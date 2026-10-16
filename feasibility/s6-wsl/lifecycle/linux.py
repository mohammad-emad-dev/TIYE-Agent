"""Controlled two-process fixture and identity-bound observer/recovery helper."""
import hashlib
import json
import os
import queue
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

CHILD = '''import json,os,signal,sys,time
from pathlib import Path
root=Path(sys.argv[-2]); nonce=sys.argv[-1]; stop=False
def on_stop(*args):
 global stop
 stop=True
signal.signal(signal.SIGTERM,on_stop)
deadline=time.monotonic()+50; counter=0
while not stop and time.monotonic()<deadline:
 counter+=1
 p=root/'child-heartbeat.tmp'; p.write_text(json.dumps({'counter':counter,'nonce':nonce}))
 os.replace(p,root/'child-heartbeat.json')
 time.sleep(0.1)
'''


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def identity(pid):
    base = Path('/proc') / str(pid)
    try:
        fields = (base / 'stat').read_text().rsplit(')', 1)[1].split()
        uid_line = next(line for line in (base / 'status').read_text().splitlines() if line.startswith('Uid:'))
        return {'pid': pid, 'startTicks': int(fields[19]), 'uid': int(uid_line.split()[1]),
                'bootIdSha256': hashlib.sha256(Path('/proc/sys/kernel/random/boot_id').read_bytes()).hexdigest(),
                'state': fields[0], 'argv': (base / 'cmdline').read_bytes().split(b'\0')}
    except FileNotFoundError:
        return None


def public_identity(observation):
    return {key: value for key, value in observation.items() if key != 'argv'}


def matches(observation, expected, nonce):
    return observation is not None and all(observation[key] == expected[key] for key in ['pid', 'startTicks', 'uid', 'bootIdSha256']) and nonce.encode() in observation['argv'][-2:]


def supervisor(config, nonce):
    if os.getuid() == 0:
        raise RuntimeError('Non-root fixture required')
    root = Path(tempfile.mkdtemp(prefix='tiye-s6-lifecycle-', dir='/tmp'))
    started = time.monotonic()
    atomic_json(root / 'owner.json', {'nonce': nonce})
    child = subprocess.Popen(['/usr/bin/python3', '-c', CHILD, str(root), nonce],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    commands = queue.Queue()
    def reader():
        for line in sys.stdin:
            commands.put(line)
        commands.put(None)
    threading.Thread(target=reader, daemon=True).start()
    stopping = False
    reason = 'deadline'
    def stop_signal(*args):
        nonlocal stopping, reason
        stopping, reason = True, 'SIGTERM'
    signal.signal(signal.SIGTERM, stop_signal)
    eof_seen = False
    counter = 0
    try:
        ready_deadline = time.monotonic() + 3
        while not (root / 'child-heartbeat.json').exists():
            if child.poll() is not None or time.monotonic() >= ready_deadline:
                raise RuntimeError('Child not ready')
            time.sleep(0.02)
        identities = [public_identity(identity(os.getpid())), public_identity(identity(child.pid))]
        registry = {'nonce': nonce, 'scenario': config['scenario'], 'identities': identities,
                    'startedLinuxMonotonic': started, 'supervisorTtlSeconds': 45, 'childTtlSeconds': 50}
        atomic_json(root / 'registry.json', registry)
        counter += 1
        atomic_json(root / 'root-heartbeat.json', {'counter': counter, 'nonce': nonce, 'stdinEof': eof_seen})
        print(json.dumps({'event': 'ready', 'root': str(root), 'registry': registry,
                          'registrySha256': hashlib.sha256((root / 'registry.json').read_bytes()).hexdigest()}), flush=True)
        while not stopping and time.monotonic() - started < 45:
            try:
                command = commands.get_nowait()
            except queue.Empty:
                command = ''
            if command is None:
                eof_seen = True
            elif command:
                request = json.loads(command)
                if request == {'action': 'stop', 'nonce': nonce}:
                    stopping, reason = True, 'stdin-stop'
            counter += 1
            atomic_json(root / 'root-heartbeat.json', {'counter': counter, 'nonce': nonce, 'stdinEof': eof_seen})
            child.poll()
            time.sleep(0.1)
    finally:
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=3)
        atomic_json(root / 'supervisor-exit.json', {'reason': reason, 'childExitCode': child.returncode,
                                                   'elapsedSeconds': time.monotonic() - started})


