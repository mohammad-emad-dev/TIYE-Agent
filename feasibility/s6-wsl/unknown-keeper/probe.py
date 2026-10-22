"""Actual Linux service/observer/keeper tests; no Windows unknown-state credit."""
import uuid


def unknown_admin(nonce, request):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        deadline = time.monotonic() + 3
        while True:
            try:
                peer.connect('\0tiye-keeper-release-' + nonce)
                break
            except ConnectionRefusedError:
                require(time.monotonic() < deadline, 'unknown-endpoint-unavailable')
                time.sleep(0.01)
        if request == 'timeout':
            require(peer.recv(1) == b'', 'unknown-request-timeout-not-refused')
            return
        if request == 'malformed':
            peer.send(b'\xff')
        else:
            send_packet(peer, request)
        if request == 'malformed' or request.get('nonce') != nonce:
            require(peer.recv(1) == b'', 'unknown-invalid-request-not-refused')
        else:
            require(packet(peer) == {'event': 'still-held', 'nonce': nonce, 'copyVerified': False},
                    'unknown-probe-binding')


def unknown_observe(root, nonce):
    global FIXED_REFUSAL, OBSERVER_ROOT
    FIXED_REFUSAL, OBSERVER_ROOT = True, root
    witness = SimpleNamespace(rootfd=open_root(root, nonce), nonce=nonce, held=[], sentinel=None, props=None)
    try:
        prepare_observer(witness)
        observe_command()
        send_packet(witness.keeper_peer, {'event': 'finish', 'nonce': nonce})
        require(packet(witness.keeper_peer) == {'event': 'unknown', 'nonce': nonce}, 'unknown-not-reported')
        document = load_receipt(Path(witness.keeper_info['root']))
        require(set(document) == {'scope', 'nonce', 'keeperIdentity', 'observerLossDetected', 'startup',
                'invocation', 'outcome', 'copyVerified', 'automaticDeletion', 'mountIdentity'}
                and document['scope'] == 'fixed-supervised-keeper-unknown' and document['nonce'] == nonce
                and document['keeperIdentity'] == witness.keeper_info['identity']
                and document['startup'] == witness.startup and document['invocation'] == witness.props['InvocationID']
                and document['outcome'] == 'unknown' and document['copyVerified'] is False
                and document['automaticDeletion'] is False and document['observerLossDetected'] is False
                and document['mountIdentity'] == list(witness.mount_view.identity), 'unknown-receipt-binding')
        witness.keeper_peer.close()
        # Close both observer references before reconnecting; only keeper owns the mount.
        witness.mount_view.close()
        witness.mount_view, witness.startup_runtime = None, None
        wrong_peer = '''import socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET)
s.settimeout(2)
s.connect('\\0tiye-keeper-release-'+sys.argv[1])
if s.recv(1)!=b'': raise ValueError('replacement-peer-accepted')
s.close()
'''
        # This process has the nonce and same UID but was never the pinned observer.
        # Wait for endpoint readiness using the authorized probe before spawning it.
        unknown_admin(nonce, {'event': 'probe', 'nonce': nonce})
        rejected = subprocess.run(['/usr/bin/python3', '-I', '-S', '-B', '-c', wrong_peer, nonce],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env=BUS_ENV, timeout=3)
        require(rejected.returncode == 0, 'unknown-replacement-peer-not-refused')
        requests = [{'event': 'probe', 'nonce': nonce},
                    {'event': 'release-fixed-fixture', 'nonce': 'b' * 32}, 'malformed', 'timeout',
                    {'event': 'probe', 'nonce': nonce}]
        for request in requests:
            unknown_admin(nonce, request)
            require(not select.select([witness.held[0]], [], [], 0)[0], 'unknown-keeper-ended-before-release')
            require(load_receipt(Path(witness.keeper_info['root'])) == document, 'unknown-receipt-mutated')
        unknown_admin(nonce, {'event': 'release-fixed-fixture', 'nonce': nonce})
        require(witness.keeper_process.wait(timeout=3) == 0, 'unknown-fixed-disposal-exit')
        wait_signaled(witness.held, 1)
        require(cgroup_empty(witness.cgroup), 'unknown-service-not-empty')
        require(load_receipt(Path(witness.keeper_info['root'])) == document, 'unknown-promoted-after-disposal')
        audit(witness.rootfd, Ledger('observer'))
    finally:
        finish_observer(witness)
    emit_recovery({'event': 'result', 'nonce': nonce, 'outcome': 'unknown', 'copyVerified': False})


