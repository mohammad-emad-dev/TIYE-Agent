"""Fixed finite Linux fixture processes; no providers or arbitrary commands."""
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def save(path, record):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(record), encoding='utf-8')
    temporary.replace(path)


def identity(nonce):
    stat = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': os.getpid(), 'startTicks': int(stat[19]), 'nonce': nonce,
            'sid': os.getsid(0), 'ppid': os.getppid()}


def main():
    mode, directory, nonce = sys.argv[1:]
    folder = Path(directory)
    deadline = time.monotonic() + 10
    if mode in {'leaf', 'leaf2', 'stubborn'}:
        if mode == 'stubborn':
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
        save(folder / ('leaf2.json' if mode == 'leaf2' else 'leaf.json'), identity(nonce))
        time.sleep(max(0, deadline - time.monotonic()))
        return 0
    if mode == 'sentinel':
        save(folder / 'sentinel.json', identity(nonce))
        time.sleep(max(0, deadline - time.monotonic()))
        return 0
    if mode not in {'normal', 'adopted', 'escalate', 'mismatch'}:
        raise ValueError('unknown-fixed-peer-mode')
    save(folder / 'root.json', identity(nonce))
    if mode != 'normal':
        # Deliberately leave the root's session; process-group-only cleanup misses it.
        subprocess.Popen([sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()),
            'stubborn' if mode == 'escalate' else 'leaf', directory, nonce],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True)
        if mode == 'mismatch':
            subprocess.Popen([sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()),
                'leaf2', directory, nonce], stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    while not (folder / 'release').exists():
        if time.monotonic() >= deadline:
            raise TimeoutError('peer-release-timeout')
        time.sleep(0.01)
    return 0 if mode == 'normal' else 7


if __name__ == '__main__':
    raise SystemExit(main())
