"""Actual socket ACK discard and pidfd-targeted inspector death, with no reset."""


def enrollment_status_exchange(nonce):
    with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        peer.connect('\0tiye-keeper-release-'+nonce)
        send_packet(peer,{'event':'inspect-custody-enrollment','nonce':nonce})
        return packet(peer)


def discarded_inspector_ack(nonce,request):
    with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as peer:
        peer.settimeout(2)
        peer.connect('\0tiye-keeper-release-'+nonce)
        send_packet(peer,request)
        peer.shutdown(socket.SHUT_RDWR)


def foreign_enrollment_status_refused(nonce):
    script='''import json,socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET)
s.settimeout(2)
s.connect('\\0tiye-keeper-release-'+sys.argv[1])
s.send(json.dumps({'event':'inspect-custody-enrollment','nonce':sys.argv[1]}).encode())
if s.recv(1)!=b'': raise ValueError('foreign-enrollment-status-accepted')
'''
    checked=subprocess.run(['/usr/bin/python3','-I','-S','-B','-c',script,nonce],env=BUS_ENV,
        stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
    require(checked.returncode==0,'foreign-enrollment-status-not-refused')


def live_inspector_replacement_refused(witness):
    candidate=subprocess.Popen(['/usr/bin/python3','-I','-S','-B','-c','import time;time.sleep(95)'],
        stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
        env=BUS_ENV,start_new_session=True)
    replacement=identity(candidate.pid)
    held=hold(replacement)
    try:
        require_refused_request(witness.nonce,{'event':'enroll-custody-inspector','nonce':witness.nonce,'identity':replacement})
    finally:
        signal.pidfd_send_signal(held,signal.SIGKILL)
        wait_signaled([held],3)
        candidate.wait(timeout=2)
        os.close(held)


def enroll_observed_inspector(witness):
    wire=sys.stdin.buffer.readline(4097)
    require(wire.endswith(b'\n') and len(wire)<=4096,'interrupted-inspector-input-bound')
    command=decode(wire.decode('utf-8'))
    require(type(command) is dict and set(command)=={'event','nonce','identity','interruption'}
        and command['event']=='qualify-inspector-interruption' and command['nonce']==witness.nonce
        and command['interruption'] in ('unobserved-ack','inspector-loss'),'interrupted-inspector-input')
    request={'event':'enroll-custody-inspector','nonce':witness.nonce,'identity':command['identity']}
    inspectorfd=hold(command['identity'])
    if command['interruption']=='unobserved-ack':
        discarded_inspector_ack(witness.nonce,request)
    else:
        with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as peer:
            peer.settimeout(2)
            peer.connect('\0tiye-keeper-release-'+witness.nonce)
            send_packet(peer,request)
            reply=packet(peer)
            require(reply['event']=='inspector-enrolled' and reply['document']['identity']==command['identity'],
                'interrupted-inspector-ack')
        signal.pidfd_send_signal(inspectorfd,signal.SIGKILL)
        wait_signaled([inspectorfd],3)
    status=enrollment_status_exchange(witness.nonce)
    expected={'event':'inspector-status','nonce':witness.nonce,'keeperIdentity':witness.keeper_info['identity'],
        'mountIdentity':witness.startup['runtimeIdentity'],'identity':command['identity'],'slotOccupied':True,
        'inspectorState':'live' if command['interruption']=='unobserved-ack' else 'ended',
        'persistence':'keeper-memory-only','replacementAllowed':False,'automaticReleaseAllowed':False,
        'nativeExecutionAllowed':False}
    require(encode(status)==encode(expected),'interrupted-inspector-status-binding')
    for forbidden in (request,{'event':'release-fixed-fixture','nonce':witness.nonce},
            {'event':'inspect-custody-enrollment','nonce':witness.nonce,'replace':True}):
        require_refused_request(witness.nonce,forbidden)
    require(enrollment_status_exchange(witness.nonce)==status,'interrupted-inspector-status-mutated')
    foreign_enrollment_status_refused(witness.nonce)
    live_inspector_replacement_refused(witness)
    expected_custody={'event':'custody','nonce':witness.nonce,'keeperIdentity':witness.keeper_info['identity'],
        'mountIdentity':witness.startup['runtimeIdentity'],
        'manifestSha256':witness.interruption_manifest,'outcome':'unknown','copyVerified':False,
        'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
    custody_exchange(witness,expected_custody)
    report={'event':'result','nonce':witness.nonce,'stage':'inspector-reconciled','status':status,
        'replacementRefused':True,'releaseRefused':True,'interruption':command['interruption']}
    emit_recovery(report)
    if command['interruption']=='unobserved-ack':
        os.close(inspectorfd)
        while True:
            select.select([],[],[],60)
    recovery_command(b'dispose-inspector-interruption\n')
    require_live_keeper(witness)
    sentinel=fixed_keeper_sentinel(witness)
    try:
        signal.pidfd_send_signal(witness.held[0],signal.SIGKILL)
        signal.pidfd_send_signal(sentinel,signal.SIGKILL)
        wait_signaled(witness.held+[sentinel,inspectorfd],3)
        require(witness.keeper_process.wait(timeout=2)==-signal.SIGKILL,'interrupted-inspector-keeper-exit')
    finally:
        os.close(sentinel)
        os.close(inspectorfd)
    finish_observer(witness)
    emit_recovery(report|{'stage':'fixture-disposed','fixtureDisposalVerified':True})
