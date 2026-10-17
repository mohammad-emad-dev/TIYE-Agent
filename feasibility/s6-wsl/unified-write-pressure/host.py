"""Actual Windows protocol reader/writer plus a separate ownership heartbeat."""
import asyncio
import base64
import json
import os
import subprocess
import sys
import threading
import hashlib
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import profile
import transport
import windows
import journal


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
    attempt = root / 'attempt.json'
    journal.reserve(attempt, config['nonce'], hashlib.sha256((SOURCE / 'host.py').read_bytes()).hexdigest())
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
        first_write = True

        def before_send():
            nonlocal first_write
            if first_write:
                journal.mark_attempted(attempt, config['nonce'])
                first_write = False

        def tick():
            control = root / 'stop-request.json'
            if control.exists():
                request = json.loads(control.read_text(encoding='utf-8'))
                if request != {'nonce': config['nonce'], 'action': 'stop'}:
                    raise ValueError('invalid-stop-request')
                raise transport.ProtocolFault('normal-stop')

        def pressure_ready(witness):
            temporary = root / 'pressure-ready.tmp'
            temporary.write_text(json.dumps({'nonce': config['nonce'], **witness}), encoding='utf-8')
            temporary.replace(root / 'pressure-ready.json')

        async def stop_service():
            # Retire ownership before waiting on a failed transport. Normal Stop
            # requests identity-bound control first so lease expiry is not its mechanism.
            if config['mode'] == 'pressure-stop':
                child = await asyncio.create_subprocess_exec(*wsl('stop.py', config, [config['mode']]),
                    env=env, stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                try:
                    output, diagnostic_bytes = await asyncio.wait_for(child.communicate(), 12)
                except asyncio.TimeoutError:
                    child.kill()
                    await asyncio.wait_for(child.wait(), 5)
                    raise
                (root / 'stop-response.bin').write_bytes(output)
                if child.returncode != 0 or diagnostic_bytes:
                    raise ValueError('explicit-stop-failed')
                packet = json.loads(output)
                if (not isinstance(packet, dict) or packet.get('nonce') != config['nonce']
                        or not isinstance(packet.get('stop'), dict)
                        or packet['stop'].get('state') != 'stop-requested'):
                    raise ValueError('explicit-stop-not-observed')
                (root / 'stop-result.json').write_bytes(output)
        def retire_heartbeat():
            stopped.set()
            sender.join(timeout=2)
            try:
                if sender.is_alive():
                    errors.append('heartbeat-writer-blocked')
                    lease.kill()
                    sender.join(timeout=2)
                if not lease.stdin.closed:
                    lease.stdin.close()
                try:
                    lease.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    errors.append('lease-wait-timeout')
                    lease.kill()
                    lease.wait(timeout=5)
            except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                errors.append('heartbeat-cleanup:' + repr(error))

        async def before_cleanup():
            try:
                await stop_service()
            finally:
                retire_heartbeat()

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
                'tick': tick, 'beforeCleanup': before_cleanup,
                'beforeSend': before_send,
                'pressurePayload': b'P' * profile.PRESSURE_BYTES,
                'pressureBegin': lambda: journal.mark_pressure_attempt(attempt, config['nonce'], profile.PRESSURE_BYTES),
                'pressureReady': pressure_ready,
                'ready': lambda: handshake.accepted, 'allowed': handshake.reply_allowed,
                'feed': handshake.feed, 'eof': handshake.eof, 'spawned': spawned, 'signal': send_signal})
        finally:
            retire_heartbeat()
        for name, content in raw.items():
            (root / ('protocol-' + name + '.bin')).write_bytes(content)
        result = {'nonce': config['nonce'], 'mode': config['mode'], 'profile': profile.manifest(),
            'report': report, 'handshakeAccepted': handshake.accepted, 'handshakeFault': handshake.fault,
            'leaseExitCode': lease.returncode, 'heartbeatErrors': errors,
            'rawBase64': {name: base64.b64encode(content).decode('ascii') for name, content in raw.items()}}
        (root / 'protocol-result.json').write_text(json.dumps(result), encoding='utf-8')
        expected_faults = {'normal-stop'} if config['mode'] == 'pressure-stop' else {'transport-ended', 'write-failed'}
        if (errors or lease.returncode != 0 or report['fault'] not in expected_faults
                or not report.get('directChildReaped') or report.get('returnCode') is None
                or report.get('cleanupErrors')):
            return 1
        return 0


if __name__ == '__main__':
    try:
        exit_code = asyncio.run(run(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))))
    except journal.AttemptRefused:
        sys.stderr.buffer.write(b'attempt-already-recorded\n')
        exit_code = 23
    raise SystemExit(exit_code)
