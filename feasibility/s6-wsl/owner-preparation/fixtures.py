"""Owned synthetic actors used only by the Linux integration tests."""
import array
import base64
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid

from authority import PeerPin, StoppedWriters, group_events, signaled
from owner import OwnerContext, PreparationOwner
from prepare import DIRECTORY_FLAGS
from protocol import EVENT

WORKER = '''import os,subprocess,sys
fd=os.open('cgroup.procs',os.O_WRONLY,dir_fd=int(sys.argv[1]))
os.write(fd,str(os.getpid()).encode());os.close(fd)
leaf=subprocess.Popen([sys.executable,'-I','-S','-B','-c','import time;time.sleep(40)'],start_new_session=True)
print(leaf.pid,flush=True)
sys.stdin.buffer.readline()
'''


def wait_empty(group_fd):
    deadline = time.monotonic() + 2
    while group_events(group_fd)['populated']:
        if time.monotonic() >= deadline:
            raise TimeoutError('fixture-group-did-not-empty')
        time.sleep(0.01)


class Workers:
    def __init__(self, group_fd):
        self.child = subprocess.Popen([sys.executable, '-I', '-S', '-B', '-c', WORKER, str(group_fd)],
            pass_fds=(group_fd,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.main = os.pidfd_open(self.child.pid)
        self.leaf = None
        if not select.select([self.child.stdout], [], [], 2)[0]:
            self.close()
            raise TimeoutError('fixture-worker-readiness')
        try:
            leaf_pid = int(self.child.stdout.readline(32))
            self.leaf = os.pidfd_open(leaf_pid)
        except (ValueError, OSError):
            self.close()
            raise

    def end_parent(self):
        self.child.stdin.write(b'exit\n')
        self.child.stdin.flush()
        self.child.wait(timeout=2)

    def stop(self):
        for descriptor in (self.main, self.leaf):
            if descriptor is not None and not signaled(descriptor):
                signal.pidfd_send_signal(descriptor, signal.SIGKILL)
        self.child.wait(timeout=2)
        for descriptor in (self.main, self.leaf):
            if descriptor is not None and not select.select([descriptor], [], [], 2)[0]:
                raise TimeoutError('fixture-worker-not-ended')

    def close(self):
        self.stop()
        for descriptor in (self.main, self.leaf):
            if descriptor is not None:
                os.close(descriptor)
        for stream in (self.child.stdin, self.child.stdout, self.child.stderr):
            stream.close()


def client_main(descriptor):
    with socket.socket(fileno=descriptor) as control:
        while command := control.recv(65536):
            request = json.loads(command)
            if request == {'event': 'quit'}:
                return
            with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as peer:
                peer.settimeout(4)
                peer.connect(request['address'])
                control.send(b'connected')
                if control.recv(32) != b'send':
                    raise ValueError('fixture-client-send-command')
                payload = base64.b64decode(request['payload'], validate=True)
                if request.get('inherit'):
                    sender = os.fork()
                    if sender == 0:
                        peer.send(payload)
                        os._exit(0)
                elif request.get('rights'):
                    with open('/dev/null', 'rb') as extra:
                        rights = array.array('i', [extra.fileno()] * request['rights'])
                        peer.sendmsg([payload], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, rights)])
                else:
                    peer.send(payload)
                try:
                    response = peer.recv(20000)
                except ConnectionResetError:
                    response = b''
                if request.get('inherit'):
                    os.waitpid(sender, 0)
                control.send(base64.b64encode(response))


class Client:
    def __init__(self):
        self.control, remote = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        self.control.settimeout(4)
        source = Path(__file__).parent
        imports = [str(source), str(source.parent / 'export-preparation'), str(source.parent / 'export-grant')]
        bootstrap = ('import sys;sys.path[:0]=' + repr(imports) + ';'
                     'from fixtures import client_main;client_main(' + str(remote.fileno()) + ')')
        self.child = subprocess.Popen([sys.executable, '-I', '-S', '-B', '-c', bootstrap],
            pass_fds=(remote.fileno(),), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE)
        remote.close()
        self.pin = PeerPin(self.child.pid)

    def begin(self, listener, payload, **options):
        self.control.send(json.dumps({'address': listener.getsockname().decode('ascii'),
            'payload': base64.b64encode(payload).decode(), **options}).encode())
        if self.control.recv(32) != b'connected':
            raise ValueError('fixture-client-not-connected')
        peer = listener.accept()[0]
        self.control.send(b'send')
        return peer

    def response(self):
        return base64.b64decode(self.control.recv(30000), validate=True)

    def close(self):
        if self.child.poll() is None:
            signal.pidfd_send_signal(self.pin.descriptor, signal.SIGKILL)
        self.child.wait(timeout=2)
        self.pin.close()
        self.child.stderr.close()
        self.control.close()


class Fixture:
    def __init__(self, stack):
        self.stack = stack
        self.source = Path(stack.enter_context(tempfile.TemporaryDirectory(dir='/dev/shm', prefix='tiye-owner-')))
        self.destination = Path(stack.enter_context(tempfile.TemporaryDirectory(dir='/tmp', prefix='tiye-owner-')))
        group_path = Path('/sys/fs/cgroup') / Path('/proc/self/cgroup').read_text().strip().split('::', 1)[1].lstrip('/')
        if not group_path.name.startswith('tiye-owner-preparation-') or not group_path.name.endswith('.service'):
            raise ValueError('fixture-outside-own-delegated-service')
        self.group = group_path / ('writers-' + uuid.uuid4().hex)
        self.group.mkdir()
        stack.callback(self.group.rmdir)
        self.group_fd = self.directory(self.group)
        stack.callback(wait_empty, self.group_fd)
        self.source_fd, self.destination_fd = self.directory(self.source), self.directory(self.destination)
        (self.source / 'alpha.txt').write_bytes(b'alpha')
        (self.source / 'alpha.txt').chmod(0o600)
        self.workers = self.spawn_workers()
        self.client = self.new_client()
        self.listener = stack.enter_context(socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET))
        self.listener.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
        self.listener.bind('\0tiye-owner-preparation-' + uuid.uuid4().hex)
        self.listener.listen(4)
        self.listener.settimeout(2)

    def directory(self, path):
        descriptor = os.open(path, DIRECTORY_FLAGS)
        self.stack.callback(os.close, descriptor)
        return descriptor

    def spawn_workers(self):
        workers = Workers(self.group_fd)
        self.stack.callback(workers.close)
        return workers

    def new_client(self):
        client = Client()
        self.stack.callback(client.close)
        return client

    def owner(self, worker_fds):
        stopped = StoppedWriters(self.stack, self.group_fd, worker_fds)
        context = OwnerContext('1' * 32, 1, '2' * 32, self.client.pin, stopped)
        owner = PreparationOwner(self.source_fd, self.destination_fd, context)
        self.stack.callback(owner.close)
        return owner

    def request(self, **changes):
        return json.dumps({'event': EVENT, 'session': '1' * 32, 'generation': 1,
            'ownerEpoch': '2' * 32, 'nonce': uuid.uuid4().hex, 'paths': ['alpha.txt'],
            'byteBudget': 131072, 'validForSeconds': 30, **changes}).encode()
