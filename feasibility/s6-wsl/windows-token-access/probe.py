"""Trusted synthetic worker: same-account restricted-token open attempts only."""
import contextlib
import ctypes as C
from ctypes import wintypes as W
import hashlib
import json
import os
from pathlib import Path
import sys

STORAGE = Path(__file__).resolve().parents[1] / "private-capture-store"
sys.path.insert(0, str(STORAGE))
import winacl

KERNEL, ADVAPI = winacl.KERNEL, winacl.ADVAPI
PTR, checked, close = winacl.PTR, winacl.checked, winacl.close
RC = "S-1-5-12"
INVALID = PTR(-1).value
RIGHTS = {"data-or-list": 1, "write-or-create": 2, "read-control": 0x20000, "write-dacl": 0x40000}


class SidAttributes(C.Structure):
    _fields_ = [("sid", PTR), ("attributes", W.DWORD)]


class Groups(C.Structure):
    _fields_ = [("count", W.DWORD), ("entries", SidAttributes * 1)]


class Luid(C.Structure):
    _fields_ = [("low", W.DWORD), ("high", W.LONG)]


class Privilege(C.Structure):
    _fields_ = [("luid", Luid), ("attributes", W.DWORD)]


class Privileges(C.Structure):
    _fields_ = [("count", W.DWORD), ("entries", Privilege * 1)]


CHANGE_NOTIFY = Luid()


winacl.bind(KERNEL, "GetCurrentThread", [], W.HANDLE)
winacl.bind(ADVAPI, "OpenThreadToken", [W.HANDLE, W.DWORD, W.BOOL, C.POINTER(W.HANDLE)], W.BOOL)
winacl.bind(ADVAPI, "ConvertStringSidToSidW", [W.LPCWSTR, C.POINTER(PTR)], W.BOOL)
winacl.bind(ADVAPI, "CreateRestrictedToken", [W.HANDLE, W.DWORD, W.DWORD, PTR,
             W.DWORD, PTR, W.DWORD, PTR, C.POINTER(W.HANDLE)], W.BOOL)
winacl.bind(ADVAPI, "IsTokenRestricted", [W.HANDLE], W.BOOL)
winacl.bind(ADVAPI, "ImpersonateLoggedOnUser", [W.HANDLE], W.BOOL)
winacl.bind(ADVAPI, "RevertToSelf", [], W.BOOL)
winacl.bind(ADVAPI, "LookupPrivilegeValueW", [W.LPCWSTR, W.LPCWSTR, C.POINTER(Luid)], W.BOOL)


def information(token, kind):
    needed = W.DWORD()
    success = ADVAPI.GetTokenInformation(token, kind, None, 0, C.byref(needed))
    if success or C.get_last_error() != 122 or not 0 < needed.value <= 65536:
        raise ValueError("token-information-size")
    buffer = C.create_string_buffer(needed.value)
    checked(ADVAPI.GetTokenInformation(token, kind, buffer, needed, C.byref(needed)))
    return buffer


def token_snapshot(token):
    user = information(token, 1)
    restrictions = information(token, 11)
    count = W.DWORD.from_buffer(restrictions).value
    offset = Groups.entries.offset
    if count > 64 or offset + count * C.sizeof(SidAttributes) > len(restrictions):
        raise ValueError("restricting-sid-shape")
    sids = [winacl.sid_string(SidAttributes.from_buffer(restrictions, offset + index * C.sizeof(SidAttributes)).sid)
            for index in range(count)]
    privileges = information(token, 3)
    count = W.DWORD.from_buffer(privileges).value
    offset = Privileges.entries.offset
    if count > 128 or offset + count * C.sizeof(Privilege) > len(privileges):
        raise ValueError("privilege-shape")
    enabled = []
    for index in range(count):
        entry = Privilege.from_buffer(privileges, offset + index * C.sizeof(Privilege))
        if entry.attributes & 2:
            identity = (entry.luid.low, entry.luid.high)
            enabled.append("SeChangeNotifyPrivilege" if identity == (CHANGE_NOTIFY.low, CHANGE_NOTIFY.high)
                           else "unrecognized-enabled-privilege")
    kind = W.DWORD.from_buffer(information(token, 8)).value
    identity = Luid.from_buffer(information(token, 10))
    snapshot = {"user": winacl.sid_string(SidAttributes.from_buffer(user).sid),
                "restricted": bool(ADVAPI.IsTokenRestricted(token)), "restrictingSids": sids,
                "enabledPrivileges": sorted(enabled), "type": kind,
                "tokenId": [identity.low, identity.high]}
    if kind == 2:
        snapshot["impersonationLevel"] = W.DWORD.from_buffer(information(token, 9)).value
    return snapshot


def require_unimpersonated():
    token = W.HANDLE()
    if ADVAPI.OpenThreadToken(KERNEL.GetCurrentThread(), 8, True, C.byref(token)):
        close(token)
        raise ValueError("unexpected-thread-token")
    if C.get_last_error() != 1008:
        raise C.WinError(C.get_last_error())


def active_snapshot(owner):
    token = W.HANDLE()
    checked(ADVAPI.OpenThreadToken(KERNEL.GetCurrentThread(), 8, True, C.byref(token)))
    try:
        observed = token_snapshot(token)
    finally:
        close(token)
    if (observed["user"] != owner or not observed["restricted"]
            or observed["restrictingSids"] != [RC]
            or observed["enabledPrivileges"] != ["SeChangeNotifyPrivilege"]
            or observed["type"] != 2 or observed["impersonationLevel"] < 2):
        raise ValueError("active-restricted-token-mismatch")
    return observed


