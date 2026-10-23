"""Read-only owner request boundary; no persistent or export authority."""
from contextlib import ExitStack
from dataclasses import dataclass
import os
import socket
import threading

from prepare import DIRECTORY_FLAGS, open_owned, prepare
from protocol import Deadline, receive, selection_request
from request import Binding, require


def directory_identity(descriptor):
    metadata = os.fstat(descriptor)
    return metadata.st_dev, metadata.st_ino


@dataclass(frozen=True)
class OwnerContext:
    session: str
    generation: int
    owner_epoch: str
    requester: object
    writers: object


class PreparationOwner:
    def __init__(self, source_fd, destination_fd, context):
        self._opened = ExitStack()
        self._lock = threading.Lock()
        self._closed = False
        self._nonces = set()
        self.context = context
        try:
            self.source = open_owned(self._opened, source_fd, '.', DIRECTORY_FLAGS)
            self.destination = open_owned(self._opened, destination_fd, '.', DIRECTORY_FLAGS)
            self.binding = Binding(context.session, context.generation, context.owner_epoch,
                                   directory_identity(self.source), directory_identity(self.destination))
        except (OSError, ValueError):
            self._opened.close()
            raise

    def custody(self):
        require(directory_identity(self.source) == self.binding.source
                and directory_identity(self.destination) == self.binding.destination,
                'owner-root-custody-drift')
        self.context.writers.verify()

    def manifest(self, peer, deadline):
        self.context.requester.authenticate(peer)
        specification = selection_request(receive(peer, self.context.requester, deadline), self.binding)
        self.context.requester.authenticate(peer)
        require(specification.nonce not in self._nonces and len(self._nonces) < 64,
                'owner-replayed-request-or-lifetime-limit')
        # A recognized request stays spent even if subsequent custody or I/O fails.
        self._nonces.add(specification.nonce)
        self.custody()
        deadline.remaining()
        payload = prepare(self.source, self.destination, specification)
        self.custody()
        self.context.requester.authenticate(peer)
        deadline.remaining()
        return payload

    def serve_once(self, peer):
        deadline = Deadline()
        require(self._lock.acquire(timeout=deadline.remaining()), 'owner-lock-deadline')
        try:
            require(not self._closed, 'owner-closed')
            payload = self.manifest(peer, deadline)
            peer.settimeout(deadline.remaining())
            require(peer.send(payload, socket.MSG_NOSIGNAL) == len(payload), 'owner-short-reply')
        finally:
            self._lock.release()

    def close(self):
        with self._lock:
            if not self._closed:
                self._closed = True
                self._opened.close()
