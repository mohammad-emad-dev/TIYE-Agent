"""Stop an active fixed workload; no provider or native U0 entry point."""
import os
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from owner import Owner
from peer import save
from stop import stop_owned


def run(mode, folder, nonce):
    owner = Owner()
    try:
        owner.start([sys.executable, '-I', '-S', '-B', str(Path(__file__).with_name('peer.py')),
            mode, str(folder), nonce], str(folder), {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
        save(folder / 'ready.json', {'pid': os.getpid(), 'nonce': nonce})
        deadline = time.monotonic() + 4
        while not (folder / 'stop').exists():
            if time.monotonic() >= deadline:
                raise TimeoutError('stop-request-not-observed')
            time.sleep(0.01)
        result = stop_owned(owner)
        save(folder / 'result.json', {**result, 'nonce': nonce, 'nativeAdmissionGranted': False})
        return 0 if result['observedEmpty'] else 1
    finally:
        cleanup_deadline = time.monotonic() + 1
        try:
            while time.monotonic() < cleanup_deadline:
                owner.sweep()
                if owner.empty():
                    break
                owner.send_once(signal.SIGKILL)
                time.sleep(0.01)
        finally:
            owner.close()


if __name__ == '__main__':
    selected, directory, nonce = sys.argv[1:]
    if selected not in {'graceful', 'leaf-stubborn', 'both-stubborn'}:
        raise ValueError('unknown-fixed-mode')
    raise SystemExit(run(selected, Path(directory), nonce))
