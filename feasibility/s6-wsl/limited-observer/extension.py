"""Integrate designated tmpfs limits with fixed supervised initialize and retention."""
_startup_prepare = prepare_observer
_startup_finish = finish_observer
_startup_emit = emit
LIMIT_RESULT = None
RETENTION_RESULT = None

GUARD = r'''
import os,resource,stat
fields=dict(line.rstrip().split(':',1) for line in open('/proc/self/status'))
valid=all(int(fields[key],16)==0 for key in ('CapInh','CapPrm','CapEff','CapBnd','CapAmb'))
valid=valid and fields['NoNewPrivs'].strip()=='1'
valid=valid and resource.getrlimit(resource.RLIMIT_FSIZE)==(65536,65536)
valid=valid and resource.getrlimit(resource.RLIMIT_CORE)==(0,0)
valid=valid and os.getuid()==0
if not valid: raise ValueError('fixed-leaf-privilege-or-limit')
os.write(GUARD_FD,b'LIMITS-OK\n')
os.close(GUARD_FD)
'''


def worker(root, nonce):
    fd = open_root(root, nonce)
    try:
        verify_bundle(fd, nonce)
    finally:
        os.close(fd)
    argv = ['/usr/bin/unshare', '--user', '--map-root-user', '--mount', '--propagation', 'private',
            '/usr/bin/python3', '-I', '-S', '-B', str(root / 'linux_runtime.py'),
            'namespace_worker', str(root), nonce]
    os.execve(argv[0], argv, {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})


def check_namespace():
    require(os.getuid() == 0, 'namespace-worker-not-root')
    require(Path('/proc/self/uid_map').read_text().split() == ['0', '1000', '1'], 'namespace-uid-map')
    require(Path('/proc/self/gid_map').read_text().split() == ['0', '1000', '1'], 'namespace-gid-map')
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        fields = line.split()
        require(not any(token.startswith(('shared:', 'master:', 'propagate_from:'))
                        for token in fields[6:fields.index('-')]), 'namespace-propagation-not-private')


def mounted_root():
    path = Path(tempfile.mkdtemp(prefix='tiye-limited-mount-', dir='/tmp'))
    before = os.stat(path)
    code, _, stderr = command(['/usr/bin/mount', '-n', '-t', 'tmpfs', '-o',
        'size=2m,nr_inodes=64,nosuid,nodev,noexec,mode=0700', 'tiye-fixed-supervised', str(path)])
    require(code == 0 and not stderr, 'private-mount-failed')
    rows = [line.split() for line in Path('/proc/self/mountinfo').read_text().splitlines()
            if line.split()[4] == str(path)]
    require(len(rows) == 1 and {'nosuid', 'nodev', 'noexec'} <= set(rows[0][5].split(','))
            and rows[0][rows[0].index('-') + 1] == 'tmpfs', 'private-mount-flags')
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    for name in ('home', 'codex-home', 'tmp'):
        os.mkdir(name, 0o700, dir_fd=fd)
    marker = os.open('retention.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=fd)
    try:
        payload = encode({'uncertain': True, 'automaticDeletion': False, 'scope': 'fixed-synthetic-mount'})
        require(os.write(marker, payload) == len(payload), 'mount-marker-short-write')
        os.fsync(marker)
    finally:
        os.close(marker)
    return path, fd, [before.st_dev, before.st_ino]


def transfer_mount(fd, nonce):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(3)
        peer.connect('\0tiye-limited-' + nonce)
        metadata = os.fstat(fd)
        packet = encode({'nonce': nonce, 'identity': [metadata.st_dev, metadata.st_ino]})
        require(peer.sendmsg([packet], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, array.array('i', [fd]))])
                == len(packet), 'mount-transfer-short-write')
        require(peer.recv(3) == b'OK', 'mount-transfer-not-acknowledged')


def guarded_fixture(path, target):
    reader, writer = os.pipe2(os.O_CLOEXEC)
    try:
        try:
            script = 'GUARD_FD=' + str(writer) + '\n' + GUARD + '\n' + FIXTURE
            child = subprocess.Popen(['/usr/bin/prlimit', '--fsize=65536:65536', '--core=0:0', '--',
                '/usr/bin/setpriv', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all',
                '--no-new-privs', target, '-I', '-S', '-B', '-c', script, str(path), target],
                env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'HOME': str(path / 'home'),
                     'CODEX_HOME': str(path / 'codex-home'), 'TMPDIR': str(path / 'tmp')},
                cwd=path, start_new_session=True, pass_fds=(writer,), stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
        finally:
            os.close(writer)
        initialize_fixture(child, str(path / 'codex-home'))
        require(select.select([reader], [], [], 2)[0] and os.read(reader, 64) == b'LIMITS-OK\n',
                'leaf-limit-witness-missing')
    finally:
        os.close(reader)
    return child


def host_identity(pid):
    observed = identity(pid)
    require(observed['uid'] == 0, 'unexpected-namespace-process-uid')
    return observed | {'uid': 1000}


