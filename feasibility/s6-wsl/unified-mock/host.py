"""Actual Windows protocol reader/writer plus a separate ownership heartbeat."""
import asyncio
import base64
import json
import os
import subprocess
import sys
import threading
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import profile
import transport
import windows


def wsl(script, config, extra):
    system = Path(os.environ['SystemRoot'])
    return [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
        '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
        '/usr/bin/python3', '-I', '-S', '-B', '-u', config['linuxRoot'] + '/' + script,
        config['linuxRoot'], config['nonce']] + extra


def heartbeat(child, nonce, stopped, errors):
    sequence = 0
    try:
        while not stopped.is_set():
            sequence += 1
            child.stdin.write(json.dumps({'nonce': nonce, 'sequence': sequence}).encode('ascii') + b'\n')
            child.stdin.flush()
            stopped.wait(0.1)
    except (OSError, ValueError) as error:
        errors.append(repr(error))


async def run(config):
    if config['mode'] not in profile.MODES:
        raise ValueError('native-and-arbitrary-modes-disabled')
    root = Path(config['windowsRoot'])
    system = Path(os.environ['SystemRoot'])
    env = {'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32'),
        'TEMP': str(root), 'TMP': str(root)}
    stopped, errors = threading.Event(), []
    with (root / 'lease.stderr.bin').open('xb') as diagnostic:
        lease = subprocess.Popen(wsl('bridge.py', config, []), stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL, stderr=diagnostic, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        sender = threading.Thread(target=heartbeat, args=(lease, config['nonce'], stopped, errors), daemon=True)
        sender.start()
        handshake = transport.Handshake('/fixture')

        def spawned(pid):
            ready = {'nonce': config['nonce'], 'root': windows.identity(os.getpid(), config['nonce']),
                'lease': windows.identity(lease.pid, config['nonce']),
                'protocol': windows.identity(pid, config['nonce'])}
            temporary = root / 'host-ready.tmp'
            temporary.write_text(json.dumps(ready), encoding='utf-8')
            temporary.replace(root / 'host-ready.json')

        def send_signal(proc, kind):
            (proc.terminate if kind == 'term' else proc.kill)()
            return {'kind': kind, 'result': 'sent-to-owned-wsl-protocol-client'}

        try:
            report, raw = await transport.observe(wsl('entry.py', config, [config['mode']]), {
                'env': env, 'cwd': str(root), 'seconds': profile.WINDOWS_PROTOCOL_SECONDS,
                'spawnSeconds': profile.SPAWN_SECONDS, 'workSeconds': profile.INITIALIZE_SECONDS,
                'cleanupWaitSeconds': profile.CLEANUP_PHASE_SECONDS,
                'limits': {'stdout': 4194304, 'stderr': 1048576},
                'initial': transport.wire({'id': 1, 'method': 'initialize', 'params': {
                    'clientInfo': {'name': 'tiye_feasibility', 'title': 'TIYE feasibility', 'version': '0.0.1'},
                    'capabilities': {'experimentalApi': False}}}),
                'second': transport.wire({'method': 'initialized'}),
                'ready': lambda: handshake.accepted, 'allowed': handshake.reply_allowed,
                'feed': handshake.feed, 'eof': handshake.eof, 'spawned': spawned, 'signal': send_signal})
        finally:
            stopped.set()
            sender.join(timeout=2)
            if sender.is_alive():
                lease.kill()
                sender.join(timeout=2)
                errors.append('heartbeat-writer-blocked')
            lease.stdin.close()
            lease.wait(timeout=5)
        for name, content in raw.items():
            (root / ('protocol-' + name + '.bin')).write_bytes(content)
        result = {'nonce': config['nonce'], 'mode': config['mode'], 'profile': profile.manifest(),
            'report': report, 'handshakeAccepted': handshake.accepted, 'handshakeFault': handshake.fault,
            'leaseExitCode': lease.returncode, 'heartbeatErrors': errors,
            'rawBase64': {name: base64.b64encode(content).decode('ascii') for name, content in raw.items()}}
        (root / 'protocol-result.json').write_text(json.dumps(result), encoding='utf-8')
        if errors or lease.returncode != 0:
            return 1
        return 0


if __name__ == '__main__':
    raise SystemExit(asyncio.run(run(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))))
