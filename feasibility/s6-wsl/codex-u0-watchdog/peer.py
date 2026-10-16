"""Synthetic Windows root/descendant fixtures with a finite lifetime."""
import ctypes
from ctypes import wintypes as W
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def describe(handle, pid, nonce):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetCurrentProcess.restype = W.HANDLE
    kernel.GetProcessTimes.argtypes = [W.HANDLE] + [ctypes.POINTER(W.FILETIME)] * 4
    kernel.GetProcessTimes.restype = W.BOOL
    times = [W.FILETIME() for unused in range(4)]
    if not kernel.GetProcessTimes(handle or kernel.GetCurrentProcess(), *[ctypes.byref(t) for t in times]):
        raise ctypes.WinError(ctypes.get_last_error())
    creation = times[0].dwLowDateTime | (times[0].dwHighDateTime << 32)
    return {'pid': pid, 'creationTime': creation, 'nonce': nonce}


def witness(root, role, record):
    target = root / (role + '.json')
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(record), encoding='utf-8')
    temporary.replace(target)


def main():
    mode, folder, nonce = sys.argv[1:]
    root = Path(folder)
    deadline = time.monotonic() + 15
    if mode == 'suspended-owner':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from winjob import ChildJob
        command = [sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()), 'child', folder, nonce]
        with ChildJob(command, folder) as target:
            witness(root, 'suspended', describe(target.process_handle, target.pid, nonce))
            time.sleep(15)
        return
    if mode in ['child', 'sentinel']:
        witness(root, mode, describe(None, os.getpid(), nonce))
        time.sleep(15)
        return
    witness(root, 'root', describe(None, os.getpid(), nonce))
    if mode not in ['normal', 'nonzero']:
        subprocess.Popen([sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()),
                          'child', folder, nonce], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if mode in ['normal', 'nonzero', 'root-exits']:
        while not (root / 'release-root').exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        return 7 if mode == 'nonzero' else 0
    time.sleep(max(0, deadline - time.monotonic()))


if __name__ == '__main__':
    raise SystemExit(main())
