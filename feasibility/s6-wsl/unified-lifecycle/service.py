# service.py
import os
import re
import subprocess

UNIT_RE = re.compile(r"tiye-service-[0-9a-f]{32}\.service\Z")
HEX32_RE = re.compile(r"[0-9a-f]{32}\Z")
PROPERTIES = (
    "Id", "LoadState", "InvocationID", "ControlGroup", "MainPID",
    "ActiveState", "SubState", "Result", "ExecMainCode", "ExecMainStatus",
    "KillMode", "ExitType", "TimeoutStopUSec", "RuntimeMaxUSec",
    "SendSIGKILL", "Delegate", "Restart", "Transient", "UMask",
)
BUS_ENV = {
    "PATH": "/usr/bin:/bin",
    "LC_ALL": "C.UTF-8",
    "XDG_RUNTIME_DIR": "/run/user/1000",
    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus",
}


def _text(value):
    if value is None:
        return ""
    return value.decode("utf-8", "replace") if isinstance(value, bytes) else value


def _clip(value, limit=2048):
    value = _text(value)
    return value if len(value) <= limit else value[:limit] + "...[truncated]"


def command(argv, env=BUS_ENV):
    try:
        p = subprocess.run(
            argv, env=env, timeout=3, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            encoding="utf-8", errors="replace", check=False,
        )
        return {
            "returnCode": p.returncode, "stdout": p.stdout,
            "stderr": _clip(p.stderr), "timedOut": False,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "returnCode": None, "stdout": _text(exc.stdout),
            "stderr": _clip(exc.stderr), "timedOut": True,
        }


def _command_error(action, result):
    return RuntimeError(
        f"{action} failed (returnCode={result['returnCode']}, "
        f"timedOut={result['timedOut']}): {result['stderr']}"
    )


def query(unit):
    if not isinstance(unit, str) or not UNIT_RE.fullmatch(unit):
        raise ValueError("invalid unit")
    argv = [
        "/usr/bin/systemctl", "--user", "show", unit, "--no-pager",
        "--property=" + ",".join(PROPERTIES),
    ]
    result = command(argv, dict(BUS_ENV))
    if len(result["stdout"]) > 65536:
        raise ValueError("malformed systemctl output")
    properties = {}
    for line in result["stdout"].splitlines():
        key, sep, value = line.partition("=")
        if not sep or not key or key not in PROPERTIES or key in properties:
            raise ValueError("malformed systemctl property output")
        properties[key] = value
    answer = {
        "returnCode": result["returnCode"],
        "stderr": result["stderr"],
        "properties": properties,
    }
    if result["timedOut"]:
        answer["timedOut"] = True
    return answer


def _identity_matches(observation, descriptor):
    props = observation["properties"]
    group_matches = props.get('ControlGroup') == descriptor.get('controlGroup')
    if props.get('ActiveState') in ('failed', 'inactive') and props.get('MainPID') == '0':
        group_matches = props.get('ControlGroup') in ('', descriptor.get('controlGroup'))
    return (
        props.get("Id") == descriptor.get("unit")
        and props.get("InvocationID") == descriptor.get("invocationId")
        and group_matches
    )


def _require_identity(observation, descriptor):
    if not _identity_matches(observation, descriptor):
        raise ValueError("unit-identity-mismatch")


def stop_owned(descriptor):
    if not isinstance(descriptor, dict):
        raise ValueError("unit-identity-mismatch")
    unit = descriptor.get("unit")
    initial = query(unit)
    if initial.get('timedOut'):
        raise RuntimeError('unit-query-timeout')
    if initial["properties"].get("LoadState") == "not-found":
        return {"state": "already-gone", "query": initial, "finalQuery": initial}
    _require_identity(initial, descriptor)
    if initial.get("timedOut") or initial["returnCode"] != 0:
        raise RuntimeError("refusing stop: unit query failed")

    stopped = command(
        ["/usr/bin/systemctl", "--user", "stop", unit], dict(BUS_ENV)
    )
    if stopped["timedOut"] or stopped["returnCode"] != 0:
        raise _command_error("systemctl stop", stopped)

    post_stop = query(unit)
    reset = None
    final = post_stop
    if post_stop["properties"].get("LoadState") != "not-found":
        if post_stop.get('timedOut') or post_stop['returnCode'] != 0:
            raise RuntimeError('post-stop-query-unverified')
        _require_identity(post_stop, descriptor)
        if post_stop["properties"].get("ActiveState") in ("failed", "inactive"):
            reset = command(
                ["/usr/bin/systemctl", "--user", "reset-failed", unit],
                dict(BUS_ENV),
            )
            if reset["timedOut"] or reset["returnCode"] != 0:
                raise _command_error("systemctl reset-failed", reset)
            final = query(unit)
    if final.get('timedOut'):
        raise RuntimeError('final-query-timeout')
    if final['returnCode'] != 0 and final['properties'].get('LoadState') != 'not-found':
        raise RuntimeError('final-query-unverified')
    return {
        "state": "stop-requested",
        "initialQuery": initial,
        "stop": stopped,
        "postStopQuery": post_stop,
        "reset": reset,
        "finalQuery": final,
    }
