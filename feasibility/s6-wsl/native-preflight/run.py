"""Default offline integrity check; --inspect rehashes installed package without exec."""
import argparse
import hashlib
import json
from pathlib import Path

import policy

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-native-preflight'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def own_sources():
    paths = list(SOURCE.glob('*.py'))
    paths += [SOURCE.parent / 'private-capture-store' / name for name in ('store.py', 'winacl.py')]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def check(cache=None):
    evidence = json.loads((OUT / 'evidence.json').read_text())
    if set(evidence) != {'sources', 'artifactSha256', 'bindings', 'nativeExecutionAllowed'}:
        raise ValueError('evidence-schema')
    if evidence['sources'] != own_sources() or evidence['nativeExecutionAllowed'] is not False:
        raise ValueError('source-or-admission-drift')
    expected = {'README.md', 'findings.json', 'inspection.json', 'review.json', 'reconciliation.json'}
    if set(evidence['artifactSha256']) != expected:
        raise ValueError('artifact-set')
    references = {'output/s4-codex-candidate/installation.json', 'output/s6-native-contract/contract.json',
                  'output/s6-stream-launcher/observations.json', 'feasibility/s6-wsl/consolidated-launcher/profile.py'}
    if set(evidence['bindings']) != references:
        raise ValueError('reference-set')
    for name, expected_digest in evidence['bindings'].items():
        if sha(ROOT / name) != expected_digest:
            raise ValueError('reference-drift')
    for name, expected_digest in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected_digest:
            raise ValueError('artifact-drift')
    plan = json.loads((OUT / 'reconciliation.json').read_text())
    if (plan['metadataAllocations'] != policy.ALLOCATIONS or plan['reservedBytes'] != policy.RESERVED
            or plan['metadataTotalBytes'] != policy.TOTAL or plan['phaseCapsSeconds'] != policy.CAPS
            or plan['nativeExecutionAllowed'] is not False or plan['integrated'] is not False):
        raise ValueError('plan-or-integration-promotion')
    inspection = json.loads((OUT / 'inspection.json').read_text())
    installed = json.loads((ROOT / 'output/s4-codex-candidate/installation.json').read_text())['linux']
    expected_inspection = {'scope': 'listed-package-bytes-only-no-execution', 'filesMatched': len(installed['inventory']),
                          'allListedDigestsMatched': True, 'uidMatched': True, 'candidateExecuted': False,
                          'credentialFilesRead': False, 'authStatusRequested': False}
    if set(inspection) != set(expected_inspection) or any(type(inspection[key]) is not type(value)
            or inspection[key] != value for key, value in expected_inspection.items()):
        raise ValueError('inspection-scope-or-count')
    if cache is not None:
        findings = json.loads((OUT / 'findings.json').read_text())
        cache = Path(cache).resolve()
        for row in findings['sourceFiles']:
            path = cache / row['path']
            if not path.resolve().is_relative_to(cache) or path.is_symlink() or sha(path) != row['sha256']:
                raise ValueError('cached-source-drift')
    print('Saved package/source review and policy primitives verified; native disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--source-cache')
    args = parser.parse_args()
    if args.inspect:
        if args.source_cache:
            parser.error('choose inspection or offline source check')
        from inspect_windows import inspect
        inspect()
    else:
        check(args.source_cache)
