"""Passive package/config metadata inspection and synthetic helper-policy tests."""
import hashlib
import io
import json
import os
from pathlib import PurePosixPath
import re
import stat
import sys
import tempfile
import unittest

ALIASES = {'apply_patch', 'applypatch', 'codex-linux-sandbox', 'codex-execve-wrapper'}
CONFIG_PATHS = ('/etc/codex/config.toml', '/etc/codex/requirements.toml',
                '/etc/codex/managed_config.toml', '/tmp/.codex/config.toml',
                '/.codex/config.toml', '/tmp/config.toml', '/config.toml')


def open_directory(path):
    parts = PurePosixPath(path).parts
    if (str(PurePosixPath(path)) != path or not parts or parts[0] != '/'
            or any(part in ('.', '..') for part in parts[1:])):
        raise ValueError('absolute-directory-required')
    current = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[1:]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            os.close(current)
            current = following
        return os.dup(current)
    finally:
        os.close(current)


def indexed_inventory(rows):
    if not 1 <= len(rows) <= 128:
        raise ValueError('inventory-count')
    indexed = {}
    for row in rows:
        name = row['path']
        if (type(name) is not str or name.startswith('/') or str(PurePosixPath(name)) != name
                or len(name.encode()) > 4096 or len(name.split('/')) > 8
                or any(part in ('', '.', '..') for part in name.split('/')) or name in indexed
                or type(row['bytes']) is not int or not 0 <= row['bytes'] <= 536870912
                or not re.fullmatch('[0-9a-f]{64}', row['sha256'])):
            raise ValueError('inventory-entry')
        indexed[name] = row
    if sum(row['bytes'] for row in rows) > 1073741824:
        raise ValueError('inventory-total')
    return indexed


def directory_metadata(fd):
    metadata = os.fstat(fd)
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 1000 or metadata.st_mode & 0o6022:
        raise ValueError('package-directory-owner-or-write-permissions')
    return metadata.st_dev, metadata.st_ino, metadata.st_mtime_ns, metadata.st_ctime_ns


def walk_package(fd, prefix, state):
    before = directory_metadata(fd)
    with os.scandir(fd) as entries:
        for entry in entries:
            state['nodes'] += 1
            name = prefix + entry.name
            if state['nodes'] > 128 or name in state['seen']:
                raise ValueError('package-node-bound-or-duplicate')
            state['seen'].add(name)
            if name in state['directories']:
                child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    walk_package(child, name + '/', state)
                finally:
                    os.close(child)
            elif name in state['files']:
                inspect_file(fd, entry.name, state['files'][name])
            else:
                raise ValueError('unlisted-package-node')
    if directory_metadata(fd) != before:
        raise ValueError('package-directory-changed')


