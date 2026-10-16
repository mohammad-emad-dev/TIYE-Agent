"""Private Linux U0 worker. No auth, account, model, thread or turn requests."""
import asyncio
import base64
import hashlib
import json
import os
import select
import signal
import sys
import tempfile
from pathlib import Path


def sha_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def identity(pid):
    base = Path('/proc') / str(pid)
    try:
        fields = (base / 'stat').read_text().rsplit(')', 1)[1].split()
        uid = next(row for row in (base / 'status').read_text().splitlines() if row.startswith('Uid:'))
        return {'pid': pid, 'startTicks': int(fields[19]), 'uid': int(uid.split()[1]),
                'boot': Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
    except FileNotFoundError:
        if base.exists():
            raise ValueError('partial-process-identity')
        return None


class OwnedChild:
    def __init__(self):
        self.expected = None
        self.fd = None

    def register(self, pid):
        self.fd = os.pidfd_open(pid)
        self.expected = identity(pid)
        if self.expected is None or self.expected['uid'] != os.getuid():
            raise ValueError('child-identity-unverified')

    def send(self, proc, kind):
        if self.fd is None or self.expected is None or proc.pid != self.expected['pid']:
            raise ValueError('signal-owner-unverified')
        if select.select([self.fd], [], [], 0)[0]:
            return {'kind': kind, 'result': 'already-exited'}
        if identity(proc.pid) != self.expected:
            raise ValueError('signal-identity-mismatch')
        number = signal.SIGTERM if kind == 'term' else signal.SIGKILL
        signal.pidfd_send_signal(self.fd, number)
        return {'kind': kind, 'result': 'sent', 'mechanism': 'pidfd'}


async def run(config):
    if sys.platform != 'linux' or os.getuid() != 1000:
        raise ValueError('expected-linux-uid1000')
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise ValueError('pidfd-required')
    binary = Path(config['binary'])
    if binary.resolve() != binary or not binary.is_file():
        raise ValueError('binary-path-mismatch')
    if sha_file(binary) != config['binarySha256']:
        raise ValueError('binary-hash-mismatch')
    root = Path(tempfile.mkdtemp(prefix='tiye-codex-u0-', dir='/tmp'))
    os.chmod(root, 0o700)
    (root / '.owner').write_text(config['nonce'], encoding='utf-8')
    for name in ['home', 'codex-home', 'tmp', 'cwd']:
        (root / name).mkdir(mode=0o700)
    env = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'HOME': str(root / 'home'),
           'CODEX_HOME': str(root / 'codex-home'), 'TMPDIR': str(root / 'tmp')}
    previous_umask = os.umask(0o077)
    # Source is sent from the frozen host manifest; do not import ambient modules.
    namespace = {}
    exec(compile(config['transportSource'], '<frozen-u0-transport>', 'exec'), namespace)
    handshake = namespace['Handshake'](env['CODEX_HOME'])
    wire = namespace['wire']
    owner = OwnedChild()
    request = {'id': 1, 'method': 'initialize', 'params': {'clientInfo': {
        'name': 'tiye_feasibility', 'title': 'TIYE feasibility', 'version': '0.0.1'},
        'capabilities': {'experimentalApi': False}}}
    print(json.dumps({'event': 'ready', 'nonce': config['nonce'], 'root': str(root)}), flush=True)
    try:
        result, raw = await namespace['observe']([str(binary), 'app-server', '--listen', 'stdio://'], {
            'env': env, 'cwd': str(root / 'cwd'), 'seconds': 60, 'spawnSeconds': 15,
            'workSeconds': 15, 'limits': {'stdout': 4194304, 'stderr': 1048576},
            'initial': wire(request), 'second': wire({'method': 'initialized'}),
            'ready': lambda: handshake.accepted, 'allowed': handshake.reply_allowed,
            'feed': handshake.feed, 'eof': handshake.eof,
            'spawned': owner.register, 'signal': owner.send})
        result.update(root=str(root), uid=os.getuid(), gid=os.getgid(), groups=os.getgroups(),
            umaskOctal=oct(0o077), priorUmaskOctal=oct(previous_umask), env=env,
            childIdentity=owner.expected, binarySha256After=sha_file(binary),
            handshakeAccepted=handshake.accepted, handshakeFault=handshake.fault,
            treeCleanup='unverified', ambientCredentialAccess='unverified', networkIsolation=False,
            providerAuthRequests=0, modelRequests=0, routeQualified=False)
        result['binaryUnchanged'] = result['binarySha256After'] == config['binarySha256']
        return {'event': 'result', 'nonce': config['nonce'], 'observation': result,
                'rawBase64': {name: base64.b64encode(value).decode('ascii') for name, value in raw.items()}}
    finally:
        if owner.fd is not None:
            os.close(owner.fd)
        os.umask(previous_umask)


if __name__ == '__main__':
    incoming = sys.stdin.buffer.read(1048577)
    if len(incoming) > 1048576:
        raise ValueError('worker-input-budget')
    print(json.dumps(asyncio.run(run(json.loads(incoming)))), flush=True)
