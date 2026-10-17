"""Independent Linux pidfd observer; no control before final observations."""
import json
import os
import select
import selectors
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import service


def emit(packet):
    print(json.dumps(packet), flush=True)


def read_record(path):
    deadline = time.monotonic() + 5
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    return json.loads(path.read_text())


def command(expected):
    selector = selectors.DefaultSelector()
    try:
        selector.register(0, selectors.EVENT_READ)
        if not selector.select(8):
            raise TimeoutError('observer-input-deadline')
        # Parent sends one short command only after each response.
        if sys.stdin.buffer.readline(64) != expected:
            raise ValueError('observer-command-mismatch')
    finally:
        selector.close()


def hold(folder, role, nonce):
    identity = read_record(folder / (role + '.json'))
    if identity['nonce'] != nonce:
        raise ValueError('observer-nonce')
    fd = os.pidfd_open(identity['pid'])
    try:
        verify(fd, identity)
    except (OSError, ValueError):
        os.close(fd)
        raise
    return fd, identity


def verify(fd, identity):
    proc = Path('/proc') / str(identity['pid'])
    ticks = int((proc / 'stat').read_text().rsplit(')', 1)[1].split()[19])
    if (ticks != identity['startTicks'] or select.select([fd], [], [], 0)[0]
            or (proc / 'cgroup').read_text().strip() != identity['cgroup']):
        raise ValueError('observer-instance-not-live')


def run(folder, nonce):
    descriptor, sentinel = None, None
    owned, fds = [], []
    try:
        sentinel = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(folder / 'peer.py'),
            'sentinel', str(folder), nonce], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
        sentinel_fd, sentinel_id = hold(folder, 'sentinel', nonce)
        fds.append(sentinel_fd)
        read_record(folder / 'lease.json')
        (folder / 'mode.txt').write_text('pending')
        launched = time.monotonic()
        descriptor = service.launch(folder, nonce, 8)
        for role in ('main', 'leaf', 'protocol-live'):
            held = hold(folder, role, nonce)
            owned.append(held)
            fds.append(held[0])
        main, leaf, protocol = [identity for fd, identity in owned]
        unit_group = '0::' + descriptor['controlGroup']
        observer = {'pid': os.getpid(), 'uid': os.getuid(),
            'cgroup': Path('/proc/self/cgroup').read_text().strip()}
        assert main['pid'] == descriptor['mainPid']
        assert all(identity['cgroup'] == unit_group for identity in (main, leaf, protocol))
        assert all(identity['ppid'] == main['pid'] and identity['sid'] != main['sid']
            for identity in (leaf, protocol))
        assert protocol['stage'] == 'pending' and protocol['initializeReceived'] is True
        for outside in (observer, sentinel_id):
            assert outside['cgroup'] != unit_group and not outside['cgroup'].startswith(unit_group + '/')
        emit({'event': 'ready', 'nonce': nonce})
        command(b'arm\n')
        before = service.query(descriptor['unit'])
        assert before['returnCode'] == 0 and not before.get('timedOut', False)
        assert before['properties']['ActiveState'] == 'active'
        expected_policy = {'KillMode': 'control-group', 'ExitType': 'main', 'RuntimeMaxUSec': '8s',
            'TimeoutStopUSec': '500ms', 'Restart': 'no', 'Delegate': 'no', 'UMask': '0077',
            'SendSIGKILL': 'yes', 'Transient': 'yes'}
        assert all(before['properties'].get(key) == value for key, value in expected_policy.items())
        assert all(before['properties'][key] == descriptor['properties'][key]
            for key in ('Id', 'InvocationID', 'ControlGroup', 'MainPID'))
        for fd, identity in owned:
            verify(fd, identity)
        lease = read_record(folder / 'lease.json')
        armed = time.monotonic()
        assert lease['nonce'] == nonce and 0 <= armed - lease['received'] < 0.5
        assert armed - launched < 2
        assert not (folder / 'protocol.json').exists()
        emit({'event': 'armed', 'nonce': nonce, 'lease': lease})
        command(b'observe\n')
        cgroup = Path('/sys/fs/cgroup') / descriptor['controlGroup'].lstrip('/')
        deadline = armed + 4
        while time.monotonic() < deadline:
            exited = all(select.select([fd], [], [], 0)[0] for fd, identity in owned)
            absent = all(not (Path('/proc') / str(identity['pid'])).exists() for fd, identity in owned)
            empty = not cgroup.exists() or 'populated 0' in (cgroup / 'cgroup.events').read_text()
            if exited and absent and empty:
                break
            time.sleep(0.01)
        assert exited and absent and empty
        assert not select.select([sentinel_fd], [], [], 0)[0] and sentinel.poll() is None
        after = service.query(descriptor['unit'])
        expiry = read_record(folder / 'lease-expired.json')
        finished = time.monotonic()
        assert finished - launched < 6 and finished - armed < 4
        assert expiry['nonce'] == nonce and expiry['pid'] == main['pid']
        assert expiry['reason'] == 'expired' and expiry['ageSeconds'] >= 1
        assert expiry['lastReceived'] >= lease['received']
        assert expiry['observedMonotonic'] - expiry['lastReceived'] == expiry['ageSeconds']
        assert expiry['lastSequence'] >= lease['sequence']
        assert after['properties']['Id'] == descriptor['unit']
        assert after['properties']['InvocationID'] == descriptor['invocationId']
        assert after['properties']['ExecMainStatus'] == '71'
        assert after['properties']['ExecMainCode'] == '1' and after['properties']['Result'] == 'exit-code'
        assert not (folder / 'protocol.json').exists()
        emit({'event': 'result', 'nonce': nonce, 'descriptor': descriptor, 'before': before,
            'after': after, 'identities': [identity for fd, identity in owned],
            'observer': observer, 'sentinel': sentinel_id, 'leaseAtArm': lease, 'expiry': expiry,
            'preActionSeconds': armed - launched, 'cleanupSeconds': finished - armed,
            'totalSeconds': finished - launched,
            'cgroupAfter': 'removed' if not cgroup.exists() else (cgroup / 'cgroup.events').read_text(),
            'originalPidfdsSignaled': True, 'originalProcEntriesAbsent': True,
            'unrelatedSentinelLive': True, 'protocolCompletion': 'interrupted-unobserved'})
    finally:
        original_error = sys.exception()
        cleanup_errors = []
        if descriptor is not None:
            try:
                service.stop_owned(descriptor)
            except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                cleanup_errors.append('service: ' + repr(error))
        if sentinel is not None:
            try:
                if sentinel.poll() is None:
                    sentinel.kill()
                sentinel.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired) as error:
                cleanup_errors.append('sentinel: ' + repr(error))
        for fd in fds:
            try:
                os.close(fd)
            except OSError as error:
                cleanup_errors.append('pidfd: ' + repr(error))
        if cleanup_errors:
            detail = '; '.join(cleanup_errors)
            if original_error is not None:
                original_error.add_note('Observer cleanup errors: ' + detail)
            else:
                raise RuntimeError('Observer cleanup errors: ' + detail)
