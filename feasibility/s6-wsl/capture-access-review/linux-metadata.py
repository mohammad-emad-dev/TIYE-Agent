"""Present-day fixed-path metadata only; no credential reads or provider execution."""
import json
import os
import re
import stat
import sys
from pathlib import Path

CHILDREN = ('home', 'codex-home', 'tmp', 'main.json', 'protocol-live.json',
            'lease.json', 'descriptor.json', 'service-command.json')


def metadata(path):
    try:
        observed = path.lstat()
    except FileNotFoundError:
        return {'exists': False}
    return {'exists': True, 'mode': format(stat.S_IMODE(observed.st_mode), '04o'),
            'type': stat.S_IFMT(observed.st_mode),
            'ownerMatchesProbeUid': observed.st_uid == os.getuid(),
            'groupMatchesProbeGid': observed.st_gid == os.getgid()}


def snapshot(roots):
    if os.getuid() != 1000 or len(roots) != 9 or len(set(roots)) != 9:
        raise ValueError('requires-nine-roots-and-uid1000')
    if any(not re.fullmatch(r'/tmp/tiye-consolidated-launcher-[a-z0-9_]+', root) for root in roots):
        raise ValueError('unexpected-root')
    return {'uid': os.getuid(), 'scope': 'current-observer-not-historical-service',
            'roots': {root: {name: metadata(Path(root) / name) for name in ('.',) + CHILDREN}
                      for root in roots},
            'mountpointMetadata': {'/mnt/d': metadata(Path('/mnt/d'))},
            'posixAclEvaluated': False, 'effectiveAccessEvaluated': False}


if __name__ == '__main__':
    print(json.dumps(snapshot(json.load(sys.stdin))))
