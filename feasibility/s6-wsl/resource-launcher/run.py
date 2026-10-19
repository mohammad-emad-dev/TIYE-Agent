"""Default offline check. --develop runs fixed synthetic Windows fixtures only."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import unittest
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-resource-launcher'
REFERENCES = {'output/s6-native-preflight/reconciliation.json',
              'output/s6-native-contract/contract.json',
              'output/s6-stream-launcher/observations.json'}
ARTIFACTS = {'README.md', 'observations.json', 'review.json'}
EXPECTED = {'valid': (None, True), 'overflow': ('diagnostic-persistence-fault', False),
            'timeout': ('initialize-expired', False)}


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(65536):
            digest.update(block)
    return digest.hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py'))
    paths += [SOURCE.parent / name for name in ('native-preflight/policy.py', 'stream-writer/writer.py',
                                               'private-capture-store/store.py', 'private-capture-store/winacl.py')]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def validate(evidence, observations):
    if set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}:
        raise ValueError('evidence-schema')
    if evidence['sources'] != sources() or evidence['nativeExecutionAllowed'] is not False:
        raise ValueError('source-or-native-admission-drift')
    if set(evidence['artifacts']) != ARTIFACTS or set(evidence['references']) != REFERENCES:
        raise ValueError('artifact-or-reference-set')
    for name, digest in evidence['artifacts'].items():
        if sha(OUT / name) != digest:
            raise ValueError('artifact-drift')
    for name, digest in evidence['references'].items():
        if sha(ROOT / name) != digest:
            raise ValueError('reference-drift')
    validate_observations(observations)


def validate_observations(record):
    if (set(record) != {'scope', 'unitTests', 'cases', 'nativeExecutionAllowed'}
            or record['scope'] != 'windows-synthetic-direct-children-only'
            or type(record['unitTests']) is not int or record['unitTests'] != 11
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 3):
        raise ValueError('observation-scope-or-count')
    seen = set()
    for row in record['cases']:
        if set(row) != {'scenario', 'verified', 'fault', 'storageCompleted',
                        'directChildrenReapedAndPipesDrained', 'nativeExecutionAllowed'}:
            raise ValueError('case-schema-private-fields-forbidden')
        name = row['scenario']
        if name not in EXPECTED or name in seen:
            raise ValueError('case-set')
        fault, completed = EXPECTED[name]
        if (row['verified'] is not True or row['fault'] != fault or row['storageCompleted'] is not completed
                or row['directChildrenReapedAndPipesDrained'] is not True
                or row['nativeExecutionAllowed'] is not False):
            raise ValueError('case-verdict-or-native-promotion')
        seen.add(name)


def check():
    evidence = json.loads((OUT / 'evidence.json').read_text())
    observations = json.loads((OUT / 'observations.json').read_text())
    validate(evidence, observations)
    print('Saved synthetic resource composition verified; WSL/native admission disabled')


def develop():
    import test_resources
    from resources import BudgetCapture, MetadataFiles, policy, writer
    budget = policy.MetadataBudget()
    capture = BudgetCapture(budget)
    files = None
    try:
        files = MetadataFiles(capture, budget)
        files.write('controller', 'attempt.json', b'{"scope":"development-harness"}')
        log = io.StringIO()
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromModule(test_resources))
        payload = log.getvalue().encode('utf-8')
        for offset in range(0, len(payload), writer.CHUNK):
            files.write('observer', 'stdout.bin', payload[offset:offset + writer.CHUNK])
        files.write('controller', 'outcome.json', writer.encode({'successful': result.wasSuccessful(),
                    'testsRun': result.testsRun, 'privateRuns': test_resources.PRIVATE_RUNS}))
        for name in writer.LIMITS:
            capture.eof(name)
        capture.finish()
        files.audit()
        if not result.wasSuccessful():
            raise RuntimeError('synthetic-tests-failed-private-diagnostics-retained')
        selected = {'scope': 'windows-synthetic-direct-children-only', 'unitTests': result.testsRun,
                    'cases': test_resources.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
        target = ROOT / '.git/tiye-resource-launcher' / uuid.uuid4().hex
        target.mkdir(parents=True)
        (target / 'observations.json').write_bytes(writer.encode(selected))
        (target / 'sources.json').write_bytes(writer.encode(sources()))
        (target / 'private-locator.json').write_bytes(writer.encode({'path': str(capture.storage.path)}))
        print('Synthetic tests passed; selected result: ' + str(target / 'observations.json'))
    finally:
        try:
            if files is not None:
                files.close()
        finally:
            capture.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    develop() if args.develop else check()
