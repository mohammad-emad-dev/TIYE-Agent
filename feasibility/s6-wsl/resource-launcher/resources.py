"""Single-process persistence authority for a synthetic Windows composition."""
import hashlib
import os
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
sys.path[:0] = [str(SOURCE.parent / 'native-preflight'), str(SOURCE.parent / 'stream-writer')]
import policy
import writer

NAMES = {'controller': {'attempt.json', 'outcome.json'},
         'observer': {'stdout.bin', 'stderr.bin'}}


class BudgetCapture(writer.StreamCapture):
    def __init__(self, budget):
        self.budget = budget
        super().__init__()

    def _metadata(self, name, record):
        # Includes retention during allocation, before any child can start.
        self.budget.charge('stream', len(writer.encode(record)))
        super()._metadata(name, record)


class MetadataFiles:
    """Exclusive held descriptors; one owner per write, including failed writes."""
    def __init__(self, capture, budget):
        self.capture, self.budget = capture, budget
        self.fds = {}
        self.directories = {}
        self.sealed = False
        self.hashes = {}
        self.sizes = {owner: 0 for owner in NAMES}
        try:
            self._allocate()
        except (OSError, ValueError):
            self.close()
            raise

    def _allocate(self):
        storage = self.capture.storage
        for owner, names in NAMES.items():
            directory = storage.path / owner
            writer.winacl.create_directory(directory, storage.owner)
            self.directories[owner] = writer.store.pin_directory(storage.handles, directory)
            for name in sorted(names):
                handle = writer.winacl.create_file(directory / name, storage.owner)
                fd, _ = writer.store.verified_descriptor(handle, storage.owner, os.O_BINARY | os.O_RDWR)
                self.fds[owner, name] = fd
                self.hashes[owner, name] = hashlib.sha256()

    def write(self, owner, name, payload):
        if (self.sealed or (owner, name) not in self.fds or type(payload) is not bytes
                or len(payload) > writer.CHUNK):
            raise ValueError('unknown-closed-file-or-oversize-chunk')
        self.budget.charge(owner, len(payload))
        count = os.write(self.fds[owner, name], payload)
        self.sizes[owner] += count
        self.hashes[owner, name].update(payload[:count])
        if count != len(payload):
            raise OSError('short-metadata-write')

    def audit(self):
        """Flush and independently read held files; no unbounded readback buffer."""
        self.sealed = True
        self._verify_inventory()
        sizes = {owner: 0 for owner in NAMES}
        for key, fd in self.fds.items():
            sizes[key[0]] += self._readback(key, fd)
        if sizes != self.sizes:
            raise ValueError('metadata-size-drift')
        sizes['stream'] = self.capture.metadata_bytes
        policy.audit_metadata_sizes(sizes)
        return sizes

    def _verify_inventory(self):
        self.capture._verify()
        self.capture._verify_metadata()
        for name in writer.LIMITS:
            self.capture._readback(name)
        expected = writer.FILES if self.capture.completed else writer.FILES - {'completion.json'}
        if {path.name for path in self.capture.path.iterdir()} != expected:
            raise ValueError('stream-inventory-drift')
        if {path.name for path in self.capture.storage.path.iterdir()} != {
                self.capture.path.name, *NAMES}:
            raise ValueError('root-inventory-drift')
        for owner, handle in self.directories.items():
            writer.winacl.verify_directory(handle, self.capture.storage.owner)
            directory = self.capture.storage.path / owner
            if {path.name for path in directory.iterdir()} != NAMES[owner]:
                raise ValueError('metadata-inventory-drift')

    def _readback(self, key, fd):
        handle = writer.msvcrt.get_osfhandle(fd)
        writer.winacl.verify_file(handle, self.capture.storage.owner)
        if writer.winacl.file_information(handle).links != 1:
            raise ValueError('linked-metadata-file')
        os.fsync(fd)
        size = os.fstat(fd).st_size
        os.lseek(fd, 0, os.SEEK_SET)
        digest = hashlib.sha256()
        remaining = size
        while remaining:
            block = os.read(fd, min(writer.CHUNK, remaining))
            if not block:
                raise ValueError('metadata-readback-eof')
            digest.update(block)
            remaining -= len(block)
        if digest.digest() != self.hashes[key].digest():
            raise ValueError('metadata-content-drift')
        return size

    def close(self):
        error = None
        for fd in self.fds.values():
            try:
                os.close(fd)
            except OSError as current:
                error = error or current
        self.fds.clear()
        if error:
            raise error
