"""Synthetic Linux service, stdin lease and independent pidfd/cgroup witness."""
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import select
import selectors
import stat
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace

CAPS = {'bootstrap': 65536, 'worker': 16384, 'observer': 32768}
RESERVED = 16384
OWNERS = {'linux_runtime.py': 'bootstrap', 'config.json': 'bootstrap', 'retention.json': 'bootstrap',
          'startup.json': 'worker', 'terminal.json': 'worker', 'audit.json': 'observer'}
BUS_ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'XDG_RUNTIME_DIR': '/run/user/1000',
           'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/1000/bus'}
PROPS = ('Id', 'LoadState', 'InvocationID', 'ControlGroup', 'MainPID', 'ActiveState',
         'KillMode', 'ExitType', 'RuntimeMaxUSec', 'TimeoutStopUSec', 'Restart',
         'Delegate', 'Transient', 'UMask', 'SendSIGKILL', 'ExecMainStatus')


def unique(pairs):
    record = {}
    for key, field in pairs:
        if key in record:
            raise ValueError('duplicate-json-member')
        record[key] = field
    return record


def reject_constant(name):
    raise ValueError('nonfinite-json-number')


def decode(payload):
    return json.loads(payload, object_pairs_hook=unique, parse_constant=reject_constant)


def encode(record):
    return json.dumps(record, sort_keys=True, allow_nan=False).encode('utf-8')


class Ledger:
    def __init__(self, role):
        if role not in CAPS:
            raise ValueError('fixed-linux-role')
        self.role, self.used = role, 0

    def charge(self, size):
        if type(size) is not int or size < 0 or size > CAPS[self.role] - self.used:
            raise ValueError('linux-runtime-allocation-exhausted')
        self.used += size


def open_root(root, nonce):
    if (os.getuid() != 1000 or not re.fullmatch('[0-9a-f]{32}', nonce)
            or root.parent != Path('/tmp') or not root.name.startswith('tiye-charged-' + nonce + '-')):
        raise ValueError('linux-runtime-root')
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    observed = os.fstat(fd)
    if observed.st_uid != 1000 or stat.S_IMODE(observed.st_mode) != 0o700:
        os.close(fd)
        raise ValueError('linux-root-permissions')
    return fd


def read_file(rootfd, name):
    if name not in OWNERS:
        raise ValueError('unknown-runtime-file')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=rootfd)
    try:
        observed = os.fstat(fd)
        if (not stat.S_ISREG(observed.st_mode) or observed.st_uid != 1000 or observed.st_nlink != 1
                or stat.S_IMODE(observed.st_mode) != 0o600 or observed.st_size > 65536):
            raise ValueError('runtime-file-type-owner-or-size')
        payload = bytearray()
        while block := os.read(fd, min(16384, 65537 - len(payload))):
            payload.extend(block)
            if len(payload) > 65536:
                raise ValueError('runtime-read-cap')
        return bytes(payload)
    finally:
        os.close(fd)


def write_file(rootfd, name, payload, ledger):
    if name not in OWNERS or OWNERS[name] != ledger.role:
        raise ValueError('runtime-file-accounting-owner')
    ledger.charge(len(payload))
    fd = os.open(name, os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_RDWR, 0o600, dir_fd=rootfd)
    try:
        if os.write(fd, payload) != len(payload):
            raise OSError('short-runtime-write')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        if os.read(fd, len(payload) + 1) != payload:
            raise ValueError('runtime-write-readback')
    finally:
        os.close(fd)


def verify_bundle(rootfd, nonce):
    config = decode(read_file(rootfd, 'config.json'))
    if (set(config) != {'nonce', 'sourceSha256', 'caps'} or config['nonce'] != nonce or config['caps'] != CAPS
            or hashlib.sha256(read_file(rootfd, 'linux_runtime.py')).hexdigest() != config['sourceSha256']):
        raise ValueError('runtime-source-or-config-drift')


def emit(record):
    payload = encode(record) + b'\n'
    if len(payload) > 8192:
        raise ValueError('observer-output-cap')
    if os.write(1, payload) != len(payload):
        raise OSError('short-observer-output')


def identity(pid):
    proc = Path('/proc') / str(pid)
    fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
    uid = int(next(row for row in (proc / 'status').read_text().splitlines() if row.startswith('Uid:')).split()[1])
    return {'pid': pid, 'startTicks': int(fields[19]), 'ppid': int(fields[1]),
            'sid': int(fields[3]), 'uid': uid, 'cgroup': (proc / 'cgroup').read_text().strip()}


