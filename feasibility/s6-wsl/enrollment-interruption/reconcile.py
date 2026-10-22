"""Inspection reports live keeper state and receipt validity without changing authority."""
PARTIAL_WRITE_FIXTURE = False
_sealed_commit_enrollment = commit_enrollment


def persist_keeper_fault(rootfd, nonce, fault):
    payload = encode({'nonce': nonce, 'type': type(fault).__name__, 'reason': str(fault)[:256]})
    require(len(payload) <= 1024, 'keeper-fault-record-bound')
    fd = os.open('keeper-fault.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600, dir_fd=rootfd)
    try:
        require(os.write(fd, payload) == len(payload), 'keeper-fault-record-short-write')
        os.fsync(fd)
        os.fsync(rootfd)
    finally:
        os.close(fd)


def commit_enrollment(rootfd, document):
    if not PARTIAL_WRITE_FIXTURE:
        return _sealed_commit_enrollment(rootfd, document)
    # This authenticated synthetic fault leaves a real exclusive partial file.
    fd = os.open('recovery-owner.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600, dir_fd=rootfd)
    try:
        require(os.write(fd, b'{') == 1, 'partial-fixture-short-write')
        os.fsync(fd)
        os.fsync(rootfd)
    finally:
        os.close(fd)
    raise OSError(5, 'fixed-partial-enrollment-fixture')


def reconciliation(query, view, bound, state):
    require(set(query.request) == {'event', 'nonce'}, 'reconciliation-schema')
    release_authority(query.peer, bound)
    require(directory_stamp(view.fd)[:2] == view.identity, 'reconciliation-mount-replaced')
    if state.fixture:
        fixed_fixture_present(view)
    unknown = record_at(bound.receiptfd, 'broker-receipt.json')
    expected_unknown = {'scope': 'fixed-supervised-keeper-unknown', 'nonce': bound.nonce,
        'keeperIdentity': bound.keeper, 'observerLossDetected': False, 'startup': bound.startup,
        'invocation': bound.properties['InvocationID'], 'outcome': 'unknown', 'copyVerified': False,
        'automaticDeletion': False, 'mountIdentity': list(view.identity)}
    require(encode(unknown) == encode(expected_unknown), 'reconciliation-unknown-binding')
    owner_verified = False
    if state.committed:
        owner = record_at(bound.receiptfd, 'recovery-owner.json')
        expected = {'scope': 'fixed-prebound-unknown-owner', 'nonce': bound.nonce,
            'observerIdentity': bound.observer, 'keeperIdentity': bound.keeper, 'recoveryIdentity': state.identity,
            'invocation': bound.properties['InvocationID'], 'mountIdentity': list(view.identity),
            'unknownReceiptSha256': hashlib.sha256(encode(unknown)).hexdigest(),
            'automaticDeletion': False, 'nativeExecutionAllowed': False}
        require(encode(owner) == encode(expected), 'reconciliation-owner-binding')
        owner_verified = True
    require(state.identity is not None and state.fd is not None, 'reconciliation-no-enrollment')
    ended = bool(select.select([state.fd], [], [], 0)[0])
    if not ended:
        require(identity(state.identity['pid']) == state.identity, 'reconciliation-standby-identity-changed')
    return {'event': 'recovery-status', 'nonce': bound.nonce, 'stateSource': 'live-keeper',
        'enrollmentState': 'committed' if state.committed else 'pending', 'standbyState': 'ended' if ended else 'live',
        'ownerReceiptVerified': owner_verified, 'keeperIdentity': bound.keeper, 'mountIdentity': list(view.identity),
        'receiptSha256': hashlib.sha256(encode(unknown)).hexdigest(), 'outcome': 'unknown',
        'automaticReleaseAllowed': False, 'reEnrollmentAllowed': False, 'nativeExecutionAllowed': False}
