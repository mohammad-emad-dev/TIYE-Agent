"""Nonrecursive reviewed deletion, restricted to this fresh synthetic cohort."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zlib

FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
ROLE_FILES = {"main.json", "leaf.json", "sentinel.json", "protocol-live.json", "descriptor.json",
              "lease.json", "service-command.json", "observer-result.json", "observer-finished.json",
              "protocol-receipt.json", "reaped.json", "release-peer"}
CAPTURE_FILES = {"stdout.bin", "stderr.bin", "completion.json", "retention.json"}


class ReviewRefused(ValueError):
    pass


def canonical(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def metadata(observed, directory=False):
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    if (not expected(observed.st_mode) or observed.st_uid != 1000
            or stat.S_IMODE(observed.st_mode) != (0o700 if directory else 0o600)
            or (not directory and observed.st_nlink != 1)):
        raise ValueError("owned-object-shape-changed")
    identity = {"device": observed.st_dev, "inode": observed.st_ino,
                "uid": observed.st_uid, "gid": observed.st_gid, "mode": stat.S_IMODE(observed.st_mode)}
    if not directory:
        identity.update(bytes=observed.st_size, links=observed.st_nlink)
    return identity


def directory_identity(descriptor):
    if os.listxattr(descriptor):
        raise ValueError("directory-xattrs-refused")
    return metadata(os.fstat(descriptor), True)


def parts(relative):
    path = PurePosixPath(relative)
    if (not relative or path.is_absolute() or str(path) != relative
            or ".." in path.parts or "\\" in relative):
        raise ValueError("noncanonical-relative-path")
    return path.parts


def parent_for(root, relative):
    components = parts(relative)
    parent = os.dup(root)
    try:
        for name in components[:-1]:
            child = os.open(name, FLAGS, dir_fd=parent)
            os.close(parent)
            parent = child
            directory_identity(parent)
        return parent, components[-1]
    except (OSError, ValueError):
        os.close(parent)
        raise


def file_record(root, relative):
    parent, name = parent_for(root, relative)
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        before = os.fstat(descriptor)
        identity = metadata(before)
        if before.st_size > 65536 or os.listxattr(descriptor):
            raise ValueError("file-budget-or-xattrs")
        with os.fdopen(os.dup(descriptor), "rb") as stream:
            payload = stream.read(65537)
        after = os.fstat(descriptor)
        if (len(payload) != before.st_size or identity != metadata(after)
                or before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns):
            raise ValueError("file-changed-during-review")
        return payload, {"identity": identity, "sha256": digest(payload)}
    finally:
        os.close(descriptor)


def write_record(root, name, record):
    payload = canonical(record)
    if len(payload) > 65536:
        raise ValueError("record-budget")
    descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(root)


def open_group(record, expected):
    path = Path(record["runtime"]["captureParent"])
    if (os.getuid() != 1000 or record["sourceSetSha256"] != expected
            or path.parent != Path("/tmp") or not re.fullmatch("tiye-retained-launcher-[a-z0-9_]{8}", path.name)
            or str(path) != record["runtime"]["captureParent"]
            or record["runtime"]["linuxRoot"] != str(path / "runtime")):
        raise ValueError("fresh-cohort-group-required")
    parent = os.open("/tmp", FLAGS)
    try:
        root = os.open(path.name, FLAGS, dir_fd=parent)
    except OSError:
        os.close(parent)
        raise
    try:
        identity = directory_identity(root)
    except (OSError, ValueError):
        os.close(root)
        os.close(parent)
        raise
    return path, parent, root, identity


def unpack(payload):
    decompressor = zlib.decompressobj()
    result = decompressor.decompress(payload, 131073)
    if len(result) > 131072 or not decompressor.eof or decompressor.unused_data or decompressor.unconsumed_tail:
        raise ValueError("archive-decompression-budget-or-shape")
    return result


def review(record, expected, expected_sources):
    path, parent, root, identity = open_group(record, expected)
    try:
        group = json.loads(file_record(root, "group.json")[0])
        nonce = group["nonce"]
        if record["case"] != "valid" or group["mode"] != "valid":
            raise ReviewRefused("uncertain-attempt")
        if (not re.fullmatch("[0-9a-f]{32}", nonce) or record["linux"]["nonce"] != nonce
                or group["sourceSetSha256"] != expected or group["sources"] != expected_sources
                or group["bootId"] != Path("/proc/sys/kernel/random/boot_id").read_text().strip()
                or set(os.listdir(root)) != {"runtime", nonce, "group.json", "finalize-attempt.json"}):
            raise ReviewRefused("group-identity-or-inventory")
        runtime = os.open("runtime", FLAGS, dir_fd=root)
        capture = os.open(nonce, FLAGS, dir_fd=root)
        try:
            if (set(os.listdir(capture)) != CAPTURE_FILES
                    or group["runtimeIdentity"] != {key: directory_identity(runtime)[key] for key in ("device", "inode")}
                    or group["captureIdentity"] != {key: directory_identity(capture)[key] for key in ("device", "inode")}):
                raise ReviewRefused("unsealed-or-replaced-capture")
            for name, expected_hash in expected_sources.items():
                if file_record(root, "runtime/" + name)[1]["sha256"] != expected_hash:
                    raise ReviewRefused("runtime-source-changed")
            # Only hash-checked, current-cohort fixture modules are imported for the initial review.
            sys.path.insert(0, str(path / "runtime"))
            import lifecycle
            import validation
            import capture_store
            validation.validate_lifecycle(record)
            observed = json.loads(file_record(root, "runtime/observer-result.json")[0])
            finished = json.loads(file_record(root, "runtime/observer-finished.json")[0])
            if (canonical(observed) != canonical(record["linux"])
                    or finished != {"nonce": nonce, "sourceSetSha256": expected,
                                    "resultSha256": digest(canonical(observed)), "observerReturned": True}
                    or json.loads(file_record(root, "finalize-attempt.json")[0]) != {
                        "nonce": nonce, "witnessSha256": digest(canonical(record)), "automaticRetry": False}):
                raise ReviewRefused("completion-witness-mismatch")
            transaction = capture_store.Capture(root, nonce)
            try:
                transaction.review()
                try:
                    archive, archived_files = lifecycle.snapshot(runtime, expected_sources)
                except lifecycle.RuntimeInventoryError as error:
                    raise ReviewRefused("unexpected-runtime-inventory") from error
                if (unpack(transaction.read("stdout.bin")[0]) != archive
                        or unpack(transaction.read("stderr.bin")[0]) != canonical({
                            "record": record, "archiveSha256": digest(archive)})):
                    raise ReviewRefused("archive-witness-mismatch")
            finally:
                transaction.close()
            files = {"runtime/" + name: file_record(root, "runtime/" + name)[1] for name in archived_files}
            files.update({nonce + "/" + name: file_record(root, nonce + "/" + name)[1] for name in CAPTURE_FILES})
            files.update({name: file_record(root, name)[1] for name in ("group.json", "finalize-attempt.json")})
            directories = {"runtime": directory_identity(runtime), nonce: directory_identity(capture)}
            for name in ("home", "codex-home", "tmp"):
                descriptor = os.open(name, FLAGS, dir_fd=runtime)
                try:
                    if os.listdir(descriptor):
                        raise ReviewRefused("nonempty-runtime-directory")
                    directories["runtime/" + name] = directory_identity(descriptor)
                finally:
                    os.close(descriptor)
        finally:
            os.close(runtime)
            os.close(capture)
        manifest = {"schema": "tiye-reviewed-group-delete-v1", "group": str(path), "nonce": nonce,
                    "sourceSetSha256": expected, "rootIdentity": identity, "directories": directories,
                    "files": files, "bootId": group["bootId"]}
        write_record(root, "delete-review.json", manifest)
        return {"manifest": manifest, "sha256": digest(canonical(manifest)),
                "reviewEntry": file_record(root, "delete-review.json")[1]}
    finally:
        os.close(root)
        os.close(parent)


def plan(manifest):
    nonce = manifest["nonce"]
    runtime_files = sorted(name for name in manifest["files"] if name.startswith("runtime/"))
    steps = [("file", name) for name in runtime_files]
    steps += [("dir", "runtime/" + name) for name in ("codex-home", "home", "tmp")]
    steps += [("dir", "runtime")]
    steps += [("file", nonce + "/" + name) for name in ("stdout.bin", "stderr.bin", "completion.json", "retention.json")]
    steps += [("dir", nonce), ("file", "group.json"), ("file", "finalize-attempt.json"),
              ("file", "delete-review.json"), ("file", "delete-intent.json")]
    return steps


def inventory(root, manifest, token, intent):
    allowed_files = set(manifest["files"]) | {"delete-review.json", "delete-intent.json"}
    allowed_dirs = set(manifest["directories"])
    present = set()
    stack = [("", os.dup(root))]
    try:
        while stack:
            prefix, descriptor = stack.pop()
            try:
                for name in os.listdir(descriptor):
                    relative = prefix + name
                    present.add(relative)
                    if relative in allowed_dirs:
                        child = os.open(name, FLAGS, dir_fd=descriptor)
                        try:
                            if directory_identity(child) != manifest["directories"][relative]:
                                raise ValueError("directory-identity-changed")
                        except (OSError, ValueError):
                            os.close(child)
                            raise
                        stack.append((relative + "/", child))
                    elif relative in allowed_files:
                        payload, observed = file_record(root, relative)
                        if relative == "delete-review.json":
                            if payload != canonical(manifest) or observed != token["reviewEntry"]:
                                raise ValueError("review-record-changed")
                        elif relative == "delete-intent.json":
                            if payload != canonical(intent):
                                raise ValueError("deletion-intent-changed")
                        elif observed != manifest["files"][relative]:
                            raise ValueError("reviewed-file-changed")
                    else:
                        raise ValueError("unexpected-group-entry")
            finally:
                os.close(descriptor)
    finally:
        for unused_prefix, descriptor in stack:
            os.close(descriptor)
    return present


def validate_manifest(token, record, expected, expected_sources):
    manifest = token["manifest"]
    nonce = record["linux"]["nonce"]
    runtime_files = {"runtime/" + name for name in set(expected_sources) | ROLE_FILES}
    expected_files = runtime_files | {nonce + "/" + name for name in CAPTURE_FILES} | {"group.json", "finalize-attempt.json"}
    expected_dirs = {"runtime", "runtime/home", "runtime/codex-home", "runtime/tmp", nonce}
    if (token["sha256"] != digest(canonical(manifest)) or manifest["schema"] != "tiye-reviewed-group-delete-v1"
            or manifest["group"] != record["runtime"]["captureParent"] or manifest["nonce"] != nonce
            or manifest["sourceSetSha256"] != expected or record["case"] != "valid"
            or set(manifest["files"]) != expected_files or set(manifest["directories"]) != expected_dirs
            or manifest["bootId"] != Path("/proc/sys/kernel/random/boot_id").read_text().strip()):
        raise ValueError("review-token-or-manifest-mismatch")
    return manifest


def delete_steps(record, token, expected, expected_sources):
    manifest = validate_manifest(token, record, expected, expected_sources)
    path, parent, root, identity = open_group(record, expected)
    intent = {"schema": "tiye-group-delete-intent-v1", "reviewSha256": token["sha256"],
              "reviewEntry": token["reviewEntry"], "rootIdentity": manifest["rootIdentity"]}
    try:
        if identity != manifest["rootIdentity"]:
            raise ValueError("group-directory-replaced")
        if "delete-review.json" not in os.listdir(root):
            raise ReviewRefused("missing-review-final-metadata-quarantine")
        present = inventory(root, manifest, token, intent)
        steps = plan(manifest)
        resuming = "delete-intent.json" in present
        if not resuming:
            if present != {relative for unused_kind, relative in steps} - {"delete-intent.json"}:
                raise ValueError("missing-unstarted-entry")
            write_record(root, "delete-intent.json", intent)
            present.add("delete-intent.json")
        started = False
        for unused_kind, relative in steps:
            if relative in present:
                started = True
            elif started:
                raise ValueError("missing-paths-are-not-a-deleted-prefix")
        for kind, relative in steps:
            if relative not in present:
                continue
            if inventory(root, manifest, token, intent) != present:
                raise ValueError("inventory-changed-during-deletion")
            descriptor, name = parent_for(root, relative)
            try:
                (os.unlink if kind == "file" else os.rmdir)(name, dir_fd=descriptor)
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            present.remove(relative)
            yield {"step": "review-removed" if relative == "delete-review.json" else "entry-removed", "path": relative}
        if os.listdir(root) or metadata(os.stat(path.name, dir_fd=parent, follow_symlinks=False), True) != identity:
            raise ValueError("group-not-empty-or-replaced")
        os.rmdir(path.name, dir_fd=parent)
        os.fsync(parent)
        try:
            os.stat(path.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            yield {"step": "group-removed", "rootAbsent": True}
        else:
            raise ValueError("group-still-present")
    finally:
        os.close(root)
        os.close(parent)


def dispatch(request, expected, expected_sources):
    record = request["record"]
    if request["action"] == "state":
        path, parent, root, root_identity = open_group(record, expected)
        observed = {"root": root_identity}
        stack = [("", os.dup(root))]
        try:
            while stack:
                prefix, descriptor = stack.pop()
                try:
                    for name in os.listdir(descriptor):
                        relative = prefix + name
                        allowed_dirs = {"runtime", record["linux"]["nonce"], "runtime/home", "runtime/codex-home", "runtime/tmp"}
                        if relative in allowed_dirs:
                            child = os.open(name, FLAGS, dir_fd=descriptor)
                            try:
                                observed[relative] = directory_identity(child)
                            except (OSError, ValueError):
                                os.close(child)
                                raise
                            stack.append((relative + "/", child))
                        else:
                            observed[relative] = file_record(root, relative)[1]
                finally:
                    os.close(descriptor)
            return {"treeSha256": digest(canonical(observed)), "entries": len(observed)}
        finally:
            for unused_prefix, descriptor in stack:
                os.close(descriptor)
            os.close(root)
            os.close(parent)
    if request["action"] == "review":
        try:
            return {"decision": "reviewed", "review": review(record, expected, expected_sources)}
        except ReviewRefused as error:
            path, parent, root, unused_identity = open_group(record, expected)
            try:
                if {"delete-review.json", "delete-intent.json"} & set(os.listdir(root)):
                    raise ValueError("refusal-must-not-create-deletion-records")
                return {"decision": "retained-refused", "reason": str(error), "reviewAbsent": True, "intentAbsent": True}
            finally:
                os.close(root)
                os.close(parent)
    if request["action"] != "delete":
        raise ValueError("unsupported-action")
    progress = []
    iterator = delete_steps(record, request["review"], expected, expected_sources)
    try:
        for event in iterator:
            progress.append(event)
            if request.get("until") == "first-entry" or (request.get("until") == "review-removed" and event["step"] == "review-removed"):
                break
    except ReviewRefused as error:
        if str(error) != "missing-review-final-metadata-quarantine":
            raise
        return {"decision": "quarantined-final-metadata", "noDeletionAttempted": not progress}
    finally:
        iterator.close()
    return {"decision": "removed" if progress and progress[-1]["step"] == "group-removed" else "interrupted",
            "progress": progress, "rootAbsent": bool(progress and progress[-1].get("rootAbsent"))}
