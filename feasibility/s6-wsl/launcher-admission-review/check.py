"""Offline dated integrity review; never generates admission or launches a process."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

from validation import validate_review

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/launcher-admission-review'
CHECKERS = {
    's4-codex-u0-launcher': 'codex-u0/check.py',
    's4-codex-u0-watchdog-v2': 'codex-u0-watchdog-v2/run.py',
    's4-codex-u0-supervised': 'codex-u0-supervised/record.py',
    's6-linux-owner': 'linux-owner/run.py', 's6-linux-stop': 'linux-stop/run.py',
    's6-linux-service': 'linux-service/run.py', 's6-service-transport': 'service-transport/run.py',
    's6-service-inflight': 'service-inflight/run.py', 's6-cross-owner': 'cross-owner/run.py',
}
SUPPORT = ('output/s4-codex-native-protocol/README.md',
    'output/s4-codex-candidate/installation.json', 'output/s4-codex-outreach/README.md',
    'output/s4-codex-u0-watchdog/STATUS.md')
LINUX_ENVELOPES = {'s6-linux-owner', 's6-linux-stop', 's6-linux-service',
    's6-service-transport', 's6-service-inflight'}


def unique_object(pairs):
    record = {}
    for key, value in pairs:
        if key in record:
            raise ValueError('duplicate-json-key:' + key)
        record[key] = value
    return record


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def checked_path(root, name):
    if (not isinstance(name, str) or not name or any(c in name for c in ('\\', ':', '\x00'))
            or any(part in ('', '.', '..') for part in name.split('/'))):
        raise ValueError('unsafe-reference-path')
    if name.split('/')[0] == '.git':
        raise ValueError('private-git-store-not-review-input')
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('reference-outside-root-or-missing:' + name)
    return path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_hashes(root, expected):
    for name, digest in expected.items():
        if not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('invalid-reference-digest')
        if sha(checked_path(root, name)) != digest:
            raise ValueError('reference-digest-mismatch:' + name)


def cohort_references(root, cohort, evidence):
    references = dict(evidence['sourceSha256'])
    for name, digest in evidence['artifactSha256'].items():
        checked_path(checked_path(root, cohort['evidence']).parent, name)
        artifact = (Path(cohort['evidence']).parent / name).as_posix()
        if artifact in references and references[artifact] != digest:
            raise ValueError('conflicting-reference-digest')
        references[artifact] = digest
    verify_hashes(root, references)
    return set(references) | {cohort['evidence'], cohort['checker']}


def cohort_result(root, cohort, evidence):
    folder = checked_path(root, cohort['evidence']).parent
    if cohort['id'] in LINUX_ENVELOPES:
        if evidence['hostExitCode'] != 0 or evidence['timedOut'] is not False:
            raise ValueError('linux-cohort-host-incomplete')
        envelope = read_json(folder / 'wsl.stdout.bin')
        tests = json.loads(base64.b64decode(envelope['stdoutBase64'], validate=True))
        if (envelope['uid'] != 1000 or envelope['testExitCode'] != 0
                or tests['passed'] is not True or tests['testCount'] != cohort['tests']
                or len(tests['observations']) != cohort['cases']):
            raise ValueError('linux-cohort-result-incomplete')
    elif cohort['id'] == 's4-codex-u0-launcher':
        if (evidence['testExitCode'] != 0 or evidence['offlineExitCode'] != 0
                or evidence['testCount'] != cohort['tests'] or cohort['cases'] != cohort['tests']):
            raise ValueError('original-launcher-result-incomplete')
    elif (evidence['testsSuccessful'] is not True or evidence['testCount'] != cohort['tests']
            or len(read_json(folder / 'observations.json')) != cohort['cases']):
        raise ValueError('windows-cohort-result-incomplete')


def verify_cohort(root, cohort):
    expected_checker = 'feasibility/s6-wsl/' + CHECKERS[cohort['id']]
    if (cohort['evidence'] != 'output/' + cohort['id'] + '/evidence.json'
            or cohort['checker'] != expected_checker):
        raise ValueError('cohort-reference-not-bound-to-id')
    evidence = read_json(checked_path(root, cohort['evidence']))
    if not evidence.get('sourceSha256') or not isinstance(evidence['sourceSha256'], dict):
        raise ValueError('cohort-source-manifest-missing')
    if cohort['id'] in LINUX_ENVELOPES:
        required_results = {'input.json', 'wsl.stdout.bin', 'wsl.stderr.bin'}
    elif cohort['id'] == 's4-codex-u0-launcher':
        required_results = {'tests.stderr.bin', 'tests.stdout.bin', 'offline.stdout.bin', 'offline.stderr.bin'}
    else:
        required_results = {'input.json', 'tests.log', 'observations.json'}
    if not required_results <= evidence['artifactSha256'].keys():
        raise ValueError('cohort-result-not-hash-bound')
    count_keys = [k for k in ('nativeRuns', 'nativeCodexRuns', 'nativeProviderRuns') if k in evidence]
    if len(count_keys) != 1:
        raise ValueError('cohort-native-count-missing-or-ambiguous')
    count_key = count_keys[0]
    if (evidence['nativeAdmissionGranted'] is not False or evidence['phase1'] != 'HOLD'
            or type(evidence[count_key]) is not int or evidence[count_key] != 0
            or evidence.get('sourcesUnchanged', True) is not True):
        raise ValueError('cohort-native-or-integrity-state-changed')
    cohort_result(root, cohort, evidence)
    return cohort_references(root, cohort, evidence)


def input_index():
    document = read_json(OUT / 'readiness.json')
    validate_review(document)
    references = set(SUPPORT)
    for cohort in document['cohorts']:
        references.update(verify_cohort(ROOT, cohort))
    for requirement in document['requirements']:
        references.update(requirement['evidence'])
    references.update(path.relative_to(ROOT).as_posix() for path in SOURCE.glob('*.py'))
    references.update('output/launcher-admission-review/' + name for name in
        ('readiness.json', 'README.md', 'CAPTURE-PRIVACY.md', 'NEXT-STEP.md', 'review.json', 'tests.log'))
    return {name: sha(checked_path(ROOT, name)) for name in sorted(references)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seal', action='store_true', help='Write a new local hash index, never admission')
    arguments = parser.parse_args()
    current = input_index()
    expected = {'schema': 'tiye-launcher-review-index-v1',
        'scope': 'local-artifact-integrity-only-not-launch-admission', 'inputSha256': current}
    if arguments.seal:
        with (OUT / 'index.json').open('x', encoding='utf-8') as stream:
            json.dump(expected, stream, indent=2)
    if read_json(OUT / 'index.json') != expected:
        raise ValueError('review-index-mismatch')
    print('Launcher review verified: 9 dated mock cohorts; 5 unresolved requirements; native disabled; Phase1 HOLD')


if __name__ == '__main__':
    main()