def observer_line(observer):
    wire = observer.stdout.readline(8193)
    require(len(wire) <= 8192 and wire.endswith(b'\n'), 'probe-observer-line-bound')
    return decode(wire.decode('utf-8', errors='strict'))


def supervised_case(source, mode):
    root, nonce = seed(source)
    role = 'observe' if mode == 'retained' else 'unknown_observe'
    argv = ['/usr/bin/python3', '-I', '-S', '-B', str(root / 'linux_runtime.py')]
    observer = subprocess.Popen([*argv, role, str(root), nonce], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, env=BUS_ENV, start_new_session=True, bufsize=0)
    bridge_child = None
    try:
        # Socket listener is installed before bridge start; connecting bridge retries is not assumed.
        deadline = time.monotonic() + 3
        endpoint = '@tiye-limited-' + nonce
        while endpoint not in Path('/proc/net/unix').read_text():
            require(observer.poll() is None and time.monotonic() < deadline, 'probe-listener-not-ready')
            time.sleep(0.01)
        bridge_child = subprocess.Popen([*argv, 'bridge', str(root), nonce], stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=BUS_ENV, bufsize=0)
        ready = observer_line(observer)
        require(ready['event'] == 'ready' and ready['nonce'] == nonce
                and ready['keeperObservation'] == READY_KEEPER, 'probe-supervised-readiness')
        heartbeat = encode({'nonce': nonce, 'sequence': 1}) + b'\n'
        require(bridge_child.stdin.write(heartbeat) == len(heartbeat), 'probe-heartbeat-write')
        bridge_child.stdin.close()
        require(observer.stdin.write(b'observe\n') == 8, 'probe-observe-write')
        observer.stdin.close()
        report = observer_line(observer)
        require(report['event'] == 'result' and report['nonce'] == nonce, 'probe-result-binding')
        require(observer.wait(timeout=4) == 0 and bridge_child.wait(timeout=4) == 71,
                'probe-process-exit')
        if mode == 'retained':
            require(report['keeperObservation']['copyReceiptVerified'] is True, 'probe-retention-incomplete')
            reopen_copy(report['retention'])
        else:
            require(report == {'event': 'result', 'nonce': nonce, 'outcome': 'unknown', 'copyVerified': False},
                    'probe-unknown-promoted')
        return {'mode': mode, 'serviceCleanupVerified': True, 'copyVerified': mode == 'retained',
            'unknownHeldAcrossControlEof': mode == 'refused', 'invalidRequestsRefused': mode == 'refused',
            'explicitFixtureDisposal': mode == 'refused', 'outcome': 'retained' if mode == 'retained' else 'unknown'}, str(root)
    finally:
        if bridge_child is not None and not bridge_child.stdin.closed:
            bridge_child.stdin.close()
        if not observer.stdin.closed:
            observer.stdin.close()
        # Failures retain any keeper mount. They never earn disposal or cleanup credit.
        if observer.poll() is None:
            observer.kill()
            observer.wait(timeout=3)
        observer.stdout.close()


def run_cases(bundle):
    source = base64.b64decode(bundle['sourceBase64'], validate=True)
    require(hashlib.sha256(source).hexdigest() == bundle['sha256'], 'probe-source-digest')
    cases, private_runs = [], []
    for mode in ('retained', 'refused'):
        selected, root = supervised_case(source, mode)
        cases.append(selected)
        private_runs.append({'root': root, 'mode': mode})
    print(json.dumps({'scope': 'fixed-supervised-unknown-keeper', 'cases': cases, 'privateRuns': private_runs,
                      'candidateExecuted': False, 'nativeExecutionAllowed': False}))
