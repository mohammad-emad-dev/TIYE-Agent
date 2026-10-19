"""Offline consistency checks only; native startup has no admission path here."""
import hashlib
import json
from pathlib import Path

from inspect_windows import validate as validate_inspection

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-native-inventory'
ARTIFACTS = {'README.md', 'review.json', 'inspection.json', 'profile.json', 'sources.json'}
REFERENCES = {'output/s6-native-preflight/findings.json', 'output/s6-native-preflight/evidence.json',
              'output/s6-scheduled-wsl/evidence.json', 'output/s6-native-contract/contract.json'}
DEPENDENCIES = ['native-preflight/inspect_linux.py', 'resource-watchdog/composition.py',
                'resource-launcher/resources.py', 'native-preflight/policy.py', 'stream-writer/writer.py',
                'private-capture-store/store.py', 'private-capture-store/winacl.py']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py')) + [SOURCE.parent / path for path in DEPENDENCIES]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def validate_profile(profile):
    flags = {'candidateExecuted', 'nativeHelpersObserved', 'effectiveConfigurationResolved',
             'networkSilenceEstablished', 'credentialDiscoveryAbsenceEstablished',
             'nativeAdmissionGranted', 'nativeExecutionAllowed'}
    if (type(profile) is not dict or set(profile) != flags | {
            'scope', 'candidateVersion', 'upstreamCommit', 'draft', 'remainingEvidence'}
            or profile['scope'] != 'source-derived-profile-not-native-admission'
            or profile['candidateVersion'] != '0.157.1'
            or profile['upstreamCommit'] != '36650394c5b38c2990ccf2a3457165ca3e9d9726'
            or any(profile[name] is not False for name in flags)
            or type(profile['remainingEvidence']) is not list or not profile['remainingEvidence']):
        raise ValueError('profile-schema-or-admission-promotion')


def validate_evidence(evidence):
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != sources() or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('source-or-admission-drift')
    for key, expected, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)]:
        if set(evidence[key]) != expected:
            raise ValueError('artifact-or-reference-set')
        for path, digest in evidence[key].items():
            if sha(base / path) != digest:
                raise ValueError('artifact-or-reference-drift')


def check():
    validate_evidence(json.loads((OUT / 'evidence.json').read_text()))
    validate_inspection(json.loads((OUT / 'inspection.json').read_text()))
    validate_profile(json.loads((OUT / 'profile.json').read_text()))
    print('Saved passive inventory and proposed profile verified; native admission denied')


if __name__ == '__main__':
    check()
