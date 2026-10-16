"""Measurement-only detached survivor and identity-bound recovery; no provider work."""
import hashlib
import json
import os
import select
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def boot_hash():
    return digest(Path('/proc/sys/kernel/random/boot_id').read_bytes())


def identity(pid):
    base = Path('/proc') / str(pid)
    try:
        fields = (base / 'stat').read_text().rsplit(')', 1)[1].split()
        uid = next(line for line in (base / 'status').read_text().splitlines() if line.startswith('Uid:'))
        argv = (base / 'cmdline').read_bytes().split(b'\0')
        return {'pid': pid, 'startTicks': int(fields[19]), 'uid': int(uid.split()[1]),
                'bootIdSha256': boot_hash(), 'state': fields[0], 'argv': argv}
    except FileNotFoundError:
        # Missing a field in an extant /proc directory is uncertainty, not absence.
        if base.exists():
            raise RuntimeError('Partial /proc identity read')
        return None


def public(value):
    return {k: v for k, v in value.items() if k != 'argv'} if value else None


def matches(value, expected, nonce):
    return (value is not None and value['state'] not in ['Z', 'X']
            and all(value[k] == expected[k] for k in ['pid', 'startTicks', 'uid', 'bootIdSha256'])
            and nonce.encode() in value['argv'][-2:])


def beat(root, role, nonce, counter):
    atomic_json(root / (role + '-heartbeat.json'), {'counter': counter, 'nonce': nonce})


def run_child(root, nonce):
    stopping = False
    def stop(*unused):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    deadline = time.monotonic() + 95
    counter = 0
    while not stopping and time.monotonic() < deadline:
        counter += 1
        beat(root, 'child', nonce, counter)
        time.sleep(0.1)


def run_supervisor(root, nonce):
    stopping = False
    def stop(*unused):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    started = time.monotonic()
    child = subprocess.Popen(['/usr/bin/python3', str(root / 'fixture.py'), 'child', str(root), nonce],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 3
        while not (root / 'child-heartbeat.json').exists():
            if child.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('Child did not become ready')
            time.sleep(0.02)
        registry = {'nonce': nonce, 'startedLinuxMonotonic': started,
                    'identities': [public(identity(os.getpid())), public(identity(child.pid))],
                    'supervisorTtlSeconds': 90, 'childTtlSeconds': 95}
        beat(root, 'root', nonce, 1)
        atomic_json(root / 'registry.json', registry)
        counter = 1
        while not stopping and time.monotonic() - started < 90:
            counter += 1
            beat(root, 'root', nonce, counter)
            child.poll()
            time.sleep(0.1)
    finally:
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=3)
        atomic_json(root / 'supervisor-exit.json', {'reason': 'SIGTERM' if stopping else 'deadline-or-error',
                                                   'childExitCode': child.returncode,
                                                   'elapsedSeconds': time.monotonic() - started})


def load(config):
    root = Path(config['root'])
    if root.parent != Path('/tmp') or not root.name.startswith('tiye-s6-recovery-') or root.resolve() != root:
        raise RuntimeError('Unexpected fixture path')
    if root.stat().st_uid != os.getuid() or json.loads((root / 'owner.json').read_text()) != {'nonce': config['nonce']}:
        raise RuntimeError('Ownership marker mismatch')
    raw = (root / 'registry.json').read_bytes()
    if digest(raw) != config['registrySha256']:
        raise RuntimeError('Registry changed')
    registry = json.loads(raw)
    if registry['nonce'] != config['nonce'] or len(registry['identities']) != 2:
        raise RuntimeError('Unexpected registry')
    if any(e['uid'] != os.getuid() or e['pid'] <= 1 for e in registry['identities']):
        raise RuntimeError('Unexpected fixture identity')
    return root, registry


def inspect(config, negative=False):
    root, registry = load(config)
    expected = json.loads(json.dumps(registry['identities']))
    if negative:
        expected[0]['startTicks'] += 1
    states = []
    for item in expected:
        observed = identity(item['pid'])
        status = 'gone' if observed is None else 'verified-live' if matches(observed, item, config['nonce']) else 'unverified'
        if observed and observed['state'] == 'Z':
            status = 'zombie'
        states.append({'expected': item, 'observed': public(observed), 'status': status})
    return {'states': states, 'bootIdSha256': boot_hash(),
            'heartbeats': {role: json.loads((root / (role + '-heartbeat.json')).read_text()) for role in ['root', 'child']},
            'launchRecords': json.loads((root / 'launch.json').read_text()),
            'ageSeconds': time.monotonic() - registry['startedLinuxMonotonic']}


