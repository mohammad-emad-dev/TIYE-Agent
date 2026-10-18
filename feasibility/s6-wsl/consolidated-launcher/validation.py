"""One-source saved protocol, interruption, pressure and preparation verdicts."""
import base64
import hashlib
import json
from pathlib import Path
import profile


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def validate_witnesses(record):
    linux, windows, mode = record['linux'], record['watchdog'], record['case']
    require(linux['profile'] == profile.manifest() and linux['mode'] == mode, 'profile-or-mode-mismatch')
    require(all(linux[k] is True for k in ('heldPidfdsSignaled', 'originalProcEntriesAbsent', 'unrelatedSentinelLive')), 'linux-cleanup-unverified')
    require(record['windowsHeldHandleCount'] == 3 and record['windowsHeldHandlesSignaled'] is True
        and windows['windowsJobEmpty'] is True and windows['rootHandleSignaled'] is True, 'windows-cleanup-unverified')
    require(windows['stopReason'] in ('job-empty', 'owner-exit') and windows['finalRootExitCode'] == (77 if mode in profile.OWNERS else 0)
        and windows['deadlineSeconds'] == profile.WINDOWS_WATCHDOG_SECONDS, 'watchdog-fallback')
    require(0 <= record['injectionToWindowsDoneSeconds'] < 15 and 0 <= linux['cleanupSeconds'] < 15
        and 0 <= linux['workerLifetimeSeconds'] < 30, 'cleanup-bound-exceeded')
    require(linux['cgroupAfter'] == 'removed' or 'populated 0' in linux['cgroupAfter'].splitlines(), 'cgroup-not-empty')


def validate_identity(record):
    linux = record['linux']
    main, leaf, peer = linux['identities']
    desc, nonce = linux['descriptor'], linux['nonce']
    group = '0::' + desc['controlGroup']
    require(record['windowsIdentities']['nonce'] == nonce and desc['unit'] == 'tiye-service-' + nonce + '.service'
        and desc['mainPid'] == main['pid'] and record['runtime']['uid'] == 1000, 'generation-not-bound')
    require(all(r['cgroup'] == group and r['nonce'] == nonce for r in (main, leaf, peer)), 'membership-mismatch')
    require(all(r['ppid'] == main['pid'] and r['sid'] != main['sid'] for r in (leaf, peer)), 'parent-session-mismatch')
    for outside in (linux['observer'], linux['sentinel']):
        require(outside['cgroup'] != group and not outside['cgroup'].startswith(group + '/'), 'observer-inside-tree')
    command = linux['serviceCommand']
    require(command['nonce'] == nonce and command['profile'] == profile.manifest() and command['argv'][0] == '/usr/bin/systemd-run'
        and all(flag in command['argv'] for flag in ('--pipe', '--wait', '--quiet', '--service-type=exec'))
        and any(arg.endswith('/worker.py') for arg in command['argv']), 'command-not-bound')
    expected = {'KillMode': 'control-group', 'ExitType': 'main', 'RuntimeMaxUSec': '1min', 'TimeoutStopUSec': '5s',
        'UMask': '0077', 'Restart': 'no', 'Delegate': 'no', 'SendSIGKILL': 'yes', 'Transient': 'yes'}
    require(all(desc['beforeQuery']['properties'].get(k) == v for k, v in expected.items()), 'policy-mismatch')
    terminal = linux['afterQuery']
    require(not terminal.get('timedOut'), 'terminal-query-timeout')
    if terminal['properties'].get('LoadState') == 'not-found':
        require(linux['managerTerminalAvailable'] is False, 'gc-metadata-misrepresented')
    else:
        require(linux['managerTerminalAvailable'] is True and terminal['returnCode'] == 0
            and terminal['properties']['InvocationID'] == desc['invocationId'], 'terminal-query-not-bound')