def inspect_file(parent, name, expected):
    metadata = os.stat(name, dir_fd=parent, follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o6022:
        raise ValueError('package-file-type-or-permissions')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        if os.fstat(fd).st_mode & 0o6022:
            raise ValueError('package-file-write-permissions')
        FROZEN['measure'](fd, expected)
    finally:
        os.close(fd)


def inspect_package(path, rows):
    files = indexed_inventory(rows)
    directories = {str(parent) for name in files for parent in PurePosixPath(name).parents
                   if str(parent) != '.'}
    state = {'files': files, 'directories': directories, 'seen': set(), 'nodes': 0}
    root = open_directory(path)
    try:
        walk_package(root, '', state)
    finally:
        os.close(root)
    if state['seen'] != set(files) | directories:
        raise ValueError('missing-package-node')
    return len(files)


def helper_directory(path, target):
    root = open_directory(path)
    try:
        if stat.S_IMODE(os.fstat(root).st_mode) != 0o700 or os.fstat(root).st_uid != 1000:
            raise ValueError('helper-directory-identity')
        seen = set()
        with os.scandir(root) as entries:
            for entry in entries:
                if entry.name in seen or entry.name not in ALIASES | {'.lock'}:
                    raise ValueError('unexpected-helper-entry')
                seen.add(entry.name)
                metadata = os.stat(entry.name, dir_fd=root, follow_symlinks=False)
                if metadata.st_uid != 1000:
                    raise ValueError('helper-owner')
                if entry.name in ALIASES:
                    if not stat.S_ISLNK(metadata.st_mode) or os.readlink(entry.name, dir_fd=root) != target:
                        raise ValueError('helper-link-target')
                elif (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or metadata.st_size != 0
                      or stat.S_IMODE(metadata.st_mode) != 0o600):
                    raise ValueError('helper-lock-metadata')
        if seen != ALIASES | {'.lock'}:
            raise ValueError('missing-helper-entry')
    finally:
        os.close(root)


def config_presence(path):
    """No content read and no symlink traversal; absence is a point observation."""
    parent, name = path.rsplit('/', 1)
    try:
        fd = open_directory(parent or '/')
    except FileNotFoundError:
        return 'absent-parent'
    except OSError:
        return 'unresolved-parent'
    try:
        try:
            metadata = os.stat(name, dir_fd=fd, follow_symlinks=False)
        except FileNotFoundError:
            return 'absent-entry'
        return 'present-link' if stat.S_ISLNK(metadata.st_mode) else 'present-entry'
    except OSError:
        return 'unresolved-entry'
    finally:
        os.close(fd)


class PolicyTests(unittest.TestCase):
    def test_exact_helper_set_refuses_extra_missing_wrong_target_and_lock_links(self):
        with tempfile.TemporaryDirectory(prefix='tiye-helper-policy-') as folder:
            os.chmod(folder, 0o700)
            target = folder + '/pinned-binary'
            # Target belongs outside the inspected alias directory, as in Codex.
            aliases = folder + '/aliases'
            os.mkdir(aliases, 0o700)
            with open(target, 'xb') as stream:
                stream.write(b'synthetic-not-executed')
            for name in ALIASES:
                os.symlink(target, aliases + '/' + name)
            lock = aliases + '/.lock'
            with open(lock, 'xb'):
                pass
            os.chmod(lock, 0o600)
            helper_directory(aliases, target)
            for mutation in ('extra', 'missing', 'relative-target', 'wrong-target', 'lock-link'):
                with self.subTest(mutation=mutation):
                    victim = aliases + '/apply_patch'
                    if mutation == 'extra':
                        os.symlink(target, aliases + '/extra')
                    elif mutation == 'lock-link':
                        os.unlink(lock)
                        os.symlink(target, lock)
                    else:
                        os.unlink(victim)
                        if mutation != 'missing':
                            os.symlink('../pinned-binary' if mutation == 'relative-target' else '/bin/true', victim)
                    with self.assertRaises(ValueError):
                        helper_directory(aliases, target)
                    if mutation == 'extra':
                        os.unlink(aliases + '/extra')
                    elif mutation == 'lock-link':
                        os.unlink(lock)
                        with open(lock, 'xb'):
                            pass
                        os.chmod(lock, 0o600)
                    else:
                        if os.path.lexists(victim):
                            os.unlink(victim)
                        os.symlink(target, victim)

    def test_complete_package_refuses_extra_missing_symlink_and_writable_files(self):
        with tempfile.TemporaryDirectory(prefix='tiye-package-policy-') as folder:
            filename = folder + '/binary'
            payload = b'synthetic-package-not-executed'
            with open(filename, 'xb') as stream:
                stream.write(payload)
            rows = [{'path': 'binary', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}]
            self.assertEqual(inspect_package(folder, rows), 1)
            for mutation in ('extra', 'missing', 'symlink', 'writable', 'root-writable', 'fifo', 'hardlink'):
                with self.subTest(mutation=mutation):
                    if mutation == 'extra':
                        os.mkdir(folder + '/extra')
                    elif mutation == 'writable':
                        os.chmod(filename, 0o666)
                    elif mutation == 'root-writable':
                        os.chmod(folder, 0o777)
                    elif mutation == 'hardlink':
                        os.link(filename, folder + '-second-link')
                    else:
                        os.unlink(filename)
                        if mutation == 'symlink':
                            os.symlink('/bin/true', filename)
                        elif mutation == 'fifo':
                            os.mkfifo(filename, 0o600)
                    with self.assertRaises((OSError, ValueError)):
                        inspect_package(folder, rows)
                    if mutation == 'extra':
                        os.rmdir(folder + '/extra')
                    elif mutation == 'writable':
                        os.chmod(filename, 0o600)
                    elif mutation == 'root-writable':
                        os.chmod(folder, 0o700)
                    elif mutation == 'hardlink':
                        os.unlink(folder + '-second-link')
                    else:
                        if os.path.lexists(filename):
                            os.unlink(filename)
                        with open(filename, 'xb') as stream:
                            stream.write(payload)

    def test_metadata_probe_never_follows_config_symlink(self):
        with tempfile.TemporaryDirectory(prefix='tiye-config-policy-') as folder:
            path = folder + '/config.toml'
            self.assertEqual(config_presence(path), 'absent-entry')
            os.symlink('/does-not-exist', path)
            self.assertEqual(config_presence(path), 'present-link')


def inspect(packet):
    if os.getuid() != 1000:
        raise ValueError('expected-owned-account-uid')
    count = inspect_package(packet['package'], packet['inventory'])
    log = io.StringIO()
    report = unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromTestCase(PolicyTests))
    if not report.wasSuccessful():
        raise RuntimeError(log.getvalue())
    return {'scope': 'passive-complete-package-and-fixed-config-metadata', 'filesMatched': count,
            'exactPackageInventoryMatched': True, 'policyTests': report.testsRun,
            'configPresence': {path: config_presence(path) for path in CONFIG_PATHS},
            'candidateExecuted': False, 'credentialContentsRead': False, 'keyringQueried': False,
            'nativeHelpersObserved': False, 'effectiveConfigurationResolved': False,
            'nativeExecutionAllowed': False}


if __name__ == '__main__':
    raw = sys.stdin.buffer.readline(65537)
    if len(raw) > 65536 or not raw.endswith(b'\n'):
        raise ValueError('inspection-input-bound')
    print(json.dumps(inspect(json.loads(raw))))