@contextlib.contextmanager
def restricted_token():
    require_unimpersonated()
    base, restricted, sid = W.HANDLE(), W.HANDLE(), PTR()
    checked(ADVAPI.OpenProcessToken(KERNEL.GetCurrentProcess(), 0x0e, C.byref(base)))
    try:
        if ADVAPI.IsTokenRestricted(base):
            raise ValueError("base-token-already-restricted")
        checked(ADVAPI.ConvertStringSidToSidW(RC, C.byref(sid)))
        entry = SidAttributes(sid, 0)
        checked(ADVAPI.CreateRestrictedToken(base, 1, 0, None, 0, None, 1, C.byref(entry), C.byref(restricted)))
        yield restricted
    finally:
        if restricted.value:
            close(restricted)
        if sid.value:
            KERNEL.LocalFree(sid)
        close(base)


def open_attempt(path, directory, rights):
    flags = 0x00200000 | (0x02000000 if directory else 0x80)
    handle = KERNEL.CreateFileW(str(path), rights, 7, None, 3, flags, None)
    if handle == INVALID:
        return {"opened": False, "error": C.get_last_error()}
    try:
        metadata = winacl.file_information(handle)
        if bool(metadata.attributes & 0x10) != directory:
            raise ValueError("target-type-mismatch")
        return {"opened": True, "error": 0}
    finally:
        close(handle)


def owner_matrix(targets):
    for target in targets:
        for rights in RIGHTS.values():
            if not open_attempt(target["path"], target["directory"], rights)["opened"]:
                raise ValueError("owner-baseline-open-failed")


def measure(packet):
    targets = packet["targets"]
    if [entry["label"] for entry in targets] != ["root", "run", "payload", "retention", "leaf"]:
        raise ValueError("fixed-target-labels-required")
    owner = winacl.current_sid()
    if owner != packet["owner"]:
        raise ValueError("worker-owner-mismatch")
    # Resolve the allowed LUID before impersonation; compare actual token entries during each open.
    checked(ADVAPI.LookupPrivilegeValueW(None, "SeChangeNotifyPrivilege", C.byref(CHANGE_NOTIFY)))
    all_targets = [*targets, *[{"path": entry["control"], "directory": entry["directory"]} for entry in targets]]
    require_unimpersonated()
    owner_matrix(all_targets)
    content_before = Path(targets[2]["path"]).read_bytes()
    rows = []
    with restricted_token() as token:
        checked(ADVAPI.ImpersonateLoggedOnUser(token))
        try:
            for target in targets:
                for label, rights in RIGHTS.items():
                    witness_before = active_snapshot(owner)
                    negative = open_attempt(target["path"], target["directory"], rights)
                    control = open_attempt(target["control"], target["directory"], rights)
                    witness_after = active_snapshot(owner)
                    if (witness_before != witness_after or negative != {"opened": False, "error": 5}
                            or control != {"opened": True, "error": 0}):
                        raise ValueError("paired-access-or-token-witness-failed:" + target["label"] + ":" + label)
                    rows.append({"target": target["label"], "right": label, "requested": rights,
                                 "protected": negative, "control": control, "token": witness_before})
        finally:
            # The process must not continue under an unintentionally retained identity.
            if not ADVAPI.RevertToSelf():
                os._exit(97)
    require_unimpersonated()
    owner_matrix(all_targets)
    if content_before != Path(targets[2]["path"]).read_bytes():
        raise ValueError("canary-content-changed")
    return {"scope": "same-account-restricted-token-only", "rows": rows,
            "ownerBeforeAfter": True, "reverted": True, "controlPathsOpened": True,
            "payloadUnchanged": True, "payloadSha256": hashlib.sha256(content_before).hexdigest(),
            "owner": owner, "targets": targets}


@contextlib.contextmanager
def control_attributes(owner, directory):
    flags = "OICI" if directory else ""
    sddl = "O:" + owner + "D:P" + "".join("(A;" + flags + ";FA;;;" + sid + ")"
                                             for sid in (owner, "SY", "BA", RC))
    descriptor = PTR()
    checked(ADVAPI.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, C.byref(descriptor), None))
    try:
        yield winacl.SecurityAttributes(C.sizeof(winacl.SecurityAttributes), descriptor, False)
    finally:
        KERNEL.LocalFree(descriptor)


def create_control(path, owner, directory, payload=b""):
    with control_attributes(owner, directory) as attributes:
        if directory:
            checked(KERNEL.CreateDirectoryW(str(path), C.byref(attributes)))
        else:
            handle = KERNEL.CreateFileW(str(path), 0xc0020080, 7, C.byref(attributes), 1, 0x00200080, None)
            if handle == INVALID:
                raise C.WinError(C.get_last_error())
            import msvcrt
            descriptor = msvcrt.open_osfhandle(handle, os.O_BINARY | os.O_RDWR)
            with os.fdopen(descriptor, "w+b") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
    handle = winacl.open_directory(path) if directory else winacl.open_file(path)
    try:
        observed = winacl.snapshot(handle, owner)
        expected = {"ownerMatchesCurrentToken": True, "daclProtected": True, "daclPresent": True,
                    "directory": directory, "aces": [{"role": role, "mask": 0x1f01ff,
                    "flags": 3 if directory else 0} for role in ("current-user", "system", "administrators", "other")]}
        if observed != expected:
            raise ValueError("control-descriptor-mismatch")
    finally:
        close(handle)


if __name__ == "__main__":
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError("packet-budget")
    print(json.dumps(measure(json.loads(raw))), flush=True)
