"""Independent Linux lifecycle and peer-receipt witnesses for the unified path."""
import json
import os
import select
import selectors
import subprocess
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import profile
import service
import common


def emit(packet):
    print(json.dumps(packet), flush=True)


def read_record(path):
    deadline = time.monotonic() + profile.SPAWN_SECONDS
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    return json.loads(path.read_text())


def observe_command():
    selector = selectors.DefaultSelector()
    try:
        selector.register(0, selectors.EVENT_READ)
        if not selector.select(30) or sys.stdin.buffer.readline(64) != b'observe\n':
            raise ValueError('observer-observe-command-missing')
    finally:
        selector.close()


def verify(fd, identity):
    proc = Path('/proc') / str(identity['pid'])
    fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
    uid = int(next(row for row in (proc / 'status').read_text().splitlines() if row.startswith('Uid:')).split()[1])
    if (int(fields[19]) != identity['startTicks'] or uid != 1000
            or int(fields[1]) != identity['ppid'] or int(fields[3]) != identity['sid']
            or select.select([fd], [], [], 0)[0]
            or (proc / 'cgroup').read_text().strip() != identity['cgroup']):
        raise ValueError('held-instance-not-live-or-mismatch')


def hold(folder, role, nonce):
    identity = read_record(folder / (role + '.json'))
    if identity['nonce'] != nonce:
        raise ValueError('observer-nonce-mismatch')
    fd = os.pidfd_open(identity['pid'])
    try:
        verify(fd, identity)
    except (OSError, ValueError):
        os.close(fd)
        raise
    return fd, identity


def descriptor_for(nonce):
    query = service.query('tiye-service-' + nonce + '.service')
    props = query['properties']
    if query['returnCode'] != 0 or query.get('timedOut') or props.get('ActiveState') != 'active':
        raise ValueError('service-not-observed-active')
    expected = {'Id': 'tiye-service-' + nonce + '.service', 'KillMode': 'control-group',
        'ExitType': 'main', 'RuntimeMaxUSec': '1min', 'TimeoutStopUSec': '5s',
        'SendSIGKILL': 'yes', 'Restart': 'no', 'Delegate': 'no', 'Transient': 'yes', 'UMask': '0077'}
    if any(props.get(key) != value for key, value in expected.items()):
        raise ValueError('service-policy-not-applied')
    if (not service.HEX32_RE.fullmatch(props['InvocationID']) or props['InvocationID'] == '0' * 32
            or not props['ControlGroup'].startswith('/user.slice/user-1000.slice/')
            or props['Id'] not in props['ControlGroup'].split('/')):
        raise ValueError('service-descriptor-not-bound')
    return {'unit': props['Id'], 'invocationId': props['InvocationID'],
        'controlGroup': props['ControlGroup'], 'mainPid': int(props['MainPID']), 'properties': props,
        'beforeQuery': query}


def run(folder, nonce, mode):
    descriptor, sentinel = None, None
    fds, owned = [], []
    try:
        sentinel = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(folder / 'worker.py'),
            'sentinel', str(folder), nonce, mode], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
        sentinel_fd, sentinel_id = hold(folder, 'sentinel', nonce)
        fds.append(sentinel_fd)
        for role in ('main', 'leaf', 'protocol-live'):
            held = hold(folder, role, nonce)
            owned.append(held)
            fds.append(held[0])
        descriptor = descriptor_for(nonce)
        main, leaf, peer = [identity for fd, identity in owned]
        group = '0::' + descriptor['controlGroup']
        observer = {'pid': os.getpid(), 'uid': os.getuid(), 'cgroup': Path('/proc/self/cgroup').read_text().strip()}
        assert main['pid'] == descriptor['mainPid']
        assert all(identity['cgroup'] == group for identity in (main, leaf, peer))
        assert all(identity['ppid'] == main['pid'] and identity['sid'] != main['sid'] for identity in (leaf, peer))
        for outside in (observer, sentinel_id):
            assert outside['cgroup'] != group and not outside['cgroup'].startswith(group + '/')
        cgroup = Path('/sys/fs/cgroup') / descriptor['controlGroup'].lstrip('/')
        assert 'populated 1' in (cgroup / 'cgroup.events').read_text()
        assert time.monotonic() - main['observedMonotonic'] < profile.INITIALIZE_SECONDS
        for fd, identity in owned:
            verify(fd, identity)
        common.save(folder / "descriptor.json", descriptor)
        emit({"event": "ready", "nonce": nonce, "descriptor": descriptor})
        observe_command()
        started = time.monotonic()
        deadline = started + profile.OBSERVATION_SECONDS
        while time.monotonic() < deadline:
            exited = all(select.select([fd], [], [], 0)[0] for fd, identity in owned)
            absent = all(not (Path('/proc') / str(identity['pid'])).exists() for fd, identity in owned)
            empty = not cgroup.exists() or 'populated 0' in (cgroup / 'cgroup.events').read_text()
            if exited and absent and empty:
                break
            time.sleep(0.01)
        assert exited and absent and empty
        assert not select.select([sentinel_fd], [], [], 0)[0] and sentinel.poll() is None
        expiry = None
        if mode != "pressure-stop":
            expiry = read_record(folder / "lease-expired.json")
            assert expiry["nonce"] == nonce and expiry["pid"] == main["pid"]
            assert expiry["reason"] == "expired" and expiry["ageSeconds"] > 1
        else:
            assert not (folder / "lease-expired.json").exists()
        assert peer["initializedNotification"] == {"method": "initialized"}
        after = service.query(descriptor['unit'])
        assert not after.get('timedOut'), 'terminal-query-timed-out'
        if after['properties'].get('LoadState') != 'not-found':
            assert after['returnCode'] == 0 and not after.get('timedOut')
            assert after['properties']['InvocationID'] == descriptor['invocationId']
        finished = time.monotonic()
        assert finished - started < profile.OBSERVATION_SECONDS
        assert finished - main['observedMonotonic'] < 30
        emit({'event': 'result', 'nonce': nonce, 'mode': mode, 'profile': profile.manifest(),
            'descriptor': descriptor, 'identities': [identity for fd, identity in owned],
            'observer': observer, 'sentinel': sentinel_id, 'leaseExpiry': expiry,
            'serviceCommand': read_record(folder / 'service-command.json'),
            'afterQuery': after, 'managerTerminalAvailable': after['properties'].get('LoadState') != 'not-found',
            'cgroupAfter': 'removed' if not cgroup.exists() else (cgroup / 'cgroup.events').read_text(),
            'cleanupSeconds': finished - started, 'workerLifetimeSeconds': finished - main['observedMonotonic'],
            'heldPidfdsSignaled': True, 'originalProcEntriesAbsent': True, 'unrelatedSentinelLive': True})
    finally:
        original_error, errors = sys.exception(), []
        if descriptor is not None:
            try:
                service.stop_owned(descriptor)
            except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                errors.append('service: ' + repr(error))
        if sentinel is not None:
            try:
                if sentinel.poll() is None:
                    sentinel.kill()
                sentinel.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired) as error:
                errors.append('sentinel: ' + repr(error))
        for fd in fds:
            try:
                os.close(fd)
            except OSError as error:
                errors.append('pidfd: ' + repr(error))
        if errors:
            if original_error is not None:
                original_error.add_note('; '.join(errors))
            else:
                raise RuntimeError('; '.join(errors))
