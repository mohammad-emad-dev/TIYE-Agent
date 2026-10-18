"""Fresh managed fixtures; deletion helper stays outside the deleted runtime."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
import zlib

from results import select_public

SOURCE = Path(__file__).resolve().parent
BASE = SOURCE.parent / "launcher-retention"
sys.path.insert(0, str(BASE))
spec = importlib.util.spec_from_file_location("retention_base", BASE / "integration.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
from private_storage import file_observation

FINGERPRINT = None
RESULTS = []
METHODS = {"test_reviewed_group_removed": ("valid", "complete"),
           "test_partial_deletion_resumes": ("valid", "resume"),
           "test_final_metadata_interruption_quarantines": ("valid", "metadata-quarantine"),
           "test_owner_loss_review_refused": ("owner-loss", "owner-loss-refused"),
           "test_unknown_file_review_refused": ("valid", "unknown-file-refused")}
BOOTSTRAP = '''import base64,hashlib,json,sys,zlib
raw=sys.stdin.buffer.read(131073)
if len(raw)>131072: raise ValueError('helper-packet-budget')
packet=json.loads(raw)
decoder=zlib.decompressobj()
code=decoder.decompress(base64.b64decode(packet['code'],validate=True),65537)
if len(code)>65536 or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail: raise ValueError('helper-code-budget')
if hashlib.sha256(code).hexdigest()!=__CODE_HASH__: raise ValueError('helper-source-mismatch')
namespace={'__name__':'tiye_delete_worker'}
exec(compile(code,'tiye-delete-worker','exec'),namespace)
print(json.dumps(namespace['dispatch'](packet['request'],__FINGERPRINT__,__RUNTIME_SOURCES__)),flush=True)
'''


class DeletionTests(base.IntegratedTests):
    def test_reviewed_group_removed(self):
        self.exercise("valid")

    def test_partial_deletion_resumes(self):
        self.exercise("valid")

    def test_final_metadata_interruption_quarantines(self):
        self.exercise("valid")

    def test_owner_loss_review_refused(self):
        self.exercise("owner-loss")

    def test_unknown_file_review_refused(self):
        self.exercise("valid")

    def invoke_helper(self, request):
        code = (SOURCE / "deletion.py").read_bytes()
        bootstrap = BOOTSTRAP.replace("__CODE_HASH__", repr(hashlib.sha256(code).hexdigest()))
        bootstrap = bootstrap.replace("__FINGERPRINT__", repr(FINGERPRINT)).replace("__RUNTIME_SOURCES__", repr(base.RUNTIME_SOURCES))
        packet = json.dumps({"code": base64.b64encode(zlib.compress(code)).decode(), "request": request}).encode()
        self.assertLessEqual(len(packet), 131072)
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/env", "-i", "PATH=/usr/bin:/bin",
                                "LC_ALL=C.UTF-8", "/usr/bin/python3", "-I", "-S", "-B", "-c", bootstrap],
                               input=packet, capture_output=True, timeout=30)
        self.helper_raw.append({"exitCode": child.returncode, "stdoutBase64": base64.b64encode(child.stdout).decode(),
                                "stderrBase64": base64.b64encode(child.stderr).decode()})
        return child

    def helper(self, request):
        child = self.invoke_helper(request)
        self.assertEqual((child.returncode, child.stderr), (0, b""))
        return json.loads(child.stdout)

    def helper_refused(self, request, reason):
        child = self.invoke_helper(request)
        self.assertNotEqual(child.returncode, 0)
        self.assertEqual(child.stdout, b"")
        self.assertIn(reason, child.stderr)

    def change_owned_receipt_marker(self, changed):
        code = ("import json,os,pathlib,sys; p=json.load(sys.stdin); r=pathlib.Path(p['runtime']); "
                "g=json.loads((r.parent/'group.json').read_text()); assert g['nonce']==p['nonce']; "
                "f=os.open(r/'release-peer',os.O_RDWR|os.O_NOFOLLOW); "
                "b=os.read(f,64); assert b==(p['nonce'].encode() if p['changed'] else b'x'*32); "
                "os.lseek(f,0,0); assert os.write(f,b'x'*32 if p['changed'] else p['nonce'].encode())==32; "
                "os.fsync(f); os.close(f)")
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B", "-c", code],
                               input=json.dumps({"runtime": self.runtime["linuxRoot"], "nonce": self.nonce, "changed": changed}).encode(),
                               capture_output=True, timeout=15)
        self.assertEqual((child.returncode, child.stdout, child.stderr), (0, b"", b""))

    def inspect_group(self):
        code = ("import json,os,pathlib,sys; p=json.load(sys.stdin); r=pathlib.Path(p['runtime']); g=r.parent; "
                "assert g.parent==pathlib.Path('/tmp') and g.name.startswith('tiye-retained-launcher-'); "
                "print(json.dumps({'rootAbsent':not g.exists(),'names':sorted(x.name for x in g.iterdir()) if g.exists() else []}))")
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B", "-c", code],
                               input=json.dumps({"runtime": self.runtime["linuxRoot"]}).encode(), capture_output=True, timeout=15)
        self.assertEqual((child.returncode, child.stderr), (0, b""))
        return json.loads(child.stdout)

    def inject_unknown(self):
        code = ("import json,os,pathlib,sys; p=json.load(sys.stdin); r=pathlib.Path(p['runtime']); "
                "g=json.loads((r.parent/'group.json').read_text()); assert g['nonce']==p['nonce']; "
                "f=os.open(r/'unexpected.bin',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600); "
                "os.write(f,b'owned post-seal unknown'); os.fsync(f); os.close(f)")
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B", "-c", code],
                               input=json.dumps({"runtime": self.runtime["linuxRoot"], "nonce": self.nonce}).encode(),
                               capture_output=True, timeout=15)
        self.assertEqual((child.returncode, child.stdout, child.stderr), (0, b"", b""))

    def tearDown(self):
        self.helper_raw = []
        try:
            # Finish the original fixture cleanup, then validate both OS witnesses before storage or deletion.
            base.legacy.UnifiedTests.tearDown(self)
            self.assertEqual(len(base.legacy.OBSERVATIONS), self.record_start + 1)
            record = base.legacy.OBSERVATIONS[-1]
            base.validate_lifecycle(record)
            self.assertEqual(record["sourceSetSha256"], FINGERPRINT)
            self.assertEqual(record["runtime"]["runtimeSourceSha256"], base.RUNTIME_SOURCES)
            self.assertIs(record["runtime"]["storageBeforeSpawnVerified"], True)
            finalizer = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--exec", "/usr/bin/python3", "-I", "-S", "-B",
                                       self.runtime["linuxRoot"] + "/lifecycle.py"],
                                      input=json.dumps({"record": record}).encode(), capture_output=True, timeout=20)
            self.helper_raw.append({"phase": "finalize", "exitCode": finalizer.returncode,
                "stdoutBase64": base64.b64encode(finalizer.stdout).decode(), "stderrBase64": base64.b64encode(finalizer.stderr).decode()})
            self.assertEqual((finalizer.returncode, finalizer.stderr), (0, b""))
            finalized = json.loads(finalizer.stdout)
            self.assertEqual(finalized["decision"], "uncertainty-retained" if self.mode == "owner-loss" else "sealed")
            case = METHODS[self._testMethodName][1]
            if case == "unknown-file-refused":
                self.inject_unknown()
            before = self.retained_audit(record)
            tree_before = self.helper({"action": "state", "record": record})
            measurements = {"review": self.helper({"action": "review", "record": record})}
            witness_hash = self.private.write_record("witness.json", {
                "sourceSetSha256": FINGERPRINT, "case": case, "record": record,
                "reviewBeforeDeletion": measurements["review"], "windowsEvidenceRetained": True})
            self.assertEqual(file_observation(self.private.path / "witness.json", self.private.storage.owner)["sha256"], witness_hash)
            measurements["callerReviewPersisted"] = True
            if case.endswith("refused"):
                self.assertEqual(self.retained_audit(record), before)
                self.assertEqual(self.helper({"action": "state", "record": record}), tree_before)
                measurements["retainedUnchanged"] = True
            else:
                review = measurements["review"]["review"]
                request = {"action": "delete", "record": record, "review": review}
                if case == "complete":
                    reviewed_state = self.helper({"action": "state", "record": record})
                    bad = copy.deepcopy(request)
                    bad["review"]["sha256"] = "0" * 64
                    self.helper_refused(bad, b"review-token-or-manifest-mismatch")
                    self.assertEqual(self.helper({"action": "state", "record": record}), reviewed_state)
                    self.change_owned_receipt_marker(True)
                    changed_state = self.helper({"action": "state", "record": record})
                    self.helper_refused(request, b"reviewed-file-changed")
                    self.assertEqual(self.helper({"action": "state", "record": record}), changed_state)
                    self.change_owned_receipt_marker(False)
                    self.assertEqual(self.helper({"action": "state", "record": record}), reviewed_state)
                    measurements["postReviewGuardsPassed"] = True
                if case == "resume":
                    measurements["first"] = self.helper({**request, "until": "first-entry"})
                    self.assertEqual(len(measurements["first"]["progress"]), 1)
                elif case == "metadata-quarantine":
                    measurements["first"] = self.helper({**request, "until": "review-removed"})
                    self.assertEqual(measurements["first"]["decision"], "interrupted")
                measurements["final"] = self.helper(request)
                state = self.inspect_group()
                if case == "metadata-quarantine":
                    self.assertEqual(state, {"rootAbsent": False, "names": ["delete-intent.json"]})
                    measurements["terminalIntentOnly"] = True
                else:
                    self.assertIs(state["rootAbsent"], True)
            selected = select_public(case, record, measurements, FINGERPRINT)
            self.private.write_record("private-evidence.json", {"record": record, "finalized": finalized,
                "deletion": measurements, "helperRaw": self.helper_raw})
            self.private.write_record("storage-audit.json", {"files": self.private.audit_before_manifest(),
                "sourceSetSha256": FINGERPRINT, "prelaunch": self.prelaunch, "selfHashExcluded": True})
            self.private.audit()
            RESULTS.append(selected)
        finally:
            self.private.close()


def suite(fingerprint):
    global FINGERPRINT
    FINGERPRINT = fingerprint
    base.suite(fingerprint)
    base.METHODS = {method: mode for method, (mode, unused_case) in METHODS.items()}
    return unittest.TestSuite([DeletionTests(method) for method in METHODS])
