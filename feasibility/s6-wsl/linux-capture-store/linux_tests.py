"""Privileged test supervisor; only disposable fixtures use alternate numeric UIDs."""
import errno
import io
import json
import os
from pathlib import Path
import resource
import signal
import tempfile
import unittest
import uuid

import store

ROOT = None
RAW = []


def as_uid(uid, operation):
    incoming, outgoing = os.pipe()
    child = os.fork()
    if child == 0:
        os.close(incoming)
        os.closerange(3, outgoing)
        os.closerange(outgoing + 1, 1048576)
        try:
            os.setgroups([])
            os.setgid(uid)
            os.setuid(uid)
            answer = {"ok": True, "value": operation()}
        except (OSError, ValueError, AssertionError) as error:
            answer = {"ok": False, "error": type(error).__name__, "message": str(error)}
        encoded = store.encode(answer)
        os.write(outgoing, encoded)
        os.close(outgoing)
        os._exit(0)
    os.close(outgoing)
    with os.fdopen(incoming, "rb") as pipe:
        raw = pipe.read(65537)
    waited, status = os.waitpid(child, 0)
    if waited != child or status != 0 or len(raw) > 65536:
        raise AssertionError("owned-fixture-child-failed")
    answer = json.loads(raw)
    if not answer["ok"]:
        raise AssertionError(answer)
    return answer["value"]


def capture(identity, create=False):
    parent = os.open(ROOT, store.DIRECTORY_FLAGS)
    try:
        return store.Capture(parent, identity, create)
    finally:
        os.close(parent)


def prepared(identity):
    transaction = capture(identity, True)
    transaction.write("stdout.bin", b"owned-synthetic-output")
    transaction.write("stderr.bin", b"owned-synthetic-error")
    return transaction


def sealed(identity):
    transaction = prepared(identity)
    try:
        transaction.seal()
        return transaction.review()
    finally:
        transaction.close()


def erase(identity, reviewed):
    transaction = capture(identity)
    try:
        return list(transaction.delete_reviewed(reviewed))
    finally:
        transaction.close()


