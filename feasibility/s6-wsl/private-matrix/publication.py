"""Construct selected verdicts; raw records, paths and base64 never pass through."""
import json
import re

import contract

OUTCOMES = {'valid': 'handshake-and-clean-eof', 'foreign': 'rejected-uncorrelated-response',
            'invalid-raw': 'rejected-invalid-utf8', 'stop-pending': 'cancelled-before-response',
            'owner-loss': 'unknown-after-owner-loss', 'transport-loss': 'unknown-after-transport-loss',
            'pressure-stop': 'cancelled-pending-write-uncertain',
            'pressure-owner-loss': 'pending-write-unknown-after-owner-loss',
            'pressure-transport-loss': 'pending-write-unknown-after-transport-loss'}


def canonical(record):
    return json.dumps(record, sort_keys=True, allow_nan=False)


def pressure_witness(record):
    if record['case'] not in contract.PRESSURE:
        return None
    witness, protocol = record['pressure'], record['protocol']
    return {'syntheticBytes': witness['bytes'],
            'pendingDrainObserved': witness['drainStarted'] and witness['drainPending'],
            'samplesAboveHigh': len(witness['samples']) == 2 and all(
                sample['bufferBytes'] > witness['highWater'] for sample in witness['samples']),
            'plumbingOnly': witness['plumbingOnly'], 'nativeFrameCapacityQualified': False,
            'delivery': 'unknown',
            'outcome': protocol['report']['writes'][2]['state'] if protocol else 'unknown-owner-dead',
            'stdinAbortRequested': protocol['report']['stdinAbortRequested'] if protocol else None}


def validate_pressure(witness, mode):
    if mode not in contract.PRESSURE:
        if witness is not None:
            raise ValueError('pressure-in-nonpressure-case')
        return
    allowed = {'unknown-owner-dead'} if mode in contract.OWNERS else {'uncertain-write-cancelled'}
    if mode == 'pressure-transport-loss':
        allowed.add('uncertain-write')
    expected = {'syntheticBytes': contract.SYNTHETIC_WRITE_BYTES, 'pendingDrainObserved': True,
                'samplesAboveHigh': True, 'plumbingOnly': True, 'nativeFrameCapacityQualified': False,
                'delivery': 'unknown', 'outcome': witness['outcome'],
                'stdinAbortRequested': None if mode in contract.OWNERS else True}
    if witness['outcome'] not in allowed or canonical(witness) != canonical(expected):
        raise ValueError('pressure-uncertainty-or-pending-evidence-mismatch')


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
        'pressure': pressure_witness(record),
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
        'ownerReport': 'absent' if mode in contract.OWNERS else 'retained',
        'peerReceiptObserved': mode in contract.BASELINE, 'stopObserved': mode in contract.STOPS,
        'retention': {'required': True, 'deleted': False, 'deletionAllowed': False}}
    copy = dict(record)
    count, byte_count = copy.pop('fileCount'), copy.pop('privateBytes')
    validate_pressure(copy.pop('pressure'), mode)
    if (type(count) is not int or count != len(contract.filenames(mode)) or type(byte_count) is not int
            or not 0 < byte_count <= contract.PER_CASE or canonical(copy) != canonical(expected)):
        raise ValueError('public-verdict-or-unreviewed-field')


def validate_records(records, fingerprint):
    if sorted(record['case'] for record in records) != sorted(contract.MODES):
        raise ValueError('public-case-coverage')
    for record in records:
        validate_record(record, fingerprint)
