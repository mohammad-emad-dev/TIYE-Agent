"""Original pidfds are pinned before the explicit synthetic observer-loss fault."""


def enroll_observed_inspector(witness):
    wire=sys.stdin.buffer.readline(4097)
    require(wire.endswith(b'\n') and len(wire)<=4096,'inspector-enrollment-input-bound')
    request=decode(wire.decode('utf-8'))
    require(type(request) is dict and set(request)=={'event','nonce','identity'}
        and request['event']=='enroll-custody-inspector' and request['nonce']==witness.nonce,
        'inspector-enrollment-input')
    require_refused_request(witness.nonce,request|{'identity':{}})
    with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        peer.connect('\0tiye-keeper-release-'+witness.nonce)
        send_packet(peer,request)
        reply=packet(peer)
        require(reply['event']=='inspector-enrolled' and reply['nonce']==witness.nonce,'inspector-enrollment-ack')
    require_refused_request(witness.nonce,request)
    require_refused_request(witness.nonce,{'event':'release-fixed-fixture','nonce':witness.nonce})
    emit_recovery({'event':'result','nonce':witness.nonce,'stage':'inspector-enrolled','document':reply['document']})
    # EOF does not authorize disposal or replacement once this read-only pin exists.
    while True:
        select.select([],[],[],60)


def inspector_exchange(nonce,expected):
    with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        peer.connect('\0tiye-keeper-release-'+nonce)
        send_packet(peer,{'event':'probe-custody','nonce':nonce})
        require(encode(packet(peer))==encode(expected),'inspector-custody-response-binding')


def foreign_inspector_refused(nonce):
    script='''import json,socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET)
s.settimeout(2)
s.connect('\\0tiye-keeper-release-'+sys.argv[1])
s.send(json.dumps({'event':'probe-custody','nonce':sys.argv[1]}).encode())
if s.recv(1)!=b'': raise ValueError('foreign-inspector-accepted')
s.close()
'''
    checked=subprocess.run(['/usr/bin/python3','-I','-S','-B','-c',script,nonce],env=BUS_ENV,
        stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
    require(checked.returncode==0,'inspector-foreign-peer-not-refused')


def inspect_custody(root,nonce):
    with contextlib.ExitStack() as cleanup:
        rootfd=open_root(root,nonce)
        cleanup.callback(os.close,rootfd)
        verify_bundle(rootfd,nonce)
        wire=sys.stdin.buffer.readline(4097)
        require(wire.endswith(b'\n') and len(wire)<=4096,'inspector-binding-bound')
        binding=decode(wire.decode('utf-8'))
        require(type(binding) is dict and set(binding)=={'observer','keeper','startup','invocation','manifestSha256',
            'fault','receiptSha256'} and binding['fault'] in ('missing','receipt-blocked'),'inspector-binding-schema')
        held=[hold(binding['observer']),hold(binding['keeper']['identity'])]
        for fd in held:
            cleanup.callback(os.close,fd)
        fixture=SimpleNamespace(keeper_info=binding['keeper'])
        sentinel=fixed_keeper_sentinel(fixture)
        cleanup.callback(os.close,sentinel)
        witness=SimpleNamespace(rootfd=rootfd,nonce=nonce,keeper_info=binding['keeper'],
            startup=binding['startup'],props={'InvocationID':binding['invocation']})
        if binding['fault']=='receipt-blocked':
            receiptfd=receipt_directory(witness)
            try:
                witness.collision_stamp=file_stamp(os.stat('broker-receipt.json',dir_fd=receiptfd,follow_symlinks=False))
                require(witness.collision_stamp[6]==0,'inspector-receipt-not-empty')
            finally:
                os.close(receiptfd)
        require(evidence_receipt(witness,binding['fault'])==binding['receiptSha256'],'inspector-receipt-before-loss')
        own=identity(os.getpid())
        emit_recovery({'event':'armed','nonce':nonce,'identity':own})
        recovery_command(b'enrolled\n')
        request={'event':'probe-custody','nonce':nonce}
        require_refused_request(nonce,request)
        emit_recovery({'event':'armed','nonce':nonce,'identity':own,'stage':'enrolled','earlyInspectionRefused':True})
        recovery_command(b'kill\n')
        require(not select.select([held[1],sentinel],[],[],0)[0],'inspector-fixture-ended-before-loss')
        signal.pidfd_send_signal(held[0],signal.SIGKILL)
        wait_signaled([held[0]],3)
        require(not select.select([held[1],sentinel],[],[],0)[0],'inspector-keeper-ended-with-observer')
        expected={'event':'custody','nonce':nonce,'keeperIdentity':binding['keeper']['identity'],
            'mountIdentity':binding['startup']['runtimeIdentity'],'manifestSha256':binding['manifestSha256'],
            'outcome':'unknown','copyVerified':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
        inspector_exchange(nonce,expected)
        foreign_inspector_refused(nonce)
        for forbidden in ({'event':'release-fixed-fixture','nonce':nonce},
                {'event':'enroll-custody-inspector','nonce':nonce,'identity':own},request|{'release':True}):
            require_refused_request(nonce,forbidden)
        inspector_exchange(nonce,expected)
        require(evidence_receipt(witness,binding['fault'])==binding['receiptSha256'],'inspector-receipt-after-loss')
        group=Path('/sys/fs/cgroup')/binding['startup']['main']['cgroup'].removeprefix('0::').lstrip('/')
        require(cgroup_empty(group),'inspector-worker-group-not-empty')
        report={'event':'killed','nonce':nonce,'observer':binding['observer'],'identity':own,
            'keeperAlive':True,'earlyInspectionRefused':True,'foreignInspectionRefused':True,
            'releaseRefused':True,'replacementRefused':True,'outcome':'unknown','copyVerified':False,
            'manifestSha256':binding['manifestSha256'],'receiptSha256':binding['receiptSha256'],
            'socketPidfdVerified':True,'inspectorPersistence':'keeper-memory-only','nativeExecutionAllowed':False}
        emit_recovery(report)
        recovery_command(b'dispose-supervised-fixture\n')
        signal.pidfd_send_signal(held[1],signal.SIGKILL)
        signal.pidfd_send_signal(sentinel,signal.SIGKILL)
        wait_signaled(held+[sentinel],3)
        require(evidence_receipt(witness,binding['fault'])==binding['receiptSha256'] and cgroup_empty(group),
            'inspector-disposal-evidence-changed')
        emit_recovery(report|{'event':'result','keeperAlive':False,'fixtureDisposalVerified':True})
