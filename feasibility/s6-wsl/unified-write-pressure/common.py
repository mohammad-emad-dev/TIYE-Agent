import json
import os
import tempfile
import time
from pathlib import Path


def save(path, record):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        json.dump(record, stream)
        stream.flush()
        os.fsync(stream.fileno())
        temporary = Path(stream.name)
    temporary.replace(path)


def identity(role, nonce):
    ticks = int(Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()[19])
    return {'role': role, 'pid': os.getpid(), 'startTicks': ticks, 'uid': os.getuid(),
        'nonce': nonce, 'ppid': os.getppid(), 'sid': os.getsid(0),
        'cgroup': Path('/proc/self/cgroup').read_text().strip(), 'observedMonotonic': time.monotonic()}
