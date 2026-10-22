"""Separate fixed-fixture broker owns the mount before producer acknowledgement."""
import signal
import uuid

ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'}
MODES = ('observer-exit', 'observer-kill', 'unexpected-node')
PRIVATE_RUNS = []


def send_packet(peer, packet, fd=None):
    payload = encode(packet)
    require(len(payload) <= 4096, 'broker-packet-bound')
    ancillary = [] if fd is None else [(socket.SOL_SOCKET, socket.SCM_RIGHTS, array.array('i', [fd]))]
    require(peer.sendmsg([payload], ancillary) == len(payload), 'broker-packet-short-write')


def packet(peer):
    payload, ancillary, flags, _ = peer.recvmsg(4096, 0)
    require(payload and not ancillary and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC),
            'broker-packet-eof-or-truncated')
    decoded = decode(payload.decode('utf-8', errors='strict'))
    require(type(decoded) is dict, 'broker-packet-object')
    return decoded


def actor(root, nonce, request, channel):
    role, extra = request[0], request[1:]
    return subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B', str(root / 'linux_runtime.py'),
        role, str(root), nonce, str(channel.fileno()), *extra], env=ENV, pass_fds=(channel.fileno(),),
        stdin=subprocess.DEVNULL, start_new_session=True)


def relay_observer(root, nonce):
    control = socket.socket(fileno=int(sys.argv[4]))
    control.settimeout(8)
    with control, socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as listener:
        listener.bind('\0tiye-limited-' + nonce)
        listener.listen(1)
        listener.settimeout(8)
        send_packet(control, {'event': 'listening', 'nonce': nonce})
        with listener.accept()[0] as producer:
            producer.settimeout(8)
            credentials = struct.unpack('3i', producer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            payload, ancillary, flags, _ = producer.recvmsg(1024, socket.CMSG_SPACE(32), socket.MSG_CMSG_CLOEXEC)
            view, producer_pid = validate_transfer((payload, ancillary, flags, credentials), nonce)
            try:
                send_packet(control, {'nonce': nonce, 'identity': list(view.identity)}, view.fd)
                require(packet(control) == {'event': 'broker-owns-mount', 'nonce': nonce}, 'broker-ack')
                require(producer.send(b'OK') == 2, 'producer-ack-short-write')
                send_packet(control, {'event': 'producer-acknowledged', 'nonce': nonce, 'pid': producer_pid})
                require(packet(control) == {'event': 'exit', 'nonce': nonce}, 'observer-exit-command')
            finally:
                view.close()


def receive_view(peer, nonce, event):
    payload, ancillary, flags, _ = peer.recvmsg(4096, socket.CMSG_SPACE(32), socket.MSG_CMSG_CLOEXEC)
    descriptors, controls_valid = [], True
    try:
        for level, kind, control in ancillary:
            if level != socket.SOL_SOCKET or kind != socket.SCM_RIGHTS:
                controls_valid = False
                continue
            received = array.array('i')
            controls_valid &= len(control) % received.itemsize == 0
            received.frombytes(control[:len(control) - len(control) % received.itemsize])
            descriptors.extend(received)
        require(controls_valid and len(descriptors) == 1
                and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC), 'broker-transfer-control')
        fd = descriptors[0]
        require(not os.get_inheritable(fd), 'broker-transfer-cloexec')
        view = MountView(fd, os.path.realpath('/usr/bin/python3'))
        expected = {'nonce': nonce, 'identity': list(view.identity)}
        if event is not None:
            expected['event'] = event
        require(decode(payload.decode('utf-8', errors='strict')) == expected, 'broker-transfer-binding')
        mount_capacity(fd)
        descriptors.clear()
        return view
    finally:
        for fd in descriptors:
            os.close(fd)


