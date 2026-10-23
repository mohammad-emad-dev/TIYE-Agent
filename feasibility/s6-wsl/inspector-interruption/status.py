"""Only the original live observer can reconcile the latched inspection slot."""
import errno


def cgroup_empty(group):
    try:
        return 'populated 0' in (group/'cgroup.events').read_text().splitlines()
    except OSError as fault:
        if fault.errno not in (errno.ENOENT,errno.ENODEV):
            raise
        try:
            group.stat()
        except FileNotFoundError:
            return True
        return False


def inspector_enrollment_status(query,view,bound,state):
    require(query.request=={'event':'inspect-custody-enrollment','nonce':bound.nonce},'inspector-status-schema')
    release_authority(query.peer,bound)
    require(directory_stamp(view.fd)[:2]==view.identity,'inspector-status-mount-replaced')
    require(hasattr(state,'inspector'),'inspector-status-slot-unoccupied')
    inspector=state.inspector
    ended=bool(select.select([inspector.fd],[],[],0)[0])
    if not ended:
        require(identity(inspector.identity['pid'])==inspector.identity,'inspector-status-live-identity-changed')
        ended=bool(select.select([inspector.fd],[],[],0)[0])
    release_authority(query.peer,bound)
    return {'event':'inspector-status','nonce':bound.nonce,'keeperIdentity':bound.keeper,
        'mountIdentity':list(view.identity),'identity':inspector.identity,'slotOccupied':True,
        'inspectorState':'ended' if ended else 'live','persistence':'keeper-memory-only',
        'replacementAllowed':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
