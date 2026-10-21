"""FD-relative fixed inventory and bounded persistent copy, outside the service."""
import array
import ctypes
import socket
import struct

MOUNT_BYTES, MOUNT_INODES, RETENTION_BYTES = 2097152, 64, 131072
SESSION = 'codex-home/tmp/arg0/codex-arg0protocol'
DIRECTORIES = {'home', 'codex-home', 'tmp', 'codex-home/tmp', 'codex-home/tmp/arg0', SESSION}
FILES = {'retention.json', SESSION + '/.lock'}
LINKS = {SESSION + '/' + name for name in POLICY['ALIASES']}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def directory_stamp(fd):
    metadata = os.fstat(fd)
    require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == 1000
            and stat.S_IMODE(metadata.st_mode) == 0o700, 'mount-directory-metadata')
    return metadata.st_dev, metadata.st_ino, metadata.st_mtime_ns, metadata.st_ctime_ns


def file_stamp(metadata):
    return (metadata.st_dev, metadata.st_ino, metadata.st_mode, metadata.st_uid,
            metadata.st_gid, metadata.st_nlink, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns)


def mount_capacity(fd):
    # Linux statfs starts with a native long f_type. Oversized buffer avoids
    # depending on the remaining architecture-specific structure layout.
    filesystem = ctypes.create_string_buffer(256)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.fstatfs.argtypes = (ctypes.c_int, ctypes.c_void_p)
    libc.fstatfs.restype = ctypes.c_int
    require(libc.fstatfs(fd, filesystem) == 0
            and ctypes.c_long.from_buffer(filesystem).value == 0x01021994, 'received-fd-not-tmpfs')
    capacity = os.fstatvfs(fd)
    flags = os.ST_NOSUID | os.ST_NODEV | os.ST_NOEXEC
    require(capacity.f_blocks * capacity.f_frsize == MOUNT_BYTES and capacity.f_files == MOUNT_INODES
            and capacity.f_flag & flags == flags, 'received-mount-capacity-or-flags')


