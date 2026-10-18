"""Synthetic Linux storage transactions; no provider or launcher integration."""
import hashlib
import json
import os
import re
import stat

PAYLOADS = ("stdout.bin", "stderr.bin")
FILES = {*PAYLOADS, "retention.json", "completion.json", "deletion.json"}
FILE_LIMIT = 65536
TOTAL_LIMIT = 98304
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def encode(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fingerprint(metadata):
    return {"device": metadata.st_dev, "inode": metadata.st_ino,
            "uid": metadata.st_uid, "gid": metadata.st_gid,
            "mode": stat.S_IMODE(metadata.st_mode), "links": metadata.st_nlink,
            "bytes": metadata.st_size}


def check_directory(descriptor, mode):
    metadata = os.fstat(descriptor)
    if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != mode or os.listxattr(descriptor)):
        raise ValueError("owned-directory-mode-required")
    return {"device": metadata.st_dev, "inode": metadata.st_ino}


class Capture:
    def __init__(self, parent, identity, create=False):
        if os.geteuid() == 0 or not re.fullmatch("[0-9a-f]{32}", identity):
            raise ValueError("nonroot-owner-and-uuid-required")
        self.parent = os.dup(parent)
        self.directory = None
        self.identity, self.writable, self.faulted = identity, create, False
        try:
            metadata = os.fstat(self.parent)
            if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.geteuid():
                raise ValueError("owned-parent-required")
            if create:
                os.mkdir(identity, 0o700, dir_fd=self.parent)
                os.fsync(self.parent)
            self.directory = os.open(identity, DIRECTORY_FLAGS, dir_fd=self.parent)
            self.directory_identity = check_directory(self.directory, 0o700)
            if create:
                self._write("retention.json", encode({
                    "schema": "tiye-linux-synthetic-retention-v1", "run": identity,
                    "uncertain": True, "automaticDeletion": False,
                    "completionScope": "synchronous-storage-only"}))
        except (OSError, ValueError):
            self.close()
            raise

    def close(self):
        if self.directory is not None:
            os.close(self.directory)
            self.directory = None
        if self.parent is not None:
            os.close(self.parent)
            self.parent = None

    def _directory(self):
        if self.directory is None or check_directory(self.directory, 0o700) != self.directory_identity:
            raise ValueError("closed-or-replaced-directory")

    def _write(self, name, payload):
        self._directory()
        descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
                             | os.O_CLOEXEC, 0o600, dir_fd=self.directory)
        try:
            self._file_metadata(descriptor)
            remaining = memoryview(payload)
            while remaining:
                written = os.write(descriptor, remaining)
                if written <= 0:
                    raise OSError("short-storage-write")
                remaining = remaining[written:]
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.fsync(self.directory)

    def _file_metadata(self, descriptor):
        metadata = os.fstat(descriptor)
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_nlink != 1
                or metadata.st_size > FILE_LIMIT):
            raise ValueError("file-owner-type-mode-link-or-budget")
        # Extended ACLs/capability xattrs are outside this prototype's accepted files.
        if os.listxattr(descriptor):
            raise ValueError("extended-attributes-not-supported")
        return metadata

    def read(self, name):
        if name not in FILES:
            raise ValueError("fixed-file-required")
        self._directory()
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
                             | os.O_CLOEXEC, dir_fd=self.directory)
        try:
            before = self._file_metadata(descriptor)
            chunks, count = [], 0
            while True:
                chunk = os.read(descriptor, 8192)
                if not chunk:
                    break
                chunks.append(chunk)
                count += len(chunk)
                if count > FILE_LIMIT:
                    raise ValueError("read-budget")
            after = self._file_metadata(descriptor)
            if (fingerprint(before) != fingerprint(after)
                    or before.st_mtime_ns != after.st_mtime_ns
                    or before.st_ctime_ns != after.st_ctime_ns):
                raise ValueError("file-changed-during-read")
            return b"".join(chunks), fingerprint(after)
        finally:
            os.close(descriptor)

    def write(self, name, payload):
        if not self.writable or self.faulted or name not in PAYLOADS or type(payload) is not bytes:
            raise ValueError("closed-transaction-or-invalid-payload")
        sizes = sum(self.read(existing)[1]["bytes"] for existing in PAYLOADS
                    if existing in os.listdir(self.directory))
        if len(payload) > FILE_LIMIT or sizes + len(payload) > TOTAL_LIMIT:
            raise ValueError("payload-budget")
        try:
            self._write(name, payload)
        except (OSError, ValueError):
            self.faulted = True
            raise

    def _entry(self, name):
        payload, metadata = self.read(name)
        return {"sha256": hashlib.sha256(payload).hexdigest(), "metadata": metadata}

    def seal(self):
        """Seal completed synchronous writes; this asserts no child/process completion."""
        if not self.writable or self.faulted:
            raise ValueError("uncertain-storage-transaction")
        names = set(os.listdir(self.directory))
        if names != {"retention.json", *PAYLOADS}:
            raise ValueError("complete-fixed-payload-set-required")
        entries = {name: self._entry(name) for name in sorted(names)}
        self.writable = False
        self._write("completion.json", encode({"scope": "synchronous-storage-only",
                    "directory": self.directory_identity, "entries": entries}))

    def _completion(self, expected):
        payload, unused_metadata = self.read("completion.json")
        digest = hashlib.sha256(payload).hexdigest()
        if expected is not None and digest != expected:
            raise ValueError("reviewed-completion-changed")
        completion = json.loads(payload)
        if (set(completion) != {"scope", "directory", "entries"}
                or completion["scope"] != "synchronous-storage-only"
                or completion["directory"] != self.directory_identity
                or set(completion["entries"]) != {"retention.json", *PAYLOADS}):
            raise ValueError("invalid-storage-completion")
        return completion, digest

    def _remaining(self, completion, resuming):
        names = set(os.listdir(self.directory))
        allowed = {"retention.json", "completion.json", *PAYLOADS}
        if resuming:
            allowed.add("deletion.json")
        if names - allowed or not {"retention.json", "completion.json"} <= names:
            raise ValueError("unexpected-or-missing-capture-entry")
        for name, expected in completion["entries"].items():
            if name not in names and resuming and name in PAYLOADS:
                continue
            if name not in names or self._entry(name) != expected:
                raise ValueError("capture-entry-changed")

    def review(self):
        completion, digest = self._completion(None)
        self._remaining(completion, False)
        return digest

    def delete_reviewed(self, expected):
        """Iterate progress to completion; interruption preserves a bounded resume path."""
        if type(expected) is not str or not re.fullmatch("[0-9a-f]{64}", expected):
            raise ValueError("explicit-review-digest-required")
        completion, digest = self._completion(expected)
        resuming = "deletion.json" in os.listdir(self.directory)
        self._remaining(completion, resuming)
        intent = {"scope": "explicit-reviewed-delete", "completionSha256": digest}
        if resuming:
            if self.read("deletion.json")[0] != encode(intent):
                raise ValueError("deletion-intent-changed")
        else:
            self._write("deletion.json", encode(intent))
        for name in PAYLOADS:
            if name in os.listdir(self.directory):
                if self._entry(name) != completion["entries"][name]:
                    raise ValueError("payload-changed-before-unlink")
                os.unlink(name, dir_fd=self.directory)
                os.fsync(self.directory)
                yield "payload-unlinked"
        self._remaining(completion, True)
        for name in ("completion.json", "retention.json", "deletion.json"):
            os.unlink(name, dir_fd=self.directory)
            os.fsync(self.directory)
            yield "metadata-unlinked"
        named = os.stat(self.identity, dir_fd=self.parent, follow_symlinks=False)
        if {"device": named.st_dev, "inode": named.st_ino} != self.directory_identity:
            raise ValueError("run-name-replaced")
        os.rmdir(self.identity, dir_fd=self.parent)
        os.fsync(self.parent)
        yield "run-removed"
