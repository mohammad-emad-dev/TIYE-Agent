"""Saved wire bytes, service lifecycle and Windows accounting stay distinct."""
import base64
import json
import hashlib
from pathlib import Path

import profile


def validate_lifecycle(record):
    linux, windows = record['linux'], record['watchdog']
    if (linux['profile'] != profile.manifest() or linux['mode'] != record['case']
            or not all(linux[key] is True for key in ('heldPidfdsSignaled', 'originalProcEntriesAbsent', 'unrelatedSentinelLive'))
            or record['windowsHeldHandlesSignaled'] is not True
            or windows['windowsJobEmpty'] is not True or windows['rootHandleSignaled'] is not True
            or windows['stopReason'] not in ('job-empty', 'owner-exit') or windows['finalRootExitCode'] != (77 if record['case'] == 'pressure-owner-loss' else 0)
            or windows['deadlineSeconds'] != profile.WINDOWS_WATCHDOG_SECONDS
            or not 0 <= record['injectionToWindowsDoneSeconds'] < profile.OBSERVATION_SECONDS
            or not 0 <= linux['cleanupSeconds'] < 15 or not 0 <= linux['workerLifetimeSeconds'] < 30):
        raise ValueError('unified-lifecycle-not-observed')
    main, leaf, peer = linux['identities']
    descriptor = linux['descriptor']
    nonce = linux['nonce']
    if (record['windowsIdentities']['nonce'] != nonce
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
    expected_notification = {"method": "initialized"}
    if peer["initializedNotification"] != expected_notification or peer["initializeRequest"]["method"] != "initialize":
        raise ValueError("lifecycle-peer-phase-not-bound")
    expiry = linux["leaseExpiry"]
    if record["case"] == "pressure-stop":
        if expiry is not None or record["stop"]["nonce"] != nonce or record["stop"]["stop"]["state"] != "stop-requested":
            raise ValueError("lifecycle-stop-not-bound")
        stopped = record['stop']['stop']
        initial = stopped['initialQuery']
        if (initial.get('timedOut') or initial['returnCode'] != 0
                or initial['properties']['InvocationID'] != descriptor['invocationId']
                or initial['properties']['ControlGroup'] != descriptor['controlGroup']
                or initial['properties']['Id'] != descriptor['unit']
                or stopped['stop']['returnCode'] != 0 or stopped['stop']['timedOut']):
            raise ValueError('lifecycle-stop-control-unverified')
    elif expiry["nonce"] != nonce or expiry["pid"] != main["pid"] or expiry["reason"] != "expired" or expiry["ageSeconds"] <= 1:
        raise ValueError("lifecycle-lease-not-expired")
    attempt, refusal = record["attempt"], record["restartRefusal"]
    if (attempt["nonce"] != nonce or attempt["state"] != "attempted" or attempt["delivery"] != "unknown"
            or attempt['sourceSha256'] != hashlib.sha256(Path(__file__).with_name('host.py').read_bytes()).hexdigest()
            or refusal["exitCode"] != 23 or refusal["journalUnchanged"] is not True
            or base64.b64decode(refusal["stderrBase64"], validate=True) != b"attempt-already-recorded\n"):
        raise ValueError("lifecycle-replay-not-refused")
    witness = record['pressure']
    if (witness['nonce'] != nonce or witness['bytes'] != profile.PRESSURE_BYTES
            or witness['drainStarted'] is not True or witness['drainPending'] is not True
            or witness['plumbingOnly'] is not True or witness['nativeProtocolFrame'] is not False
            or len(witness['samples']) != 2 or witness['highWater'] < witness['lowWater']
            or any(sample['bufferBytes'] <= witness['highWater'] for sample in witness['samples'])
            or witness['samples'][0]['observedMonotonic'] > witness['samples'][1]['observedMonotonic']
            or attempt['pressureWrite'] != {'sequence': 3, 'bytes': profile.PRESSURE_BYTES,
                'state': 'attempted', 'delivery': 'unknown'}):
        raise ValueError('pressure-witness-or-journal-not-bound')
    protocol = record["protocol"]
    if record["case"] == "pressure-owner-loss":
        if protocol is not None:
            raise ValueError("dead-owner-result-fabricated")
    else:
        report = protocol["report"]
        if {'nonce': nonce, **report['pressureWitness']} != record['pressure']:
            raise ValueError('pressure-witness-diverged')
        if 'stdinClosePeerError' in report and (report['stdinClosePeerError'] not in {'BrokenPipeError', 'ConnectionResetError'}
                or report['stdinClosedAfterPeerError'] is not True):
            raise ValueError('pressure-pipe-close-unaccounted')
        if (protocol["nonce"] != nonce or protocol["profile"] != profile.manifest()
                or report["fault"] not in ({"normal-stop"} if record["case"] == "pressure-stop" else {"transport-ended", "write-failed"})
                or report["directChildReaped"] is not True or report["returnCode"] != (0 if record['case'] == 'pressure-stop' else 77)
                or report["signals"] or report["spawnUncertain"] or protocol["heartbeatErrors"] or protocol["leaseExitCode"] != 0
                or len(report["writes"]) != 3):
            raise ValueError("lifecycle-protocol-outcome-mismatch")
        if (report['readerEof'] != {'stdout': True, 'stderr': True}
                or report['cleanupErrors'] or any(write['state'] != 'locally-drained' for write in report['writes'][:2])
                or protocol['handshakeAccepted'] is not True):
            raise ValueError('lifecycle-stream-cleanup-mismatch')
        if any(write['bufferBytesAfterWrite'] > write['highWater'] for write in report['writes'][:2]):
            raise ValueError('pressure-small-frame-baseline-exceeded')
        for stream in ('stdout', 'stderr'):
            captured = base64.b64decode(protocol['rawBase64'][stream], validate=True)
            if (len(captured) != report['retainedBytes'][stream]
                    or len(captured) != report['observedBytes'][stream] or report['discardedBytes'][stream]):
                raise ValueError('lifecycle-byte-accounting-mismatch')
            if stream == 'stderr' and captured != b'initialized-notification-observed\n':
                raise ValueError('lifecycle-peer-stderr-mismatch')
        raw = base64.b64decode(protocol['rawBase64']['stdout'], validate=True)
        if json.loads(raw)['id'] != 1:
            raise ValueError('pressure-handshake-response-missing')
        if (report['writes'][2]['bytes'] != profile.PRESSURE_BYTES
                or report['writes'][2]['state'] not in {'uncertain-write', 'uncertain-write-cancelled'}
                or report['stdinAbortRequested'] is not True):
            raise ValueError('pressure-write-not-uncertain')
        if record['case'] == 'pressure-stop' and (report['writes'][2]['state'] != 'uncertain-write-cancelled'
                or report['controlObservedMonotonic'] > report['pressureOutcomeMonotonic']):
            raise ValueError('pressure-stop-not-cancelled')
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
    if len(records) != 6 or {record['case'] for record in records} != set(profile.MODES) | {'native-refusal', 'partial-journal-refusal', 'cleanup-hook-failure'}:
        raise ValueError('unified-cases-missing')
    for record in records:
        if record['case'] == 'native-refusal':
            if (record['returnCode'] != 2 or record['nativeLaunched'] is not False
                    or b'native-execution-disabled: fixed mock launcher only' not in
                    base64.b64decode(record['stderrBase64'], validate=True)):
                raise ValueError('unified-native-refusal-missing')
        elif record['case'] == 'partial-journal-refusal':
            if record['records'] != [{'bytes': n, 'exitCode': 23, 'journalUnchanged': True} for n in (0, 7)]:
                raise ValueError('partial-journal-refusal-missing')
        elif record['case'] == 'cleanup-hook-failure':
            report = record['report']
            if (report['fault'] != 'normal-stop' or report['cleanupErrors'] != ['before-cleanup:ValueError']
                    or report['directChildReaped'] is not True or report['returnCode'] != 0 or report['signals']
                    or report['readerEof'] != {'stdout': True, 'stderr': True}
                    or base64.b64decode(record['stdoutBase64'], validate=True) != b'fixture-input\n'):
                raise ValueError('cleanup-hook-failure-not-accounted')
        else:
            validate_lifecycle(record)