def validate_phase(record):
    linux, mode = record['linux'], record['case']
    main, leaf, peer = linux['identities']
    nonce = linux['nonce']
    if mode in profile.BASELINE:
        receipt = linux['receipt']
        require(receipt['nonce'] == nonce and receipt['pid'] == peer['pid'] and receipt['initializeRequest'] == peer['initializeRequest']
            and receipt['stdinEof'] is True and receipt['unexpectedInputBytes'] == 0, 'receipt-not-bound')
        require(receipt['initializedNotification'] == ({'method': 'initialized'} if mode == 'valid' else None), 'notification-not-revoked')
        require(linux['reaped'] == {'nonce': nonce, 'pid': peer['pid'], 'returnCode': 0}, 'peer-not-reaped')
    else:
        require(peer['initializedNotification'] == (None if mode == 'stop-pending' else {'method': 'initialized'}), 'phase-mismatch')
        require(linux['receipt'] is None and linux['reaped'] is None, 'interrupted-result-fabricated')
    expiry = linux['leaseExpiry']
    if mode in profile.LOSSES:
        require(expiry['nonce'] == nonce and expiry['pid'] == main['pid'] and expiry['reason'] == 'expired'
            and expiry['ageSeconds'] > 1, 'lease-expiry-not-bound')
    else:
        require(expiry is None, 'unexpected-lease-expiry')
    if mode in profile.STOPS:
        stopped = record['stop']
        require(stopped['nonce'] == nonce and stopped['stop']['state'] == 'stop-requested', 'stop-not-observed')
        before, desc = stopped['stop']['initialQuery'], linux['descriptor']
        require(not before.get('timedOut') and before['returnCode'] == 0 and all(before['properties'][k] == desc[t]
            for k, t in (('Id', 'unit'), ('InvocationID', 'invocationId'), ('ControlGroup', 'controlGroup')))
            and stopped['stop']['stop']['returnCode'] == 0 and not stopped['stop']['stop']['timedOut'], 'stop-control-failed')
    else:
        require(record['stop'] is None, 'unexpected-stop')


def validate_attempt(record):
    attempt, refusal = record['attempt'], record['restartRefusal']
    require(attempt['nonce'] == record['linux']['nonce'] and attempt['state'] == 'attempted' and attempt['delivery'] == 'unknown'
        and attempt['sourceSha256'] == hashlib.sha256(Path(__file__).with_name('host.py').read_bytes()).hexdigest(), 'attempt-not-bound')
    require(refusal['exitCode'] == 23 and refusal['journalUnchanged'] is True
        and base64.b64decode(refusal['stderrBase64'], validate=True) == b'attempt-already-recorded\n', 'restart-not-refused')
    if record['case'] not in profile.PRESSURE:
        require('pressureWrite' not in attempt and record['pressure'] is None, 'pressure-in-wrong-scenario')
        return
    require(attempt['pressureWrite'] == {'sequence': 3, 'bytes': profile.PRESSURE_BYTES, 'state': 'attempted', 'delivery': 'unknown'}, 'pressure-attempt-not-bound')
    w = record['pressure']
    require(w['nonce'] == record['linux']['nonce'] and w['bytes'] == profile.PRESSURE_BYTES and w['drainStarted'] is True
        and w['drainPending'] is True and w['plumbingOnly'] is True and w['nativeProtocolFrame'] is False, 'pressure-not-observed')
    require(len(w['samples']) == 2 and w['highWater'] >= w['lowWater'] and all(s['bufferBytes'] > w['highWater'] for s in w['samples'])
        and w['samples'][0]['observedMonotonic'] <= w['samples'][1]['observedMonotonic'], 'pressure-samples-mismatch')


