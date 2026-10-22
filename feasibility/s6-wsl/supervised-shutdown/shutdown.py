"""Protocol and unverified terminal states keep independent unknown mount custody."""
PROTOCOL_REASONS=frozenset(('fault-truncated','fault-oversize','fault-heartbeat','fault-read'))


def shutdown_terminal(witness):
    terminal=decode(read_file(witness.rootfd,'terminal.json'))
    fields={'nonce','pid','reason','lastSequence','ageSeconds','chargedBeforeTerminal'}
    require(type(terminal) is dict and set(terminal)==fields and terminal['nonce']==witness.nonce
        and terminal['pid']==witness.startup['main']['pid'] and type(terminal['pid']) is int
        and terminal['reason'] in PROTOCOL_REASONS|{'eof','expired'}
        and type(terminal['lastSequence']) is int and terminal['lastSequence']>=1
        and type(terminal['ageSeconds']) in (int,float) and math.isfinite(terminal['ageSeconds'])
        and terminal['ageSeconds']>=0 and type(terminal['chargedBeforeTerminal']) is int
        and 0<=terminal['chargedBeforeTerminal']<=CAPS['worker'],'shutdown-terminal-binding')
    current=query(witness.nonce)
    require(current.get('LoadState')=='not-found' or
        current.get('InvocationID')==witness.props['InvocationID'] and current.get('ExecMainStatus')=='71',
        'shutdown-terminal-service-exit')
    return terminal


def preserve_shutdown_unknown(view,bound):
    document={'scope':'fixed-supervised-keeper-unknown','nonce':bound.nonce,'keeperIdentity':bound.keeper,
        'observerLossDetected':bound.lost,'startup':bound.startup,'invocation':bound.properties['InvocationID'],
        'outcome':'unknown','copyVerified':False,'automaticDeletion':False,'mountIdentity':list(view.identity)}
    try:
        receipt(bound.receiptfd,document)
        if not bound.lost:
            send_packet(bound.peer,{'event':'unknown','nonce':bound.nonce})
    except (OSError,ValueError):
        # Failure to acknowledge uncertainty never authorizes dropping custody.
        pass
    hold_refused_copy(view,bound,False)
    raise RuntimeError('shutdown-unknown-holder-returned-without-authority')


def keeper_shutdown(view,bound,witness):
    try:
        started=_wait_cleanup(witness)
        terminal=shutdown_terminal(witness)
        reason=terminal['reason']
        if reason not in PROTOCOL_REASONS:
            reason=terminal_evidence(witness)
    except (OSError,ValueError,KeyError,TypeError):
        preserve_shutdown_unknown(view,bound)
    if reason in PROTOCOL_REASONS:
        preserve_shutdown_unknown(view,bound)
    return started,reason


def refusal_observation(witness,document):
    wait_signaled(witness.held[1:],1)
    require(all(not (Path('/proc')/str(witness.startup[role]['pid'])).exists() for role in ('main','leaf'))
            and cgroup_empty(witness.cgroup),'shutdown-worker-exit-unverified')
    terminal=shutdown_terminal(witness)
    return {'event':'result','nonce':witness.nonce,'stage':'held','outcome':'unknown','copyVerified':False,
        'automaticDeletion':False,'keeperIdentity':witness.keeper_info['identity'],
        'mountIdentity':witness.startup['runtimeIdentity'],'invocation':witness.props['InvocationID'],
        'receiptSha256':hashlib.sha256(encode(document)).hexdigest(),'keeperAlive':True,
        'workerPidfdsSignaled':True,'originalProcEntriesAbsent':True,'cgroupEmpty':True,
        'leaseReason':terminal['reason'],'terminalSequence':terminal['lastSequence'],
        'fixtureDisposalVerified':False,'nativeExecutionAllowed':False}


def scheduled_unknown_observe(root,nonce):
    global FIXED_REFUSAL,OBSERVER_ROOT
    FIXED_REFUSAL,OBSERVER_ROOT=True,root
    witness=SimpleNamespace(rootfd=open_root(root,nonce),nonce=nonce,held=[],sentinel=None,props=None)
    prepare_observer(witness)
    observe_command()
    document=establish_unknown_custody(witness)
    report=refusal_observation(witness,document)
    emit_recovery(report)
    recovery_command(b'dispose-supervised-fixture\n')
    # Isolated test teardown uses only original held synthetic keeper/sentinel identities.
    require_live_keeper(witness)
    sentinel=fixed_keeper_sentinel(witness)
    try:
        signal.pidfd_send_signal(witness.held[0],signal.SIGKILL)
        signal.pidfd_send_signal(sentinel,signal.SIGKILL)
        wait_signaled(witness.held+[sentinel],3)
        require(witness.keeper_process.wait(timeout=2)==-signal.SIGKILL,'shutdown-fixture-keeper-exit')
    finally:
        os.close(sentinel)
    require(unknown_document(witness)==document and cgroup_empty(witness.cgroup),'shutdown-fixture-evidence-changed')
    audit(witness.rootfd,Ledger('observer'))
    finish_observer(witness)
    emit_recovery(report|{'stage':'fixture-disposed','keeperAlive':False,'fixtureDisposalVerified':True})