def hold(expected):
    fd = os.pidfd_open(expected['pid'])
    try:
        if identity(expected['pid']) != expected or select.select([fd], [], [], 0)[0]:
            raise ValueError('linux-held-identity-not-live')
        return fd
    except (OSError, ValueError):
        os.close(fd)
        raise


def heartbeat(line, nonce, sequence):
    packet = decode(line)
    if (type(packet) is not dict or set(packet) != {'nonce', 'sequence'} or packet['nonce'] != nonce
            or type(packet['sequence']) is not int or packet['sequence'] != sequence + 1):
        raise ValueError('lease-nonce-or-sequence')
    return packet['sequence']


def lease_loop(nonce):
    pending = bytearray()
    sequence, last = 0, time.monotonic()
    with selectors.DefaultSelector() as selector:
        selector.register(0, selectors.EVENT_READ)
        while True:
            now = time.monotonic()
            if now - last >= 1:
                return 'expired', sequence, last, now
            if not selector.select(min(0.1, last + 1 - now)):
                continue
            block = os.read(0, 4096)
            if not block:
                if pending:
                    raise ValueError('truncated-heartbeat')
                return 'eof', sequence, last, time.monotonic()
            pending.extend(block)
            if len(pending) > 4096:
                raise ValueError('heartbeat-buffer-cap')
            while b'\n' in pending:
                line, _, rest = pending.partition(b'\n')
                sequence = heartbeat(line, nonce, sequence)
                pending = bytearray(rest)
                last = time.monotonic()


def worker(root, nonce):
    rootfd = open_root(root, nonce)
    verify_bundle(rootfd, nonce)
    ledger = Ledger('worker')
    leaf = subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B', '-c', 'import time; time.sleep(95)'],
                            start_new_session=True, stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=BUS_ENV)
    write_file(rootfd, 'startup.json', encode({'nonce': nonce, 'main': identity(os.getpid()),
                                            'leaf': identity(leaf.pid)}), ledger)
    reason, sequence, last, observed = lease_loop(nonce)
    try:
        write_file(rootfd, 'terminal.json', encode({'nonce': nonce, 'pid': os.getpid(), 'reason': reason,
            'lastSequence': sequence, 'ageSeconds': observed - last, 'chargedBeforeTerminal': ledger.used}), ledger)
    finally:
        # Persistence failure must not keep the service main alive after lease loss.
        os._exit(71)


def unit_name(nonce):
    return 'tiye-charged-' + nonce + '.service'


def bridge(root, nonce):
    fd = open_root(root, nonce)
    verify_bundle(fd, nonce)
    os.close(fd)
    argv = ['/usr/bin/systemd-run', '--user', '--quiet', '--wait', '--collect', '--pipe',
            '--service-type=exec', '--unit=' + unit_name(nonce), '-pKillMode=control-group',
            '-pExitType=main', '-pRuntimeMaxSec=20s', '-pTimeoutStopSec=2s', '-pRestart=no',
            '-pDelegate=no', '-pUMask=0077', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin',
            'LC_ALL=C.UTF-8', '/usr/bin/python3', '-I', '-S', '-B', str(root / 'linux_runtime.py'),
            'worker', str(root), nonce]
    os.execve(argv[0], argv, BUS_ENV)


def command(argv):
    child = subprocess.Popen(argv, env=BUS_ENV, stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    buffers = {name: bytearray() for name in ('stdout', 'stderr')}
    try:
        deadline = time.monotonic() + 2
        with selectors.DefaultSelector() as selector:
            for name in buffers:
                selector.register(getattr(child, name), selectors.EVENT_READ, name)
            while selector.get_map():
                if time.monotonic() >= deadline:
                    raise TimeoutError('bounded-systemctl-timeout')
                for key, _ in selector.select(max(0, deadline - time.monotonic())):
                    block = os.read(key.fileobj.fileno(), 4096)
                    if not block:
                        selector.unregister(key.fileobj)
                        continue
                    if len(block) > 8192 - sum(len(buffer) for buffer in buffers.values()):
                        raise ValueError('systemctl-output-cap')
                    buffers[key.data].extend(block)
        return child.wait(timeout=max(0.01, deadline - time.monotonic())), bytes(buffers['stdout']), bytes(buffers['stderr'])
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=1)
        child.stdout.close()
        child.stderr.close()


