"""Offline integrity and non-promotion gate for the consolidated access review."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
OUT = ROOT / 'output/s6-capture-access-review'
PRIOR = ROOT / 'output/s6-consolidated-launcher'
BASELINE_EVIDENCE_SHA256 = '014ff0e840d0bc6c1616aae8724912882d735129d74096e6d649200ebbd97592'
LIMITS = {'nativeAdmissionGranted': False, 'nativeProviderRuns': 0,
          'phase1': 'HOLD', 'P1': 'OPEN', 'P2': 'OPEN',
          'historicalEffectiveAccessProven': False,
          'currentEffectiveAccessEvaluated': False}
ROLES = {'current-user', 'system', 'administrators', 'everyone',
         'authenticated-users', 'users', 'unclassified-principal'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(folder):
    return {path.relative_to(ROOT).as_posix(): sha(path)
            for path in sorted(folder.rglob('*')) if path.is_file()}


def verify_manifest(manifest):
    for name, digest in manifest.items():
        parts = name.split('/')
        if (not name or '\\' in name or any(part in ('', '.', '..') for part in parts)
                or ':' in name or name.startswith('/') or not re.fullmatch('[0-9a-f]{64}', digest)):
            raise ValueError('invalid-manifest-entry')
        target = ROOT.joinpath(*parts).resolve()
        if not target.is_relative_to(ROOT) or sha(target) != digest:
            raise ValueError('manifest-content-changed:' + name)


def validate_acl(rows, targets):
    if sorted(row['target'] for row in rows) != sorted(targets):
        raise ValueError('acl-target-coverage')
    for row in rows:
        if (set(row) != {'target', 'ownerRole', 'daclState', 'daclProtected', 'daclCanonical', 'aces'}
                or row['daclState'] not in ('present', 'null', 'absent')
                or row['ownerRole'] not in ROLES or type(row['daclProtected']) is not bool
                or type(row['daclCanonical']) is not bool or not isinstance(row['aces'], list)):
            raise ValueError('invalid-acl-record')
        if row['daclState'] != 'present' and row['aces']:
            raise ValueError('rules-without-dacl')
        for ace in row['aces']:
            if (set(ace) != {'principalRole', 'rights', 'accessType', 'inherited', 'inheritanceFlags', 'propagationFlags'}
                    or ace['principalRole'] not in ROLES or ace['accessType'] not in ('Allow', 'Deny')
                    or type(ace['rights']) is not int or type(ace['inherited']) is not bool
                    or not 0 <= ace['rights'] <= 0xffffffff
                    or type(ace['inheritanceFlags']) is not int or type(ace['propagationFlags']) is not int):
                raise ValueError('invalid-ace')


def validate_metadata(entry):
    if entry == {'exists': False} and type(entry['exists']) is bool:
        return
    if (set(entry) != {'exists', 'mode', 'type', 'ownerMatchesProbeUid', 'groupMatchesProbeGid'}
            or entry['exists'] is not True or not re.fullmatch('[0-7]{4}', entry['mode'])
            or type(entry['type']) is not int
            or type(entry['ownerMatchesProbeUid']) is not bool
            or type(entry['groupMatchesProbeGid']) is not bool):
        raise ValueError('invalid-linux-metadata')


def validate_subject(review):
    if sha(PRIOR / 'evidence.json') != BASELINE_EVIDENCE_SHA256:
        raise ValueError('baseline-evidence-changed')
    prior_evidence = json.loads((PRIOR / 'evidence.json').read_text(encoding='utf-8'))
    prior_sources = prior_evidence['sourceSha256']
    prefix = PRIOR.relative_to(ROOT).as_posix() + '/'
    prior_artifacts = {prefix + name: digest for name, digest in prior_evidence['artifactSha256'].items()}
    prior_artifacts[prefix + 'evidence.json'] = BASELINE_EVIDENCE_SHA256
    if review['subjectSources'] != prior_sources or review['subjectArtifacts'] != prior_artifacts:
        raise ValueError('subject-inventory-mismatch')
    if inventory(PRIOR) != prior_artifacts:
        raise ValueError('subject-files-changed')
    verify_manifest(review['subjectSources'])
    verify_manifest(review['subjectArtifacts'])


def validate_linux(linux):
    if set(linux) != {'uid', 'scope', 'roots', 'mountpointMetadata', 'posixAclEvaluated', 'effectiveAccessEvaluated'}:
        raise ValueError('linux-metadata-fields')
    observations = json.loads((PRIOR / 'observations.json').read_text(encoding='utf-8'))
    roots = {record['runtime']['linuxRoot'] for record in observations if 'runtime' in record}
    if (set(linux['roots']) != roots or len(roots) != 9 or linux['uid'] != 1000
            or linux['scope'] != 'current-observer-not-historical-service'
            or linux['posixAclEvaluated'] is not False or linux['effectiveAccessEvaluated'] is not False):
        raise ValueError('linux-scope-mismatch')
    expected_entries = {'.', 'home', 'codex-home', 'tmp', 'main.json', 'protocol-live.json',
                        'lease.json', 'descriptor.json', 'service-command.json'}
    for entries in linux['roots'].values():
        if set(entries) != expected_entries:
            raise ValueError('linux-entry-coverage')
        for entry in entries.values():
            validate_metadata(entry)
    if set(linux['mountpointMetadata']) != {'/mnt/d'}:
        raise ValueError('mountpoint-coverage')
    validate_metadata(linux['mountpointMetadata']['/mnt/d'])


def validate_review(review, measurements):
    if any(json.dumps(record['limits'], sort_keys=True) != json.dumps(LIMITS, sort_keys=True)
           for record in (review, measurements)):
        raise ValueError('access-review-cannot-promote-admission')
    if set(measurements) != {'observedUtc', 'limits', 'windowsDacl', 'linuxMetadata'}:
        raise ValueError('measurement-fields')
    validate_subject(review)
    public_targets = list(review['subjectArtifacts']) + ['output/s6-consolidated-launcher']
    private_targets = ['private-delegation-root', 'private-development-root']
    validate_acl(measurements['windowsDacl'], public_targets + private_targets)
    validate_linux(measurements['linuxMetadata'])
    if (review['retention']['automaticDeletionImplemented'] is not False
            or review['retention']['publishedArtifactsArePrivate'] is not False
            or review['retention']['gitExclusionIsAccessControl'] is not False):
        raise ValueError('retention-overclaim')


def check():
    review = json.loads((OUT / 'review.json').read_text(encoding='utf-8'))
    measurements = json.loads((OUT / 'measurements.json').read_text(encoding='utf-8'))
    verify_manifest(review['reviewSources'])
    if review['reviewSources'] != inventory(SOURCE):
        raise ValueError('review-source-inventory-mismatch')
    verify_manifest(review['measurementFiles'])
    current_files = inventory(OUT)
    current_files.pop('output/s6-capture-access-review/review.json')
    if review['measurementFiles'] != current_files:
        raise ValueError('review-artifact-inventory-mismatch')
    validate_review(review, measurements)
    print('Access review verified: P1/P2 OPEN; current metadata only; native admission disabled')


if __name__ == '__main__':
    check()
