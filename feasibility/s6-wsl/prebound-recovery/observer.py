"""One pre-enrolled successor may inspect and dispose only the known synthetic fixture."""


def record_at(rootfd, name):
    require(name in ('recovery-owner.json', 'broker-receipt.json'), 'recovery-record-name')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=rootfd)
    try:
        metadata = os.fstat(fd)
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 1000 and metadata.st_nlink == 1
                and stat.S_IMODE(metadata.st_mode) == 0o600 and metadata.st_size <= 4096, 'recovery-record-metadata')
        payload = os.read(fd, 4097)
        require(len(payload) == metadata.st_size and file_stamp(os.fstat(fd)) == file_stamp(metadata),
                'recovery-record-changed')
        return decode(payload.decode('utf-8', errors='strict'))
    finally:
        os.close(fd)


def commit_enrollment(rootfd, document):
    payload = encode(document)
    require(len(payload) <= 4096, 'recovery-enrollment-bound')
    fd = os.open('recovery-owner.json', os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600, dir_fd=rootfd)
    try:
        require(os.write(fd, payload) == len(payload), 'recovery-enrollment-short-write')
        os.fsync(fd)
        require(record_at(rootfd, 'recovery-owner.json') == document, 'recovery-enrollment-readback')
        os.fsync(rootfd)
    finally:
        os.close(fd)


def enroll_successor(request, view, bound, state):
    require(state.identity is None and set(request) == {'event', 'nonce', 'identity'}, 'recovery-already-enrolled-or-schema')
    successor = request['identity']
    fields = {'pid', 'startTicks', 'ppid', 'sid', 'uid', 'cgroup'}
    require(type(successor) is dict and set(successor) == fields
            and all(type(successor[name]) is int and successor[name] > 0 for name in fields - {'cgroup'})
            and successor['pid'] <= 2147483647 and type(successor['cgroup']) is str,
            'recovery-successor-identity-schema')
    excluded = {bound.observer['pid'], bound.keeper['pid'], bound.startup['main']['pid'], bound.startup['leaf']['pid']}
    service_group = bound.startup['main']['cgroup']
    require(type(successor) is dict and successor['pid'] not in excluded and successor['uid'] == 1000
            and successor['cgroup'] != service_group and not successor['cgroup'].startswith(service_group + '/')
            and successor['sid'] != bound.observer['sid'], 'recovery-role-overlap-or-failure-domain')
    fd = hold(successor)
    # Pending enrollment revokes original release before any fallible persistence.
    state.identity, state.fd = successor, fd
    document = {'scope': 'fixed-prebound-unknown-owner', 'nonce': bound.nonce, 'observerIdentity': bound.observer,
        'keeperIdentity': bound.keeper, 'recoveryIdentity': successor, 'invocation': bound.properties['InvocationID'],
        'mountIdentity': list(view.identity),
        'unknownReceiptSha256': hashlib.sha256(encode(record_at(bound.receiptfd, 'broker-receipt.json'))).hexdigest(),
        'automaticDeletion': False, 'nativeExecutionAllowed': False}
    commit_enrollment(bound.receiptfd, document)
    state.committed = True
    return document


def successor_authority(peer, bound, state):
    require(state.committed and select.select([bound.parentfd], [], [], 0)[0], 'recovery-original-observer-not-ended')
    credentials = struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    require(credentials == (state.identity['pid'], 1000, 1000)
            and not select.select([state.fd], [], [], 0)[0]
            and identity(state.identity['pid']) == state.identity, 'recovery-peer-not-pinned-successor')


def recovery_request(peer, view, bound, state):
    peer.settimeout(0.25)
    request = packet(peer)
    require(request.get('nonce') == bound.nonce, 'recovery-request-nonce')
    if request.get('event') == 'enroll-fixed-recovery':
        release_authority(peer, bound)
        document = enroll_successor(request, view, bound, state)
        send_packet(peer, {'event': 'enrolled', 'nonce': bound.nonce, 'document': document})
        return False
    require(request in ({'event': 'probe', 'nonce': bound.nonce},
                        {'event': 'release-fixed-fixture', 'nonce': bound.nonce}), 'recovery-request-schema')
    authority = release_authority if state.identity is None else successor_authority
    arguments = (peer, bound) if state.identity is None else (peer, bound, state)
    authority(*arguments)
    require(directory_stamp(view.fd)[:2] == view.identity, 'recovery-mount-replaced')
    if request['event'] == 'release-fixed-fixture':
        require(state.fixture, 'recovery-not-fixed-fixture')
        fixed_fixture_present(view)
    send_packet(peer, {'event': 'still-held', 'nonce': bound.nonce, 'copyVerified': False})
    authority(*arguments)
    return request['event'] == 'release-fixed-fixture'


