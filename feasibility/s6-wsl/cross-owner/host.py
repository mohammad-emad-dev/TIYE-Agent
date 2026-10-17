"""Windows fixture owner: strict heartbeats over one owned WSL stdin pipe."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import windows


def run(config):
    folder, nonce = config['linuxRoot'], config['nonce']
    if not folder.startswith('/tmp/tiye-cross-owner-') or '\x00' in folder:
        raise ValueError('invalid fixture root')
    system = Path(os.environ['SystemRoot'])
    env = {'SystemRoot': str(system), 'WINDIR': str(system),
        'PATH': str(system / 'System32'), 'TEMP': config['windowsRoot'], 'TMP': config['windowsRoot']}
    argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
        '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
        '/usr/bin/python3', '-I', '-S', '-B', folder + '/bridge.py', folder, nonce]
    root = Path(config['windowsRoot'])
    with (root / 'bridge.stderr.bin').open('xb') as diagnostic:
        child = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
            stderr=diagnostic, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        ready = {'root': windows.identity(os.getpid(), nonce),
            'bridge': windows.identity(child.pid, nonce), 'nonce': nonce}
        temporary = root / 'host-ready.tmp'
        temporary.write_text(json.dumps(ready), encoding='utf-8')
        temporary.replace(root / 'host-ready.json')
        try:
            deadline = time.monotonic() + 16
            sequence = 0
            while time.monotonic() < deadline:
                sequence += 1
                packet = json.dumps({'nonce': nonce, 'sequence': sequence}).encode('ascii') + b'\n'
                child.stdin.write(packet)
                child.stdin.flush()
                time.sleep(0.1)
        finally:
            child.stdin.close()
            child.wait(timeout=3)


if __name__ == '__main__':
    run(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
