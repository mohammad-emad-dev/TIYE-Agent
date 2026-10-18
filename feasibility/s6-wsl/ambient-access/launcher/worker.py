"""Fixed service worker; owns and reaps only its fixed protocol peer."""
import os
import subprocess
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import common
import lease
import profile


def main(role, folder, nonce, mode):
    if os.getuid() != 1000 or mode not in profile.MODES or role not in ('main', 'leaf', 'sentinel'):
        raise ValueError('fixed-mock-entry-only')
    if role != 'main':
        common.save(folder / (role + '.json'), common.identity(role, nonce))
        time.sleep(95)
        return 0
    lease.start(folder, nonce)
    common.save(folder / 'main.json', common.identity('main', nonce))
    # Retain Popen until main exits; the manager owns the remaining leaf lifecycle.
    leaf = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'worker.py'),
        'leaf', str(folder), nonce, mode], stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
    peer = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'protocol_peer.py'),
        mode, str(folder), nonce], env={key: os.environ[key] for key in
            ('PATH', 'LC_ALL', 'HOME', 'CODEX_HOME', 'TMPDIR')})
    try:
        status = peer.wait(timeout=profile.SERVICE_RUNTIME_SECONDS)
    except subprocess.TimeoutExpired:
        peer.kill()
        status = peer.wait(timeout=profile.SERVICE_STOP_SECONDS)
        common.save(folder / 'reaped.json', {'nonce': nonce, 'pid': peer.pid,
            'returnCode': status, 'timedOut': True})
        return 73
    common.save(folder / 'reaped.json', {'nonce': nonce, 'pid': peer.pid, 'returnCode': status})
    return status


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1], Path(sys.argv[2]), sys.argv[3], sys.argv[4]))
