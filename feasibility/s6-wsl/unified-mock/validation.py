"""Saved wire bytes, service lifecycle and Windows accounting stay distinct."""
import base64
import json

import profile


def validate_wire(record):
    result, mode = record['protocol'], record['case']
    report = result['report']
    expected_fault = {'valid': None, 'foreign': 'uncorrelated-or-error-response',
        'invalid-raw': 'invalid-json:UnicodeDecodeError'}[mode]
    if (result['profile'] != profile.manifest() or report['fault'] != expected_fault
            or result['handshakeFault'] != expected_fault or result['handshakeAccepted'] is not (mode == 'valid')):
        raise ValueError('unified-wire-result-mismatch')
    if (report['directChildReaped'] is not True or report['returnCode'] != 0
            or report['readerEof'] != {'stdout': True, 'stderr': True} or report['cleanupErrors']
            or report['signals'] or report['spawnUncertain'] is not False
            or result['heartbeatErrors'] or result['leaseExitCode'] != 0):
        raise ValueError('unified-owned-client-cleanup-mismatch')
    if len(report['writes']) != (2 if mode == 'valid' else 1) or any(
            write['state'] != 'locally-drained' for write in report['writes']):
        raise ValueError('unified-notification-not-revoked')
    for stream in ('stdout', 'stderr'):
        raw = base64.b64decode(result['rawBase64'][stream], validate=True)
        if (len(raw) != report['retainedBytes'][stream] or len(raw) != report['observedBytes'][stream]
                or report['discardedBytes'][stream] != 0):
            raise ValueError('unified-byte-accounting-mismatch')
        if stream == 'stderr' and raw != (b'initialized-notification-observed\n' if mode == 'valid' else b''):
            raise ValueError('unified-peer-stderr-mismatch')
        if stream == 'stdout':
            if mode == 'invalid-raw':
                if raw != b'\xff\n':
                    raise ValueError('unified-invalid-byte-not-preserved')
            elif json.loads(raw)['id'] != (1 if mode == 'valid' else 2):
                raise ValueError('unified-response-id-mismatch')


def validate_lifecycle(record):
    linux, windows = record['linux'], record['watchdog']
    if (linux['profile'] != profile.manifest() or linux['mode'] != record['case']
            or not all(linux[key] is True for key in ('heldPidfdsSignaled', 'originalProcEntriesAbsent', 'unrelatedSentinelLive'))
            or record['windowsHeldHandlesSignaled'] is not True
            or windows['windowsJobEmpty'] is not True or windows['rootHandleSignaled'] is not True
            or windows['stopReason'] != 'job-empty' or windows['finalRootExitCode'] != 0
            or windows['deadlineSeconds'] != profile.WINDOWS_WATCHDOG_SECONDS
            or not 0 <= linux['cleanupSeconds'] < 15 or not 0 <= linux['workerLifetimeSeconds'] < 30):
        raise ValueError('unified-lifecycle-not-observed')
    main, leaf, peer = linux['identities']
    descriptor = linux['descriptor']
    nonce = linux['nonce']
    if (record['protocol']['nonce'] != nonce or record['windowsIdentities']['nonce'] != nonce
            or descriptor['unit'] != 'tiye-service-' + nonce + '.service'
            or descriptor['mainPid'] != main['pid'] or record['runtime']['uid'] != 1000):
        raise ValueError('unified-generation-not-bound')
    group = '0::' + descriptor['controlGroup']
    command = linux['serviceCommand']
    if (command['nonce'] != nonce or command['profile'] != profile.manifest()
            or command['argv'][0] != '/usr/bin/systemd-run'
            or any(flag not in command['argv'] for flag in ('--pipe', '--wait', '--quiet', '--service-type=exec'))
            or not any(argument.endswith('/worker.py') for argument in command['argv'])):
        raise ValueError('unified-service-command-not-bound')
    if any(identity['cgroup'] != group or identity['nonce'] != nonce for identity in (main, leaf, peer)):
        raise ValueError('unified-process-membership-mismatch')
    if any(identity['ppid'] != main['pid'] or identity['sid'] == main['sid'] for identity in (leaf, peer)):
        raise ValueError('unified-process-parentage-mismatch')
    for outside in (linux['observer'], linux['sentinel']):
        if outside['cgroup'] == group or outside['cgroup'].startswith(group + '/'):
            raise ValueError('unified-observer-inside-owned-tree')
    if linux['cgroupAfter'] != 'removed' and 'populated 0' not in linux['cgroupAfter'].splitlines():
        raise ValueError('unified-cgroup-not-empty')
    if (linux['receipt']['initializedNotification'] != ({'method': 'initialized'} if record['case'] == 'valid' else None)
            or linux['receipt']['stdinEof'] is not True or linux['receipt'].get('unexpectedInputBytes', 0)
            or linux['reaped'] != {'nonce': nonce, 'pid': peer['pid'], 'returnCode': 0}):
        raise ValueError('unified-peer-receipt-or-reap-mismatch')
    props = descriptor['beforeQuery']['properties']
    expected = {'KillMode': 'control-group', 'ExitType': 'main', 'RuntimeMaxUSec': '1min',
        'TimeoutStopUSec': '5s', 'UMask': '0077', 'Restart': 'no', 'Delegate': 'no',
        'SendSIGKILL': 'yes', 'Transient': 'yes'}
    if any(props.get(key) != value for key, value in expected.items()):
        raise ValueError('unified-service-policy-mismatch')
    terminal = linux['afterQuery']
    if terminal.get('timedOut'):
        raise ValueError('unified-terminal-query-timed-out')
    if terminal['properties'].get('LoadState') == 'not-found':
        if linux['managerTerminalAvailable'] is not False:
            raise ValueError('unavailable-manager-result-misrepresented')
    elif (linux['managerTerminalAvailable'] is not True or terminal['returnCode'] != 0
            or terminal.get('timedOut') or terminal['properties']['InvocationID'] != descriptor['invocationId']):
        raise ValueError('unified-terminal-query-not-bound')


def validate_records(records):
    if len(records) != 4 or {record['case'] for record in records} != set(profile.MODES) | {'native-refusal'}:
        raise ValueError('unified-cases-missing')
    for record in records:
        if record['case'] == 'native-refusal':
            if (record['returnCode'] != 2 or record['nativeLaunched'] is not False
                    or b'native-execution-disabled: fixed mock launcher only' not in
                    base64.b64decode(record['stderrBase64'], validate=True)):
                raise ValueError('unified-native-refusal-missing')
        else:
            validate_wire(record)
            validate_lifecycle(record)