def validate_protocol(record):
    protocol, mode = record['protocol'], record['case']
    if mode in profile.OWNERS:
        require(protocol is None, 'dead-owner-result-fabricated')
        return
    report = protocol['report']
    faults = {'valid': {None}, 'foreign': {'uncorrelated-or-error-response'}, 'invalid-raw': {'invalid-json:UnicodeDecodeError'}}
    expected = faults.get(mode, {'normal-stop'} if mode in profile.STOPS else {'transport-ended', 'write-failed'})
    require(protocol['nonce'] == record['linux']['nonce'] and protocol['profile'] == profile.manifest() and report['fault'] in expected, 'fault-mismatch')
    require(report['directChildReaped'] is True and report['returnCode'] == (77 if mode in profile.LOSSES else 0)
        and report['readerEof'] == {'stdout': True, 'stderr': True} and not report['cleanupErrors'] and not report['signals']
        and report['spawnUncertain'] is False and not protocol['heartbeatErrors'] and protocol['leaseExitCode'] == 0, 'client-cleanup-failed')
    count = 3 if mode in profile.PRESSURE else 1 if mode in ('foreign', 'invalid-raw', 'stop-pending') else 2
    require(len(report['writes']) == count and all(w['state'] == 'locally-drained' and w['bufferBytesAfterWrite'] <= w['highWater']
        for w in report['writes'][:min(count, 2)]), 'handshake-writes-mismatch')
    require(protocol['handshakeAccepted'] is (mode not in ('foreign', 'invalid-raw', 'stop-pending')), 'acceptance-mismatch')
    require(report['writes'][0]['payloadSha256'] == record['linux']['identities'][2]['initializeBytesSha256'], 'initialize-bytes-not-correlated')
    if mode in profile.BASELINE:
        receipt = record['linux']['receipt']
        require(receipt['initializeBytesSha256'] == report['writes'][0]['payloadSha256'], 'receipt-initialize-bytes-mismatch')
        require(receipt['initializedBytesSha256'] == (report['writes'][1]['payloadSha256'] if mode == 'valid' else None), 'receipt-notification-bytes-mismatch')
    for stream in ('stdout', 'stderr'):
        raw = base64.b64decode(protocol['rawBase64'][stream], validate=True)
        require(len(raw) == report['retainedBytes'][stream] == report['observedBytes'][stream] and report['discardedBytes'][stream] == 0, 'byte-accounting-mismatch')
        if stream == 'stderr':
            require(raw == (b'' if count == 1 else b'initialized-notification-observed\n'), 'stderr-mismatch')
        elif mode == 'invalid-raw':
            require(raw == b'\xff\n', 'invalid-raw-not-preserved')
        elif mode == 'stop-pending':
            require(raw == b'', 'pending-stop-received-response')
        else:
            require(json.loads(raw)['id'] == (2 if mode == 'foreign' else 1), 'response-id-mismatch')
    if mode in profile.PRESSURE:
        require({'nonce': record['linux']['nonce'], **report['pressureWitness']} == record['pressure'] and report['stdinAbortRequested'] is True
            and report['writes'][2]['bytes'] == profile.PRESSURE_BYTES and report['writes'][2]['state'] in {'uncertain-write', 'uncertain-write-cancelled'}, 'pressure-outcome-mismatch')
        if mode == 'pressure-stop':
            require(report['writes'][2]['state'] == 'uncertain-write-cancelled'
                and report['controlObservedMonotonic'] <= report['pressureOutcomeMonotonic'], 'pressure-stop-not-cancelled')
    if 'stdinClosePeerError' in report:
        require(report['stdinClosePeerError'] in {'BrokenPipeError', 'ConnectionResetError'} and report['stdinClosedAfterPeerError'] is True, 'peer-close-unaccounted')


def validate_lifecycle(record):
    validate_witnesses(record)
    validate_identity(record)
    validate_phase(record)
    validate_attempt(record)
    validate_protocol(record)


def validate_records(records, entry):
    guards = {'native-refusal', 'partial-journal-refusal', 'cleanup-hook-failure', 'candidate-preparation'}
    require(len(records) == 13 and {r['case'] for r in records} == set(profile.MODES) | guards, 'cases-missing')
    sources = {Path(name).name: digest for name, digest in entry['sourceSha256'].items()}
    for record in records:
        mode = record['case']
        if mode in profile.MODES:
            require(record['sourceSetSha256'] == entry['sourceSetSha256']
                and record['bundleSourceSha256'] == {n: sources[n] for n in profile.BUNDLE_FILES}, 'case-source-set-mismatch')
            validate_lifecycle(record)
        elif mode == 'native-refusal':
            require(record['returnCode'] == 2 and record['nativeLaunched'] is False
                and b'native-execution-disabled: fixed mock launcher only' in base64.b64decode(record['stderrBase64'], validate=True), 'native-refusal-missing')
        elif mode == 'partial-journal-refusal':
            require(record['records'] == [{'bytes': n, 'exitCode': 23, 'journalUnchanged': True} for n in (0, 7)], 'partial-journal-refusal-missing')
        elif mode == 'candidate-preparation':
            expected = ['candidate:' + n for n in ('binary', 'binarySha256', 'installationSha256', 'executed')]
            expected += ['config:' + n for n in ('argvTail', 'sourceSetSha256', 'nativeExecutionAllowed', 'experimentalApi', 'profile')]
            require(record['plan'] == entry['preparedCandidate'] and record['nativeLaunched'] is False and record['refused'] == expected
                and record['fixtureBytesMismatchRefused'] is True and record['fixturePathMismatchRefused'] is True, 'preparation-cases-missing')
        else:
            report = record['report']
            require(report['fault'] == 'normal-stop' and report['cleanupErrors'] == ['before-cleanup:ValueError']
                and report['directChildReaped'] is True and report['returnCode'] == 0 and not report['signals']
                and report['readerEof'] == {'stdout': True, 'stderr': True}
                and base64.b64decode(record['stdoutBase64'], validate=True) == b'fixture-input\n', 'hook-failure-not-accounted')
