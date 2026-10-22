"""Independent keeper and pre-fault recovery witness for fixed supervised fixtures."""
import math
import signal

_limited_bind = bind_runtime
_limited_finish = finish_observer
_limited_emit = emit
_charged_observe = observe
KEEPER_RESULT = None
READY_KEEPER = {'ownedBeforeProducerAck': True, 'activeBindingsVerified': True}


def reopen_copy(retained):
    require(type(retained) is dict and set(retained) == {'path', 'manifestSha256', 'verified', 'automaticDeletion'}
            and retained['verified'] is True and retained['automaticDeletion'] is False, 'keeper-copy-schema')
    path = Path(retained['path'])
    require(path.parent == Path('/tmp') and re.fullmatch('tiye-limited-retained-[A-Za-z0-9_-]+', path.name),
            'keeper-copy-path')
    fd = POLICY['open_directory'](str(path))
    try:
        manifest = MountView(fd, os.path.realpath('/usr/bin/python3')).inventory()
        require(SESSION in manifest and hashlib.sha256(encode(manifest)).hexdigest() == retained['manifestSha256'],
                'keeper-copy-digest')
    finally:
        os.close(fd)


def keeper_document(document, expected):
    fields = {'scope', 'nonce', 'keeperIdentity', 'observerLossDetected', 'startup', 'invocation', 'cleanup', 'retention'}
    require(type(document) is dict and set(document) == fields
            and document['scope'] == 'fixed-supervised-keeper-retained'
            and document['nonce'] == expected['nonce'] and document['keeperIdentity'] == expected['identity']
            and document['startup'] == expected['startup'] and document['invocation'] == expected['invocation']
            and document['observerLossDetected'] is expected['observerLossDetected'], 'keeper-receipt-binding')
    cleanup = document['cleanup']
    require(type(cleanup) is dict and set(cleanup) == {'heldPidfdsSignaled', 'originalProcEntriesAbsent',
        'cgroupEmpty', 'sentinelSurvived', 'leaseReason', 'observationSeconds'}, 'keeper-cleanup-schema')
    for name in ('heldPidfdsSignaled', 'originalProcEntriesAbsent', 'cgroupEmpty', 'sentinelSurvived'):
        require(cleanup[name] is True, 'keeper-cleanup-unverified')
    duration = cleanup['observationSeconds']
    require(cleanup['leaseReason'] in ('eof', 'expired') and type(duration) in (int, float)
            and math.isfinite(duration) and 0 <= duration < 8, 'keeper-cleanup-window')
    reopen_copy(document['retention'])
    group = Path('/sys/fs/cgroup') / expected['startup']['main']['cgroup'].removeprefix('0::').lstrip('/')
    require(cgroup_empty(group), 'keeper-service-not-empty-after-copy')
    return document


