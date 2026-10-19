"""Bounded final-size checks, including uncertain worker files after Job death."""
import contextlib
import os
from pathlib import Path
import re

import composition
from resources import writer


def file_size(path, owner, limit):
    handle = writer.winacl.open_file(path)
    fd, _ = writer.store.verified_descriptor(handle, owner, os.O_BINARY | os.O_RDONLY)
    try:
        stat = os.fstat(fd)
        if stat.st_nlink != 1 or stat.st_size > limit:
            raise ValueError('linked-or-oversize-retained-file')
        return stat.st_size
    finally:
        os.close(fd)


def retained_worker(root):
    sizes = dict.fromkeys(composition.policy.ALLOCATIONS, 0)
    owner = writer.winacl.current_sid()
    with contextlib.ExitStack() as handles:
        root = Path(root)
        writer.store.pin_ancestors(handles, root.parent)
        handle = writer.store.pin_directory(handles, root)
        writer.winacl.verify_directory(handle, owner)
        folders = {path.name for path in root.iterdir()}
        captures = folders - {'controller', 'observer'}
        if len(captures) != 1 or not re.fullmatch('[0-9a-f]{32}', next(iter(captures))):
            raise ValueError('worker-root-inventory')
        for directory in root.iterdir():
            audit_directory(directory, handles, owner, sizes)
    return sizes


def audit_directory(directory, handles, owner, sizes):
    handle = writer.store.pin_directory(handles, directory)
    writer.winacl.verify_directory(handle, owner)
    names = {path.name for path in directory.iterdir()}
    if directory.name in ('controller', 'observer'):
        expected = {'attempt.json', 'outcome.json'} if directory.name == 'controller' else {'stdout.bin', 'stderr.bin'}
        if names != expected:
            raise ValueError('worker-metadata-inventory')
        for name in names:
            sizes[directory.name] += file_size(directory / name, owner, composition.SLICES['worker'][directory.name])
    else:
        if names not in (writer.FILES, writer.FILES - {'completion.json'}):
            raise ValueError('worker-stream-inventory')
        for name in names:
            stream = name.removesuffix('.bin')
            limit = writer.LIMITS[stream] if stream in writer.LIMITS else composition.SLICES['worker']['stream']
            size = file_size(directory / name, owner, limit)
            if stream not in writer.LIMITS:
                sizes['stream'] += size


def control_sizes(storage, expected):
    if {path.name for path in storage.path.iterdir()} != expected:
        raise ValueError('final-control-inventory')
    return {path.name: file_size(path, storage.owner, writer.CHUNK) for path in storage.path.iterdir()}
