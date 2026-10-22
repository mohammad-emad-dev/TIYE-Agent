"""Fixed interruption probes and explicit synthetic teardown; not a release API."""


def inspect_enrollment(nonce):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(3)
        peer.connect('\0tiye-keeper-release-' + nonce)
        send_packet(peer, {'event': 'inspect-recovery', 'nonce': nonce})
        return packet(peer)


def discard_enrollment_ack(nonce, successor):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(3)
        peer.connect('\0tiye-keeper-release-' + nonce)
        send_packet(peer, {'event': 'enroll-fixed-recovery', 'nonce': nonce, 'identity': successor})
        peer.shutdown(socket.SHUT_RDWR)


def refuse_foreign_inspection(nonce):
    script = '''import json,socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET)
s.settimeout(2)
s.connect('\\0tiye-keeper-release-'+sys.argv[1])
s.send(json.dumps({'event':'inspect-recovery','nonce':sys.argv[1]}).encode())
if s.recv(1)!=b'': raise ValueError('foreign-inspection-accepted')
s.close()
'''
    checked = subprocess.run(['/usr/bin/python3', '-I', '-S', '-B', '-c', script, nonce], env=BUS_ENV,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    require(checked.returncode == 0, 'interruption-foreign-inspection-not-refused')


def verify_partial_fixture_record(witness):
    rootfd = POLICY['open_directory'](witness.keeper_info['root'])
    try:
        require(list(directory_stamp(rootfd)[:2]) == witness.keeper_info['rootIdentity'], 'partial-record-root-replaced')
        fd = os.open('recovery-owner.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=rootfd)
        try:
            metadata = os.fstat(fd)
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 1000 and metadata.st_nlink == 1
                    and stat.S_IMODE(metadata.st_mode) == 0o600 and metadata.st_size == 1,
                    'partial-record-fixture-metadata')
            require(os.read(fd, 2) == b'{' and file_stamp(os.fstat(fd)) == file_stamp(metadata),
                    'partial-record-fixture-changed')
        finally:
            os.close(fd)
    finally:
        os.close(rootfd)


def exercise_interruption(witness, fault):
    standby = subprocess.Popen(['/usr/bin/python3', '-I', '-S', '-B', '-c', 'import time;time.sleep(95)'],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True, env=BUS_ENV)
    successor = identity(standby.pid)
    standbyfd = hold(successor)
    request = {'event': 'enroll-fixed-recovery', 'nonce': witness.nonce, 'identity': successor}
    if fault == 'unobserved-ack':
        discard_enrollment_ack(witness.nonce, successor)
    elif fault == 'partial-record':
        require_refused_request(witness.nonce, request | {'event': 'enroll-fixed-partial-record'})
    else:
        require(fault == 'standby-loss', 'interruption-fixed-mode')
        enrollment_exchange(witness.nonce, successor)
        signal.pidfd_send_signal(standbyfd, signal.SIGKILL)
        wait_signaled([standbyfd], 3)
        require(standby.wait(timeout=2) == -signal.SIGKILL, 'interruption-standby-not-killed')
    status = inspect_enrollment(witness.nonce)
    if fault == 'partial-record':
        verify_partial_fixture_record(witness)
    expected = ('pending', 'live', False) if fault == 'partial-record' else (
        'committed', 'ended' if fault == 'standby-loss' else 'live', True)
    require((status['enrollmentState'], status['standbyState'], status['ownerReceiptVerified']) == expected,
            'interruption-status-mismatch')
    require_refused_request(witness.nonce, request)
    require_refused_request(witness.nonce, {'event': 'release-fixed-fixture', 'nonce': witness.nonce})
    require_refused_request(witness.nonce, {'event': 'inspect-recovery', 'nonce': witness.nonce, 'grantRelease': True})
    refuse_foreign_inspection(witness.nonce)
    require(inspect_enrollment(witness.nonce) == status, 'interruption-inspection-mutated-authority')
    require_live_keeper(witness)
    return standby, standbyfd, status


def fixed_keeper_sentinel(witness):
    keeper_pid = witness.keeper_info['identity']['pid']
    children = (Path('/proc') / str(keeper_pid) / 'task' / str(keeper_pid) / 'children').read_text().split()
    require(len(children) == 1, 'interruption-fixed-sentinel-count')
    sentinel = identity(int(children[0]))
    require(sentinel['ppid'] == keeper_pid and sentinel['uid'] == 1000, 'interruption-fixed-sentinel-binding')
    command = (Path('/proc') / children[0] / 'cmdline').read_bytes().split(b'\0')
    require(command == [b'/usr/bin/python3', b'-I', b'-S', b'-B', b'-c', b'import time;time.sleep(95)', b''],
            'interruption-fixed-sentinel-command')
    return hold(sentinel)


def dispose_interruption_fixture(witness, standby, standbyfd):
    # Explicit test-only teardown targets only the original already held keeper.
    # It does not restore original release authority or create a keeper API bypass.
    require_live_keeper(witness)
    before = unknown_document(witness)
    sentinelfd = fixed_keeper_sentinel(witness)
    try:
        signal.pidfd_send_signal(witness.held[0], signal.SIGKILL)
        signal.pidfd_send_signal(sentinelfd, signal.SIGKILL)
        wait_signaled(witness.held + [sentinelfd], 3)
        require(witness.keeper_process.wait(timeout=2) == -signal.SIGKILL, 'interruption-keeper-not-killed')
    finally:
        os.close(sentinelfd)
    if standby.poll() is None:
        signal.pidfd_send_signal(standbyfd, signal.SIGKILL)
    standby.wait(timeout=2)
    os.close(standbyfd)
    require(unknown_document(witness) == before and cgroup_empty(witness.cgroup), 'interruption-evidence-changed')
    audit(witness.rootfd, Ledger('observer'))


def scheduled_unknown_observe(root, nonce):
    global FIXED_REFUSAL, OBSERVER_ROOT
    FIXED_REFUSAL, OBSERVER_ROOT = True, root
    witness = SimpleNamespace(rootfd=open_root(root, nonce), nonce=nonce, held=[], sentinel=None, props=None)
    prepare_observer(witness)
    observe_command()
    document = establish_unknown_custody(witness)
    emit_recovery(refusal_observation(witness, document))
    wire = sys.stdin.buffer.readline(4097)
    require(wire.endswith(b'\n') and len(wire) <= 4096, 'interruption-request-bound')
    request = decode(wire.decode('utf-8', errors='strict'))
    require(type(request) is dict and set(request) == {'event', 'nonce', 'fault'}
            and request['event'] == 'qualify-interruption' and request['nonce'] == nonce
            and request['fault'] in ('unobserved-ack', 'partial-record', 'standby-loss'), 'interruption-request')
    standby, standbyfd, status = exercise_interruption(witness, request['fault'])
    require(unknown_document(witness) == document, 'interruption-unknown-receipt-mutated')
    report = {'event': 'result', 'nonce': nonce, 'stage': 'interruption-verified',
        'fault': request['fault'], 'status': status, 'originalReleaseRefused': True, 'reEnrollmentRefused': True}
    emit_recovery(report)
    recovery_command(b'dispose-interruption-fixture\n')
    dispose_interruption_fixture(witness, standby, standbyfd)
    if request['fault'] == 'partial-record':
        verify_partial_fixture_record(witness)
    finish_observer(witness)
    emit_recovery(report | {'stage': 'fixture-disposed', 'fixtureDisposalVerified': True})