def hold_refused_copy(view, bound, fixture):
    state = SimpleNamespace(identity=None, fd=None, committed=False, fixture=fixture)
    # All enrollment and release transitions share this single synchronous loop.
    while True:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as admin:
                admin.bind('\0tiye-keeper-release-' + bound.nonce)
                admin.listen(1)
                while True:
                    try:
                        with admin.accept()[0] as peer:
                            if recovery_request(peer, view, bound, state):
                                if state.fd is not None:
                                    os.close(state.fd)
                                return
                    except (OSError, ValueError):
                        continue
        except OSError:
            time.sleep(0.1)


def enrollment_exchange(nonce, successor):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(3)
        peer.connect('\0tiye-keeper-release-' + nonce)
        send_packet(peer, {'event': 'enroll-fixed-recovery', 'nonce': nonce, 'identity': successor})
        reply = packet(peer)
        require(set(reply) == {'event', 'nonce', 'document'} and reply['event'] == 'enrolled'
                and reply['nonce'] == nonce and reply['document']['recoveryIdentity'] == successor,
                'recovery-enrollment-ack')
        return reply['document']


def require_refused_request(nonce, request):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        peer.connect('\0tiye-keeper-release-' + nonce)
        send_packet(peer, request)
        require(peer.recv(1) == b'', 'recovery-forbidden-request-not-refused')


def scheduled_unknown_observe(root, nonce):
    global FIXED_REFUSAL, OBSERVER_ROOT
    FIXED_REFUSAL, OBSERVER_ROOT = True, root
    witness = SimpleNamespace(rootfd=open_root(root, nonce), nonce=nonce, held=[], sentinel=None, props=None)
    prepare_observer(witness)
    observe_command()
    document = establish_unknown_custody(witness)
    report = refusal_observation(witness, document)
    emit_recovery(report)
    wire = sys.stdin.buffer.readline(4097)
    require(wire.endswith(b'\n') and len(wire) <= 4096, 'recovery-enrollment-input-bound')
    request = decode(wire.decode('utf-8', errors='strict'))
    require(set(request) == {'event', 'nonce', 'identity'} and request['event'] == 'enroll-fixed-recovery'
            and request['nonce'] == nonce, 'recovery-enrollment-input')
    require_refused_request(nonce, {'event': 'enroll-fixed-recovery', 'nonce': nonce, 'identity': {}})
    enrollment = enrollment_exchange(nonce, request['identity'])
    require_refused_request(nonce, request)
    require_refused_request(nonce, {'event': 'release-fixed-fixture', 'nonce': nonce})
    emit_recovery({'event': 'result', 'nonce': nonce, 'stage': 'enrolled', 'document': enrollment})
    # Once enrolled, no old-observer command or EOF may dispose the fixture.
    while True:
        select.select([], [], [], 60)


def recovery_records(binding, nonce):
    info = binding['keeper']
    path = Path(info['root'])
    require(path.parent == Path('/tmp') and re.fullmatch('tiye-full-keeper-[A-Za-z0-9_-]+', path.name),
            'recovery-receipt-path')
    fd = POLICY['open_directory'](str(path))
    try:
        require(list(directory_stamp(fd)[:2]) == info['rootIdentity'], 'recovery-receipt-root-replaced')
        unknown = record_at(fd, 'broker-receipt.json')
        enrollment = record_at(fd, 'recovery-owner.json')
    finally:
        os.close(fd)
    expected = {'scope': 'fixed-supervised-keeper-unknown', 'nonce': nonce, 'keeperIdentity': info['identity'],
        'observerLossDetected': False, 'startup': binding['startup'], 'invocation': binding['invocation'],
        'outcome': 'unknown', 'copyVerified': False, 'automaticDeletion': False,
        'mountIdentity': binding['startup']['runtimeIdentity']}
    require(encode(unknown) == encode(expected), 'recovery-unknown-receipt-binding')
    expected_owner = {'scope': 'fixed-prebound-unknown-owner', 'nonce': nonce,
        'observerIdentity': binding['observer'], 'keeperIdentity': info['identity'],
        'recoveryIdentity': identity(os.getpid()), 'invocation': binding['invocation'],
        'mountIdentity': binding['startup']['runtimeIdentity'],
        'unknownReceiptSha256': hashlib.sha256(encode(unknown)).hexdigest(),
        'automaticDeletion': False, 'nativeExecutionAllowed': False}
    require(encode(enrollment) == encode(expected_owner), 'recovery-owner-receipt-binding')
    return unknown, enrollment


