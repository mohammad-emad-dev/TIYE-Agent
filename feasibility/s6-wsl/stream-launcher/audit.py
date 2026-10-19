"""Read held objects in bounded chunks; private hashes never become public fields."""
import hashlib
import msvcrt
import os
from pathlib import Path

import winacl


def directory(path, owner):
    handle = winacl.open_directory(path)
    try:
        winacl.verify_directory(handle, owner)
    finally:
        winacl.close(handle)


def file(path, owner, limit):
    handle = winacl.open_file(path)
    try:
        observed = winacl.snapshot(handle, owner)
        flags = 0 if observed['daclProtected'] else 16
        expected = {'ownerMatchesCurrentToken': True, 'directory': False,
                    'daclPresent': True, 'daclProtected': observed['daclProtected'],
                    'aces': [{'role': role, 'mask': 0x1f01ff, 'flags': flags}
                             for role in ('current-user', 'system', 'administrators')]}
        info = winacl.file_information(handle)
        size = (info.sizeHigh << 32) | info.sizeLow
        if observed != expected or info.links != 1 or size > limit:
            raise ValueError('capture-security-or-budget')
        fd = msvcrt.open_osfhandle(handle, os.O_BINARY | os.O_RDONLY)
    except (OSError, ValueError):
        winacl.close(handle)
        raise
    digest = hashlib.sha256()
    total = 0
    with os.fdopen(fd, 'rb') as stream:
        while True:
            chunk = stream.read(16384)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise ValueError('capture-growth')
            digest.update(chunk)
    if total != size:
        raise ValueError('capture-size-drift')
    return {'bytes': total, 'sha256': digest.hexdigest()}


def capture(path, owner, completed):
    directory(path.parent, owner)
    directory(path, owner)
    expected = {'retention.json', 'stdout.bin', 'stderr.bin'} | ({'completion.json'} if completed else set())
    if {p.name for p in path.iterdir()} != expected:
        raise ValueError('stream-inventory')
    caps = {'stdout.bin': 4194304, 'stderr.bin': 1048576,
            'retention.json': 1048576, 'completion.json': 1048576}
    result = {name: file(path / name, owner, caps[name]) for name in expected}
    if sum(row['bytes'] for name, row in result.items() if name.endswith('.json')) > 1048576:
        raise ValueError('metadata-budget')
    return result