def load_fixture(config):
    root = Path(config['root'])
    if root.parent != Path('/tmp') or not root.name.startswith('tiye-s6-lifecycle-') or root.resolve() != root:
        raise RuntimeError('Unexpected fixture root')
    if json.loads((root / 'owner.json').read_text()) != {'nonce': config['nonce']}:
        raise RuntimeError('Owner marker mismatch')
    raw = (root / 'registry.json').read_bytes()
    if hashlib.sha256(raw).hexdigest() != config['registrySha256']:
        raise RuntimeError('Registry changed')
    registry = json.loads(raw)
    if registry['nonce'] != config['nonce']:
        raise RuntimeError('Nonce mismatch')
    return root, registry


def inspect_fixture(config):
    root, registry = load_fixture(config)
    states = []
    for expected in registry['identities']:
        current = identity(expected['pid'])
        same_identity = current is not None and all(current[key] == expected[key] for key in ['pid', 'startTicks', 'uid', 'bootIdSha256'])
        status = 'gone' if current is None else 'zombie' if same_identity and current['state'] == 'Z' else 'verified-live' if matches(current, expected, config['nonce']) else 'unverified'
        states.append({'expected': expected, 'status': status,
                       'observed': public_identity(current) if current else None})
    beats = {role: json.loads((root / (role + '-heartbeat.json')).read_text()) for role in ['root', 'child']}
    return {'states': states, 'heartbeats': beats,
            'ageSeconds': time.monotonic() - registry['startedLinuxMonotonic']}


def recover(config, negative):
    root, registry = load_fixture(config)
    expected_list = json.loads(json.dumps(registry['identities']))
    if negative:
        expected_list[0]['startTicks'] += 1
    handles = []
    report = {'decision': 'not-admitted', 'negativeControl': negative, 'signals': []}
    try:
        for expected in expected_list:
            current = identity(expected['pid'])
            if current is None:
                if negative:
                    report['decision'] = 'paused-unverified'
                    return report
                continue
            if current['state'] == 'Z':
                # Zombies are non-running but not absent; observe them separately.
                if negative:
                    report['decision'] = 'paused-unverified'
                    return report
                continue
            fd = os.pidfd_open(expected['pid'])
            handles.append((expected, fd))
            current = identity(expected['pid'])
            if not matches(current, expected, config['nonce']):
                report['decision'] = 'paused-unverified'
                return report
        for expected, fd in reversed(handles):
            if not matches(identity(expected['pid']), expected, config['nonce']):
                report['decision'] = 'paused-unverified'
                return report
        if negative:
            report['decision'] = 'negative-control-did-not-refuse'
            return report
        report['decision'] = 'verified-cleanup' if handles else 'no-live-survivors'
        for expected, fd in reversed(handles):
            try:
                signal.pidfd_send_signal(fd, signal.SIGTERM)
                report['signals'].append({'pid': expected['pid'], 'mechanism': 'pidfd', 'signal': 'SIGTERM'})
            except ProcessLookupError:
                report['signals'].append({'pid': expected['pid'], 'mechanism': 'pidfd', 'outcome': 'already-exited'})
        return report
    finally:
        for _, fd in handles:
            os.close(fd)


def main():
    mode, nonce = sys.argv[-2:]
    config = json.loads(sys.stdin.readline())
    if config['nonce'] != nonce:
        raise RuntimeError('Launch nonce mismatch')
    if mode == 'supervisor':
        supervisor(config, nonce)
        return
    if mode == 'inspect':
        result = inspect_fixture(config)
    elif mode in ['recover', 'negative']:
        result = recover(config, mode == 'negative')
    elif mode == 'wait-gone':
        deadline = time.monotonic() + 5
        polls = 0
        while True:
            polls += 1
            result = inspect_fixture(config)
            if all(s['status'] == 'gone' for s in result['states']) or time.monotonic() >= deadline:
                break
            time.sleep(0.1)
        result['polls'] = polls
    else:
        raise RuntimeError('Unknown mode')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
