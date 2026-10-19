"""Windows private bounded byte capture; no process management or native admission."""
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import sys
import threading
import uuid

HELPERS = Path(__file__).resolve().parents[1] / 'private-capture-store'
sys.path.insert(0, str(HELPERS))
import store
import winacl

CHUNK = 16384
RECORD = 262144
LIMITS = {'stdout': 4194304, 'stderr': 1048576}
METADATA = 1048576
FILES = {'retention.json', 'stdout.bin', 'stderr.bin', 'completion.json'}


def encode(record):
    return json.dumps(record, sort_keys=True, allow_nan=False).encode('utf-8')


class StreamCapture:
    """Two trusted producers feed chunks; first fault revokes persistence globally."""
    def __init__(self):
        self._initialize()
        self.storage = store.create_store()
        try:
            self._allocate()
        except (OSError, ValueError) as error:
            self._fault('allocation-failure')
            try:
                self.close()
            except OSError as cleanup:
                error.add_note('close-failure:' + type(cleanup).__name__)
            raise

    def _initialize(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.fault = None
        self.completed = False
        self.closed = False
        self.fds = {}
        self.metadata_bytes = 0
        self.metadata_hashes = {}
        self.line_bytes = 0
        self.rows = {name: {'seen': 0, 'retained': 0, 'discarded': 0, 'uncertain': 0, 'eof': False}
                     for name in LIMITS}
        self.hashes = {name: hashlib.sha256() for name in LIMITS}

    def _allocate(self):
        self.path = self.storage.path / uuid.uuid4().hex
        winacl.create_directory(self.path, self.storage.owner)
        self.handle = store.pin_directory(self.storage.handles, self.path)
        self._metadata('retention.json', {'scope': 'bounded-byte-storage-only',
            'uncertain': True, 'automaticDeletion': False,
            'deletionPolicy': 'separate-review-not-implemented'})
        for name in LIMITS:
            self._create(name + '.bin')
        self.verify_allocated()

    def _fault(self, reason):
        if self.fault is None:
            self.fault = reason
        self.stop.set()

    def _create(self, name):
        handle = winacl.create_file(self.path / name, self.storage.owner)
        descriptor, _security = store.verified_descriptor(handle, self.storage.owner,
                                                         os.O_BINARY | os.O_RDWR)
        self.fds[name] = descriptor
        return descriptor

    def _verify(self):
        winacl.verify_directory(self.storage.handle, self.storage.owner)
        winacl.verify_directory(self.handle, self.storage.owner)
        for fd in self.fds.values():
            handle = msvcrt.get_osfhandle(fd)
            winacl.verify_file(handle, self.storage.owner)
            if winacl.file_information(handle).links != 1:
                raise ValueError('linked-capture-file')

    def _metadata(self, name, record):
        payload = encode(record)
        if len(payload) + self.metadata_bytes > METADATA:
            raise ValueError('metadata-budget')
        fd = self._create(name)
        count = os.write(fd, payload)
        self.metadata_bytes += count
        if count != len(payload):
            raise OSError('short-metadata-write')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        if os.read(fd, len(payload) + 1) != payload:
            raise ValueError('metadata-readback')
        self.metadata_hashes[name] = (len(payload), hashlib.sha256(payload).digest())

    def _verify_metadata(self):
        for name, (size, expected) in self.metadata_hashes.items():
            fd = self.fds[name]
            if os.fstat(fd).st_size != size:
                raise ValueError('metadata-size-drift')
            os.lseek(fd, 0, os.SEEK_SET)
            observed = hashlib.sha256()
            remaining = size
            while remaining:
                payload = os.read(fd, min(CHUNK, remaining))
                if not payload:
                    raise ValueError('metadata-readback-eof')
                observed.update(payload)
                remaining -= len(payload)
            if observed.digest() != expected:
                raise ValueError('metadata-content-drift')

    def verify_allocated(self):
        self._verify()
        if {path.name for path in self.path.iterdir()} != FILES - {'completion.json'}:
            raise ValueError('allocation-inventory')
        return {'protectedBeforeFeed': True, 'rawFilesEmpty': all(
            os.fstat(self.fds[name + '.bin']).st_size == 0 for name in LIMITS)}

    def _record_prefix(self, payload):
        offset = 0
        while offset < len(payload):
            end = payload.find(b'\n', offset)
            stop = len(payload) if end == -1 else end
            available = RECORD - self.line_bytes
            if stop - offset > available:
                self.line_bytes = RECORD
                return offset + available, True
            self.line_bytes += stop - offset
            if end == -1:
                return len(payload), False
            self.line_bytes = 0
            offset = end + 1
        return len(payload), False

    def feed(self, name, payload):
        if name not in LIMITS or not isinstance(payload, bytes) or len(payload) > CHUNK:
            raise ValueError('stream-or-chunk-budget')
        with self.lock:
            if self.closed or self.completed or self.rows[name]['eof']:
                raise ValueError('closed-completed-or-eof-stream')
            row = self.rows[name]
            row['seen'] += len(payload)
            if self.fault is not None:
                row['discarded'] += len(payload)
                return
            self._feed_active(name, payload)

    def _persist(self, name, payload):
        if not payload:
            return 0, 0, None
        try:
            count = os.write(self.fds[name + '.bin'], payload)
        except OSError:
            return 0, len(payload), 'write-error'
        return count, 0, 'short-write' if count != len(payload) else None

    def _feed_active(self, name, payload):
        row = self.rows[name]
        allowed = min(len(payload), LIMITS[name] - row['retained'])
        reason = 'stream-overflow' if allowed < len(payload) else None
        if name == 'stdout':
            record_allowed, overflow = self._record_prefix(payload[:allowed])
            allowed = min(allowed, record_allowed)
            if overflow:
                reason = 'record-overflow'
        written, uncertain, write_fault = self._persist(name, payload[:allowed])
        row['retained'] += written
        row['uncertain'] += uncertain
        self.hashes[name].update(payload[:written])
        row['discarded'] += len(payload) - written - uncertain
        if write_fault or reason:
            self._fault(write_fault or reason)

    def eof(self, name):
        with self.lock:
            if name not in LIMITS or self.closed or self.completed or self.rows[name]['eof']:
                raise ValueError('invalid-eof')
            self.rows[name]['eof'] = True

    def reader_failed(self, name):
        with self.lock:
            if name not in LIMITS or self.closed or self.completed:
                raise ValueError('invalid-reader-failure')
            self._fault('reader-failure')

    def _readback(self, name):
        fd = self.fds[name + '.bin']
        os.fsync(fd)
        if os.fstat(fd).st_size != self.rows[name]['retained']:
            raise ValueError('capture-size-drift')
        os.lseek(fd, 0, os.SEEK_SET)
        observed = hashlib.sha256()
        remaining = self.rows[name]['retained']
        while remaining:
            payload = os.read(fd, min(CHUNK, remaining))
            if not payload:
                raise ValueError('capture-readback-eof')
            observed.update(payload)
            remaining -= len(payload)
        if observed.digest() != self.hashes[name].digest():
            raise ValueError('capture-readback-hash')

    def finish(self):
        with self.lock:
            if self.closed or self.completed or self.fault or not all(row['eof'] for row in self.rows.values()):
                raise ValueError('incomplete-or-faulted-capture')
            try:
                self._finalize()
                self.completed = True
            except (OSError, ValueError):
                self._fault('finalization-failure')
                raise

    def _finalize(self):
        self._verify()
        if {path.name for path in self.path.iterdir()} != FILES - {'completion.json'}:
            raise ValueError('unexpected-inventory')
        for name in LIMITS:
            self._readback(name)
        self._verify_metadata()
        self._metadata('completion.json', {'scope': 'synchronous-byte-storage-only',
            'streams': {name: {'bytes': self.rows[name]['retained'],
                              'sha256': self.hashes[name].hexdigest()} for name in LIMITS},
            'providerTaskQualified': False, 'processCleanupQualified': False})
        self._verify()
        self._verify_metadata()
        if {path.name for path in self.path.iterdir()} != FILES:
            raise ValueError('completion-inventory')

    def snapshot(self):
        with self.lock:
            return {'scope': 'byte-writer-only', 'completed': self.completed,
                    'fault': self.fault, 'stopRequested': self.stop.is_set(),
                    'streams': {name: dict(row) for name, row in self.rows.items()},
                    'metadataBytes': self.metadata_bytes}

    def close(self):
        with self.lock:
            if self.closed:
                return
            error = self._close_files()
            try:
                self.storage.close()
            except OSError as current:
                error = error or current
            self.closed = True
            if error:
                self.completed = False
                self._fault('close-failure')
                raise error

    def _close_files(self):
        error = None
        for fd in self.fds.values():
            try:
                os.close(fd)
            except OSError as current:
                error = error or current
        self.fds.clear()
        return error