def refused_early_release(nonce):
    require_refused_request(nonce, {'event': 'release-fixed-fixture', 'nonce': nonce})


def refuse_foreign_successor(nonce):
    script = '''import json,socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET)
s.settimeout(2)
s.connect('\\0tiye-keeper-release-'+sys.argv[1])
s.send(json.dumps({'event':'release-fixed-fixture','nonce':sys.argv[1]}).encode())
if s.recv(1)!=b'': raise ValueError('foreign-successor-accepted')
s.close()
'''
    checked = subprocess.run(['/usr/bin/python3', '-I', '-S', '-B', '-c', script, nonce], env=BUS_ENV,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    require(checked.returncode == 0, 'recovery-foreign-successor-not-refused')


def recover_unknown(root, nonce):
    with contextlib.ExitStack() as cleanup:
        rootfd = open_root(root, nonce)
        cleanup.callback(os.close, rootfd)
        verify_bundle(rootfd, nonce)
        wire = sys.stdin.buffer.readline(4097)
        require(wire.endswith(b'\n') and len(wire) <= 4096, 'recovery-binding-bound')
        binding = decode(wire.decode('utf-8', errors='strict'))
        require(type(binding) is dict and set(binding) == {'observer', 'keeper', 'startup', 'invocation'},
                'recovery-binding-schema')
        held = [hold(binding['observer'])]
        cleanup.callback(os.close, held[0])
        held.append(hold(binding['keeper']['identity']))
        cleanup.callback(os.close, held[1])
        own = identity(os.getpid())
        emit_recovery({'event': 'armed', 'nonce': nonce, 'identity': own})
        recovery_command(b'enrolled\n')
        unknown, enrollment = recovery_records(binding, nonce)
        refused_early_release(nonce)
        emit_recovery({'event': 'armed', 'nonce': nonce, 'stage': 'enrolled', 'identity': own,
                       'earlyReleaseRefused': True})
        recovery_command(b'kill\n')
        require(not select.select([held[1]], [], [], 0)[0], 'recovery-keeper-ended-before-fault')
        signal.pidfd_send_signal(held[0], signal.SIGKILL)
        wait_signaled([held[0]], 3)
        require(not select.select([held[1]], [], [], 0)[0], 'recovery-keeper-ended-with-observer')
        unknown_admin(nonce, {'event': 'probe', 'nonce': nonce})
        refuse_foreign_successor(nonce)
        require(recovery_records(binding, nonce) == (unknown, enrollment), 'recovery-records-changed-after-loss')
        recovered = {'event': 'killed', 'nonce': nonce, 'observer': binding['observer'], 'identity': own,
            'keeperAlive': True, 'earlyReleaseRefused': True, 'outcome': 'unknown', 'copyVerified': False,
            'enrollmentSha256': hashlib.sha256(encode(enrollment)).hexdigest(),
            'receiptSha256': hashlib.sha256(encode(unknown)).hexdigest()}
        emit_recovery(recovered)
        recovery_command(b'dispose-fixed-fixture\n')
        unknown_admin(nonce, {'event': 'release-fixed-fixture', 'nonce': nonce})
        wait_signaled(held, 3)
        require(recovery_records(binding, nonce) == (unknown, enrollment), 'recovery-records-changed-after-disposal')
        group = Path('/sys/fs/cgroup') / binding['startup']['main']['cgroup'].removeprefix('0::').lstrip('/')
        require(cgroup_empty(group), 'recovery-worker-group-not-empty')
        audit(rootfd, Ledger('observer'))
        emit_recovery(recovered | {'event': 'result', 'keeperAlive': False, 'fixtureDisposalVerified': True})
