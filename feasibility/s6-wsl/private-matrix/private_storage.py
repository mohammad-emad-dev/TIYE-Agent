"""Compose the frozen Windows ACL helper with a new launcher retention contract."""
import datetime
import hashlib
import json
import msvcrt
import os
import re
import uuid

import contract
import store
import winacl


def validate_file_security(observed):
    expected_roles = ('current-user', 'system', 'administrators')
    flags = 0 if observed['daclProtected'] else 16
    expected = {'ownerMatchesCurrentToken': True, 'directory': False, 'daclPresent': True,
                'daclProtected': observed['daclProtected'],
                'aces': [{'role': role, 'mask': 0x1f01ff, 'flags': flags} for role in expected_roles]}
    if observed != expected:
        raise ValueError('private-artifact-permissions-mismatch')


def file_observation(path, owner):
    handle = winacl.open_file(path)
    try:
        security = winacl.snapshot(handle, owner)
        validate_file_security(security)
        metadata = winacl.file_information(handle)
        size = (metadata.sizeHigh << 32) | metadata.sizeLow
        if size > contract.PER_FILE:
            raise ValueError('private-file-budget-exceeded')
        descriptor = msvcrt.open_osfhandle(handle, os.O_BINARY | os.O_RDONLY)
    except (OSError, ValueError):
        winacl.close(handle)
        raise
    with os.fdopen(descriptor, 'rb') as stream:
        payload = stream.read(contract.PER_FILE + 1)
    if len(payload) != size:
        raise ValueError('private-file-changed-during-audit')
    return {'bytes': size, 'sha256': hashlib.sha256(payload).hexdigest(), 'security': security}


class PrivateRun:
    def __init__(self, mode, fingerprint):
        if mode not in contract.MODES or not re.fullmatch('[0-9a-f]{64}', fingerprint):
            raise ValueError('mode-or-fingerprint-not-qualified')
        self.storage = store.create_store()
        try:
            self.mode, self.fingerprint = mode, fingerprint
            self.path = self.storage.path / uuid.uuid4().hex
            winacl.create_directory(self.path, self.storage.owner)
            self.handle = store.pin_directory(self.storage.handles, self.path)
            self.security = winacl.verify_directory(self.handle, self.storage.owner)
            self.intent_digest = self.write_record('retention.json', {'purpose': 'private-mock-launcher', 'owner': 'current-user',
                'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'launchIntent': True, 'sourceSetSha256': fingerprint,
                'delivery': 'unknown', 'retentionRequired': True, 'automaticDeletion': False,
                'deletionTrigger': 'separate-explicit-review-not-implemented'})
        except (OSError, ValueError) as original:
            try:
                self.storage.close()
            except OSError as cleanup:
                original.add_note('private-storage-close:' + type(cleanup).__name__)
            raise

    def verify_before_spawn(self):
        winacl.verify_directory(self.storage.handle, self.storage.owner)
        winacl.verify_directory(self.handle, self.storage.owner)
        receipt = file_observation(self.path / 'retention.json', self.storage.owner)
        if receipt['sha256'] != self.intent_digest:
            raise ValueError('private-intent-changed')
        return {'rootVerified': True, 'runVerified': True, 'intentVerified': True}

    def write_record(self, name, record):
        if name not in contract.PRIVATE:
            raise ValueError('private-record-name-not-allowed')
        payload = json.dumps(record, indent=2, allow_nan=False).encode('utf-8')
        if len(payload) > contract.PER_FILE:
            raise ValueError('private-record-budget-exceeded')
        handle = winacl.create_file(self.path / name, self.storage.owner)
        descriptor, unused_security = store.verified_descriptor(handle, self.storage.owner, os.O_BINARY | os.O_RDWR)
        with os.fdopen(descriptor, 'w+b') as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        return hashlib.sha256(payload).hexdigest()

    def audit_before_manifest(self):
        return self._audit(contract.filenames(self.mode) - {'storage-audit.json'})

    def audit(self):
        return self._audit(contract.filenames(self.mode))

    def _audit(self, expected_names):
        winacl.verify_directory(self.handle, self.storage.owner)
        names = {path.name for path in self.path.iterdir()}
        if names != expected_names:
            raise ValueError('private-artifact-inventory-mismatch')
        observed = {name: file_observation(self.path / name, self.storage.owner) for name in sorted(names)}
        if sum(row['bytes'] for row in observed.values()) > contract.PER_CASE:
            raise ValueError('private-case-budget-exceeded')
        return observed

    def close(self):
        self.storage.close()