def wait_signaled(descriptors, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if all(select.select([fd], [], [], 0)[0] for fd in descriptors):
            return
        time.sleep(0.01)
    raise TimeoutError('held-process-exit-unverified')


def wait_service_empty(group, descriptors):
    wait_signaled(descriptors, 8)
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        if cgroup_empty(group):
            return
        time.sleep(0.01)
    raise TimeoutError('broker-cgroup-not-empty')


def receipt(rootfd, document):
    payload = encode(document)
    require(len(payload) <= 4096, 'broker-receipt-bound')
    fd = os.open('broker-receipt.json', os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW,
                 0o600, dir_fd=rootfd)
    try:
        require(os.write(fd, payload) == len(payload), 'broker-receipt-short-write')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        require(os.read(fd, len(payload) + 1) == payload, 'broker-receipt-readback')
        os.fsync(rootfd)
    finally:
        os.close(fd)


def hold_unknown(view, nonce, outer_pid):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as admin:
        admin.bind('\0tiye-broker-release-' + nonce)
        admin.listen(1)
        # No EOF or timer releases the mount. Only this fixed-test parent can
        # authorize disposal of its known synthetic bytes through this endpoint.
        while True:
            try:
                with admin.accept()[0] as peer:
                    peer.settimeout(3)
                    credentials = struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                    require(credentials == (outer_pid, 1000, 1000), 'unknown-release-peer')
                    request = packet(peer)
                    require(request in ({'nonce': nonce, 'event': 'probe'},
                                        {'nonce': nonce, 'event': 'release-fixed-fixture'}), 'unknown-release-request')
                    require(directory_stamp(view.fd)[:2] == view.identity, 'unknown-held-mount-replaced')
                    require('unexpected-fixed-fixture.bin' in os.listdir(view.fd), 'unknown-node-lost')
                    send_packet(peer, {'event': 'still-held', 'nonce': nonce, 'copyVerified': False})
                    if request['event'] == 'release-fixed-fixture':
                        return
            except (ValueError, ConnectionResetError, BrokenPipeError, TimeoutError):
                # Refuse this request while retaining ownership of uncertain state.
                continue


def broker(root, nonce):
    control = socket.socket(fileno=int(sys.argv[4]))
    control.settimeout(10)
    mode = sys.argv[5]
    require(mode in MODES, 'broker-mode')
    outer_pid = os.getppid()
    rootfd = open_root(root, nonce)
    verify_bundle(rootfd, nonce)
    view, observer, bridge_child = None, None, None
    owned = []
    parent, child = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    parent.settimeout(10)
    try:
        observer = actor(root, nonce, ('relay_observer',), child)
        child.close()
        observer_identity = identity(observer.pid)
        observer_fd = hold(observer_identity)
        owned.append(observer_fd)
        require(packet(parent) == {'event': 'listening', 'nonce': nonce}, 'observer-listener-binding')
        bridge_child = subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B',
            str(root / 'linux_runtime.py'), 'bridge', str(root), nonce], env=ENV,
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, bufsize=0)
        # Only the known child inherits this private socketpair endpoint; its
        # creation-time SO_PEERCRED is not treated as child authentication.
        view = receive_view(parent, nonce, None)
        require(view.snapshot(view.executable) == {'nodes': 4, 'helperSessions': 0}, 'broker-before-snapshot')
        send_packet(parent, {'event': 'broker-owns-mount', 'nonce': nonce})
        acknowledgement = packet(parent)
        require(acknowledgement['event'] == 'producer-acknowledged'
                and acknowledgement['nonce'] == nonce, 'producer-ack-binding')
        startup = wait_startup(rootfd)
        props = descriptor(nonce, startup)
        require(acknowledgement['pid'] == startup['main']['pid']
                and startup['runtimeIdentity'] == list(view.identity)
                and startup['leafLimitsVerified'] is True, 'broker-startup-binding')
        for role in ('main', 'leaf'):
            owned.append(hold(startup[role]))
        group = Path('/sys/fs/cgroup') / props['ControlGroup'].lstrip('/')
        service_group = '0::' + props['ControlGroup']
        outside = (identity(os.getpid())['cgroup'], observer_identity['cgroup'])
        require(all(member != service_group and not member.startswith(service_group + '/') for member in outside)
                and identity(os.getpid())['sid'] != observer_identity['sid'], 'broker-failure-domain')
        require(view.snapshot(startup['fixtureExecutable'])['helperSessions'] == 1, 'broker-active-snapshot')
        send_packet(control, {'event': 'ready', 'nonce': nonce, 'observer': observer_identity,
            'main': startup['main'], 'leaf': startup['leaf'], 'group': str(group),
            'hostMountpoint': startup['runtimeRoot'], 'hostRootIdentity': startup['hostRootIdentity']})
        require(packet(control) == {'event': 'fault-armed', 'nonce': nonce}, 'fault-before-held-identities')
        if mode == 'observer-exit':
            send_packet(parent, {'event': 'exit', 'nonce': nonce})
        require(packet(control) == {'event': 'observer-ended', 'nonce': nonce}, 'observer-ended-command')
        wait_signaled([observer_fd], 3)
        expected_exit = 0 if mode == 'observer-exit' else -signal.SIGKILL
        require(observer.wait(timeout=2) == expected_exit, 'observer-not-ended-as-injected')
        require(query(nonce).get('InvocationID') == props['InvocationID'], 'service-invocation-changed')
        heartbeat = encode({'nonce': nonce, 'sequence': 1}) + b'\n'
        require(bridge_child.stdin.write(heartbeat) == len(heartbeat), 'broker-heartbeat-short-write')
        bridge_child.stdin.close()
        wait_service_empty(group, owned[1:])
        bridge_child.wait(timeout=3)
        send_packet(control, {'event': 'cleaned', 'nonce': nonce, 'identity': list(view.identity)}, view.fd)
        require(packet(control) == {'event': 'copy', 'nonce': nonce}, 'copy-not-authorized-after-cleanup')
        try:
            retained = view.retain()
        except ValueError as error:
            require(mode == 'unexpected-node' and str(error) == 'unexpected-node-no-content-read',
                    'unexpected-copy-failure')
            receipt(rootfd, {'nonce': nonce, 'outcome': 'unknown', 'copyVerified': False,
                             'mountIdentity': list(view.identity), 'automaticDeletion': False})
            send_packet(control, {'event': 'unknown', 'nonce': nonce})
            require(control.recv(1) == b'', 'unknown-test-control-not-closed')
            hold_unknown(view, nonce, outer_pid)
        else:
            require(mode != 'unexpected-node', 'unknown-copy-incorrectly-accepted')
            receipt(rootfd, {'nonce': nonce, 'outcome': 'retained', 'retention': retained,
                             'automaticDeletion': False})
            send_packet(control, {'event': 'retained', 'nonce': nonce, 'retention': retained})
    finally:
        control.close()
        parent.close()
        child.close()
        if view is not None:
            view.close()
        for fd in owned:
            os.close(fd)
        os.close(rootfd)
        if observer is not None and observer.poll() is None:
            observer.kill()
            observer.wait(timeout=2)
        if bridge_child is not None and bridge_child.stdin and not bridge_child.stdin.closed:
            bridge_child.stdin.close()


