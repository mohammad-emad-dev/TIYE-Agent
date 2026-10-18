"""WSL observer owns synthetic resources outside the managed service and fresh HOME."""
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import socket
import stat
import struct
import sys
import tempfile
import threading

FILES = {'bridge.py', 'service.py', 'profile.py', 'worker.py', 'common.py',
         'protocol_peer.py', 'entry.py', 'observer.py', 'lease.py', 'stop.py', 'ambient_probe.py'}


def owned_stat(path):
    metadata = path.lstat()
    return {'uid': metadata.st_uid, 'mode': stat.S_IMODE(metadata.st_mode),
            'type': stat.S_IFMT(metadata.st_mode), 'inode': metadata.st_ino, 'device': metadata.st_dev}


class OwnedResources:
    def __init__(self, nonce):
        self.nonce, self.listeners, self.threads, self.receipts = nonce, {}, [], {}
        self.errors, self.identities = [], {}
        self.root = Path(tempfile.mkdtemp(prefix='tiye-ambient-resources-', dir='/tmp'))
        self.root_identity = owned_stat(self.root)
        try:
            self._prepare_files()
            self._listen('unix', socket.AF_UNIX, str(self.root / 'service.sock'))
            (self.root / 'service.sock').chmod(0o600)
            self.identities['service.sock'] = owned_stat(self.root / 'service.sock')
            self._listen('tcp', socket.AF_INET, ('127.0.0.1', 0))
        except (OSError, ValueError, RuntimeError) as original:
            for listener in self.listeners.values():
                listener.close()
            for thread in self.threads:
                thread.join(timeout=11)
            if any(thread.is_alive() for thread in self.threads):
                original.add_note('partial-resource-thread-still-live')
            raise

    def _prepare_files(self):
        nonce = self.nonce
        for name, payload, mode in (('read.txt', 'owned-read:' + nonce, 0o600),
                                    ('deny.txt', 'owned-deny:' + nonce, 0)):
            path = self.root / name
            with path.open('xb') as stream:
                stream.write(payload.encode('ascii'))
                stream.flush()
                os.fsync(stream.fileno())
            path.chmod(mode)
            self.identities[name] = owned_stat(path)

    def _listen(self, name, family, endpoint):
        listener = socket.socket(family, socket.SOCK_STREAM)
        self.listeners[name] = listener
        listener.settimeout(10)
        listener.bind(endpoint)
        listener.listen(1)
        thread = threading.Thread(target=self._serve, args=(name,), daemon=True)
        thread.start()
        self.threads.append(thread)

    def _serve(self, name):
        try:
            listener = self.listeners[name]
            connection, address = listener.accept()
            with connection:
                connection.settimeout(3)
                with connection.makefile('rb') as incoming:
                    message = incoming.readline(128)
                if message != ('hello ' + self.nonce + '\n').encode('ascii'):
                    raise ValueError('owned-listener-nonce')
                receipt = {'nonceMatched': True, 'peerEndpoint': address, 'listenerEndpoint': listener.getsockname()}
                if name == 'unix':
                    receipt['peerCredentials'] = list(struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)))
                connection.sendall(('owned ' + self.nonce + '\n').encode('ascii'))
                self.receipts[name] = receipt
        except (OSError, ValueError) as error:
            self.errors.append(type(error).__name__)

    def packet(self):
        return {'nonce': self.nonce, 'resourceRoot': str(self.root),
                'tcpPort': self.listeners['tcp'].getsockname()[1],
                'readSha256': hashlib.sha256(('owned-read:' + self.nonce).encode('ascii')).hexdigest()}

    def finish(self):
        for thread in self.threads:
            thread.join(timeout=11)
        for listener in self.listeners.values():
            listener.close()
        if any(thread.is_alive() for thread in self.threads) or self.errors:
            raise RuntimeError('owned-listener-thread-or-protocol-failure')
        write = self.root / 'peer-write.txt'
        self.identities['peer-write.txt'] = owned_stat(write)
        if (owned_stat(self.root) != self.root_identity
                or {p.name for p in self.root.iterdir()} != set(self.identities)):
            raise ValueError('resource-root-or-inventory-changed')
        descriptor = os.open(write, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 1000 or metadata.st_size > 4096:
                raise ValueError('owned-write-shape')
            write_digest = hashlib.sha256(os.read(descriptor, 4097)).hexdigest()
        finally:
            os.close(descriptor)
        for name, identity in self.identities.items():
            if owned_stat(self.root / name) != identity:
                raise ValueError('resource-identity-changed')
        initial = dict(self.identities)
        for name in self.identities:
            (self.root / name).unlink()
        self.root.rmdir()
        return {'initial': initial, 'rootIdentity': self.root_identity, 'resourceRoot': str(self.root),
                'ownerPid': os.getpid(), 'ownerUid': os.getuid(),
                'namespaceIds': {name: os.readlink('/proc/self/ns/' + name) for name in ('mnt', 'net', 'user')},
                'writeSha256': write_digest, 'receipts': self.receipts,
                'rootAbsent': not self.root.exists(), 'threadsStopped': True,
                'listenerFdsClosed': all(listener.fileno() == -1 for listener in self.listeners.values())}


def main():
    if os.getuid() != 1000:
        raise ValueError('requires-uid1000')
    os.umask(0o077)
    raw = sys.stdin.buffer.readline(65537)
    if len(raw) > 65536 or not raw.endswith(b'\n'):
        raise ValueError('bundle-budget')
    bundle = json.loads(raw)
    if set(bundle['files']) != FILES or bundle['mode'] != 'valid':
        raise ValueError('fixed-ambient-bundle-only')
    runtime = Path(tempfile.mkdtemp(prefix='tiye-ambient-runtime-', dir='/tmp'))
    for name, encoded in bundle['files'].items():
        payload = base64.b64decode(encoded, validate=True)
        if hashlib.sha256(payload).hexdigest() != bundle['sha256'][name]:
            raise ValueError('bundle-hash')
        with (runtime / name).open('xb') as stream:
            stream.write(payload)
    sys.path.insert(0, str(runtime))
    import common
    import observer
    resources = OwnedResources(bundle['nonce'])
    common.save(runtime / 'ambient-input.json', resources.packet())
    print(json.dumps({'event': 'prepared', 'nonce': bundle['nonce'], 'linuxRoot': str(runtime),
                      'uid': os.getuid(), 'linux': platform.platform(), 'python': platform.python_version()}), flush=True)
    try:
        observer.run(runtime, bundle['nonce'], 'valid')
        probe = json.loads((runtime / 'ambient-result.json').read_text())
    finally:
        original = sys.exception()
        try:
            cleanup = resources.finish()
        except (OSError, ValueError, RuntimeError) as failure:
            if original is not None:
                original.add_note('owned-resource-cleanup:' + type(failure).__name__)
                raise original
            raise
        common.save(runtime / 'ambient-cleanup.json', cleanup)
    print(json.dumps({'event': 'ambient', 'nonce': bundle['nonce'], 'probe': probe,
                      'resources': cleanup}), flush=True)


if __name__ == '__main__':
    main()
