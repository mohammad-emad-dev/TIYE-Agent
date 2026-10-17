"""Fixed finite service main and separate-session TERM-ignoring child."""
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
        'sid': os.getsid(0), 'ppid': os.getppid(), 'cgroup': Path('/proc/self/cgroup').read_text().strip()}


def main():
    mode, directory, nonce = sys.argv[1:]
    if mode not in {'main', 'leaf', 'sentinel'}:
        raise ValueError('unknown-fixed-mode')
    folder = Path(directory)
    started = time.monotonic()
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if mode == 'main':
        subprocess.Popen([sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()),
            'leaf', directory, nonce], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, start_new_session=True)
    save(folder / (mode + '.json'), identify(nonce))
    while time.monotonic() - started < 15:
        if mode == 'main' and (folder / 'release-main').exists():
            return 0
        time.sleep(0.01)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