def seed(source):
    nonce = uuid.uuid4().hex
    root = Path(tempfile.mkdtemp(prefix='tiye-charged-' + nonce + '-', dir='/tmp'))
    fd = open_root(root, nonce)
    ledger = Ledger('bootstrap')
    try:
        write_file(fd, 'linux_runtime.py', source, ledger)
        write_file(fd, 'config.json', encode({'nonce': nonce, 'sourceSha256': hashlib.sha256(source).hexdigest(),
                                            'caps': CAPS}), ledger)
        write_file(fd, 'retention.json', encode({'uncertain': True, 'automaticDeletion': False}), ledger)
    finally:
        os.close(fd)
    return root, nonce


def admin_request(nonce, event):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(3)
        deadline = time.monotonic() + 3
        while True:
            try:
                peer.connect('\0tiye-broker-release-' + nonce)
                break
            except ConnectionRefusedError:
                require(time.monotonic() < deadline, 'unknown-admin-not-ready')
                time.sleep(0.01)
        supplied_nonce = 'b' * 32 if event == 'invalid-release' else nonce
        supplied_event = 'release-fixed-fixture' if event == 'invalid-release' else event
        send_packet(peer, {'event': supplied_event, 'nonce': supplied_nonce})
        if event == 'invalid-release':
            require(peer.recv(1) == b'', 'invalid-release-not-refused')
            return
        require(packet(peer) == {'event': 'still-held', 'nonce': nonce, 'copyVerified': False}, 'held-probe-reply')


def load_receipt(root):
    rootfd = POLICY['open_directory'](str(root))
    try:
        fd = os.open('broker-receipt.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=rootfd)
        try:
            metadata = os.fstat(fd)
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 1000 and metadata.st_nlink == 1
                    and stat.S_IMODE(metadata.st_mode) == 0o600 and metadata.st_size <= 4096, 'receipt-file-metadata')
            payload = os.read(fd, 4097)
            require(len(payload) == metadata.st_size and file_stamp(os.fstat(fd)) == file_stamp(metadata),
                    'receipt-file-changed')
            return decode(payload.decode('utf-8', errors='strict'))
        finally:
            os.close(fd)
    finally:
        os.close(rootfd)


