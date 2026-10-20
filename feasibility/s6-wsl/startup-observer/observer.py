"""Passive snapshots of an exclusive fixture root; no native launch/admission API."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid

NODE_CAP, BYTE_CAP, FILE_CAP = 64, 131072, 65536
BASE = {'home', 'codex-home', 'tmp'}
PARENTS = {'codex-home/tmp', 'codex-home/tmp/arg0'}


def directory_identity(fd):
    metadata = os.fstat(fd)
    if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 1000
            or stat.S_IMODE(metadata.st_mode) != 0o700):
        raise ValueError('runtime-directory-identity-or-permissions')
    return metadata.st_dev, metadata.st_ino, metadata.st_mtime_ns, metadata.st_ctime_ns


class RuntimeRoot:
    def __init__(self):
        if os.getuid() != 1000:
            raise ValueError('owned-fixture-account-required')
        self.path = Path(tempfile.mkdtemp(prefix='tiye-startup-observer-'))
        self.fd = POLICY['open_directory'](str(self.path))
        self.identity = directory_identity(self.fd)[:2]
        self.nonce = uuid.uuid4().hex
        for name in BASE:
            os.mkdir(name, 0o700, dir_fd=self.fd)
        payload = json.dumps({'nonce': self.nonce, 'uncertain': True, 'automaticDeletion': False}).encode()
        fd = os.open('retention.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=self.fd)
        try:
            if os.write(fd, payload) != len(payload):
                raise OSError('retention-short-write')
            os.fsync(fd)
        finally:
            os.close(fd)

    def environment(self):
        return {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'HOME': str(self.path / 'home'),
                'CODEX_HOME': str(self.path / 'codex-home'), 'TMPDIR': str(self.path / 'tmp')}

    def snapshot(self, executable):
        if directory_identity(self.fd)[:2] != self.identity:
            raise ValueError('runtime-root-identity-changed')
        state = {'nodes': 0, 'bytes': 0, 'names': set(), 'sessions': {}, 'executable': executable}
        self.walk(self.fd, '', state)
        if not BASE | {'retention.json'} <= state['names']:
            raise ValueError('base-runtime-inventory-missing')
        if len(state['sessions']) > 1:
            raise ValueError('multiple-helper-sessions')
        for session, identity in state['sessions'].items():
            session_fd = POLICY['open_directory'](str(self.path / session))
            try:
                if directory_identity(session_fd) != identity:
                    raise ValueError('helper-session-replaced-before-validation')
                POLICY['helper_directory'](str(self.path / session), executable)
                if directory_identity(session_fd) != identity:
                    raise ValueError('helper-session-changed-during-validation')
            finally:
                os.close(session_fd)
        # Detect ordinary path replacement around the path-based frozen checker.
        path_fd = POLICY['open_directory'](str(self.path))
        try:
            if directory_identity(path_fd)[:2] != self.identity:
                raise ValueError('runtime-path-no-longer-held-root')
        finally:
            os.close(path_fd)
        return {'nodes': state['nodes'], 'bytes': state['bytes'], 'helperSessions': len(state['sessions'])}

    def walk(self, fd, prefix, state):
        before = directory_identity(fd)
        with os.scandir(fd) as entries:
            for entry in entries:
                name = prefix + entry.name
                state['nodes'] += 1
                if state['nodes'] > NODE_CAP or len(name.split('/')) > 6:
                    raise ValueError('runtime-node-or-depth-cap')
                metadata = os.stat(entry.name, dir_fd=fd, follow_symlinks=False)
                if metadata.st_uid != 1000:
                    raise ValueError('runtime-node-owner')
                state['names'].add(name)
                self.node(fd, entry.name, name, metadata, state)
        if directory_identity(fd) != before:
            raise ValueError('runtime-directory-changed-during-snapshot')

    def node(self, parent, basename, name, metadata, state):
        session = re.fullmatch('codex-home/tmp/arg0/codex-arg0[A-Za-z0-9_-]{1,48}', name)
        if name in BASE | PARENTS or session:
            child = os.open(basename, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                if session:
                    state['sessions'][name] = directory_identity(child)
                self.walk(child, name + '/', state)
            finally:
                os.close(child)
        elif name == 'retention.json' or (name.rsplit('/', 1)[0] in state['sessions'] and basename == '.lock'):
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1
                    or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_size > FILE_CAP):
                raise ValueError('runtime-file-metadata-or-cap')
            state['bytes'] += metadata.st_size
        elif name.rsplit('/', 1)[0] in state['sessions'] and basename in POLICY['ALIASES']:
            if not stat.S_ISLNK(metadata.st_mode):
                raise ValueError('helper-must-be-link')
            target = os.readlink(basename, dir_fd=parent)
            if target != state['executable']:
                raise ValueError('helper-target-mismatch')
            state['bytes'] += len(os.fsencode(target))
        else:
            # Includes dotenv/auth/config paths: refuse before reading content.
            raise ValueError('unexpected-runtime-node-retain-quarantine')
        if state['bytes'] > BYTE_CAP:
            raise ValueError('runtime-content-budget-exceeded')

    def close(self):
        os.close(self.fd)
