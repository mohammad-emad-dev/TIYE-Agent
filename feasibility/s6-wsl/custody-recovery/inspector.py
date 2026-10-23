"""A live-only inspection pin confers no receipt-backed recovery or release rights."""
# Linux v6.18 UAPI asm-generic/socket.h; the Python socket module may omit this name.
SO_PEERPIDFD=77


def inspector_identity(request,bound):
    expected=request['identity']
    fields={'pid','startTicks','ppid','sid','uid','cgroup'}
    require(type(expected) is dict and set(expected)==fields and type(expected['cgroup']) is str
        and all(type(expected[name]) is int and expected[name]>0 for name in fields-{'cgroup'}),
        'inspector-identity-schema')
    excluded={bound.observer['pid'],bound.keeper['pid'],bound.startup['main']['pid'],bound.startup['leaf']['pid']}
    group=bound.startup['main']['cgroup']
    require(expected['pid'] not in excluded and expected['uid']==1000 and expected['pid']<=2147483647
        and expected['ppid']!=bound.keeper['pid'] and expected['sid'] not in {bound.observer['sid'],bound.keeper['sid']}
        and expected['cgroup']!=group and not expected['cgroup'].startswith(group+'/'),'inspector-role-overlap')
    return expected


def enroll_custody_inspector(query,view,bound,state):
    release_authority(query.peer,bound)
    require(set(query.request)=={'event','nonce','identity'} and query.request['event']=='enroll-custody-inspector'
        and query.request['nonce']==bound.nonce and not hasattr(state,'inspector'),'inspector-enrollment-schema-or-occupied')
    expected=inspector_identity(query.request,bound)
    pinned=hold(expected)
    try:
        release_authority(query.peer,bound)
    except (OSError,ValueError):
        os.close(pinned)
        raise
    # This separate slot never sets release enrollment's identity/fd/committed fields.
    state.inspector=SimpleNamespace(identity=expected,fd=pinned)
    return {'scope':'live-only-custody-inspector','nonce':bound.nonce,'identity':expected,
        'keeperIdentity':bound.keeper,'mountIdentity':list(view.identity),'persistence':'keeper-memory-only',
        'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}


def inspector_peer_authority(peer,inspector):
    require(os.uname().machine=='x86_64','inspector-socket-pidfd-platform-unqualified')
    peerfd=peer.getsockopt(socket.SOL_SOCKET,SO_PEERPIDFD)
    try:
        os.set_inheritable(peerfd,False)
        credentials=struct.unpack('3i',peer.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
        expected=inspector.identity
        require(credentials==(expected['pid'],1000,1000) and not select.select([inspector.fd,peerfd],[],[],0)[0],
            'inspector-peer-not-live-pinned-process')
        fdinfo=(Path('/proc/self/fdinfo')/str(peerfd)).read_text()
        require(('Pid:\t'+str(expected['pid'])) in fdinfo.splitlines()
            and identity(expected['pid'])==expected and not select.select([inspector.fd,peerfd],[],[],0)[0],
            'inspector-socket-pidfd-identity-mismatch')
    finally:
        os.close(peerfd)


def custody_authority(peer,bound,state):
    if not select.select([bound.parentfd],[],[],0)[0]:
        release_authority(peer,bound)
        return
    require(hasattr(state,'inspector'),'inspector-not-enrolled-before-observer-loss')
    inspector_peer_authority(peer,state.inspector)


def custody_status(query,view,bound,state):
    require(query.request=={'event':'probe-custody','nonce':bound.nonce},'custody-request-schema')
    custody_authority(query.peer,bound,state)
    manifest=view.inventory()
    require(SESSION in manifest and view.inventory()==manifest,'custody-inventory-unsettled')
    custody_authority(query.peer,bound,state)
    return {'event':'custody','nonce':bound.nonce,'keeperIdentity':bound.keeper,
        'mountIdentity':list(view.identity),'manifestSha256':hashlib.sha256(encode(manifest)).hexdigest(),
        'outcome':'unknown','copyVerified':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