def run_case(source, mode):
    root, nonce = seed(source)
    parent, child = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    parent.settimeout(12)
    process = actor(root, nonce, ('broker', mode), child)
    child.close()
    brokerfd = hold(identity(process.pid))
    held = []
    try:
        ready = packet(parent)
        require(ready['event'] == 'ready' and ready['nonce'] == nonce, 'broker-ready')
        for role in ('observer', 'main', 'leaf'):
            held.append(hold(ready[role]))
        send_packet(parent, {'event': 'fault-armed', 'nonce': nonce})
        if mode != 'observer-exit':
            signal.pidfd_send_signal(held[0], signal.SIGKILL)
            wait_signaled([held[0]], 3)
        send_packet(parent, {'event': 'observer-ended', 'nonce': nonce})
        view = receive_view(parent, nonce, 'cleaned')
        borrowed = view.fd
        try:
            wait_signaled(held, 2)
            require(cgroup_empty(Path(ready['group'])), 'outer-cgroup-not-empty')
            hostfd = POLICY['open_directory'](ready['hostMountpoint'])
            try:
                require(not os.listdir(hostfd) and list(directory_stamp(hostfd)[:2]) == ready['hostRootIdentity']
                        and directory_stamp(hostfd)[:2] != view.identity, 'outer-host-mount-visible')
            finally:
                os.close(hostfd)
            # A fresh challenge written only after observer/service exit rules
            # out a stale or prematurely completed copy.
            challenge = uuid.uuid4().hex.encode()
            marker = os.open('retention.json', os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW, dir_fd=borrowed)
            try:
                require(os.write(marker, challenge) == len(challenge), 'challenge-short-write')
                os.fsync(marker)
            finally:
                os.close(marker)
            if mode == 'unexpected-node':
                unexpected = os.open('unexpected-fixed-fixture.bin', os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                                     0o600, dir_fd=borrowed)
                os.close(unexpected)
            expected = None if mode == 'unexpected-node' else view.inventory()
        finally:
            view.close()
        send_packet(parent, {'event': 'copy', 'nonce': nonce})
        response = packet(parent)
        if mode == 'unexpected-node':
            require(response == {'event': 'unknown', 'nonce': nonce}, 'unknown-not-reported')
            parent.close()
            time.sleep(0.1)
            require(not select.select([brokerfd], [], [], 0)[0], 'broker-exited-on-control-eof')
            admin_request(nonce, 'probe')
            unknown = load_receipt(root)
            require(unknown['nonce'] == nonce and unknown['outcome'] == 'unknown'
                    and unknown['copyVerified'] is False, 'unknown-receipt-before-release')
            admin_request(nonce, 'invalid-release')
            admin_request(nonce, 'probe')
            admin_request(nonce, 'release-fixed-fixture')
        else:
            require(response['event'] == 'retained' and response['nonce'] == nonce, 'retention-reply')
        require(process.wait(timeout=5) == 0, 'broker-exit-failed')
        wait_signaled([brokerfd], 1)
        document = load_receipt(root)
        require(document['nonce'] == nonce and document['automaticDeletion'] is False, 'receipt-binding')
        if mode == 'unexpected-node':
            require(document['outcome'] == 'unknown' and document['copyVerified'] is False, 'unknown-receipt')
        else:
            retained = document['retention']
            require(retained == response['retention'] and document['outcome'] == 'retained', 'retained-receipt')
            copied = POLICY['open_directory'](retained['path'])
            try:
                actual = MountView(copied, os.path.realpath('/usr/bin/python3')).inventory()
                require(actual == expected and hashlib.sha256(encode(actual)).hexdigest() == retained['manifestSha256']
                        and actual['retention.json']['sha256'] == hashlib.sha256(challenge).hexdigest(),
                        'outer-retained-copy-stale-or-incomplete')
            finally:
                os.close(copied)
        PRIVATE_RUNS.append({'root': str(root), 'retention': document.get('retention', {}).get('path'), 'mode': mode})
        return {'mode': mode, 'observerEndedVerified': True, 'serviceCleanupVerified': True,
                'copyVerified': mode != 'unexpected-node', 'retainedAfterBrokerExit': mode != 'unexpected-node',
                'unknownHeldAcrossControlEof': mode == 'unexpected-node',
                'invalidReleaseRefusedWithoutDisposal': mode == 'unexpected-node', 'nativeExecutionAllowed': False}
    finally:
        parent.close()
        child.close()
        for fd in held:
            os.close(fd)
        if process.poll() is None:
            # Only this known synthetic harness may dispose its fixed test bytes.
            signal.pidfd_send_signal(brokerfd, signal.SIGKILL)
            process.wait(timeout=3)
        os.close(brokerfd)


def run_cases(bundle):
    source = base64.b64decode(bundle['sourceBase64'], validate=True)
    require(hashlib.sha256(source).hexdigest() == bundle['sha256'], 'broker-source-digest')
    cases = [run_case(source, mode) for mode in MODES]
    print(json.dumps({'scope': 'fixed-synthetic-observer-loss-broker', 'cases': cases,
                      'privateRuns': PRIVATE_RUNS, 'candidateExecuted': False, 'nativeExecutionAllowed': False}))