def keeper(root, nonce):
    peer = socket.socket(fileno=int(sys.argv[4]))
    peer.settimeout(10)
    rootfd = open_root(root, nonce)
    verify_bundle(rootfd, nonce)
    observer_identity = identity(os.getppid())
    parentfd = hold(observer_identity)
    own_identity = identity(os.getpid())
    view, sentinel = None, None
    held = []
    receipt_root = Path(tempfile.mkdtemp(prefix='tiye-full-keeper-', dir='/tmp'))
    receiptfd = POLICY['open_directory'](str(receipt_root))
    try:
        require(directory_stamp(receiptfd)[:2] != directory_stamp(rootfd)[:2], 'keeper-receipt-aliases-service-root')
        view = receive_view(peer, nonce, None)
        require(view.snapshot(view.executable) == {'nodes': 4, 'helperSessions': 0}, 'keeper-before-inventory')
        send_packet(peer, {'event': 'held', 'nonce': nonce, 'identity': own_identity,
            'root': str(receipt_root), 'rootIdentity': list(directory_stamp(receiptfd)[:2])})
        arm = packet(peer)
        require(set(arm) == {'event', 'nonce', 'startup', 'invocation'} and arm['event'] == 'arm'
                and arm['nonce'] == nonce, 'keeper-arm-schema')
        startup = arm['startup']
        properties = descriptor(nonce, startup)
        require(properties['InvocationID'] == arm['invocation']
                and startup['runtimeIdentity'] == list(view.identity) and startup['leafLimitsVerified'] is True,
                'keeper-arm-binding')
        for role in ('main', 'leaf'):
            held.append(hold(startup[role]))
        group = Path('/sys/fs/cgroup') / properties['ControlGroup'].lstrip('/')
        sentinel = subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B', '-c', 'import time;time.sleep(95)'],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=BUS_ENV,
            start_new_session=True)
        sentinel_identity = identity(sentinel.pid)
        held.append(hold(sentinel_identity))
        service_group = '0::' + properties['ControlGroup']
        outside = (own_identity['cgroup'], observer_identity['cgroup'], sentinel_identity['cgroup'])
        require(all(member != service_group and not member.startswith(service_group + '/') for member in outside)
                and own_identity['sid'] != observer_identity['sid'], 'keeper-inside-owned-failure-domain')
        require(view.snapshot(view.executable)['helperSessions'] == 1, 'keeper-active-inventory')
        send_packet(peer, {'event': 'armed', 'nonce': nonce})
        readable, _, _ = select.select([peer, parentfd], [], [], 15)
        require(readable, 'keeper-finish-timeout')
        lost = bool(select.select([parentfd], [], [], 0)[0])
        if not lost:
            payload = peer.recv(4097)
            if not payload:
                wait_signaled([parentfd], 3)
                lost = True
            else:
                require(len(payload) <= 4096 and decode(payload.decode('utf-8')) == {'event': 'finish', 'nonce': nonce},
                        'keeper-finish-command')
        witness = SimpleNamespace(rootfd=rootfd, nonce=nonce, startup=startup, props=properties,
                                  held=held, sentinel=sentinel, cgroup=group)
        started = _wait_cleanup(witness)
        reason = terminal_evidence(witness)
        retained = view.retain()
        require(cgroup_empty(group) and all(select.select([fd], [], [], 0)[0] for fd in held[:2])
                and sentinel.poll() is None, 'keeper-cleanup-changed-after-copy')
        cleanup = {'heldPidfdsSignaled': True, 'originalProcEntriesAbsent': True, 'cgroupEmpty': True,
            'sentinelSurvived': True, 'leaseReason': reason, 'observationSeconds': time.monotonic() - started}
        document = {'scope': 'fixed-supervised-keeper-retained', 'nonce': nonce, 'keeperIdentity': own_identity,
            'observerLossDetected': lost, 'startup': startup, 'invocation': properties['InvocationID'],
            'cleanup': cleanup, 'retention': retained}
        receipt(receiptfd, document)
        if not lost:
            send_packet(peer, {'event': 'receipt', 'nonce': nonce})
    finally:
        peer.close()
        if view is not None:
            view.close()
        if sentinel is not None:
            stop_sentinel(sentinel)
        for fd in held:
            os.close(fd)
        os.close(parentfd)
        os.close(receiptfd)
        os.close(rootfd)


