"""Finite active-work fixture with a child in a separate session."""
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


def identify(nonce):
    fields = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': os.getpid(), 'startTicks': int(fields[19]), 'nonce': nonce,
            'sid': os.getsid(0), 'ppid': os.getppid()}


def main():
    mode, directory, nonce = sys.argv[1:]
    folder = Path(directory)
    if mode not in {'graceful', 'leaf-stubborn', 'both-stubborn', 'leaf', 'stubborn', 'sentinel'}:
        raise ValueError('unknown-fixed-mode')
    if mode in {'stubborn', 'both-stubborn'}:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if mode in {'leaf', 'stubborn', 'sentinel'}:
        save(folder / ('sentinel.json' if mode == 'sentinel' else 'leaf.json'), identify(nonce))
    else:
        subprocess.Popen([sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()),
            'leaf' if mode == 'graceful' else 'stubborn', directory, nonce],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True)
        save(folder / 'root.json', identify(nonce))
    time.sleep(10)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
