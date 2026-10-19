"""Exclusive protected control records; partial publications are never accepted."""
import json
import os
import re

import composition
from resources import writer

ALLOWED = {'collector': {'release.json'}, 'worker': {'intent.json', 'ready.json', 'result.json'}}


class PublicationPending(Exception):
    """An exclusive publisher still owns the file; only this sharing race retries."""


def unique_members(pairs):
    record = {}
    for name, field in pairs:
        if name in record:
            raise ValueError('duplicate-control-member')
        record[name] = field
    return record


def reject_constant(name):
    raise ValueError('nonfinite-control-number')


def parameters(mode, nonce, binding):
    if mode not in composition.MODES or not re.fullmatch('[0-9a-f]{32}', nonce):
        raise ValueError('fixed-mode-and-nonce-required')
    if binding != composition.fingerprint():
        raise ValueError('composition-source-drift')


class ControlRecords:
    def __init__(self, storage, budget, nonce):
        self.storage, self.budget, self.nonce = storage, budget, nonce

    def write(self, name, record):
        if name not in ALLOWED[self.budget.role]:
            raise ValueError('control-owner-or-name')
        payload = writer.encode(record | {'nonce': self.nonce, 'composition': composition.fingerprint()})
        if len(payload) > writer.CHUNK:
            raise ValueError('control-record-cap')
        self.budget.charge('controller', len(payload))
        writer.winacl.verify_directory(self.storage.handle, self.storage.owner)
        handle = writer.winacl.create_file(self.storage.path / name, self.storage.owner)
        fd, _ = writer.store.verified_descriptor(handle, self.storage.owner, os.O_BINARY | os.O_RDWR)
        try:
            if os.write(fd, payload) != len(payload):
                raise OSError('short-control-write')
            os.fsync(fd)
            os.lseek(fd, 0, os.SEEK_SET)
            if os.read(fd, len(payload) + 1) != payload:
                raise ValueError('control-readback')
        finally:
            os.close(fd)

    def read(self, name):
        if name not in set.union(*ALLOWED.values()):
            raise ValueError('unknown-control-name')
        writer.winacl.verify_directory(self.storage.handle, self.storage.owner)
        try:
            handle = writer.winacl.open_file(self.storage.path / name)
        except PermissionError as error:
            if error.winerror == 32:
                raise PublicationPending('exclusive-publication-in-progress') from error
            raise
        fd, _ = writer.store.verified_descriptor(handle, self.storage.owner, os.O_BINARY | os.O_RDONLY)
        with os.fdopen(fd, 'rb') as stream:
            stat = os.fstat(stream.fileno())
            if stat.st_size > writer.CHUNK or stat.st_nlink != 1:
                raise ValueError('control-record-cap')
            payload = stream.read(writer.CHUNK + 1)
        record = json.loads(payload, object_pairs_hook=unique_members, parse_constant=reject_constant)
        if (type(record) is not dict or record.get('nonce') != self.nonce
                or record.get('composition') != composition.fingerprint()):
            raise ValueError('control-binding')
        return record
