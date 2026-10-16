"""Own a Windows MCP fixture and record three distinct client routes once."""
import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-connectivity'
SERVER = ROOT / 'feasibility/s2-control/src/team-tools-server.js'
WSL = ['wsl.exe', '-d', 'Ubuntu', '--exec', '/usr/bin/env', '-i',
       'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL=C.UTF-8']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    OUTPUT.mkdir(exist_ok=False)
    sources = [SOURCE / p for p in ['run.py', 'client.py', 'relay.cjs', 'protocol.json']] + [SERVER]
    report = {'schema': 'tiye-s6-connectivity-v1', 'state': 'running', 'routes': [],
              'sourceHashes': {p.relative_to(ROOT).as_posix(): digest(p) for p in sources},
              'fullS6Qualified': False, 'productionEligible': False, 'networkConfigurationChanged': False}
    def save():
        (OUTPUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    deadline = time.monotonic() + 180
    tokens = {member: secrets.token_hex(32) for member in ['member-a', 'member-b']}
    bad_token, nonce = secrets.token_hex(32), secrets.token_hex(24)
    secret_values = [*tokens.values(), bad_token, nonce]
    child = None
    server_lines, server_errors = [], []
    threads = []
    port = None
    def remaining(limit):
        value = min(limit, deadline - time.monotonic())
        if value <= 0:
            raise RuntimeError('Overall deadline exceeded')
        return value
    def collect(stream, target):
        for raw in iter(stream.readline, b''):
            target.append(raw.decode('utf-8', errors='replace'))
    save()
    try:
        node = shutil.which('node.exe')
        if not node:
            raise RuntimeError('Windows Node unavailable')
        mode = subprocess.run(WSL + ['wslinfo', '--networking-mode'], capture_output=True, timeout=remaining(10), check=True)
        report['networkingMode'] = mode.stdout.decode().strip()
        python_version = subprocess.run(WSL + ['/usr/bin/python3', '--version'], capture_output=True, timeout=remaining(10), check=True)
        report['ubuntuPythonVersion'] = python_version.stdout.decode().strip()
        report['windowsNodeVersion'] = subprocess.run([node, '--version'], capture_output=True, timeout=remaining(10), check=True).stdout.decode().strip()
        report['sdkVersion'] = json.loads((ROOT / 'feasibility/s2-control/node_modules/@modelcontextprotocol/sdk/package.json').read_text())['version']
        linux_node = subprocess.run(WSL + ['wslpath', '-u', node], capture_output=True, timeout=remaining(10), check=True).stdout.decode().strip()
        environment = dict(os.environ)
        environment.update(TIYE_S2_TOKENS_JSON=json.dumps(tokens), TIYE_S2_EXPECTED_SUMMARY=nonce, TIYE_S2_PORT='0')
        child = subprocess.Popen([node, str(SERVER)], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, env=environment)
        report['serverOwnedPid'] = child.pid
        for stream, target in [(child.stdout, server_lines), (child.stderr, server_errors)]:
            thread = threading.Thread(target=collect, args=(stream, target), daemon=True)
            thread.start(); threads.append(thread)
        ready_deadline = time.monotonic() + remaining(8)
        while time.monotonic() < ready_deadline:
            match = re.search(r'ready host=127\.0\.0\.1 port=(\d+)', ''.join(server_lines))
            if match:
                port = int(match[1]); break
            if child.poll() is not None:
                break
            time.sleep(0.02)
        if not port or port == 40900:
            raise RuntimeError('Owned mock server not ready on permitted ephemeral port')
        report['serverBind'] = {'host': '127.0.0.1', 'port': port}
        code = (SOURCE / 'client.py').read_text(encoding='utf-8')
        for route in ['windows-control', 'ubuntu-loopback', 'ubuntu-interop-pipe']:
            start_line = len(server_lines)
            config = {'route': route, 'port': port, 'tokens': tokens, 'badToken': bad_token,
                      'nonce': nonce, 'linuxNodePath': linux_node, 'relayWindowsPath': str(SOURCE / 'relay.cjs')}
            command = [sys.executable, str(SOURCE / 'client.py')] if route == 'windows-control' else WSL + ['/usr/bin/python3', '-c', code]
            started = time.monotonic()
            try:
                result = subprocess.run(command, input=json.dumps(config).encode(), capture_output=True, timeout=remaining(25))
                # Only sanitized client reports are retained; no runtime request bodies/headers.
                for secret in secret_values:
                    if secret.encode() in result.stdout or secret.encode() in result.stderr:
                        raise RuntimeError('Client output contains runtime secret; not persisted')
                (OUTPUT / (route + '.stdout.json')).write_bytes(result.stdout)
                (OUTPUT / (route + '.stderr.bin')).write_bytes(result.stderr)
                parsed = json.loads(result.stdout) if result.stdout else {'route': route, 'state': 'route-incomplete'}
                entry = {'route': route, 'exitCode': result.returncode, 'timedOut': False, 'client': parsed}
            except subprocess.TimeoutExpired:
                entry = {'route': route, 'exitCode': None, 'timedOut': True, 'client': {'route': route, 'state': 'route-incomplete'}}
            entry['elapsedMs'] = (time.monotonic() - started) * 1000
            if entry['client']['state'] == 'roundtrip-completed':
                flush_deadline = time.monotonic() + remaining(1)
                while time.monotonic() < flush_deadline and ''.join(server_lines[start_line:]).count('report-match ') < 2:
                    time.sleep(0.01)
            segment = ''.join(server_lines[start_line:])
            entry['serverCorrelation'] = {member: segment.count('report-match member=' + member + ' matched=true') for member in tokens}
            report['routes'].append(entry)
            save()
            if route == 'windows-control' and (entry['exitCode'] != 0 or any(v != 1 for v in entry['serverCorrelation'].values())):
                raise RuntimeError('Windows positive control failed')
        report['state'] = 'route-observations-completed'
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        report.update(state='incomplete', failureCategory=type(error).__name__)
    finally:
        if child is not None:
            child.terminate()
            try:
                child.wait(timeout=5)
                report['ownedServerExitObserved'] = True
            except subprocess.TimeoutExpired:
                child.kill(); child.wait(timeout=5)
                report['ownedServerExitObserved'] = True
                report['killFallbackUsed'] = True
            report['ownedServerExitCode'] = child.returncode
            report['terminationMethod'] = 'Windows owned Popen handle termination; not graceful product shutdown'
            for thread in threads:
                thread.join(timeout=2)
        if port:
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=1):
                    report['serverPortClosedAfterExit'] = False
            except ConnectionRefusedError:
                report['serverPortClosedAfterExit'] = True
            except OSError:
                report['serverPortClosedAfterExit'] = None
        logs = {'server.stdout.log': ''.join(server_lines), 'server.stderr.log': ''.join(server_errors)}
        for name, text in logs.items():
            for secret in secret_values:
                if secret in text:
                    raise RuntimeError('Server log contains runtime secret; not persisted')
            (OUTPUT / name).write_bytes(text.encode('utf-8'))
        report['sourceHashesUnchangedAfterRun'] = all(digest(ROOT / p) == h for p, h in report['sourceHashes'].items())
        report['artifactHashes'] = {p.name: digest(p) for p in OUTPUT.iterdir() if p.is_file() and p.name != 'evidence.json'}
        save()
    print(json.dumps(report, indent=2))
    return 0 if report['state'] == 'route-observations-completed' and report.get('ownedServerExitObserved') and report.get('serverPortClosedAfterExit') and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
