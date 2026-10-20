"""Offline integrity and admission guards. --develop runs fixed Linux fixtures."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import zipfile

import run_windows as run

OUT = run.ROOT / 'output/s6-runtime-limits'
ARTIFACTS = {'README.md', 'observations.json', 'config-observation-plan.json', 'review.json'}
SCHEMA_ARCHIVE = run.ROOT / 'output/s4-codex-schema/schemas.zip'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def configuration_plan():
    with zipfile.ZipFile(SCHEMA_ARCHIVE) as archive:
        schemas = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in
                   ('v2/ConfigReadParams.json', 'v2/ConfigReadResponse.json')}
    return {
        'scope': 'C0-proposed-separate-config-observation',
        'candidateVersion': '0.157.1',
        'schemaArchive': 'output/s4-codex-schema/schemas.zip',
        'schemaSha256': schemas,
        'requestAfterSeparateInitialization': {'id': 2, 'method': 'config/read',
                                              'params': {'includeLayers': True}},
        'launchWorkingDirectory': 'fresh-exclusive-directory-required-before-any-execution',
        'wireVersionFieldAdded': False,
        'U0ContractChanged': False,
        'supportedSchemaObservations': ['config.analytics.enabled', 'origins', 'layers'],
        'notEstablishedByThisSchema': ['final-PATH', 'feedback-disabled', 'credential-store-selection',
                                       'network-inactivity', 'authentication-inactivity'],
        'responsePolicy': 'bounded-private-capture-then-schema-validation-and-allowlisted-verdicts',
        'responseValidatorImplemented': False,
        'candidateExecuted': False,
        'nativeAdmissionGranted': False,
    }


def rejection_checks(record):
    """A passed fixture must never confer permission or accept incomplete results."""
    candidates = []
    promoted = copy.deepcopy(record)
    promoted['nativeExecutionAllowed'] = True
    candidates.append(promoted)
    missing = copy.deepcopy(record)
    missing['cases'].pop()
    candidates.append(missing)
    false_check = copy.deepcopy(record)
    false_check['cases'][0]['plainUnmountVerified'] = False
    candidates.append(false_check)
    for candidate in candidates:
        try:
            run.validate(candidate)
        except ValueError:
            continue
        raise ValueError('admission-or-incomplete-result-accepted')


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'schemaArchiveSha256', 'nativeExecutionAllowed'}
            or evidence['sources'] != run.sources() or evidence['nativeExecutionAllowed'] is not False
            or set(evidence['artifacts']) != ARTIFACTS
            or evidence['schemaArchiveSha256'] != digest(SCHEMA_ARCHIVE)):
        raise ValueError('evidence-source-schema-or-scope-drift')
    for name, expected in evidence['artifacts'].items():
        if digest(OUT / name) != expected:
            raise ValueError('artifact-drift')
    record = json.loads((OUT / 'observations.json').read_bytes())
    run.validate(record)
    rejection_checks(record)
    if json.loads((OUT / 'config-observation-plan.json').read_bytes()) != configuration_plan():
        raise ValueError('config-plan-drift')
    print('Four saved kernel-limit fixtures and three rejection checks verified; native admission disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        run.develop()
    else:
        verify()
