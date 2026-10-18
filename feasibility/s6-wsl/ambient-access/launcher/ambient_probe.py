"""Only owned synthetic files and nonce-bound local listeners are accessed."""
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat

import common


def read_owned(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 1000 or metadata.st_size > 4096:
            raise ValueError('owned-file-shape')
        return os.read(descriptor, 4097)
    finally:
        os.close(descriptor)


def exchange(family, endpoint, nonce):
    with socket.socket(family, socket.SOCK_STREAM) as client:
        client.settimeout(3)
        client.connect(endpoint)
        client.sendall(('hello ' + nonce + '\n').encode('ascii'))
        reply = client.makefile('rb')
        try:
            ack = reply.readline(128)
        finally:
            reply.close()
        if ack != ('owned ' + nonce + '\n').encode('ascii'):
            raise ValueError('owned-listener-ack')
        return {'ackMatched': True, 'localEndpoint': client.getsockname(), 'remoteEndpoint': client.getpeername()}


def validate_packet(packet, folder, nonce):
    if set(packet) != {'nonce', 'resourceRoot', 'tcpPort', 'readSha256'} or packet['nonce'] != nonce:
        raise ValueError('resource-packet-shape')
    if not re.fullmatch('/tmp/tiye-ambient-resources-[a-z0-9_]+', packet['resourceRoot']):
        raise ValueError('resource-root-not-owned-fixture')
    root = Path(packet['resourceRoot'])
    metadata = root.lstat()
    if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 1000
            or stat.S_IMODE(metadata.st_mode) != 0o700 or root == folder or root.is_relative_to(folder)
            or type(packet['tcpPort']) is not int or not 1 <= packet['tcpPort'] <= 65535):
        raise ValueError('resource-root-identity-or-port')
    expected = hashlib.sha256(('owned-read:' + nonce).encode('ascii')).hexdigest()
    if packet['readSha256'] != expected:
        raise ValueError('resource-content-not-synthetic')
    return root


def run(folder, nonce):
    packet = json.loads(read_owned(folder / 'ambient-input.json'))
    root = validate_packet(packet, folder, nonce)
    read_digest = hashlib.sha256(read_owned(root / 'read.txt')).hexdigest()
    denied_errno = None
    try:
        read_owned(root / 'deny.txt')
    except PermissionError as error:
        denied_errno = error.errno
    output = ('owned-write:' + nonce).encode('ascii')
    descriptor = os.open(root / 'peer-write.txt', os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        os.write(descriptor, output)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    observed = {'nonce': nonce, 'actor': common.identity('ambient-peer', nonce), 'gid': os.getgid(),
        'uidTuple': [int(value) for value in status['Uid'].split()],
        'capEff': status['CapEff'].strip(), 'capAmb': status['CapAmb'].strip(), 'umask': status['Umask'].strip(),
        'namespaceIds': {name: os.readlink('/proc/self/ns/' + name) for name in ('mnt', 'net', 'user')},
        'readSha256': read_digest, 'writeSha256': hashlib.sha256(output).hexdigest(),
        'deniedErrno': denied_errno, 'expectedDeniedErrno': errno.EACCES,
        'environmentNames': sorted(os.environ),
        'freshEnvironment': all(os.environ[key] == str(folder / name) for key, name in
            (('HOME', 'home'), ('CODEX_HOME', 'codex-home'), ('TMPDIR', 'tmp'))),
        'cwdMatchesRuntime': Path.cwd() == folder,
        'resourcesOutsideHome': not root.is_relative_to(Path(os.environ['HOME'])),
        'resourcesOutsideCwd': not root.is_relative_to(Path.cwd()),
        'unix': exchange(socket.AF_UNIX, str(root / 'service.sock'), nonce),
        'tcp': exchange(socket.AF_INET, ('127.0.0.1', packet['tcpPort']), nonce)}
    common.save(folder / 'ambient-result.json', observed)
