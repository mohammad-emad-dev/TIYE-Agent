"""Exclusive Windows capture storage; no launcher/provider integration or raw export."""
import contextlib
import datetime
import json
import msvcrt
import os
from pathlib import Path
import re
import uuid

import winacl

FILES = {'retention.json', 'completion.json', 'stdout.bin', 'stderr.bin'}


def local_parent():
    parent = Path(os.environ['LOCALAPPDATA'])
    if not parent.is_absolute() or not re.fullmatch('[A-Za-z]:', parent.drive) or '..' in parent.parts:
        raise ValueError('local-absolute-parent-required')
    return parent


def pin_directory(stack, path):
    handle = winacl.open_directory(path)
    stack.callback(winacl.close, handle)
    if not winacl.file_information(handle).attributes & 0x10:
        raise ValueError('directory-required')
    return handle


def pin_ancestors(stack, parent):
    for path in reversed((parent,) + tuple(parent.parents)):
        pin_directory(stack, path)


def verified_descriptor(handle, owner, flags):
    try:
        security = winacl.verify_file(handle, owner)
        descriptor = msvcrt.open_osfhandle(handle, flags)
    except (OSError, ValueError):
        winacl.close(handle)
        raise
    return descriptor, security


class CaptureStore:
    def __init__(self, identity):
        if not re.fullmatch('[0-9a-f]{32}', identity):
            raise ValueError('uuid-hex-required')
        self.path = local_parent() / ('tiye-private-capture-' + identity)
        self.owner = winacl.current_sid()
        self.handles = contextlib.ExitStack()
        self.closed = False
        try:
            pin_ancestors(self.handles, self.path.parent)
            winacl.create_directory(self.path, self.owner)
            self.handle = pin_directory(self.handles, self.path)
            self.security = winacl.verify_directory(self.handle, self.owner)
        except (OSError, ValueError) as original:
            try:
                self.handles.close()
            except OSError as cleanup:
                original.add_note('capture-close-failure:' + type(cleanup).__name__)
            self.closed = True
            raise

    def new_run(self, identity):
        if self.closed or not re.fullmatch('[0-9a-f]{32}', identity):
            raise ValueError('closed-store-or-invalid-run-id')
        winacl.verify_directory(self.handle, self.owner)
        run_path = self.path / identity
        winacl.create_directory(run_path, self.owner)
        run_handle = pin_directory(self.handles, run_path)
        security = winacl.verify_directory(run_handle, self.owner)
        run = CaptureRun(self, run_path, run_handle, security)
        run.write_bytes('retention.json', json.dumps({
            'owner': 'current-user', 'purpose': 'synthetic-private-store-regression',
            'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'deletionTrigger': 'explicit-after-evidence-review',
            'uncertainOperation': True, 'completionRequiredForDeletion': True,
            'automaticDeletion': False}).encode('utf-8'))
        return run

    def close(self):
        if not self.closed:
            try:
                self.handles.close()
            finally:
                self.closed = True


class CaptureRun:
    def __init__(self, store, path, handle, security):
        self.store, self.path, self.handle, self.security = store, path, handle, security
        self.file_security = {}
        self.completed = False

    def write_bytes(self, name, payload):
        if (self.store.closed or self.completed or name not in FILES
                or not isinstance(payload, bytes) or len(payload) > 65536):
            raise ValueError('closed-run-or-invalid-payload')
        winacl.verify_directory(self.store.handle, self.store.owner)
        winacl.verify_directory(self.handle, self.store.owner)
        handle = winacl.create_file(self.path / name, self.store.owner)
        descriptor, security = verified_descriptor(handle, self.store.owner, os.O_BINARY | os.O_RDWR)
        self.file_security[name] = security
        with os.fdopen(descriptor, 'w+b') as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())

    def record_completed_child(self, child):
        if child.returncode is None or child.returncode != 0:
            raise ValueError('successful-child-completion-required')
        self.write_bytes('completion.json', json.dumps({
            'scope': 'local-synthetic-child', 'returnCode': child.returncode}).encode('utf-8'))
        self.completed = True

    def read_bytes(self, name):
        if self.store.closed or name not in FILES:
            raise ValueError('closed-run-or-invalid-file')
        winacl.verify_directory(self.store.handle, self.store.owner)
        winacl.verify_directory(self.handle, self.store.owner)
        handle = winacl.open_file(self.path / name)
        descriptor, unused_security = verified_descriptor(handle, self.store.owner, os.O_BINARY | os.O_RDONLY)
        with os.fdopen(descriptor, 'rb') as stream:
            payload = stream.read(65537)
        if len(payload) > 65536:
            raise ValueError('capture-file-budget')
        return payload


def create_store():
    return CaptureStore(uuid.uuid4().hex)


def verify_deletion_records(run):
    retention = json.loads(run.read_bytes('retention.json'))
    if retention['completionRequiredForDeletion'] is not True or not (run.path / 'completion.json').exists():
        raise ValueError('uncertain-capture-must-be-retained')
    completion = json.loads(run.read_bytes('completion.json'))
    if (completion != {'scope': 'local-synthetic-child', 'returnCode': 0}
            or type(completion['returnCode']) is not int):
        raise ValueError('successful-completion-record-required')


def delete_reviewed_run(run):
    if run.store.closed:
        raise ValueError('store-must-be-live-for-review')
    winacl.verify_directory(run.handle, run.store.owner)
    verify_deletion_records(run)
    if {path.name for path in run.path.iterdir()} - FILES:
        raise ValueError('unexpected-capture-file')
    for path in run.path.iterdir():
        if path.is_symlink() or path.is_junction() or not path.is_file():
            raise ValueError('unexpected-capture-file-type')
    for name in ('stdout.bin', 'stderr.bin', 'completion.json', 'retention.json'):
        path = run.path / name
        if path.exists():
            path.unlink()
    # The pinned run directory stays until the caller closes the store.
    return {'filesDeleted': True, 'directoryRetainedUntilClose': True}
