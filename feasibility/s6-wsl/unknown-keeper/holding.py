"""Copy refusal retains ownership; only the fixed live test observer can dispose."""
FIXED_REFUSAL = False
_supervised_keeper = keeper
UNEXPECTED = 'unexpected-fixed-fixture.bin'


class FixedFixtureDisposed(Exception):
    """Private test control flow; an unknown receipt never becomes a copy receipt."""


def keeper(root, nonce):
    try:
        _supervised_keeper(root, nonce)
    except FixedFixtureDisposed:
        return


def retain_or_hold(view, bound):
    fixture = len(sys.argv) == 6 and sys.argv[5] == 'fixed-refusal'
    if fixture:
        fd = os.open(UNEXPECTED, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=view.fd)
        os.close(fd)
    try:
        return view.retain()
    except (ValueError, OSError):
        document = {'scope': 'fixed-supervised-keeper-unknown', 'nonce': bound.nonce,
            'keeperIdentity': bound.keeper, 'observerLossDetected': bound.lost,
            'startup': bound.startup, 'invocation': bound.properties['InvocationID'],
            'outcome': 'unknown', 'copyVerified': False, 'automaticDeletion': False,
            'mountIdentity': list(view.identity)}
        try:
            receipt(bound.receiptfd, document)
            if not bound.lost:
                send_packet(bound.peer, {'event': 'unknown', 'nonce': bound.nonce})
        except (OSError, ValueError):
            # Receipt/channel failure cannot relinquish the only remaining mount.
            pass
        hold_refused_copy(view, bound, fixture)
        raise FixedFixtureDisposed()


def release_authority(peer, bound):
    credentials = struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    require(credentials == (bound.observer['pid'], 1000, 1000), 'unknown-release-peer')
    require(not select.select([bound.parentfd], [], [], 0)[0]
            and identity(bound.observer['pid']) == bound.observer, 'unknown-release-observer-ended')


def fixed_fixture_present(view):
    metadata = os.stat(UNEXPECTED, dir_fd=view.fd, follow_symlinks=False)
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 1000 and metadata.st_nlink == 1
            and stat.S_IMODE(metadata.st_mode) == 0o600 and metadata.st_size == 0,
            'unknown-release-not-fixed-empty-fixture')


def refused_request(peer, view, bound, fixture):
    peer.settimeout(0.25)
    release_authority(peer, bound)
    request = packet(peer)
    require(request in ({'event': 'probe', 'nonce': bound.nonce},
                        {'event': 'release-fixed-fixture', 'nonce': bound.nonce}), 'unknown-release-request')
    require(directory_stamp(view.fd)[:2] == view.identity, 'unknown-held-mount-replaced')
    if request['event'] == 'release-fixed-fixture':
        require(fixture, 'unknown-disposal-not-authorized')
        fixed_fixture_present(view)
    release_authority(peer, bound)
    send_packet(peer, {'event': 'still-held', 'nonce': bound.nonce, 'copyVerified': False})
    release_authority(peer, bound)
    return request['event'] == 'release-fixed-fixture'


def hold_refused_copy(view, bound, fixture):
    # Endpoint failures leave the mount owned and retry only the endpoint setup.
    while True:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as admin:
                admin.bind('\0tiye-keeper-release-' + bound.nonce)
                admin.listen(1)
                while True:
                    try:
                        with admin.accept()[0] as peer:
                            if refused_request(peer, view, bound, fixture):
                                return
                    except (OSError, ValueError):
                        continue
        except OSError:
            time.sleep(0.1)