def query(nonce):
    code, stdout, stderr = command(['/usr/bin/systemctl', '--user', 'show', unit_name(nonce),
                                    '--no-pager', '--property=' + ','.join(PROPS)])
    properties = {}
    for line in stdout.decode('utf-8').splitlines():
        key, separator, field = line.partition('=')
        if not separator or key not in PROPS or key in properties:
            raise ValueError('systemctl-property-schema')
        properties[key] = field
    if code and properties.get('LoadState') != 'not-found':
        raise ValueError('systemctl-query-failed')
    return properties


def wait_startup(rootfd):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            return decode(read_file(rootfd, 'startup.json'))
        except (FileNotFoundError, json.JSONDecodeError):
            time.sleep(0.01)
    raise TimeoutError('linux-startup-expired')


def descriptor(nonce, startup):
    properties = query(nonce)
    expected = {'Id': unit_name(nonce), 'ActiveState': 'active', 'KillMode': 'control-group',
                'ExitType': 'main', 'RuntimeMaxUSec': '20s', 'TimeoutStopUSec': '2s',
                'Restart': 'no', 'Delegate': 'no', 'Transient': 'yes', 'UMask': '0077', 'SendSIGKILL': 'yes'}
    if any(properties.get(key) != field for key, field in expected.items()):
        raise ValueError('service-policy-mismatch')
    invocation = properties.get('InvocationID', '')
    group = properties.get('ControlGroup', '')
    if (not re.fullmatch('[0-9a-f]{32}', invocation) or invocation == '0' * 32
            or not group.startswith('/user.slice/user-1000.slice/') or unit_name(nonce) not in group.split('/')
            or int(properties['MainPID']) != startup['main']['pid']):
        raise ValueError('service-descriptor-identity')
    if startup['nonce'] != nonce or any(startup[role]['cgroup'] != '0::' + group for role in ('main', 'leaf')):
        raise ValueError('service-cgroup-membership')
    if startup['leaf']['ppid'] != startup['main']['pid'] or startup['leaf']['sid'] == startup['main']['sid']:
        raise ValueError('leaf-parent-or-session')
    return properties


def audit(rootfd, ledger):
    if set(os.listdir(rootfd)) != set(OWNERS) - {'audit.json'}:
        raise ValueError('linux-final-inventory')
    sizes = {role: 0 for role in CAPS}
    for name, role in OWNERS.items():
        if name != 'audit.json':
            sizes[role] += len(read_file(rootfd, name))
    write_file(rootfd, 'audit.json', encode({'sizesBeforeAudit': sizes, 'selfCharged': True}), ledger)
    sizes['observer'] += len(read_file(rootfd, 'audit.json'))
    if any(size > CAPS[role] for role, size in sizes.items()) or sum(sizes.values()) + RESERVED > 131072:
        raise ValueError('linux-final-budget')
    return sizes


def prepare_observer(witness):
    verify_bundle(witness.rootfd, witness.nonce)
    witness.startup = wait_startup(witness.rootfd)
    witness.props = descriptor(witness.nonce, witness.startup)
    witness.cgroup = Path('/sys/fs/cgroup') / witness.props['ControlGroup'].lstrip('/')
    for role in ('main', 'leaf'):
        witness.held.append(hold(witness.startup[role]))
    witness.sentinel = subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B', '-c', 'import time; time.sleep(95)'],
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, env=BUS_ENV, start_new_session=True)
    sentinel_id = identity(witness.sentinel.pid)
    witness.held.append(hold(sentinel_id))
    group = '0::' + witness.props['ControlGroup']
    outside = (sentinel_id['cgroup'], identity(os.getpid())['cgroup'])
    if (any(member == group or member.startswith(group + '/') for member in outside)
            or 'populated 1' not in (witness.cgroup / 'cgroup.events').read_text()):
        raise ValueError('outside-witness-or-active-cgroup')
    emit({'event': 'ready', 'nonce': witness.nonce, 'descriptor': witness.props, 'startup': witness.startup})


def observe_command():
    with selectors.DefaultSelector() as selector:
        selector.register(0, selectors.EVENT_READ)
        if not selector.select(15) or os.read(0, 64) != b'observe\n':
            raise ValueError('observation-command')


def cgroup_empty(cgroup):
    try:
        return 'populated 0' in (cgroup / 'cgroup.events').read_text()
    except FileNotFoundError:
        # Removal can occur between a directory probe and opening cgroup.events.
        return not cgroup.exists()


