"""Offline evidence reconciliation; has no native admission or process API."""
import argparse
import hashlib
import json
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/launcher-evidence-review'
COHORTS = {
    's6-unified-mock': ('unified-mock', {'valid', 'foreign', 'invalid-raw', 'native-refusal'}),
    's6-unified-lifecycle': ('unified-lifecycle', {'stop-pending', 'owner-loss', 'transport-loss',
        'partial-journal-refusal', 'native-refusal', 'cleanup-hook-failure'}),
    's6-unified-write-pressure': ('unified-write-pressure', {'pressure-stop', 'pressure-owner-loss',
        'pressure-transport-loss', 'partial-journal-refusal', 'native-refusal', 'cleanup-hook-failure'}),
}
STATES = {'L1': 'partial', 'L2': 'partial', 'P1': 'open', 'P2': 'open', 'A1': 'blocked'}
DEPENDENCIES = {'L1': [], 'L2': ['L1'], 'P1': ['L1'], 'P2': ['L1'], 'A1': ['L1', 'L2', 'P1', 'P2']}
HEADER = {'schema': 'tiye-launcher-evidence-review-v1', 'projectDate': '2026-10-18',
    'scope': 'saved-launcher-evidence-review', 'decision': 'HOLD',
    'executionBoundary': 'offline-no-native-no-auth-no-inference', 'nativeAdmissionGranted': False,
    'nativeU0Runs': 0, 'phase1': 'HOLD', 'mayAuthorizeExecution': False,
    'sameArtifactRegressionSuite': False, 'nativeFramePressureQualified': False}


def unique_object(pairs):
    record = {}
    for key, value in pairs:
        if key in record:
            raise ValueError('duplicate-key:' + key)
        record[key] = value
    return record


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_path(root, name):
    if (not isinstance(name, str) or not name or any(c in name for c in ('\\', ':', '\x00'))
            or any(part in ('', '.', '..') for part in name.split('/')) or name.split('/')[0] == '.git'):
        raise ValueError('unsafe-review-reference')
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('review-reference-outside-root-or-missing')
    return path


def verify_hashes(root, expected):
    for name, digest in expected.items():
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError('invalid-review-digest')
        if sha(checked_path(root, name)) != digest:
            raise ValueError('review-reference-changed:' + name)


def source_set_digest(inventory):
    packet = json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(packet).hexdigest()


def cohort_facts(root, cohort_id):
    folder_name, expected_cases = COHORTS[cohort_id]
    prefix = 'output/' + cohort_id + '/'
    evidence_path = checked_path(root, prefix + 'evidence.json')
    evidence = read_json(evidence_path)
    if (evidence['testsSuccessful'] is not True or evidence['sourcesUnchanged'] is not True
            or evidence['testCount'] != len(expected_cases) or evidence['nativeProviderRuns'] != 0
            or type(evidence['nativeProviderRuns']) is not int or evidence['nativeAdmissionGranted'] is not False
            or evidence['phase1'] != 'HOLD'):
        raise ValueError('cohort-is-not-complete-mock-evidence')
    references = dict(evidence['sourceSha256'])
    source_root = root / 'feasibility/s6-wsl' / folder_name
    expected_sources = {p.relative_to(root).as_posix() for p in source_root.glob('*.py')}
    if not expected_sources or set(references) != expected_sources:
        raise ValueError('cohort-source-set-incomplete')
    references.update({prefix + name: digest for name, digest in evidence['artifactSha256'].items()})
    verify_hashes(root, references)
    if not {'input.json', 'observations.json', 'tests.log'} <= evidence['artifactSha256'].keys():
        raise ValueError('cohort-results-not-bound')
    incoming = read_json(checked_path(root, prefix + 'input.json'))
    observations = read_json(checked_path(root, prefix + 'observations.json'))
    if len(observations) != len(expected_cases) or {row['case'] for row in observations} != expected_cases:
        raise ValueError('cohort-case-set-changed')
    if incoming['sourceSha256'] != evidence['sourceSha256'] or incoming['nativeAdmissionGranted'] is not False:
        raise ValueError('cohort-input-source-mismatch')
    candidate = incoming['futureNativeCandidate']
    installation = 'output/s4-codex-candidate/installation.json'
    if candidate['executed'] is not False or candidate['installationSha256'] != sha(checked_path(root, installation)):
        raise ValueError('candidate-reference-is-not-unexecuted')
    installed = read_json(checked_path(root, installation))['linux']
    if any(candidate[key] != installed[key] for key in ('binary', 'binarySha256')):
        raise ValueError('candidate-reference-differs-from-installation')
    inventory = {Path(name).name: digest for name, digest in evidence['sourceSha256'].items()}
    facts = {'id': cohort_id, 'tests': evidence['testCount'], 'cases': sorted(expected_cases),
        'sourceSetSha256': source_set_digest(inventory), 'sourceSha256ByBasename': inventory,
        'nativeRuns': 0, 'nativeAdmissionGranted': False, 'profile': incoming['profile'],
        'futureCandidateReferenceSha256': source_set_digest(candidate),
        'futureCandidateExecuted': False, 'runtimeBinaryRechecked': False}
    return facts, set(references) | {prefix + 'evidence.json', installation}


