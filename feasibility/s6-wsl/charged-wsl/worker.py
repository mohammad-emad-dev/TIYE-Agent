"""Windows heartbeat owner; the private Job also owns its WSL client."""
import contextlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import composition
from control import ControlRecords, PublicationPending, parameters
from resources import BudgetCapture, MetadataFiles, writer
import windows


def drain(target, name, pipe):
    discard = False
    try:
        while payload := pipe.read(writer.CHUNK):
            if not discard:
                try:
                    with target.lock:
                        target.files.write('observer', name + '.bin', payload)
                except (OSError, ValueError):
                    discard = True
                    target.failed.set()
    except OSError:
        target.failed.set()


def own(config, controls):
    budget = controls.budget
    capture = BudgetCapture(budget)
    files = MetadataFiles(capture, budget)
    controls.write('intent.json', {'uncertain': True, 'automaticDeletion': False,
                                  'captureRoot': str(capture.storage.path), 'mode': config['mode']})
    files.write('controller', 'attempt.json', writer.encode({'mode': config['mode'], 'nonce': controls.nonce}))
    system = Path(os.environ['SystemRoot'])
    argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
            '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
            '-I', '-S', '-B', config['linuxRoot'] + '/linux_runtime.py', 'bridge', config['linuxRoot'], controls.nonce]
    child = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
                             env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
    failed, lock = threading.Event(), threading.Lock()
    target = SimpleNamespace(files=files, lock=lock, failed=failed)
    threads = [threading.Thread(target=drain, args=(target, name, getattr(child, name)), daemon=True)
               for name in ('stdout', 'stderr')]
    for thread in threads:
        thread.start()
    controls.write('ready.json', {'mode': config['mode'], 'root': windows.identity(os.getpid(), controls.nonce),
                                  'protocol': windows.identity(child.pid, controls.nonce)})
    sequence = 0
    while not failed.is_set():
        sequence += 1
        payload = writer.encode({'nonce': controls.nonce, 'sequence': sequence}) + b'\n'
        if child.stdin.write(payload) != len(payload):
            raise OSError('short-heartbeat-write-no-retry')
        child.stdin.flush()
        try:
            release = controls.read('release.json')
        except (FileNotFoundError, PublicationPending):
            time.sleep(0.1)
            continue
        expected = 'stall' if config['mode'] == 'stall' else 'exit-owner'
        if set(release) != {'nonce', 'composition', 'action'} or release['action'] != expected:
            raise ValueError('owner-release-schema')
        if config['mode'] == 'stall':
            time.sleep(95)
        os._exit(17)
    raise RuntimeError('host-diagnostic-persistence-failed')


def main():
    mode, packet, nonce, binding = sys.argv[1:]
    parameters(mode, nonce, binding)
    config = json.loads(packet)
    if (set(config) != {'windowsRoot', 'linuxRoot'} or not isinstance(config['linuxRoot'], str)
            or not re.fullmatch('/tmp/tiye-charged-' + nonce + '-[A-Za-z0-9_-]+', config['linuxRoot'])):
        raise ValueError('fixed-runtime-config')
    budget = composition.LeaseBudget('worker')
    with contextlib.ExitStack() as handles:
        root = Path(config['windowsRoot'])
        writer.store.pin_ancestors(handles, root.parent)
        handle = writer.store.pin_directory(handles, root)
        owner = writer.winacl.current_sid()
        writer.winacl.verify_directory(handle, owner)
        controls = ControlRecords(SimpleNamespace(path=root, handle=handle, owner=owner), budget, nonce)
        own(config | {'mode': mode}, controls)


if __name__ == '__main__':
    main()