def admission(config, negative=False):
    observation = inspect(config, negative)
    statuses = [s['status'] for s in observation['states']]
    decision = 'blocked-existing' if all(s == 'verified-live' for s in statuses) else 'paused-unverified'
    # This experiment only admits the initial fresh fixture. Existing descriptors
    # never cause an automatic replacement, even when all original PIDs are gone.
    return {'decision': decision, 'newLaunches': 0, 'signals': [], 'observation': observation}


def bootstrap(config):
    root = Path(tempfile.mkdtemp(prefix='tiye-s6-recovery-', dir='/tmp'))
    atomic_json(root / 'owner.json', {'nonce': config['nonce']})
    source = config['source']
    script = root / 'fixture.py'
    with script.open('x', encoding='utf-8') as stream:
        stream.write(source)
        stream.flush()
        os.fsync(stream.fileno())
    child = subprocess.Popen(['/usr/bin/python3', str(script), 'supervisor', str(root), config['nonce']],
                             start_new_session=True, stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atomic_json(root / 'launch.json', [{'pid': child.pid, 'kind': 'initial-detached-supervisor'}])
    deadline = time.monotonic() + 4
    while not (root / 'registry.json').exists():
        if child.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError('Supervisor did not become ready; no retry')
        time.sleep(0.02)
    descriptor = {'root': str(root), 'nonce': config['nonce'],
                  'registrySha256': digest((root / 'registry.json').read_bytes())}
    return {'descriptor': descriptor, 'observation': inspect(descriptor),
            'registryText': (root / 'registry.json').read_text(encoding='utf-8'),
            'fixtureSourceSha256': digest(script.read_bytes())}


def recover(config, negative=False):
    root, registry = load(config)
    expected_list = json.loads(json.dumps(registry['identities']))
    if negative:
        expected_list[0]['startTicks'] += 1
    handles = []
    report = {'decision': 'paused-unverified', 'signals': [], 'newLaunches': 0,
              'negativeControl': negative, 'expectedIdentities': expected_list}
    try:
        # Open before revalidating. Never signal by a reusable numeric PID.
        for expected in expected_list:
            fd = os.pidfd_open(expected['pid'])
            handles.append(fd)
            if select.select([fd], [], [], 0)[0] or not matches(identity(expected['pid']), expected, config['nonce']):
                return report
        for expected, fd in zip(expected_list, handles):
            if select.select([fd], [], [], 0)[0] or not matches(identity(expected['pid']), expected, config['nonce']):
                return report
        signal.pidfd_send_signal(handles[0], signal.SIGTERM)
        report['signals'].append({'pid': registry['identities'][0]['pid'], 'signal': 'SIGTERM', 'mechanism': 'pidfd'})
        report['decision'] = 'verified-supervisor-signaled'
        return report
    finally:
        for fd in handles:
            os.close(fd)


def main():
    if os.getuid() == 0:
        raise RuntimeError('Non-root execution required')
    mode = sys.argv[1]
    if mode in ['supervisor', 'child']:
        root, nonce = Path(sys.argv[2]), sys.argv[3]
        (run_supervisor if mode == 'supervisor' else run_child)(root, nonce)
        return
    config = json.loads(sys.stdin.read())
    if mode == 'bootstrap':
        result = bootstrap(config)
    elif mode == 'inspect':
        result = inspect(config)
    elif mode in ['admit', 'admit-negative']:
        result = admission(config, mode == 'admit-negative')
    elif mode in ['recover', 'negative']:
        result = recover(config, mode == 'negative')
    elif mode == 'wait-gone':
        deadline = time.monotonic() + 5
        while True:
            result = inspect(config)
            if all(s['status'] == 'gone' for s in result['states']) or time.monotonic() > deadline:
                break
            time.sleep(0.1)
        root, _ = load(config)
        result['supervisorExit'] = json.loads((root / 'supervisor-exit.json').read_text()) if (root / 'supervisor-exit.json').exists() else None
    else:
        raise RuntimeError('Unknown mode')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
