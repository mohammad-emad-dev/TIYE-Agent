"""Default offline; --develop executes four owned Windows/WSL mock compositions."""
import argparse
import io
import json
from pathlib import Path
import sys
import unittest
import uuid

import composition

OUT = composition.ROOT / 'output/s6-stream-launcher'
CASES = ('valid', 'stop-pending', 'owner-loss', 'stderr-overflow')


def validate(document):
    expected = {'schema', 'sources', 'composition', 'cases', 'nativeExecutionAllowed', 'phase1'}
    if set(document) != expected or document['schema'] != 'tiye-stream-launcher-v1':
        raise ValueError('public-schema')
    if (document['sources'] != composition.sources()
            or document['composition'] != composition.fingerprint(document['sources'])
            or document['nativeExecutionAllowed'] is not False or document['phase1'] != 'HOLD'):
        raise ValueError('source-or-state-drift')
    cases = document['cases']
    if len(cases) != 4 or {row['case'] for row in cases} != set(CASES):
        raise ValueError('cases-missing')
    for row in cases:
        expected_row = {'case': row['case'], 'cleanupVerified': True, 'restartRefused': True,
                        'privatePrefixRetained': True, 'storageCompleted': row['case'] == 'valid',
                        'ownerFinalResultAbsent': row['case'] == 'owner-loss',
                        'overflowObserved': row['case'] == 'stderr-overflow'}
        if set(row) != set(expected_row) or any(type(row[key]) is not type(value) or row[key] != value
                                               for key, value in expected_row.items()):
            raise ValueError('private-field-or-verdict-promotion')


def develop():
    sys.path.insert(0, str(composition.SOURCE.parent / 'private-capture-store'))
    import store
    import integration
    frozen = composition.sources()
    protected = store.create_store()
    try:
        evidence = protected.new_run(uuid.uuid4().hex)
        log = io.StringIO()
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(integration.suite())
        evidence.write_bytes('stdout.bin', json.dumps({'testLog': log.getvalue(), 'records': integration.PRIVATE}).encode('utf-8'))
        evidence.write_bytes('stderr.bin', b'')
        if not result.wasSuccessful() or frozen != composition.sources():
            print('Managed stream fixtures failed; diagnostics retained privately', file=sys.stderr)
            # Keep only bounded non-payload failure location for local repair.
            local = composition.ROOT / '.git/tiye-stream-launcher-failure.json'
            local.write_text(json.dumps({'path': str(evidence.path)}), encoding='utf-8')
            return 1
        document = {'schema': 'tiye-stream-launcher-v1', 'sources': frozen,
                    'composition': composition.fingerprint(frozen), 'cases': integration.RESULTS,
                    'nativeExecutionAllowed': False, 'phase1': 'HOLD'}
        validate(document)
        target = composition.ROOT / '.git/tiye-stream-launcher' / uuid.uuid4().hex
        target.mkdir(parents=True)
        (target / 'observations.json').write_text(json.dumps(document, indent=2) + '\n', encoding='utf-8')
        print('Four managed stream/launcher cases passed; native disabled')
        print('Selected observations: ' + target.relative_to(composition.ROOT).as_posix())
        return 0
    finally:
        protected.close()


def check():
    validate(json.loads((OUT / 'observations.json').read_text(encoding='utf-8')))
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if set(evidence) != {'artifactSha256', 'scope'} or evidence['scope'] != 'saved-mock-composition-no-native':
        raise ValueError('evidence-scope')
    if set(evidence['artifactSha256']) != {'observations.json', 'README.md', 'review.json'}:
        raise ValueError('evidence-files')
    for name, expected in evidence['artifactSha256'].items():
        if composition.sha(OUT / name) != expected:
            raise ValueError('artifact-drift')
    print('Saved four managed stream/launcher cases verified; native disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    raise SystemExit(develop() if args.develop else check())
