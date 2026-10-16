"""Shared mechanics for the Windows-only synthetic integration fixture."""
import importlib.util
import os
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
U0 = SOURCE.parent / 'codex-u0'


def load_source(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sys.path.insert(0, str(U0))
u0 = load_source('tiye_original_u0', U0 / 'run.py')
fixture = load_source('tiye_windows_identity', SOURCE.parent / 'codex-u0-watchdog-v2/peer.py')
from transport import Handshake, observe, wire


def witness(folder, role, nonce):
    fixture.witness(folder, role, fixture.describe(None, os.getpid(), nonce))


def environment(folder):
    system = Path(os.environ['SystemRoot'])
    return {'SystemRoot': str(system), 'WINDIR': str(system),
            'PATH': str(system / 'System32'), 'TEMP': str(folder), 'TMP': str(folder)}


def arguments(modes):
    mode, directory, nonce = sys.argv[1:]
    folder = Path(directory).resolve(strict=True)
    if (os.name != 'nt' or mode not in modes or not folder.is_dir() or len(nonce) != 32
            or any(c not in '0123456789abcdef' for c in nonce)):
        raise ValueError('invalid-synthetic-invocation')
    return mode, folder, nonce


def wait_release(folder):
    deadline = time.monotonic() + 5
    while not (folder / 'release').exists():
        if time.monotonic() >= deadline:
            raise TimeoutError('synthetic-release-deadline')
        time.sleep(0.01)


def clean(observation, write_count):
    if not isinstance(observation, dict):
        return False
    writes = observation.get('writes')
    return (observation.get('fault') is None and observation.get('directChildReaped') is True
        and type(observation.get('returnCode')) is int and observation['returnCode'] == 0
        and observation.get('cleanupErrors') == []
        and observation.get('readerEof') == {'stdout': True, 'stderr': True}
        and isinstance(writes, list) and len(writes) == write_count
        and all(isinstance(w, dict) and w.get('state') == 'locally-drained' for w in writes))
