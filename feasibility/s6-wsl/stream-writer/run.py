"""Offline by default; --develop runs Windows-only owned synthetic writer fixtures."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-stream-writer'
sys.path.insert(0, str(SOURCE.parents[0] / 'private-capture-store'))

CASES = ['exact-caps-protected', 'stdout-overflow', 'stderr-overflow',
         'record-exact-with-lf', 'record-overflow-fragmented', 'short-write-prefix',
         'injected-write-error', 'injected-fsync-failure', 'partial-manifest-quarantine',
         'completion-fsync-failure',
         'reader-failure-missing-eof', 'unexpected-inventory', 'metadata-drift',
         'payload-drift',
         'finite-concurrent-pipes-drain']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py'))
    paths += [SOURCE.parent / 'private-capture-store' / name for name in ('store.py', 'winacl.py')]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def validate(document):
    if set(document) != {'schema', 'sources', 'tests', 'cases', 'nativeExecutionAllowed', 'phase1'}:
        raise ValueError('public-fields')
    if (document['schema'] != 'tiye-stream-writer-v1' or document['sources'] != sources()
            or type(document['tests']) is not int or document['tests'] != 8
            or document['nativeExecutionAllowed'] is not False or document['phase1'] != 'HOLD'):
        raise ValueError('source-count-or-admission-state')
    cases = document['cases']
    if (len(cases) != len(CASES) or sorted(row.get('case', '') for row in cases) != sorted(CASES)
            or any(set(row) != {'case', 'verified'} or row['verified'] is not True for row in cases)):
        raise ValueError('missing-or-private-case-data')


def develop():
    import store
    import test_writer
    frozen = sources()
    protected = store.create_store()
    try:
        private = protected.new_run(uuid.uuid4().hex)
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(test_writer.WriterTests)
        log = io.StringIO()
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
        raw = json.dumps({'cases': test_writer.PRIVATE_CASES, 'testLog': log.getvalue()}, indent=2).encode('utf-8')
        private.write_bytes('stdout.bin', raw)
        private.write_bytes('stderr.bin', b'')
        if not result.wasSuccessful() or frozen != sources():
            print('Writer fixture failed; diagnostics retained in protected local storage', file=sys.stderr)
            return 1
        document = {'schema': 'tiye-stream-writer-v1', 'sources': frozen,
                    'tests': result.testsRun, 'cases': test_writer.OBSERVATIONS,
                    'nativeExecutionAllowed': False, 'phase1': 'HOLD'}
        validate(document)
        target = ROOT / '.git/tiye-stream-writer' / uuid.uuid4().hex
        target.mkdir(parents=True)
        (target / 'observations.json').write_text(json.dumps(document, indent=2) + '\n', encoding='utf-8')
        print('Windows synthetic writer: 8 tests / 15 scenarios passed; native disabled')
        print('Selected observations: ' + target.relative_to(ROOT).as_posix())
        return 0
    finally:
        protected.close()


def check():
    document = json.loads((OUT / 'observations.json').read_text(encoding='utf-8'))
    validate(document)
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if set(evidence) != {'artifactSha256', 'scope'} or evidence['scope'] != 'saved-synthetic-writer-no-native':
        raise ValueError('evidence-scope')
    expected_files = {'observations.json', 'README.md', 'review.json'}
    if set(evidence['artifactSha256']) != expected_files:
        raise ValueError('evidence-files')
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('artifact-drift:' + name)
    print('Saved Windows bounded writer: 8 synthetic tests / 15 scenarios; native disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    raise SystemExit(develop() if args.develop else check())
