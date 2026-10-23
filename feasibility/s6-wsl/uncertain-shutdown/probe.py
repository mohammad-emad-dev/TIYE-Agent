"""Synthetic evidence loss is injected only after the original worker has ended."""
EVIDENCE_FAULTS={'missing','invalid','receipt-blocked'}


def evidence_fault_command():
    with selectors.DefaultSelector() as selector:
        selector.register(0,selectors.EVENT_READ)
        require(selector.select(15),'evidence-fault-command-timeout')
        wire=os.read(0,64)
    choices={('observe-'+fault+'\n').encode():fault for fault in EVIDENCE_FAULTS}
    require(wire in choices,'evidence-fault-command')
    return choices[wire]


def receipt_directory(witness):
    path=Path(witness.keeper_info['root'])
    require(path.parent==Path('/tmp') and re.fullmatch('tiye-full-keeper-[A-Za-z0-9_-]+',path.name),
        'evidence-receipt-root-path')
    fd=POLICY['open_directory'](str(path))
    try:
        require(list(directory_stamp(fd)[:2])==witness.keeper_info['rootIdentity'],'evidence-receipt-root-replaced')
        return fd
    except (OSError,ValueError):
        os.close(fd)
        raise


def inject_evidence_fault(witness,fault):
    wait_signaled(witness.held[1:],3)
    require(cgroup_empty(witness.cgroup),'evidence-fault-before-worker-exit')
    # Validate and stamp real terminal evidence before the controlled loss/corruption.
    shutdown_terminal(witness)
    terminal_evidence(witness)
    fd=os.open('terminal.json',os.O_RDWR|os.O_NOFOLLOW,dir_fd=witness.rootfd)
    try:
        stamp=file_stamp(os.fstat(fd))
        require(file_stamp(os.stat('terminal.json',dir_fd=witness.rootfd,follow_symlinks=False))==stamp,
            'evidence-terminal-replaced-before-fault')
        if fault=='missing':
            os.unlink('terminal.json',dir_fd=witness.rootfd)
        else:
            os.ftruncate(fd,0)
            os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(witness.rootfd)
    if fault=='receipt-blocked':
        receiptfd=receipt_directory(witness)
        try:
            collision=os.open('broker-receipt.json',os.O_CREAT|os.O_EXCL|os.O_RDWR|os.O_NOFOLLOW,0o600,dir_fd=receiptfd)
            try:
                os.fsync(collision)
                witness.collision_stamp=file_stamp(os.fstat(collision))
            finally:
                os.close(collision)
            os.fsync(receiptfd)
        finally:
            os.close(receiptfd)


def evidence_state(witness,fault):
    if fault=='missing':
        require('terminal.json' not in os.listdir(witness.rootfd),'evidence-terminal-not-absent')
    else:
        require(read_file(witness.rootfd,'terminal.json')==b'','evidence-terminal-not-empty')
    try:
        shutdown_terminal(witness)
    except (OSError,ValueError):
        return 'absent' if fault=='missing' else 'invalid'
    raise ValueError('evidence-fault-still-accepted-as-terminal')


def custody_exchange(witness,expected):
    with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        deadline=time.monotonic()+3
        while True:
            try:
                peer.connect('\0tiye-keeper-release-'+witness.nonce)
                break
            except ConnectionRefusedError:
                require(time.monotonic()<deadline,'evidence-custody-unavailable')
                time.sleep(0.01)
        send_packet(peer,{'event':'probe-custody','nonce':witness.nonce})
        require(encode(packet(peer))==encode(expected),'evidence-custody-binding')
    require_live_keeper(witness)


def evidence_receipt(witness,fault):
    if fault!='receipt-blocked':
        return hashlib.sha256(encode(unknown_document(witness))).hexdigest()
    receiptfd=receipt_directory(witness)
    try:
        fd=os.open('broker-receipt.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=receiptfd)
        try:
            require(file_stamp(os.fstat(fd))==witness.collision_stamp and os.read(fd,1)==b'',
                'evidence-receipt-collision-not-empty')
        finally:
            os.close(fd)
    finally:
        os.close(receiptfd)
    try:
        unknown_document(witness)
    except ValueError:
        return None
    raise ValueError('evidence-invalid-receipt-accepted')


def dispose_evidence_fixture(witness):
    require_live_keeper(witness)
    sentinel=fixed_keeper_sentinel(witness)
    try:
        signal.pidfd_send_signal(witness.held[0],signal.SIGKILL)
        signal.pidfd_send_signal(sentinel,signal.SIGKILL)
        wait_signaled(witness.held+[sentinel],3)
        require(witness.keeper_process.wait(timeout=2)==-signal.SIGKILL,'evidence-fixture-keeper-exit')
    finally:
        os.close(sentinel)


def scheduled_unknown_observe(root,nonce):
    global FIXED_REFUSAL,OBSERVER_ROOT
    FIXED_REFUSAL,OBSERVER_ROOT=False,root
    witness=SimpleNamespace(rootfd=open_root(root,nonce),nonce=nonce,held=[],sentinel=None,props=None)
    prepare_observer(witness)
    fault=evidence_fault_command()
    inject_evidence_fault(witness,fault)
    manifest=witness.mount_view.inventory()
    digest=hashlib.sha256(encode(manifest)).hexdigest()
    expected={'event':'custody','nonce':nonce,'keeperIdentity':witness.keeper_info['identity'],
        'mountIdentity':witness.startup['runtimeIdentity'],'manifestSha256':digest,
        'outcome':'unknown','copyVerified':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
    send_packet(witness.keeper_peer,{'event':'finish','nonce':nonce})
    # A refused receipt has no acknowledgement; inspect custody on the independent endpoint.
    custody_exchange(witness,expected)
    unknown_admin(nonce,{'event':'probe-custody','nonce':'b'*32 if nonce!='b'*32 else 'a'*32})
    custody_exchange(witness,expected)
    receipt_digest=evidence_receipt(witness,fault)
    state=evidence_state(witness,fault)
    witness.keeper_peer.close()
    witness.mount_view.close()
    witness.mount_view,witness.startup_runtime=None,None
    custody_exchange(witness,expected)
    require(evidence_receipt(witness,fault)==receipt_digest,'evidence-receipt-drift-after-closure')
    require(all(not (Path('/proc')/str(witness.startup[role]['pid'])).exists() for role in ('main','leaf')),
        'evidence-original-workers-still-present')
    report={'event':'result','nonce':nonce,'stage':'held','outcome':'unknown','copyVerified':False,
        'automaticDeletion':False,'keeperIdentity':witness.keeper_info['identity'],
        'mountIdentity':witness.startup['runtimeIdentity'],'invocation':witness.props['InvocationID'],
        'receiptSha256':receipt_digest,'retentionReceiptVerified':receipt_digest is not None,'keeperAlive':True,
        'workerPidfdsSignaled':True,'originalProcEntriesAbsent':True,'cgroupEmpty':True,
        'leaseReason':'unverified','evidenceFault':fault,'terminalEvidence':state,'manifestSha256':digest,
        'duplicateClosureVerified':True,'linuxFinalInventoryVerified':False,
        'fixtureDisposalVerified':False,'nativeExecutionAllowed':False}
    emit_recovery(report)
    recovery_command(b'dispose-supervised-fixture\n')
    dispose_evidence_fixture(witness)
    require(evidence_state(witness,fault)==state and evidence_receipt(witness,fault)==receipt_digest,
        'evidence-fault-changed-at-disposal')
    finish_observer(witness)
    emit_recovery(report|{'stage':'fixture-disposed','keeperAlive':False,'fixtureDisposalVerified':True})
