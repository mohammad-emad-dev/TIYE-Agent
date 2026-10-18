"""Select only reviewed synthetic verdicts and normalized security metadata."""
import copy
import json

EXPECTED = {
    'owner-io': {'ownerReadWrite': True, 'childReturnCode': 0, 'rawPayloadExported': False,
                 'cleanup': {'filesDeleted': True, 'directoryRetainedUntilClose': True}},
    'permission-failures': {'boundaries': ['CreateDirectoryW', 'GetSecurityInfo'],
                            'payloadCreated': False, 'runCreated': False},
    'existing-run': {'bytesUnchanged': True, 'descriptorUnchanged': True},
    'owner-mismatch': {'payloadCreated': False},
    'junction': {'actualReparseRefused': True, 'targetUnchanged': True},
    'uncertain-retention': {'childReturnCode': 7, 'payloadRetained': True, 'completionAbsent': True},
    'file-query-failure': {'emptyFileRetained': True, 'payloadWritten': False},
    'cleanup-failure': {'failureReported': True, 'retentionSurvivedFailure': True,
                        'retryAfterUnlock': {'filesDeleted': True, 'directoryRetainedUntilClose': True}}}


def canonical(record):
    return json.dumps(record, sort_keys=True, allow_nan=False)


def validate_snapshot(snapshot):
    if set(snapshot) != {'ownerMatchesCurrentToken', 'daclProtected', 'daclPresent', 'directory', 'aces'}:
        raise ValueError('unreviewed-security-field')
    if any(type(snapshot[key]) is not bool for key in snapshot if key != 'aces'):
        raise ValueError('invalid-security-boolean')
    for ace in snapshot['aces']:
        if (set(ace) != {'role', 'mask', 'flags'}
                or ace['role'] not in ('current-user', 'system', 'administrators', 'other')
                or type(ace['mask']) is not int or not 0 <= ace['mask'] <= 0xffffffff
                or type(ace['flags']) is not int or not 0 <= ace['flags'] <= 255):
            raise ValueError('unreviewed-security-principal-or-mask')


def validate_protected(snapshot, expected):
    validate_snapshot(snapshot)
    if canonical(snapshot) != canonical(expected):
        raise ValueError('protected-descriptor-mismatch')


def descriptor_template(kind):
    return {'ownerMatchesCurrentToken': True, 'daclProtected': True, 'daclPresent': True,
            'directory': kind == 'directory', 'aces': [
                {'role': role, 'mask': 0x1f01ff, 'flags': 3 if kind == 'directory' else 0}
                for role in ('current-user', 'system', 'administrators')]}


def select_owner_metadata(record):
    validate_snapshot(record.pop('parentBefore'))
    for key in ('root', 'run'):
        validate_protected(record.pop(key), descriptor_template('directory'))
    files = record.pop('files')
    if set(files) != {'retention.json', 'stdout.bin', 'completion.json'}:
        raise ValueError('unreviewed-file-inventory')
    for snapshot in files.values():
        validate_protected(snapshot, descriptor_template('file'))


def select_public(records):
    if sorted(record['case'] for record in records) != sorted(EXPECTED):
        raise ValueError('qualification-case-coverage')
    selected = copy.deepcopy(records)
    for observed in selected:
        verdict = copy.deepcopy(observed)
        case = verdict.pop('case')
        if case == 'owner-io':
            select_owner_metadata(verdict)
        if canonical(verdict) != canonical(EXPECTED[case]):
            raise ValueError('unreviewed-or-failing-verdict')
    return selected