def comparison(cohorts):
    names = sorted(set().union(*(row['sourceSha256ByBasename'] for row in cohorts)))
    modules = {}
    for name in names:
        hashes = {row['id']: row['sourceSha256ByBasename'].get(name) for row in cohorts}
        modules[name] = {'sha256': hashes, 'identicalAcrossAll': None not in hashes.values() and len(set(hashes.values())) == 1}
    return {'schema': 'tiye-source-comparison-v1',
        'identicalSourceSets': len({row['sourceSetSha256'] for row in cohorts}) == 1, 'modules': modules}


def validate_ledger(document, facts):
    if set(document) != set(HEADER) | {'requirements', 'cohorts', 'nextStep'}:
        raise ValueError('not-the-review-only-schema')
    for key, expected in HEADER.items():
        if type(document[key]) is not type(expected) or document[key] != expected:
            raise ValueError('review-cannot-grant-execution-or-transfer-coverage:' + key)
    if document['cohorts'] != facts or len({row['sourceSetSha256'] for row in facts}) != 3:
        raise ValueError('review-cohorts-not-bound-to-distinct-source-sets')
    validate_requirements(document['requirements'])
    if (set(document['nextStep']) != {'id', 'nativeExecutionAllowed', 'description'}
            or document['nextStep']['id'] != 'consolidated-mock-regressions'
            or document['nextStep']['nativeExecutionAllowed'] is not False):
        raise ValueError('review-next-step-cannot-launch-native')


def validate_requirements(requirements):
    if len(requirements) != 5 or {row['id'] for row in requirements} != set(STATES):
        raise ValueError('review-requirement-set-changed')
    for row in requirements:
        if (set(row) != {'id', 'status', 'dependsOn', 'credited', 'remaining'}
                or row['status'] != STATES[row['id']] or row['dependsOn'] != DEPENDENCIES[row['id']]):
            raise ValueError('review-requirement-or-dependency-promoted')


def review_inputs():
    prior = read_json(ROOT / 'output/launcher-admission-review/index.json')
    verify_hashes(ROOT, prior['inputSha256'])
    references = set(prior['inputSha256']) | {'output/launcher-admission-review/index.json'}
    facts = []
    for cohort_id in COHORTS:
        row, names = cohort_facts(ROOT, cohort_id)
        facts.append(row)
        references.update(names)
    ledger = read_json(OUT / 'readiness.json')
    validate_ledger(ledger, facts)
    if read_json(OUT / 'source-comparison.json') != comparison(facts):
        raise ValueError('source-comparison-changed')
    references.update(p.relative_to(ROOT).as_posix() for p in SOURCE.glob('*.py'))
    references.update('output/launcher-evidence-review/' + name for name in
        ('readiness.json', 'source-comparison.json', 'README.md', 'NEXT-STEP.md', 'review.json', 'tests.log', 'verification.log'))
    return {name: sha(checked_path(ROOT, name)) for name in sorted(references)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seal', action='store_true', help='Exclusive integrity index creation; never an admission')
    arguments = parser.parse_args()
    index = {'schema': 'tiye-launcher-evidence-index-v1', 'mayAuthorizeExecution': False, 'inputSha256': review_inputs()}
    if arguments.seal:
        with (OUT / 'index.json').open('x', encoding='utf-8') as stream:
            json.dump(index, stream, indent=2)
    if read_json(OUT / 'index.json') != index:
        raise ValueError('launcher-evidence-index-mismatch')
    print('Launcher evidence verified: 3 distinct unified source sets, 16 saved tests; L1/L2 partial; P1/P2 open; A1 blocked; HOLD')


if __name__ == '__main__':
    main()
