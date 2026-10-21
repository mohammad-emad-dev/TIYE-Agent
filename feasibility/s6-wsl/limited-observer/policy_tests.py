"""Real Linux ancillary-message rejection checks; no candidate or mount setup."""
def mount_policy_tests():
    import errno
    nonce = 'a' * 32
    with tempfile.TemporaryDirectory(prefix='tiye-transfer-tests-', dir='/tmp') as temporary:
        directory = os.open(temporary, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        regular = os.open(temporary + '/regular', os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
        try:
            metadata = os.fstat(directory)
            valid = {'nonce': nonce, 'identity': [metadata.st_dev, metadata.st_ino]}
            scenarios = [
                (encode(valid | {'nonce': 'b' * 32}), [directory], 1024, 128,
                 (os.getpid(), 1000, 1000), 'mount-transfer-peer-or-nonce'),
                (encode(valid), [directory, directory], 1024, 128,
                 (os.getpid(), 1000, 1000), 'mount-transfer-control-truncated-or-count'),
                (encode(valid), [regular], 1024, 128, (os.getpid(), 1000, 1000), 'mount-directory-metadata'),
                (encode(valid), [directory], 1, 128,
                 (os.getpid(), 1000, 1000), 'mount-transfer-control-truncated-or-count'),
                (encode(valid), [directory], 1024, 0,
                 (os.getpid(), 1000, 1000), 'mount-transfer-control-truncated-or-count'),
                (encode(valid), [directory], 1024, 128, (os.getpid(), 1001, 1000), 'mount-transfer-peer-or-nonce'),
                (b'{"nonce":"a","nonce":"a"}', [directory], 1024, 128,
                 (os.getpid(), 1000, 1000), 'duplicate-json-member'),
            ]
            for payload, descriptors, message_cap, ancillary_cap, credentials, reason in scenarios:
                sender, receiver = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
                with sender, receiver:
                    sender.sendmsg([payload], [(socket.SOL_SOCKET, socket.SCM_RIGHTS,
                                               array.array('i', descriptors))])
                    message, ancillary, flags, _ = receiver.recvmsg(message_cap, ancillary_cap,
                                                                   socket.MSG_CMSG_CLOEXEC)
                    installed = []
                    for level, kind, control in ancillary:
                        if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
                            received = array.array('i')
                            received.frombytes(control)
                            installed.extend(received)
                    try:
                        validate_transfer((message, ancillary, flags, credentials), nonce)
                    except ValueError as error:
                        require(str(error) == reason, 'unexpected-transfer-rejection')
                    else:
                        raise ValueError('invalid-mount-transfer-accepted')
                    for fd in installed:
                        try:
                            os.fstat(fd)
                        except OSError as error:
                            require(error.errno == errno.EBADF, 'descriptor-closure-errno')
                        else:
                            raise ValueError('rejected-transfer-leaked-descriptor')
        finally:
            os.close(regular)
            os.close(directory)
    retention_policy_tests()
    print('POLICY-OK')


def retention_policy_tests():
    with tempfile.TemporaryDirectory(prefix='tiye-copy-tests-', dir='/tmp') as temporary:
        source, destination = Path(temporary) / 'source', Path(temporary) / 'destination'
        source.mkdir(mode=0o700)
        destination.mkdir(mode=0o700)
        for name in ('home', 'codex-home', 'tmp'):
            (source / name).mkdir(mode=0o700)
        (source / 'retention.json').write_bytes(b'fixed-test-marker')
        os.chmod(source / 'retention.json', 0o600)
        sourcefd = POLICY['open_directory'](str(source))
        destinationfd = POLICY['open_directory'](str(destination))
        try:
            view = MountView(sourcefd, os.path.realpath('/usr/bin/python3'))
            require(len(view.inventory()) == 4, 'copy-policy-base-fixture')
            # A collision must fail instead of overwriting a retained directory.
            (destination / 'home').mkdir(mode=0o700)
            try:
                view.inventory(destinationfd)
            except FileExistsError:
                pass
            else:
                raise ValueError('copy-collision-accepted')
            (source / 'auth.json').write_bytes(b'fixed-nonsecret-fixture')
            rejected_inventory(view, 'unexpected-node-no-content-read')
            (source / 'auth.json').unlink()
            with (source / 'retention.json').open('r+b') as stream:
                stream.truncate(65537)
            rejected_inventory(view, 'retention-file-metadata')
            (source / 'retention.json').write_bytes(b'fixed-test-marker')
            (source / 'home').rmdir()
            (source / 'home').symlink_to(destination, target_is_directory=True)
            rejected_inventory(view, 'directory-symlink')
        finally:
            os.close(destinationfd)
            os.close(sourcefd)


def rejected_inventory(view, reason):
    import errno
    try:
        view.inventory()
    except ValueError as error:
        require(str(error) == reason, 'unexpected-inventory-rejection')
        return
    except OSError as error:
        require(reason == 'directory-symlink' and error.errno in (errno.ENOTDIR, errno.ELOOP),
                'unexpected-inventory-errno')
        return
    raise ValueError(reason)
