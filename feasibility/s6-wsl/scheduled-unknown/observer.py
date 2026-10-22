"""A refusal result leaves its observer and keeper owned until explicit fixture disposal."""


def unknown_document(witness):
    path = Path(witness.keeper_info['root'])
    require(path.parent == Path('/tmp') and re.fullmatch('tiye-full-keeper-[A-Za-z0-9_-]+', path.name),
            'unknown-receipt-root-path')
    fd = POLICY['open_directory'](str(path))
    try:
        require(list(directory_stamp(fd)[:2]) == witness.keeper_info['rootIdentity'], 'unknown-receipt-root-replaced')
    finally:
        os.close(fd)
    document = load_receipt(path)
    expected = {'scope': 'fixed-supervised-keeper-unknown', 'nonce': witness.nonce,
        'keeperIdentity': witness.keeper_info['identity'], 'observerLossDetected': False,
        'startup': witness.startup, 'invocation': witness.props['InvocationID'], 'outcome': 'unknown',
        'copyVerified': False, 'automaticDeletion': False, 'mountIdentity': witness.startup['runtimeIdentity']}
    # Canonical JSON also distinguishes bool from integer at this process boundary.
    require(encode(document) == encode(expected), 'unknown-receipt-binding')
    return document


def require_live_keeper(witness):
    require(not select.select([witness.held[0]], [], [], 0)[0]
            and identity(witness.keeper_info['identity']['pid']) == witness.keeper_info['identity'],
            'unknown-keeper-not-live')


def establish_unknown_custody(witness):
    send_packet(witness.keeper_peer, {'event': 'finish', 'nonce': witness.nonce})
    require(packet(witness.keeper_peer) == {'event': 'unknown', 'nonce': witness.nonce}, 'unknown-ack-not-received')
    document = unknown_document(witness)
    unknown_admin(witness.nonce, {'event': 'probe', 'nonce': witness.nonce})
    require_live_keeper(witness)
    witness.keeper_peer.close()
    witness.mount_view.close()
    witness.mount_view, witness.startup_runtime = None, None
    unknown_admin(witness.nonce, {'event': 'probe', 'nonce': witness.nonce})
    require_live_keeper(witness)
    require(unknown_document(witness) == document, 'unknown-custody-receipt-changed')
    return document


def refusal_observation(witness, document):
    wait_signaled(witness.held[1:], 1)
    require(all(not (Path('/proc') / str(witness.startup[role]['pid'])).exists()
                for role in ('main', 'leaf')) and cgroup_empty(witness.cgroup), 'unknown-worker-exit-unverified')
    reason = terminal_evidence(witness)
    return {'event': 'result', 'nonce': witness.nonce, 'stage': 'held', 'outcome': 'unknown',
        'copyVerified': False, 'automaticDeletion': False, 'keeperIdentity': witness.keeper_info['identity'],
        'mountIdentity': witness.startup['runtimeIdentity'], 'invocation': witness.props['InvocationID'],
        'receiptSha256': hashlib.sha256(encode(document)).hexdigest(), 'keeperAlive': True,
        'workerPidfdsSignaled': True, 'originalProcEntriesAbsent': True, 'cgroupEmpty': True,
        'leaseReason': reason, 'fixtureDisposalVerified': False, 'nativeExecutionAllowed': False}


def wait_explicit_fixture_disposal():
    # EOF, malformed input and request timing cannot authorize disposal or observer exit.
    pending = bytearray()
    discarding = False
    with selectors.DefaultSelector() as selector:
        selector.register(0, selectors.EVENT_READ)
        while True:
            if not selector.get_map():
                select.select([], [], [], 60)
                continue
            if selector.select(1):
                command = os.read(0, 64)
                if not command:
                    selector.unregister(0)
                    pending.clear()
                    continue
                pending.extend(command)
                while b'\n' in pending:
                    line, _, rest = pending.partition(b'\n')
                    pending = bytearray(rest)
                    if not discarding and line == b'dispose-fixed-fixture':
                        return
                    discarding = False
                if len(pending) > 64:
                    pending.clear()
                    discarding = True


def dispose_observed_fixture(witness, document):
    require_live_keeper(witness)
    unknown_admin(witness.nonce, {'event': 'release-fixed-fixture', 'nonce': witness.nonce})
    require(witness.keeper_process.wait(timeout=3) == 0, 'unknown-keeper-disposal-exit')
    wait_signaled(witness.held, 1)
    require(unknown_document(witness) == document and cgroup_empty(witness.cgroup),
            'unknown-receipt-or-worker-state-changed')
    audit(witness.rootfd, Ledger('observer'))


def scheduled_unknown_observe(root, nonce):
    global FIXED_REFUSAL, OBSERVER_ROOT
    FIXED_REFUSAL, OBSERVER_ROOT = True, root
    witness = SimpleNamespace(rootfd=open_root(root, nonce), nonce=nonce, held=[], sentinel=None, props=None)
    # No generic finalizer may turn a failed handshake into disposal. If this
    # observer fails, the independent keeper still owns its mount; recovery of
    # that case is outside this qualification.
    prepare_observer(witness)
    observe_command()
    document = establish_unknown_custody(witness)
    report = refusal_observation(witness, document)
    emit_recovery(report)
    wait_explicit_fixture_disposal()
    dispose_observed_fixture(witness, document)
    finish_observer(witness)
    emit_recovery(report | {'stage': 'fixture-disposed', 'keeperAlive': False, 'fixtureDisposalVerified': True})
