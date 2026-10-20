"""Fixed disposable fixtures only. This is not a native runtime sandbox."""
import base64
import errno
import json
import os
import resource
import signal
import stat
import subprocess
import sys
import tempfile

SIZE = 2097152
INODES = 64
FILE = 65536
CASES = ('file', 'bytes', 'inodes', 'privilege')
BOOT = 'import base64,sys;exec(base64.b64decode(sys.argv[1]))'
ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'}


def require(ok, label):
    if not ok:
        raise RuntimeError(label)


def namespace():
    return os.stat('/proc/self/ns/mnt').st_ino


def mounts(path):
    with open('/proc/self/mountinfo', encoding='ascii') as stream:
        return [line.split() for line in stream if line.split()[4] == path]


def call(args):
    result = subprocess.run(args, capture_output=True, timeout=8, env=ENV, cwd='/')
    require(result.returncode == 0 and not result.stderr, 'fixed-command-failed')
    require(len(result.stdout) <= 4096, 'fixed-report-bound')
    return result.stdout


def python(role, *args):
    return ['/usr/bin/python3', '-I', '-S', '-B', '-c', BOOT, sys.argv[1], role, *args]


def caps():
    with open('/proc/self/status', encoding='ascii') as stream:
        fields = dict(line.rstrip().split(':', 1) for line in stream)
    return (all(int(fields[key], 16) == 0 for key in
                ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'))
            and fields['NoNewPrivs'].strip() == '1')


def refused(action, expected):
    try:
        action()
    except OSError as error:
        require(error.errno == expected, 'unexpected-errno')
        return True
    raise RuntimeError('expected-refusal-missing')


def child(path, case, expected_ns):
    signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
    require(stat.S_ISFIFO(os.fstat(1).st_mode), 'report-must-use-pipe')
    require(caps() and namespace() == int(expected_ns), 'child-privilege-or-namespace')
    require(resource.getrlimit(resource.RLIMIT_FSIZE) == (FILE, FILE), 'file-limit')
    require(resource.getrlimit(resource.RLIMIT_CORE) == (0, 0), 'core-limit')
    require(os.getuid() == 0 and stat.S_IMODE(os.stat(path).st_mode) == 0o700, 'fixture-mode')
    before = os.statvfs(path)
    require(before.f_blocks * before.f_frsize == SIZE and before.f_files == INODES, 'capacity')
    checks = []
    if case == 'file':
        fd = os.open(path + '/file', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            require(os.write(fd, b'x' * (FILE + 1)) == FILE, 'boundary-short-write')
            refused(lambda: os.write(fd, b'x'), errno.EFBIG)
            refused(lambda: os.ftruncate(fd, FILE + 1), errno.EFBIG)
            require(os.fstat(fd).st_size == FILE, 'file-grew')
        finally:
            os.close(fd)
        checks = ['short-write-at-limit', 'write-EFBIG', 'truncate-EFBIG']
    elif case == 'bytes':
        total = 0
        exhausted = False
        for index in range(INODES - 2):
            fd = os.open(path + '/data-' + str(index), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                for _ in range(FILE // 4096):
                    try:
                        count = os.write(fd, b'x' * 4096)
                    except OSError as error:
                        require(error.errno == errno.ENOSPC, 'byte-errno')
                        exhausted = True
                        break
                    require(count == 4096, 'unexpected-block-write')
                    total += count
            finally:
                os.close(fd)
            if exhausted:
                break
        after = os.statvfs(path)
        require(exhausted and 0 < total <= SIZE and after.f_bavail == 0
                and after.f_favail > 0, 'byte-exhaustion-attribution')
        checks = ['bytes-ENOSPC', 'blocks-exhausted-inodes-available']
    elif case == 'inodes':
        count = 0
        exhausted = False
        for index in range(INODES + 1):
            try:
                fd = os.open(path + '/empty-' + str(index), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except OSError as error:
                require(error.errno == errno.ENOSPC, 'inode-errno')
                exhausted = True
                break
            os.close(fd)
            count += 1
        after = os.statvfs(path)
        require(exhausted and 0 < count < INODES and after.f_favail == 0
                and after.f_bavail > 0, 'inode-exhaustion-attribution')
        checks = ['inodes-ENOSPC', 'inodes-exhausted-blocks-available']
    elif case == 'privilege':
        try:
            resource.setrlimit(resource.RLIMIT_FSIZE, (FILE + 1, FILE + 1))
        except (ValueError, PermissionError):
            pass
        else:
            raise RuntimeError('hard-limit-raised')
        result = subprocess.run(['/usr/bin/mount', '-n', '-o', 'remount,size=4m', path],
                                capture_output=True, timeout=3, env=ENV, cwd='/')
        require(result.returncode != 0, 'remount-was-allowed')
        require(os.statvfs(path).f_blocks * before.f_frsize == SIZE, 'mount-resized')
        executable = path + '/executable'
        with open(executable, 'xb') as stream:
            stream.write(b'#!/bin/sh\nexit 0\n')
        os.chmod(executable, 0o700)
        refused(lambda: subprocess.run([executable], timeout=3), errno.EACCES)
        checks = ['hard-limit-raise-refused', 'remount-refused', 'exec-EACCES']
    else:
        raise RuntimeError('unknown-case')
    require(caps(), 'exit-privilege')
    print(json.dumps({'case': case, 'checks': checks, 'capless': True, 'noNewPrivileges': True}))


def supervisor(path, case, host_ns):
    require(namespace() != int(host_ns), 'namespace-not-separated')
    with open('/proc/self/uid_map', encoding='ascii') as stream:
        require(stream.read().split() == ['0', '1000', '1'], 'unexpected-uid-map')
    with open('/proc/self/mountinfo', encoding='ascii') as stream:
        require(not any(token.startswith(('shared:', 'master:', 'propagate_from:'))
                        for line in stream for token in line.split()[6:line.split().index('-')]),
                'propagation-not-private')
    original = os.stat(path)
    require(not mounts(path) and not os.listdir(path), 'mountpoint-not-empty')
    call(['/usr/bin/mount', '-n', '-t', 'tmpfs', '-o',
          'size=2m,nr_inodes=64,nosuid,nodev,noexec,mode=0700', 'tiye-fixed-fixture', path])
    try:
        rows = mounts(path)
        require(len(rows) == 1 and {'nosuid', 'nodev', 'noexec'} <= set(rows[0][5].split(','))
                and rows[0][rows[0].index('-') + 1] == 'tmpfs', 'mount-flags-or-type')
        payload = call(['/usr/bin/prlimit', '--fsize=65536:65536', '--core=0:0', '--',
                        '/usr/bin/setpriv', '--bounding-set=-all', '--inh-caps=-all',
                        '--ambient-caps=-all', '--no-new-privs', *python('child', path, case, str(namespace()))])
        record = json.loads(payload)
    finally:
        # Deliberately discard ONLY fixed synthetic fixtures after measurement.
        call(['/usr/bin/umount', '-n', path])
    current = os.stat(path)
    require((original.st_dev, original.st_ino) == (current.st_dev, current.st_ino)
            and not os.listdir(path) and not mounts(path), 'unmount-restoration')
    record['plainUnmountVerified'] = True
    print(json.dumps(record))


def outer():
    require(os.getuid() == 1000, 'unexpected-host-uid')
    host_ns = namespace()
    rows = []
    # These roots contain only disposable test bytes, never native state.
    with tempfile.TemporaryDirectory(prefix='tiye-fixed-limits-', dir='/tmp') as root:
        os.chmod(root, 0o700)
        for case in CASES:
            path = root + '/' + case
            os.mkdir(path, 0o700)
            require(not mounts(path), 'host-mount-before')
            payload = call(['/usr/bin/unshare', '--user', '--map-root-user', '--mount',
                            '--propagation', 'private', *python('supervisor', path, case, str(host_ns))])
            require(namespace() == host_ns and not mounts(path), 'host-mount-after')
            rows.append(json.loads(payload))
    print(json.dumps({'scope': 'fixed-disposable-filesystem-limit-fixtures', 'cases': rows,
                      'hostMountNamespaceUnchanged': True, 'candidateExecuted': False,
                      'nativeExecutionAllowed': False}))


if sys.argv[2] == 'outer':
    outer()
elif sys.argv[2] == 'supervisor':
    supervisor(*sys.argv[3:])
elif sys.argv[2] == 'child':
    child(*sys.argv[3:])
else:
    raise RuntimeError('unknown-role')
