"""Construct selected verdicts; raw records, paths and base64 never pass through."""
import json
import re

import contract

OUTCOMES = {'valid': 'handshake-and-clean-eof', 'stop-pending': 'cancelled-before-response',
            'owner-loss': 'unknown-after-owner-loss'}


def canonical(record):
    return json.dumps(record, sort_keys=True, allow_nan=False)


def select_public(record, storage, fingerprint):
    mode = record['case']
    audit = storage['audit']
    selected = {'case': mode, 'sourceSetSha256': fingerprint,
        'prelaunch': storage['prelaunch'], 'privateRootProtected': storage['root']['daclProtected'],
        'privateRunProtected': storage['run']['daclProtected'],
        'fileCount': len(audit), 'privateBytes': sum(row['bytes'] for row in audit.values()),
        'filePermissionsVerified': all(row['security']['ownerMatchesCurrentToken'] for row in audit.values()),
        'windowsCleanupObserved': record['windowsHeldHandlesSignaled'] and record['watchdog']['windowsJobEmpty'],
        'linuxCleanupObserved': record['linux']['heldPidfdsSignaled'] and record['linux']['originalProcEntriesAbsent'],
        'sentinelLive': record['linux']['unrelatedSentinelLive'],
        'restartRefused': record['restartRefusal']['exitCode'] == 23 and record['restartRefusal']['journalUnchanged'],
        'journalDelivery': record['attempt']['delivery'], 'protocolOutcome': OUTCOMES[mode],
        'ownerReport': 'absent' if record['protocol'] is None else 'retained',
        'peerReceiptObserved': record['linux']['receipt'] is not None,
        'stopObserved': record['stop'] is not None,
        'retention': {'required': True, 'deleted': False, 'deletionAllowed': False}}
    validate_record(selected, fingerprint)
    return selected


def validate_record(record, fingerprint):
    mode = record['case']
    if mode not in contract.MODES or not re.fullmatch('[0-9a-f]{64}', fingerprint):
        raise ValueError('public-mode-or-fingerprint')
    expected = {'case': mode, 'sourceSetSha256': fingerprint,
        'prelaunch': {'rootVerified': True, 'runVerified': True, 'intentVerified': True},
        'privateRootProtected': True, 'privateRunProtected': True, 'filePermissionsVerified': True,
        'windowsCleanupObserved': True, 'linuxCleanupObserved': True, 'sentinelLive': True,
        'restartRefused': True, 'journalDelivery': 'unknown', 'protocolOutcome': OUTCOMES[mode],
        'ownerReport': 'absent' if mode == 'owner-loss' else 'retained',
        'peerReceiptObserved': mode == 'valid', 'stopObserved': mode == 'stop-pending',
        'retention': {'required': True, 'deleted': False, 'deletionAllowed': False}}
    copy = dict(record)
    count, byte_count = copy.pop('fileCount'), copy.pop('privateBytes')
    if (type(count) is not int or count != len(contract.filenames(mode)) or type(byte_count) is not int
            or not 0 < byte_count <= contract.PER_CASE or canonical(copy) != canonical(expected)):
        raise ValueError('public-verdict-or-unreviewed-field')


def validate_records(records, fingerprint):
    if sorted(record['case'] for record in records) != sorted(contract.MODES):
        raise ValueError('public-case-coverage')
    for record in records:
        validate_record(record, fingerprint)
