"""Real service, pidfds and held mount for normal and malformed lease input."""
MODES=('baseline-truncated','eof','expired','fragmented','truncated','exact-cap','oversize',
       'malformed','invalid-utf8','wrong-nonce','skipped-sequence','empty-frame','persist-refused')
FAULTS={'truncated':'fault-truncated','exact-cap':'fault-truncated','oversize':'fault-oversize',
        'malformed':'fault-heartbeat','invalid-utf8':'fault-heartbeat','wrong-nonce':'fault-heartbeat',
        'skipped-sequence':'fault-heartbeat','empty-frame':'fault-heartbeat'}


def send_lease_input(bridge,nonce,mode):
    first=encode({'nonce':nonce,'sequence':1})+b'\n'
    require(bridge.stdin.write(first)==len(first),'shutdown-first-heartbeat-write')
    if mode=='fragmented':
        second=encode({'nonce':nonce,'sequence':2})+b'\n'
        for piece in (second[:7],second[7:]):
            require(bridge.stdin.write(piece)==len(piece),'shutdown-fragmented-write')
    payloads={'baseline-truncated':b'{','truncated':b'{','exact-cap':b'x'*4096,'oversize':b'x'*4097,
        'malformed':b'{]\n','invalid-utf8':b'\xff\n','wrong-nonce':encode({'nonce':'b'*32,'sequence':2})+b'\n',
        'skipped-sequence':encode({'nonce':nonce,'sequence':3})+b'\n','empty-frame':b'\n'}
    if mode in payloads:
        payload=payloads[mode]
        require(bridge.stdin.write(payload)==len(payload),'shutdown-fault-payload-write')
    if mode=='expired':
        time.sleep(1.2)
    bridge.stdin.close()


def check_terminal(witness,mode):
    baseline=mode=='baseline-truncated'
    if baseline:
        require('terminal.json' not in os.listdir(witness.rootfd),'baseline-missing-terminal-not-reproduced')
        return 'unrecorded',None,False
    if mode=='persist-refused':
        require(read_file(witness.rootfd,'terminal.json')==b'','shutdown-collision-file-changed')
        try:
            terminal_evidence(witness)
        except ValueError:
            return 'write-refused',None,False
        raise ValueError('shutdown-collision-file-earned-cleanup-credit')
    terminal=decode(read_file(witness.rootfd,'terminal.json'))
    expected_reason=FAULTS.get(mode,'expired' if mode=='expired' else 'eof')
    expected_sequence=2 if mode=='fragmented' else 1
    require(terminal['nonce']==witness.nonce and terminal['pid']==witness.startup['main']['pid']
            and terminal['reason']==expected_reason and terminal['lastSequence']==expected_sequence,
            'shutdown-terminal-binding')
    if mode in FAULTS:
        try:
            terminal_evidence(witness)
        except ValueError as fault:
            require(str(fault)=='terminal-lease-evidence','shutdown-unexpected-refusal')
        else:
            raise ValueError('shutdown-protocol-fault-earned-cleanup-credit')
        return expected_reason,expected_sequence,False
    require(terminal_evidence(witness)==expected_reason,'shutdown-normal-lease-regression')
    return expected_reason,expected_sequence,True


def shutdown_case(source,mode):
    root,nonce=seed(source)
    parent,child=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
    parent.settimeout(10)
    observer=actor(root,nonce,('relay_observer',),child)
    child.close()
    view,bridge_child=None,None
    held=[]
    rootfd=open_root(root,nonce)
    try:
        require(packet(parent)=={'event':'listening','nonce':nonce},'shutdown-observer-listener')
        role='baseline_bridge' if mode=='baseline-truncated' else 'bridge'
        bridge_child=subprocess.Popen(['/usr/bin/python3','-I','-S','-B',str(root/'linux_runtime.py'),
            role,str(root),nonce],env=BUS_ENV,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,bufsize=0)
        view=receive_view(parent,nonce,None)
        send_packet(parent,{'event':'broker-owns-mount','nonce':nonce})
        acknowledged=packet(parent)
        require(acknowledged['event']=='producer-acknowledged' and acknowledged['nonce']==nonce,'shutdown-producer-ack')
        startup=wait_startup(rootfd)
        props=descriptor(nonce,startup)
        require(startup['runtimeIdentity']==list(view.identity),'shutdown-mount-binding')
        for role in ('main','leaf'):
            held.append(hold(startup[role]))
        group=Path('/sys/fs/cgroup')/props['ControlGroup'].lstrip('/')
        if mode=='persist-refused':
            collision=os.open('terminal.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600,dir_fd=rootfd)
            os.close(collision)
        send_lease_input(bridge_child,nonce,mode)
        wait_service_empty(group,held)
        code=bridge_child.wait(timeout=3)
        require(code==(1 if mode=='baseline-truncated' else 71),'shutdown-service-exit-status')
        reason,sequence,normal=check_terminal(SimpleNamespace(rootfd=rootfd,nonce=nonce,startup=startup,props=props),mode)
        require(view.snapshot(startup['fixtureExecutable'])['helperSessions']==1,'shutdown-held-mount-lost')
        send_packet(parent,{'event':'exit','nonce':nonce})
        require(observer.wait(timeout=3)==0,'shutdown-relay-observer-exit')
        return {'mode':mode,'missingTerminalReproduced':mode=='baseline-truncated','terminalObserved':mode not in ('baseline-truncated','persist-refused'),
            'stopReason':reason,'lastSequence':sequence,'pidfdsExitVerified':True,'cgroupExitVerified':True,
            'heldMountVerified':True,'normalLeaseEvidenceAccepted':normal,'outcome':'unknown','nativeExecutionAllowed':False},str(root)
    finally:
        if bridge_child is not None and not bridge_child.stdin.closed:
            bridge_child.stdin.close()
        if observer.poll() is None:
            observer.kill()
            observer.wait(timeout=3)
        if view is not None:
            view.close()
        for fd in held:
            os.close(fd)
        os.close(rootfd)
        parent.close()


def run_cases(bundle):
    source=base64.b64decode(bundle['sourceBase64'],validate=True)
    require(hashlib.sha256(source).hexdigest()==bundle['sha256'],'shutdown-source-digest')
    cases,private_runs=[],[]
    for mode in MODES:
        selected,root=shutdown_case(source,mode)
        cases.append(selected)
        private_runs.append({'mode':mode,'root':root})
    print(json.dumps({'scope':'fixed-worker-shutdown-evidence','cases':cases,'privateRuns':private_runs,
        'candidateExecuted':False,'nativeExecutionAllowed':False}))
