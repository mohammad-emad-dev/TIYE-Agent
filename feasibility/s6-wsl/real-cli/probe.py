#!/usr/bin/env python3
"""Bounded S6 real-CLI path/environment inventory (run inside Ubuntu).

Emits one JSON object on stdout.  Fixed queries only; no provider invocation,
no configuration/credential read, no network, no package installation.
Disposable fixtures are created under the Windows temp directory and the
owned Linux feasibility share, then removed.  The user's checkout is not used.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

FIXED_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
CANDIDATE = "/home/mohammad/.local/share/tiye-feasibility/codex-0.157.1-rx5vmnt1/package/bin/codex"
WINDOWS_BASE = "C:\\Users\\Mohammad\\AppData\\Local\\Temp"
LINUX_BASE = "/home/mohammad/.local/share/tiye-feasibility"
RUN_ID = time.strftime("%Y%m%d%H%M%S", time.gmtime()) + "-%d" % os.getpid()
UNICODE_LEAF = "tiye s6 \u8def\u5f84"
FILE_COUNT = 40
FILE_BYTES = 1024


def run(argv, timeout=15):
    started = time.monotonic()
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return {
            "argv": argv,
            "exit": p.returncode,
            "stdout": p.stdout.strip(),
            "stderr": p.stderr.strip(),
            "elapsedMs": round((time.monotonic() - started) * 1000),
            "timedOut": False,
        }
    except subprocess.TimeoutExpired:
        return {
            "argv": argv,
            "exit": None,
            "stdout": "",
            "stderr": "",
            "elapsedMs": round((time.monotonic() - started) * 1000),
            "timedOut": True,
        }
    except FileNotFoundError as exc:
        return {"argv": argv, "exit": None, "stdout": "", "stderr": str(exc), "elapsedMs": 0, "timedOut": False}


def os_release():
    values = {}
    try:
        with open("/etc/os-release", "r", encoding="utf-8") as fh:
            for line in fh:
                if "=" in line:
                    key, value = line.rstrip("\n").split("=", 1)
                    values[key] = value.strip('"')
    except OSError as exc:
        values["error"] = str(exc)
    return {"id": values.get("ID"), "versionId": values.get("VERSION_ID"), "prettyName": values.get("PRETTY_NAME")}


def which(name):
    found = shutil.which(name)
    if found is None:
        return {"name": name, "path": None}
    info = {"name": name, "path": found}
    try:
        info["elf"] = open(found, "rb").read(4) == b"\x7fELF"
    except OSError:
        info["elf"] = None
    try:
        info["symlink"] = os.path.realpath(found)
    except OSError:
        info["symlink"] = None
    return info


def version_of(path, args):
    if path is None:
        return None
    result = run([path] + args, timeout=10)
    return {"exit": result["exit"], "stdout": result["stdout"][:200], "stderr": result["stderr"][:300], "timedOut": result["timedOut"]}


def wslpath_case(label, args):
    result = run(["/usr/bin/wslpath"] + args, timeout=5)
    return {"label": label, "argvTail": args, **result}


def git_fixture(root, label):
    """Create one disposable repo and time init/add/commit with Linux Git."""
    result = {"label": label, "root": root, "files": FILE_COUNT, "fileBytes": FILE_BYTES}
    try:
        os.makedirs(root, mode=0o700, exist_ok=True)
        os.chmod(root, 0o700)
        payload = b"T" * FILE_BYTES
        for i in range(FILE_COUNT):
            with open(os.path.join(root, "f%03d.txt" % i), "wb") as fh:
                fh.write(payload)
        with open(os.path.join(root, UNICODE_LEAF + ".txt"), "wb") as fh:
            fh.write("tiye-s6-unicode-marker\n".encode("utf-8"))

        phases = {}
        for name, argv in (
            ("init", ["/usr/bin/git", "-C", root, "init", "-q"]),
            ("add", ["/usr/bin/git", "-C", root, "add", "-A"]),
            ("commit", ["/usr/bin/git", "-C", root, "-c", "user.name=TIYE S6", "-c", "user.email=s6@invalid", "commit", "-qm", "s6 fixture"]),
            ("status", ["/usr/bin/git", "-C", root, "status", "--porcelain"]),
            ("head", ["/usr/bin/git", "-C", root, "rev-parse", "HEAD"]),
        ):
            phases[name] = run(argv, timeout=60)
        result["phases"] = phases
        result["fileSystem"] = "drvfs" if root.startswith("/mnt/") else "ext4"
        result["clean"] = phases["status"]["exit"] == 0 and phases["status"]["stdout"] == ""
        result["headLength"] = len(phases["head"]["stdout"])
        result["markerSha256"] = hashlib.sha256(b"tiye-s6-unicode-marker\n").hexdigest()
        result["ok"] = all(phases[k]["exit"] == 0 for k in ("init", "add", "commit", "status", "head")) and result["clean"]
    except OSError as exc:
        result["ok"] = False
        result["error"] = str(exc)
    return result


def cross_read(windows_root, linux_root):
    """Read a file across the two filesystem sides and compare the SHA-256."""
    marker = "tiye-s6-cross-fs-marker\n"
    digest = hashlib.sha256(marker.encode("utf-8")).hexdigest()
    out = {"expectedSha256": digest}
    win_path = os.path.join(windows_root, "cross-marker.txt")
    lin_path = os.path.join(linux_root, "cross-marker.txt")
    try:
        with open(win_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(marker)
        with open(lin_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(marker)
        for side, path in (("windows-to-linux", win_path), ("linux-to-windows", lin_path)):
            with open(path, "rb") as fh:
                data = fh.read()
            out[side] = {"path": path, "sha256": hashlib.sha256(data).hexdigest(), "match": hashlib.sha256(data).hexdigest() == digest}
        out["ok"] = out["windows-to-linux"]["match"] and out["linux-to-windows"]["match"]
    except OSError as exc:
        out["ok"] = False
        out["error"] = str(exc)
    return out


def main():
    out = {
        "schema": "tiye-s6-real-cli-paths-v1",
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runId": RUN_ID,
        "fixedPath": FIXED_PATH,
        "osRelease": os_release(),
        "kernel": run(["/usr/bin/uname", "-r"])["stdout"],
        "uid": os.getuid(),
        "tools": {
            "python3": which("python3"),
            "git": which("git"),
            "node": which("node"),
            "npm": which("npm"),
            "codex": which("codex"),
            "claude": which("claude"),
            "opencode": which("opencode"),
            "gemini": which("gemini"),
        },
        "gitVersion": version_of(shutil.which("git"), ["--version"]),
        "nodeVersion": version_of(shutil.which("node"), ["--version"]),
        "candidate": {
            "path": CANDIDATE,
            "exists": os.path.isfile(CANDIDATE),
            "elf": None,
            "sha256": None,
            "version": None,
        },
        "wslpath": [],
        "fixtures": {},
        "crossRead": None,
        "limits": {
            "oneAttemptPerQuery": True,
            "queryTimeoutSeconds": 15,
            "noNetwork": True,
            "noProviderModelRequest": True,
            "noCredentialsRead": True,
        },
    }

    if out["candidate"]["exists"]:
        try:
            with open(CANDIDATE, "rb") as fh:
                head = fh.read(4)
            h = hashlib.sha256()
            with open(CANDIDATE, "rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    h.update(chunk)
            out["candidate"]["elf"] = head == b"\x7fELF"
            out["candidate"]["sha256"] = h.hexdigest()
            out["candidate"]["version"] = version_of(CANDIDATE, ["--version"])
        except OSError as exc:
            out["candidate"]["error"] = str(exc)

    win_temp = WINDOWS_BASE + "\\" + UNICODE_LEAF + "-" + RUN_ID
    lin_base = LINUX_BASE + "/s6-paths-" + RUN_ID
    lin_temp = lin_base + "/" + UNICODE_LEAF

    out["wslpath"] = [
        wslpath_case("windows-temp-to-linux", ["-u", win_temp]),
        wslpath_case("windows-repo-path-to-linux", ["-u", "D:\\TIYE Agent"]),
        wslpath_case("linux-home-to-windows", ["-w", "/home/mohammad"]),
        wslpath_case("linux-unicode-to-windows", ["-w", lin_temp]),
        wslpath_case("invalid-relative-to-linux", ["-u", "relative\\path"]),
        wslpath_case("empty-to-linux", ["-u", ""]),
    ]

    # Round trips through both directions, including spaces and Unicode.
    forward = run(["/usr/bin/wslpath", "-u", win_temp], timeout=5)
    backward = run(["/usr/bin/wslpath", "-w", forward["stdout"]] if forward["stdout"] else ["/usr/bin/wslpath", "-w", ""], timeout=5)
    out["wslpath"].append({
        "label": "round-trip-windows-linux-windows",
        "forward": forward,
        "backward": backward,
        "roundTripMatch": backward["stdout"].lower() == win_temp.lower(),
    })
    forward2 = run(["/usr/bin/wslpath", "-w", lin_temp], timeout=5)
    backward2 = run(["/usr/bin/wslpath", "-u", forward2["stdout"]] if forward2["stdout"] else ["/usr/bin/wslpath", "-u", ""], timeout=5)
    out["wslpath"].append({
        "label": "round-trip-linux-windows-linux",
        "forward": forward2,
        "backward": backward2,
        "roundTripMatch": backward2["stdout"] == lin_temp,
    })

    windows_root = tempfile.mkdtemp(prefix="tiye-s6-win-", dir="/mnt/c/Users/Mohammad/AppData/Local/Temp")
    linux_root = tempfile.mkdtemp(prefix="tiye-s6-lin-", dir=LINUX_BASE)
    try:
        out["fixtures"]["windowsFilesystem"] = git_fixture(windows_root, "windows-filesystem")
        out["fixtures"]["linuxFilesystem"] = git_fixture(linux_root, "linux-filesystem")
        out["crossRead"] = cross_read(windows_root, linux_root)
    finally:
        for root in (windows_root, linux_root):
            try:
                shutil.rmtree(root)
            except OSError:
                pass

    out["fixturesRemoved"] = not os.path.exists(windows_root) and not os.path.exists(linux_root)
    out["ok"] = (
        out["uid"] == 1000
        and out["candidate"]["exists"] and out["candidate"]["elf"] and out["candidate"]["sha256"] is not None
        and out["fixtures"]["windowsFilesystem"].get("ok") and out["fixtures"]["linuxFilesystem"].get("ok")
        and out["crossRead"] is not None and out["crossRead"].get("ok")
        and out["fixturesRemoved"]
    )
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
