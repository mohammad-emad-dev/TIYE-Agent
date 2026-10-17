"""Dedicated single-threaded synthetic Linux owner with bounded cleanup."""
import os
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from owner import Owner
from peer import save


def await_release(folder, owner):
    deadline = time.monotonic() + 4
    while not (folder / 'stop').exists():
        owner.sweep()
        if time.monotonic() >= deadline:
            raise TimeoutError('fixture-stop-marker-timeout')
        time.sleep(0.01)


def wait_empty(owner, seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        owner.sweep()
        if owner.empty():
            return True
        time.sleep(0.01)
    owner.sweep()
    return owner.empty()


def mismatch_probe(owner):
    # Alter only expected metadata; a successful refusal must precede any signal.
    saved = {pid: record['identity'].copy() for pid, record in owner.records.items()}
    try:
        live = [record for record in owner.records.values() if record['exitCode'] is None]
        altered = dict(live[-1]['identity'])
        altered['startTicks'] += 1
        live[-1]['identity'] = altered
        try:
            owner.send(signal.SIGTERM)
        except ValueError as error:
            if str(error) != 'identity-mismatch':
                raise
            return {'refused': True}
        raise AssertionError('identity-mismatch-not-refused')
    finally:
        for pid, expected in saved.items():
            owner.records[pid]['identity'] = expected


def run(mode, folder, nonce):
    owner = Owner()
    started = time.monotonic()
    root_pid = owner.start([sys.executable, '-I', '-S', '-B',
        str(Path(__file__).with_name('peer.py')), mode, str(folder), nonce],
        str(folder), {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
    save(folder / 'supervisor-ready.json', {'pid': os.getpid(),
        'rootPid': root_pid, 'nonce': nonce})
    try:
        await_release(folder, owner)
        owner.sweep()
        before = owner.report()
        probe = mismatch_probe(owner) if mode == 'mismatch' else None
        if probe:
            save(folder / 'mismatch.json', {**probe, 'nonce': nonce})
            deadline = time.monotonic() + 2
            while not (folder / 'confirm-mismatch').exists():
                if time.monotonic() >= deadline:
                    raise TimeoutError('mismatch-observer-timeout')
                time.sleep(0.01)
        term_count = owner.send(signal.SIGTERM)
        graceful = wait_empty(owner, 0.2)
        kill_count = 0
        if not graceful:
            kill_count = owner.send(signal.SIGKILL)
        empty = wait_empty(owner, 1)
        after = owner.report()
        save(folder / 'result.json', {'nonce': nonce, 'before': before, 'after': after,
            'mismatch': probe, 'termSignals': term_count, 'killSignals': kill_count,
            'observedEmpty': empty, 'elapsedSeconds': time.monotonic() - started,
            'nativeAdmissionGranted': False})
        return 0 if empty else 1
    finally:
        # On any failed fixture path, attempt owned cleanup without claiming success.
        try:
            owner.send(signal.SIGKILL)
            wait_empty(owner, 1)
        finally:
            owner.close()


if __name__ == '__main__':
    selected, directory, nonce = sys.argv[1:]
    if selected not in {'normal', 'adopted', 'escalate', 'mismatch'}:
        raise ValueError('unknown-synthetic-mode')
    raise SystemExit(run(selected, Path(directory), nonce))