def wait_cleanup(witness):
    started = time.monotonic()
    signaled = absent = empty = False
    while time.monotonic() < started + 8:
        signaled = all(select.select([fd], [], [], 0)[0] for fd in witness.held[:2])
        absent = all(not (Path('/proc') / str(witness.startup[role]['pid'])).exists() for role in ('main', 'leaf'))
        empty = cgroup_empty(witness.cgroup)
        if signaled and absent and empty:
            break
        time.sleep(0.01)
    if not (signaled and absent and empty) or select.select([witness.held[2]], [], [], 0)[0] or witness.sentinel.poll() is not None:
        raise ValueError('linux-cleanup-or-sentinel-unverified')
    return started


def terminal_evidence(witness):
    terminal = decode(read_file(witness.rootfd, 'terminal.json'))
    if (terminal['nonce'] != witness.nonce or terminal['pid'] != witness.startup['main']['pid']
            or terminal['reason'] not in ('expired', 'eof') or terminal['lastSequence'] < 1
            or (terminal['reason'] == 'expired' and terminal['ageSeconds'] < 1)):
        raise ValueError('terminal-lease-evidence')
    after = query(witness.nonce)
    if after.get('LoadState') != 'not-found':
        if after.get('InvocationID') != witness.props['InvocationID'] or after.get('ExecMainStatus') != '71':
            raise ValueError('terminal-invocation-or-exit-mismatch')
    return terminal['reason']


def finish_observer(witness):
    try:
        if witness.props is not None:
            current = query(witness.nonce)
            if current.get('LoadState') != 'not-found' and current.get('ActiveState') == 'active':
                if current.get('InvocationID') != witness.props['InvocationID']:
                    raise ValueError('rescue-refused-invocation-mismatch')
                command(['/usr/bin/systemctl', '--user', 'stop', unit_name(witness.nonce)])
    finally:
        with contextlib.ExitStack() as cleanup:
            cleanup.callback(os.close, witness.rootfd)
            for fd in witness.held:
                cleanup.callback(os.close, fd)
            if witness.sentinel is not None:
                cleanup.callback(stop_sentinel, witness.sentinel)


def observe(root, nonce):
    witness = SimpleNamespace(rootfd=open_root(root, nonce), nonce=nonce, held=[], sentinel=None, props=None)
    try:
        prepare_observer(witness)
        observe_command()
        started = wait_cleanup(witness)
        reason = terminal_evidence(witness)
        sizes = audit(witness.rootfd, Ledger('observer'))
        report = {'event': 'result', 'nonce': nonce, 'heldPidfdsSignaled': True, 'originalProcEntriesAbsent': True,
                  'cgroupEmpty': True, 'sentinelSurvived': True, 'leaseReason': reason,
                  'observationSeconds': time.monotonic() - started, 'runtimeBytes': sizes,
                  'runtimeReservedBytes': RESERVED, 'nativeExecutionAllowed': False}
    finally:
        finish_observer(witness)
    emit(report)


def stop_sentinel(sentinel):
    if sentinel.poll() is None:
        sentinel.kill()
    sentinel.wait(timeout=2)


def prepare(bundle):
    nonce = bundle['nonce']
    if not re.fullmatch('[0-9a-f]{32}', nonce):
        raise ValueError('bundle-nonce')
    source = base64.b64decode(bundle['sourceBase64'], validate=True)
    if hashlib.sha256(source).hexdigest() != bundle['sha256']:
        raise ValueError('bundle-source-digest')
    root = Path(tempfile.mkdtemp(prefix='tiye-charged-' + nonce + '-'))
    rootfd = open_root(root, nonce)
    ledger = Ledger('bootstrap')
    try:
        write_file(rootfd, 'linux_runtime.py', source, ledger)
        write_file(rootfd, 'config.json', encode({'nonce': nonce, 'sourceSha256': bundle['sha256'], 'caps': CAPS}), ledger)
        write_file(rootfd, 'retention.json', encode({'uncertain': True, 'automaticDeletion': False}), ledger)
    finally:
        os.close(rootfd)
    emit({'event': 'prepared', 'nonce': nonce, 'linuxRoot': str(root), 'sourceSha256': bundle['sha256']})
    observe(root, nonce)


if __name__ == '__main__':
    os.umask(0o077)
    if 'BUNDLE' in globals():
        prepare(BUNDLE)
    else:
        role, directory, nonce = sys.argv[1:]
        if role not in ('worker', 'bridge'):
            raise ValueError('fixed-linux-role')
        {'worker': worker, 'bridge': bridge}[role](Path(directory), nonce)