class MountView:
    def __init__(self, fd, executable):
        self.fd, self.executable = fd, executable
        self.identity = directory_stamp(fd)[:2]

    def inventory(self, destination=None):
        require(directory_stamp(self.fd)[:2] == self.identity, 'held-mount-replaced')
        state = SimpleNamespace(manifest={}, charged=0)
        self.walk(self.fd, '', state, destination)
        manifest = state.manifest
        expected = {'home', 'codex-home', 'tmp', 'retention.json'}
        require(set(manifest) in (expected, DIRECTORIES | FILES | LINKS), 'fixed-inventory-incomplete')
        return manifest

    def walk(self, fd, prefix, state, destination):
        before = directory_stamp(fd)
        manifest = state.manifest
        for basename in sorted(os.listdir(fd)):
            name = prefix + basename
            require(len(manifest) < 64 and len(name.split('/')) <= 6, 'retention-node-or-depth-bound')
            metadata = os.stat(basename, dir_fd=fd, follow_symlinks=False)
            require(metadata.st_uid == 1000, 'mount-node-owner')
            if name in DIRECTORIES:
                child = os.open(basename, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                copied = None
                try:
                    directory_stamp(child)
                    manifest[name] = {'type': 'directory'}
                    if destination is not None:
                        os.mkdir(basename, 0o700, dir_fd=destination)
                        copied = os.open(basename, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                         dir_fd=destination)
                    self.walk(child, name + '/', state, copied)
                finally:
                    if copied is not None:
                        os.close(copied)
                    os.close(child)
            elif name in FILES:
                self.copy_file(fd, name, state, destination)
            elif name in LINKS:
                require(stat.S_ISLNK(metadata.st_mode), 'mount-alias-type')
                target = os.readlink(basename, dir_fd=fd)
                require(target == self.executable, 'mount-alias-target')
                state.charged += len(os.fsencode(target))
                require(state.charged <= RETENTION_BYTES, 'retention-byte-bound')
                manifest[name] = {'type': 'link', 'target': target}
                if destination is not None:
                    os.symlink(target, basename, dir_fd=destination)
            else:
                raise ValueError('unexpected-node-no-content-read')
        require(directory_stamp(fd) == before, 'mount-directory-changed')
        if destination is not None:
            os.fsync(destination)

    def copy_file(self, parent, name, state, destination):
        basename = name.rsplit('/', 1)[-1]
        metadata = os.stat(basename, dir_fd=parent, follow_symlinks=False)
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 1000 and metadata.st_nlink == 1
                and stat.S_IMODE(metadata.st_mode) == 0o600 and metadata.st_size <= 65536,
                'retention-file-metadata')
        require(name != SESSION + '/.lock' or metadata.st_size == 0, 'helper-lock-not-empty')
        # Charge before reading or allocating a destination; failure never refunds.
        state.charged += metadata.st_size
        require(state.charged <= RETENTION_BYTES, 'retention-byte-bound')
        source = os.open(basename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            require(file_stamp(os.fstat(source)) == file_stamp(metadata), 'retention-file-replaced')
            payload = os.read(source, metadata.st_size + 1)
            require(len(payload) == metadata.st_size and file_stamp(os.fstat(source)) == file_stamp(metadata),
                    'retention-file-changed')
        finally:
            os.close(source)
        state.manifest[name] = {'type': 'file', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
        if destination is not None:
            copied = os.open(basename, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=destination)
            try:
                require(os.write(copied, payload) == len(payload), 'retention-copy-short-write')
                os.fsync(copied)
                os.lseek(copied, 0, os.SEEK_SET)
                require(os.read(copied, len(payload) + 1) == payload, 'retention-copy-readback')
            finally:
                os.close(copied)

    def snapshot(self, executable):
        require(executable == self.executable, 'retention-executable-drift')
        manifest = self.inventory()
        return {'nodes': len(manifest), 'helperSessions': int(SESSION in manifest)}

    def retain(self):
        # Only the fixed allowlisted fixture is copied; no unknown native content.
        before = self.inventory()
        require(SESSION in before, 'retention-requires-active-fixed-footprint')
        destination = Path(tempfile.mkdtemp(prefix='tiye-limited-retained-', dir='/tmp'))
        copied_fd = POLICY['open_directory'](str(destination))
        try:
            copied = self.inventory(copied_fd)
            readback = MountView(copied_fd, self.executable).inventory()
            require(before == copied == readback == self.inventory(), 'retention-manifest-mismatch')
            require(os.fstat(copied_fd).st_dev != self.identity[0], 'retention-not-outside-mount')
            os.fsync(copied_fd)
        finally:
            os.close(copied_fd)
        return {'path': str(destination), 'manifestSha256': hashlib.sha256(encode(before)).hexdigest(),
                'verified': True, 'automaticDeletion': False}

    def close(self):
        os.close(self.fd)


def validate_transfer(envelope, nonce):
    message, ancillary, flags, credentials = envelope
    descriptors, controls_valid = [], True
    try:
        # Gather every installed descriptor before any rejection, so all close.
        for level, kind, payload in ancillary:
            if level != socket.SOL_SOCKET or kind != socket.SCM_RIGHTS:
                controls_valid = False
                continue
            received = array.array('i')
            controls_valid &= len(payload) % received.itemsize == 0
            received.frombytes(payload[:len(payload) - len(payload) % received.itemsize])
            descriptors.extend(received)
        require(controls_valid and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC)
                and len(descriptors) == 1, 'mount-transfer-control-truncated-or-count')
        packet = decode(message.decode('utf-8', errors='strict'))
        require(type(packet) is dict and set(packet) == {'nonce', 'identity'} and packet['nonce'] == nonce
                and credentials[1:] == (1000, 1000), 'mount-transfer-peer-or-nonce')
        fd = descriptors[0]
        require(not os.get_inheritable(fd), 'received-fd-not-cloexec')
        view = MountView(fd, os.path.realpath('/usr/bin/python3'))
        require(packet['identity'] == list(view.identity), 'mount-transfer-identity')
        require(view.snapshot(view.executable) == {'nodes': 4, 'helperSessions': 0}, 'mount-before-inventory')
        mount_capacity(fd)
        descriptors.clear()
        return view, credentials[0]
    finally:
        for fd in descriptors:
            os.close(fd)


def receive_mount(listener, nonce):
    with listener.accept()[0] as peer:
        peer.settimeout(3)
        credentials = struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        message, ancillary, flags, _ = peer.recvmsg(1024, socket.CMSG_SPACE(8 * array.array('i').itemsize),
                                                   socket.MSG_CMSG_CLOEXEC)
        view, pid = validate_transfer((message, ancillary, flags, credentials), nonce)
        try:
            require(peer.send(b'OK') == 2, 'mount-ack-short-write')
            return view, pid
        except BaseException:
            view.close()
            raise
