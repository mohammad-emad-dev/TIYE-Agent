"""Read only exact package inventory through no-follow descriptors; never exec it."""
import hashlib
import json
import os
import stat
import sys


def open_selected(root_fd, relative):
    parts = relative.split('/')
    if not parts or any(part in ('', '.', '..') for part in parts) or relative.startswith('/'):
        raise ValueError('package-relative-file-required')
    parent = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = following
        return os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    finally:
        os.close(parent)


def measure(fd, expected):
    before = os.fstat(fd)
    if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_uid != 1000
            or before.st_size != expected['bytes'] or before.st_size > 536870912):
        raise ValueError('package-file-metadata-mismatch')
    digest = hashlib.sha256()
    total = 0
    while True:
        block = os.read(fd, 65536)
        if not block:
            break
        total += len(block)
        if total > before.st_size:
            raise ValueError('package-file-grew')
        digest.update(block)
    after = os.fstat(fd)
    stable = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
    if not stable or total != before.st_size or digest.hexdigest() != expected['sha256']:
        raise ValueError('package-file-drift')


def inspect(packet):
    if os.getuid() != 1000 or not 1 <= len(packet['inventory']) <= 128:
        raise ValueError('uid-or-inventory-size')
    if sum(row['bytes'] for row in packet['inventory']) > 1073741824:
        raise ValueError('package-total-budget')
    root = os.open(packet['package'], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for row in packet['inventory']:
            fd = open_selected(root, row['path'])
            try:
                measure(fd, row)
            finally:
                os.close(fd)
    finally:
        os.close(root)
    return {'scope': 'listed-package-bytes-only-no-execution', 'filesMatched': len(packet['inventory']),
            'allListedDigestsMatched': True, 'uidMatched': True, 'candidateExecuted': False,
            'credentialFilesRead': False, 'authStatusRequested': False}


if __name__ == '__main__':
    raw = sys.stdin.buffer.readline(65537)
    if len(raw) > 65536 or not raw.endswith(b'\n'):
        raise ValueError('inspection-input-budget')
    print(json.dumps(inspect(json.loads(raw))))