def prepare_observer(witness):
    witness.root = OBSERVER_ROOT
    witness.mount_listener = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    witness.mount_listener.settimeout(10)
    witness.mount_view, witness.startup_runtime, witness.fixture_executable_fd = None, None, None
    witness.keeper_peer, witness.keeper_process = None, None
    witness.mount_listener.bind('\0tiye-limited-' + witness.nonce)
    witness.mount_listener.listen(1)
    with witness.mount_listener.accept()[0] as producer:
        producer.settimeout(10)
        credentials = struct.unpack('3i', producer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        payload, ancillary, flags, _ = producer.recvmsg(1024, socket.CMSG_SPACE(32), socket.MSG_CMSG_CLOEXEC)
        witness.mount_view, witness.mount_peer_pid = validate_transfer(
            (payload, ancillary, flags, credentials), witness.nonce)
        parent, child = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        witness.keeper_peer = parent
        parent.settimeout(10)
        try:
            witness.keeper_process = subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B',
                str(witness.root / 'linux_runtime.py'), 'keeper', str(witness.root), witness.nonce,
                str(child.fileno())], pass_fds=(child.fileno(),), env=BUS_ENV, start_new_session=True,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        finally:
            child.close()
        keeper_identity = identity(witness.keeper_process.pid)
        witness.held.append(hold(keeper_identity))
        send_packet(parent, {'nonce': witness.nonce, 'identity': list(witness.mount_view.identity)}, witness.mount_view.fd)
        witness.keeper_info = packet(parent)
        require(set(witness.keeper_info) == {'event', 'nonce', 'identity', 'root', 'rootIdentity'}
                and witness.keeper_info['event'] == 'held' and witness.keeper_info['nonce'] == witness.nonce
                and witness.keeper_info['identity'] == keeper_identity, 'keeper-ownership-ack')
        require(producer.send(b'OK') == 2, 'keeper-producer-ack-short-write')
    verify_bundle(witness.rootfd, witness.nonce)
    witness.startup = wait_startup(witness.rootfd)
    witness.props = descriptor(witness.nonce, witness.startup)
    witness.cgroup = Path('/sys/fs/cgroup') / witness.props['ControlGroup'].lstrip('/')
    for role in ('main', 'leaf'):
        witness.held.append(hold(witness.startup[role]))
    _limited_bind(witness)
    send_packet(parent, {'event': 'arm', 'nonce': witness.nonce, 'startup': witness.startup,
                         'invocation': witness.props['InvocationID']})
    require(packet(parent) == {'event': 'armed', 'nonce': witness.nonce}, 'keeper-active-ack')
    emit({'event': 'ready', 'nonce': witness.nonce, 'descriptor': witness.props, 'startup': witness.startup,
        'startupObservation': {'beforeVerified': True, 'activeVerified': True,
            'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False},
        'keeper': witness.keeper_info, 'observerProcess': identity(os.getpid())})


def receipt_for(info, expected):
    path = Path(info['root'])
    require(path.parent == Path('/tmp') and re.fullmatch('tiye-full-keeper-[A-Za-z0-9_-]+', path.name),
            'keeper-receipt-root-path')
    fd = POLICY['open_directory'](str(path))
    try:
        require(list(directory_stamp(fd)[:2]) == info['rootIdentity'], 'keeper-receipt-root-replaced')
    finally:
        os.close(fd)
    return keeper_document(load_receipt(path), expected)


def wait_cleanup(witness):
    global STARTUP_RESULT, LIMIT_RESULT, RETENTION_RESULT, KEEPER_RESULT
    started = time.monotonic()
    send_packet(witness.keeper_peer, {'event': 'finish', 'nonce': witness.nonce})
    require(packet(witness.keeper_peer) == {'event': 'receipt', 'nonce': witness.nonce}, 'keeper-receipt-not-ready')
    require(witness.keeper_process.wait(timeout=3) == 0, 'keeper-exit-status')
    wait_signaled(witness.held, 1)
    expected = {'nonce': witness.nonce, 'identity': witness.keeper_info['identity'], 'startup': witness.startup,
                'invocation': witness.props['InvocationID'], 'observerLossDetected': False}
    document = receipt_for(witness.keeper_info, expected)
    require(witness.mount_view.snapshot(witness.startup['fixtureExecutable'])['helperSessions'] == 1,
            'observer-final-held-mount-inventory')
    STARTUP_RESULT = {'beforeActiveAfterVerified': True, 'helpersRetained': True,
                     'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}
    LIMIT_RESULT = {'designatedMountVerified': True, 'leafLimitsVerified': True,
                   'heldMountAfterCleanupVerified': True, 'persistentCopyVerified': True}
    RETENTION_RESULT = document['retention']
    KEEPER_RESULT = READY_KEEPER | {'keeperExitVerified': True, 'copyReceiptVerified': True, 'observerLossDetected': False}
    return started


def finish_observer(witness):
    try:
        _limited_finish(witness)
    finally:
        if getattr(witness, 'keeper_peer', None) is not None:
            witness.keeper_peer.close()


def recover_keeper(root, nonce):
    with contextlib.ExitStack() as cleanup:
        rootfd = open_root(root, nonce)
        cleanup.callback(os.close, rootfd)
        verify_bundle(rootfd, nonce)
        wire = sys.stdin.buffer.readline(4097)
        require(len(wire) <= 4096 and wire.endswith(b'\n'), 'recovery-binding-bound')
        binding = decode(wire.decode('utf-8', errors='strict'))
        require(type(binding) is dict and set(binding) == {'observer', 'keeper', 'startup', 'invocation'}, 'recovery-schema')
        properties = descriptor(nonce, binding['startup'])
        require(properties['InvocationID'] == binding['invocation'], 'recovery-service-invocation')
        identities = (binding['observer'], binding['keeper']['identity'],
                      binding['startup']['main'], binding['startup']['leaf'])
        pids = {expected['pid'] for expected in identities}
        require(len(pids) == 4 and os.getpid() not in pids
                and all(expected['uid'] == 1000 for expected in identities), 'recovery-role-identities-overlap')
        service_group = '0::' + properties['ControlGroup']
        require(all(expected['cgroup'] != service_group and not expected['cgroup'].startswith(service_group + '/')
                    for expected in identities[:2]), 'recovery-witness-inside-worker-group')
        held = []
        for expected in identities:
            fd = hold(expected)
            cleanup.callback(os.close, fd)
            held.append(fd)
        recover_bound(rootfd, nonce, binding, held)


def recover_bound(rootfd, nonce, binding, held):
    observerfd, keeperfd = held[:2]
    emit_recovery({'event': 'armed', 'nonce': nonce, 'observer': binding['observer'],
                   'keeper': binding['keeper']['identity']})
    recovery_command(b'kill\n')
    signal.pidfd_send_signal(observerfd, signal.SIGKILL)
    wait_signaled([observerfd], 3)
    require(not select.select([keeperfd], [], [], 0)[0], 'keeper-died-with-observer')
    emit_recovery({'event': 'killed', 'nonce': nonce, 'observer': binding['observer'], 'keeperAlive': True})
    recovery_command(b'observe\n')
    wait_signaled([keeperfd], 10)
    wait_signaled(held, 1)
    require(all(not (Path('/proc') / str(binding['startup'][role]['pid'])).exists()
                for role in ('main', 'leaf')), 'recovery-original-worker-proc-still-present')
    expected = {'nonce': nonce, 'identity': binding['keeper']['identity'], 'startup': binding['startup'],
                'invocation': binding['invocation'], 'observerLossDetected': True}
    document = receipt_for(binding['keeper'], expected)
    # Exclusive audit.json creation is the existing completion token; an
    # already audited or partially audited root fails instead of retrying.
    sizes = audit(rootfd, Ledger('observer'))
    report = document['cleanup'] | {'event': 'result', 'nonce': nonce,
        'runtimeBytes': sizes, 'runtimeReservedBytes': RESERVED, 'nativeExecutionAllowed': False,
        'retention': document['retention'],
        'startupObservation': {'beforeActiveAfterVerified': True, 'helpersRetained': True,
            'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False},
        'limitObservation': {'designatedMountVerified': True, 'leafLimitsVerified': True,
            'heldMountAfterCleanupVerified': True, 'persistentCopyVerified': True},
        'keeperObservation': READY_KEEPER | {'keeperExitVerified': True, 'copyReceiptVerified': True,
                                            'observerLossDetected': True}}
    emit_recovery(report)


def recovery_command(expected):
    with selectors.DefaultSelector() as selector:
        selector.register(0, selectors.EVENT_READ)
        require(selector.select(15) and os.read(0, 64) == expected, 'recovery-command')


def emit_recovery(record):
    payload = encode(record) + b'\n'
    require(len(payload) <= 4096 and os.write(1, payload) == len(payload), 'recovery-output-bound')


def emit(record):
    if record['event'] == 'ready':
        record['keeperObservation'] = READY_KEEPER
    elif record['event'] == 'result':
        require(KEEPER_RESULT is not None, 'keeper-result-incomplete')
        record['keeperObservation'] = KEEPER_RESULT
    _limited_emit(record)


def observe(root, nonce):
    global OBSERVER_ROOT
    OBSERVER_ROOT = root
    _charged_observe(root, nonce)
