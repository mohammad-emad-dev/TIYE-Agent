"""Three managed mock runs qualify receipt-gated Linux capture finalization."""
import base64
import hashlib
import json
from pathlib import Path
import queue
import subprocess
import sys
import unittest
import uuid
import zlib

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
LAUNCHER = SOURCE.parent / "consolidated-launcher"
sys.path[:0] = [str(LAUNCHER), str(SOURCE.parent / "private-capture-store"), str(SOURCE.parent / "private-matrix")]
import test_unified as legacy
from validation import validate_lifecycle
from private_storage import PrivateRun
from publication import select_public

FINGERPRINT = None
RESULTS = []
METHODS = {"test_valid_run_seals_retained_evidence": "valid", "test_owner_loss_retains_uncertainty": "owner-loss",
           "test_unexpected_runtime_entry_refuses_sealing": "valid"}


class IntegratedTests(legacy.UnifiedTests):
    def setUp(self):
        self.mode = METHODS[self._testMethodName]
        self.private = PrivateRun(self.mode, FINGERPRINT)
        self.addCleanup(self.private.close)
        self.nonce, self.root = uuid.uuid4().hex, self.private.path
        self.processes, self.handles, self.raw = [], [], []
        self.reader = self.diagnostic = self.watchdog_log = None
        self.messages = queue.Queue()
        self.prelaunch = self.private.verify_before_spawn()
        self.record_start = len(legacy.OBSERVATIONS)

    def prepare(self, mode):
        self.assertEqual(mode, self.mode)
        self.assertEqual(self.private.verify_before_spawn(), self.prelaunch)
        return super().prepare(mode)

    def test_valid_run_seals_retained_evidence(self):
        self.exercise("valid")

    def test_owner_loss_retains_uncertainty(self):
        self.exercise("owner-loss")

    def test_unexpected_runtime_entry_refuses_sealing(self):
        self.exercise("valid")
        # Mutate only the exact fresh runtime created by this fixture, using an exclusive fixed file.
        code = ("import json,os,pathlib,sys; p=json.load(sys.stdin); r=pathlib.Path(p['runtime']); "
                "g=json.loads((r.parent/'group.json').read_text()); "
                "assert g['nonce']==p['nonce'] and r.name=='runtime' and r.parent.name.startswith('tiye-retained-launcher-'); "
                "f=os.open(r/'unexpected.bin',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600); "
                "os.write(f,b'owned synthetic unexpected entry'); os.fsync(f); os.close(f)")
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B", "-c", code],
                               input=json.dumps({"runtime": self.runtime["linuxRoot"], "nonce": self.nonce}).encode(),
                               capture_output=True, timeout=15)
        self.assertEqual((child.returncode, child.stdout, child.stderr), (0, b"", b""))

    def tearDown(self):
        try:
            super().tearDown()
            self.assertEqual(len(legacy.OBSERVATIONS), self.record_start + 1)
            record = legacy.OBSERVATIONS[-1]
            validate_lifecycle(record)
            self.assertEqual(record["sourceSetSha256"], FINGERPRINT)
            self.assertEqual(record["bundleSourceSha256"], {name: hashlib.sha256((LAUNCHER / name).read_bytes()).hexdigest()
                                                          for name in legacy.FILES})
            self.assertEqual(record["runtime"]["runtimeSourceSha256"], RUNTIME_SOURCES)
            self.assertIs(record["runtime"]["storageBeforeSpawnVerified"], True)
            child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B",
                                    self.runtime["linuxRoot"] + "/lifecycle.py"],
                                   input=json.dumps({"record": record}).encode(), capture_output=True, timeout=20)
            self.private.write_record("private-evidence.json", {"record": record,
                "finalizerStdoutBase64": base64.b64encode(child.stdout).decode(),
                "finalizerStderrBase64": base64.b64encode(child.stderr).decode(), "exitCode": child.returncode})
            self.assertEqual((child.returncode, child.stderr), (0, b""))
            finalized = json.loads(child.stdout)
            case = "unexpected-runtime" if self._testMethodName.endswith("refuses_sealing") else self.mode
            selected = select_public(record, finalized, case, FINGERPRINT)
            before_retry = self.retained_audit(record)
            retry = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B",
                                    self.runtime["linuxRoot"] + "/lifecycle.py"],
                                   input=json.dumps({"record": record}).encode(), capture_output=True, timeout=20)
            self.assertNotEqual(retry.returncode, 0)
            self.assertEqual(retry.stdout, b"")
            expected_error = b"FileExistsError" if case == "unexpected-runtime" else b"only-empty-awaiting-evidence-may-resume"
            self.assertIn(expected_error, retry.stderr)
            self.assertEqual(self.retained_audit(record), before_retry)
            selected["repeatFinalizationRefused"] = True
            self.private.write_record("witness.json", {"sourceSetSha256": FINGERPRINT, "case": case,
                "finalization": finalized, "deletionAllowed": False, "retentionRequired": True,
                "repeatFinalizerExitCode": retry.returncode,
                "repeatFinalizerStderrBase64": base64.b64encode(retry.stderr).decode()})
            self.private.write_record("storage-audit.json", {"files": self.private.audit_before_manifest(),
                "sourceSetSha256": FINGERPRINT, "prelaunch": self.prelaunch, "selfHashExcluded": True})
            self.private.audit()
            RESULTS.append(selected)
        finally:
            self.private.close()

    def retained_audit(self, record):
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B",
                                self.runtime["linuxRoot"] + "/lifecycle.py"],
                               input=json.dumps({"record": record, "audit": True}).encode(),
                               capture_output=True, timeout=20)
        self.assertEqual((child.returncode, child.stderr), (0, b""))
        return json.loads(child.stdout)


def suite(fingerprint):
    global FINGERPRINT, RUNTIME_SOURCES
    FINGERPRINT = legacy.SOURCE_SET_HASH = fingerprint
    extras = {"capture_store.py": (SOURCE.parent / "linux-capture-store/store.py").read_bytes(),
              "lifecycle.py": (SOURCE / "lifecycle.py").read_bytes(),
              "host.py": (LAUNCHER / "host.py").read_bytes(),
              "validation.py": (LAUNCHER / "validation.py").read_bytes()}
    RUNTIME_SOURCES = {**{name: hashlib.sha256((LAUNCHER / name).read_bytes()).hexdigest() for name in legacy.FILES},
                       **{name: hashlib.sha256(payload).hexdigest() for name, payload in extras.items()}}
    encoded = {name: base64.b64encode(zlib.compress(payload)).decode() for name, payload in extras.items()}
    legacy.BOOTSTRAP = (SOURCE / "bootstrap.py").read_text().replace("__EXTRAS__", repr(encoded)).replace("__FINGERPRINT__", repr(fingerprint))
    return unittest.TestSuite([IntegratedTests(name) for name in METHODS])