def namespace_worker(root, nonce):
    check_namespace()
    rootfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    ledger = Ledger('worker')
    path, fd, host_root = mounted_root()
    transfer_mount(fd, nonce)
    target = os.path.realpath('/usr/bin/python3')
    child = guarded_fixture(path, target)
    metadata = os.fstat(fd)
    write_file(rootfd, 'startup.json', encode({'nonce': nonce, 'main': host_identity(os.getpid()),
        'leaf': host_identity(child.pid), 'runtimeRoot': str(path),
        'runtimeIdentity': [metadata.st_dev, metadata.st_ino], 'hostRootIdentity': host_root,
        'fixtureExecutable': target, 'beforeNodes': 4, 'initializeResponseVerified': True,
        'initializedLocallyWritten': True, 'initializedPeerReceiptEstablished': False,
        'leafLimitsVerified': True}), ledger)
    reason, sequence, last, observed = lease_loop(nonce)
    try:
        write_file(rootfd, 'terminal.json', encode({'nonce': nonce, 'pid': os.getpid(), 'reason': reason,
            'lastSequence': sequence, 'ageSeconds': observed - last, 'chargedBeforeTerminal': ledger.used}), ledger)
    finally:
        # KillMode=control-group owns the remaining leaf; observer keeps the mount fd.
        os._exit(71)


def prepare_observer(witness):
    witness.mount_listener = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    witness.mount_view = None
    witness.mount_listener.settimeout(10)
    witness.mount_listener.bind('\0tiye-limited-' + witness.nonce)
    witness.mount_listener.listen(1)
    witness.mount_view, witness.mount_peer_pid = receive_mount(witness.mount_listener, witness.nonce)
    _startup_prepare(witness)


def bind_runtime(witness):
    startup, view = witness.startup, witness.mount_view
    require(startup['main']['pid'] == witness.mount_peer_pid and startup['runtimeIdentity'] == list(view.identity)
            and startup['leafLimitsVerified'] is True and startup['beforeNodes'] == 4
            and startup['initializeResponseVerified'] is True and startup['initializedLocallyWritten'] is True
            and startup['initializedPeerReceiptEstablished'] is False, 'limited-startup-binding')
    path = Path(startup['runtimeRoot'])
    require(path.parent == Path('/tmp') and re.fullmatch('tiye-limited-mount-[A-Za-z0-9_-]+', path.name),
            'limited-host-mountpoint')
    host = POLICY['open_directory'](str(path))
    try:
        require(list(directory_stamp(host)[:2]) == startup['hostRootIdentity']
                and directory_stamp(host)[:2] != view.identity and not os.listdir(host), 'host-view-not-isolated')
    finally:
        os.close(host)
    witness.startup_runtime = view
    require(view.snapshot(startup['fixtureExecutable'])['helperSessions'] == 1, 'limited-active-inventory')
    executable = os.open('/proc/' + str(startup['leaf']['pid']) + '/exe', os.O_RDONLY)
    witness.fixture_executable_fd = executable
    actual, expected = os.fstat(executable), os.stat(view.executable)
    require((actual.st_dev, actual.st_ino) == (expected.st_dev, expected.st_ino), 'limited-executable-identity')


def wait_cleanup(witness):
    global STARTUP_RESULT, LIMIT_RESULT, RETENTION_RESULT
    started = _wait_cleanup(witness)
    view = witness.mount_view
    require(view.snapshot(witness.startup['fixtureExecutable'])['helperSessions'] == 1,
            'post-cleanup-mount-inventory')
    retention = view.retain()
    # The path is intentionally private and stays in protected diagnostics only.
    witness.retention = retention
    RETENTION_RESULT = retention
    STARTUP_RESULT = {'beforeActiveAfterVerified': True, 'helpersRetained': True,
                     'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}
    LIMIT_RESULT = {'designatedMountVerified': True, 'leafLimitsVerified': True,
                    'heldMountAfterCleanupVerified': True, 'persistentCopyVerified': True}
    return started


def finish_observer(witness):
    try:
        _startup_finish(witness)
    finally:
        if getattr(witness, 'mount_listener', None) is not None:
            witness.mount_listener.close()
        # Before startup binding, the legacy finalizer does not own this fd yet.
        if (getattr(witness, 'mount_view', None) is not None
                and getattr(witness, 'startup_runtime', None) is None):
            witness.mount_view.close()


def verify_retained(root, nonce):
    rootfd = open_root(root, nonce)
    try:
        verify_bundle(rootfd, nonce)
    finally:
        os.close(rootfd)
    wire = sys.stdin.buffer.readline(8193)
    require(len(wire) <= 8192 and wire.endswith(b'\n'), 'retention-reopen-input-bound')
    packet = decode(wire.decode('utf-8', errors='strict'))
    require(type(packet) is dict and set(packet) == {'path', 'manifestSha256', 'verified', 'automaticDeletion'}
            and packet['verified'] is True and packet['automaticDeletion'] is False, 'retention-reopen-schema')
    path = Path(packet['path'])
    require(path.parent == Path('/tmp') and re.fullmatch('tiye-limited-retained-[A-Za-z0-9_-]+', path.name),
            'retention-reopen-path')
    fd = POLICY['open_directory'](str(path))
    try:
        view = MountView(fd, os.path.realpath('/usr/bin/python3'))
        manifest = view.inventory()
        require(SESSION in manifest and hashlib.sha256(encode(manifest)).hexdigest() == packet['manifestSha256'],
                'retention-reopen-manifest')
    finally:
        os.close(fd)
    require(os.write(1, b'RETAINED-OK\n') == 12, 'retention-reopen-short-write')


def emit(record):
    if record['event'] == 'ready':
        record['limitObservation'] = {'beforeMountSnapshotVerified': True, 'activeMountSnapshotVerified': True,
                                     'leafLimitsVerified': True}
    elif record['event'] == 'result':
        require(LIMIT_RESULT is not None, 'limited-observation-incomplete')
        record['limitObservation'] = LIMIT_RESULT
        record['retention'] = RETENTION_RESULT
    _startup_emit(record)