class LinuxStorageTests(unittest.TestCase):
    def identity(self):
        identity = uuid.uuid4().hex
        RAW.append({"run": identity})
        return identity

    def test_effective_directory_and_file_denial(self):
        identity = self.identity()
        as_uid(1000, lambda: sealed(identity))

        def denied(directory_visible=False):
            descriptor = os.open(ROOT, store.DIRECTORY_FLAGS)
            os.close(descriptor)
            if directory_visible:
                descriptor = os.open(ROOT / identity, store.DIRECTORY_FLAGS)
                os.close(descriptor)
            status = Path("/proc/self/status").read_text()
            fields = dict(line.split(":", 1) for line in status.splitlines() if ":" in line)
            assert fields["Uid"].split() == ["65534"] * 4
            assert fields["Gid"].split() == ["65534"] * 4
            assert os.getgroups() == [] and int(fields["CapEff"].strip(), 16) == 0
            try:
                descriptor = os.open(ROOT / identity / "stdout.bin", os.O_RDONLY | os.O_NOFOLLOW)
            except OSError as error:
                assert error.errno == errno.EACCES
                return {"ancestorTraversed": True, "errno": error.errno, "uid": os.getuid()}
            os.close(descriptor)
            raise AssertionError("alternate-uid-open-succeeded")

        RAW.append(as_uid(65534, denied))
        as_uid(1000, lambda: os.chmod(ROOT / identity, 0o755))
        try:
            RAW.append(as_uid(65534, lambda: denied(True)))
        finally:
            as_uid(1000, lambda: os.chmod(ROOT / identity, 0o700))

        def owner_read():
            transaction = capture(identity)
            try:
                assert transaction.read("stdout.bin")[0] == b"owned-synthetic-output"
            finally:
                transaction.close()
        as_uid(1000, owner_read)

    def test_exact_and_excess_payload_limits(self):
        identity, over = self.identity(), self.identity()

        def exercise():
            transaction = capture(identity, True)
            try:
                transaction.write("stdout.bin", b"x" * store.FILE_LIMIT)
                with self.assertRaisesRegex(ValueError, "payload-budget"):
                    transaction.write("stderr.bin", b"x" * (store.TOTAL_LIMIT - store.FILE_LIMIT + 1))
                assert "stderr.bin" not in os.listdir(transaction.directory)
                transaction.write("stderr.bin", b"x" * (store.TOTAL_LIMIT - store.FILE_LIMIT))
                transaction.seal()
                with self.assertRaises(ValueError):
                    transaction.write("stderr.bin", b"late")
            finally:
                transaction.close()
            transaction = capture(over, True)
            try:
                with self.assertRaisesRegex(ValueError, "payload-budget"):
                    transaction.write("stdout.bin", b"x" * (store.FILE_LIMIT + 1))
                assert set(os.listdir(transaction.directory)) == {"retention.json"}
            finally:
                transaction.close()
        as_uid(1000, exercise)

    def test_uncertain_capture_cannot_be_deleted(self):
        identity = self.identity()

        def exercise():
            transaction = prepared(identity)
            try:
                before = set(os.listdir(transaction.directory))
                with self.assertRaises(FileNotFoundError):
                    list(transaction.delete_reviewed("0" * 64))
                assert before == set(os.listdir(transaction.directory))
            finally:
                transaction.close()
        as_uid(1000, exercise)

    def test_reviewed_transaction_removed_nonrecursively(self):
        identity = self.identity()
        reviewed = as_uid(1000, lambda: sealed(identity))
        stages = as_uid(1000, lambda: erase(identity, reviewed))
        self.assertEqual(stages.count("payload-unlinked"), 2)
        self.assertEqual(stages[-1], "run-removed")
        self.assertFalse((ROOT / identity).exists())

    def test_unknown_symlink_hardlink_and_mode_refuse_deletion(self):
        for mutation in ("unknown", "symlink", "hardlink", "mode", "xattr"):
            identity = self.identity()
            reviewed = as_uid(1000, lambda: sealed(identity))

            def exercise():
                target = ROOT / identity / "stdout.bin"
                if mutation == "unknown":
                    (target.parent / "unknown.bin").write_bytes(b"owned")
                elif mutation == "symlink":
                    target.unlink()
                    target.symlink_to("stderr.bin")
                elif mutation == "hardlink":
                    os.link(target, ROOT / ("alias-" + identity))
                elif mutation == "mode":
                    target.chmod(0o644)
                else:
                    os.setxattr(target, "user.tiye-synthetic", b"owned")
                before = set(os.listdir(target.parent))
                with self.assertRaises((ValueError, OSError)):
                    erase(identity, reviewed)
                assert before == set(os.listdir(target.parent))
                assert "deletion.json" not in before
            as_uid(1000, exercise)

    def test_content_drift_and_changed_review_refuse_deletion(self):
        for mutation in ("content", "review"):
            identity = self.identity()
            reviewed = as_uid(1000, lambda: sealed(identity))

            def exercise():
                if mutation == "content":
                    target = ROOT / identity / "stdout.bin"
                    target.write_bytes(b"x" * target.stat().st_size)
                with self.assertRaises(ValueError):
                    erase(identity, "0" * 64 if mutation == "review" else reviewed)
                assert not (ROOT / identity / "deletion.json").exists()
                assert (ROOT / identity / "stderr.bin").exists()
            as_uid(1000, exercise)

    def test_process_exit_after_payload_unlink_can_resume(self):
        identity = self.identity()
        reviewed = as_uid(1000, lambda: sealed(identity))

        def interrupt():
            transaction = capture(identity)
            progress = transaction.delete_reviewed(reviewed)
            assert next(progress) == "payload-unlinked"
            # The worker exits at return without running this generator to completion.
            return True
        as_uid(1000, interrupt)
        self.assertFalse((ROOT / identity / "stdout.bin").exists())
        self.assertTrue((ROOT / identity / "deletion.json").exists())
        self.assertEqual(as_uid(1000, lambda: erase(identity, reviewed))[-1], "run-removed")
        self.assertFalse((ROOT / identity).exists())

    def test_missing_completion_after_metadata_unlink_is_quarantined(self):
        identity = self.identity()
        reviewed = as_uid(1000, lambda: sealed(identity))

        def interrupt():
            transaction = capture(identity)
            progress = transaction.delete_reviewed(reviewed)
            assert [next(progress) for unused in range(3)][-1] == "metadata-unlinked"
            return True
        as_uid(1000, interrupt)

        def resume():
            with self.assertRaises(FileNotFoundError):
                erase(identity, reviewed)
            assert set(os.listdir(ROOT / identity)) == {"retention.json", "deletion.json"}
        as_uid(1000, resume)

    def test_real_partial_write_fault_cannot_seal(self):
        identity = self.identity()

        def exercise():
            transaction = capture(identity, True)
            signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
            resource.setrlimit(resource.RLIMIT_FSIZE, (8, 8))
            try:
                with self.assertRaises(OSError) as failure:
                    transaction.write("stdout.bin", b"x" * 32)
                assert failure.exception.errno == errno.EFBIG
                with self.assertRaisesRegex(ValueError, "uncertain-storage"):
                    transaction.seal()
                assert "completion.json" not in os.listdir(transaction.directory)
                assert os.stat("stdout.bin", dir_fd=transaction.directory).st_size == 8
            finally:
                transaction.close()
        as_uid(1000, exercise)


def run():
    global ROOT
    if os.getuid() != 0:
        raise ValueError("root-supervisor-required-for-numeric-uid-fixtures")
    os.umask(0o077)
    ROOT = Path(tempfile.mkdtemp(prefix="tiye-linux-store-tests-", dir="/tmp"))
    os.chown(ROOT, 1000, 1000)
    ROOT.chmod(0o755)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(LinuxStorageTests)
    log = io.StringIO()
    outcome = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    return {"successful": outcome.wasSuccessful(), "tests": outcome.testsRun,
            "log": log.getvalue(), "root": str(ROOT), "raw": RAW,
            "retained": True, "scope": "synthetic-linux-store-only"}
