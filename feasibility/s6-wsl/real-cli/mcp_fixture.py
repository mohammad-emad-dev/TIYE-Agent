#!/usr/bin/env python3
"""Bounded stdio MCP fixture for the S6 real-CLI tool-attachment probe.

Reads TIYE_CALL_LOG and appends one JSON line per protocol method/event.  No
network, no model, no product effect: every call is acknowledged locally.
"""
import json
import os
import sys

LOG = os.environ.get("TIYE_CALL_LOG", "")


def record(entry):
    if not LOG:
        return
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def send(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


TOOLS = [
    {
        "name": "report_result",
        "description": "Report the completed task result to the Leader.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "status": {"type": "string", "enum": ["done", "blocked", "failed"]},
                "summary": {"type": "string", "minLength": 1, "maxLength": 1000},
            },
            "required": ["status", "summary"],
        },
    }
]


def main():
    record({"event": "server-start", "pid": os.getpid()})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            record({"event": "invalid-json"})
            continue
        method = message.get("method", "")
        record({"event": "method", "method": method})
        if method == "initialize":
            send({
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "result": {
                    "protocolVersion": (message.get("params") or {}).get("protocolVersion", "2025-06-18"),
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "tiye-s6-tool-attach", "version": "0.1.0"},
                },
            })
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": message.get("id"), "result": {"tools": TOOLS}})
        elif method == "tools/call":
            params = message.get("params") or {}
            args = params.get("arguments") or {}
            record({"event": "tool-call", "name": params.get("name", ""), "status": args.get("status", "")})
            send({
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "result": {
                    "content": [{"type": "text", "text": "report_result accepted for s6-probe"}],
                    "isError": False,
                },
            })
        elif message.get("id") is not None:
            send({"jsonrpc": "2.0", "id": message.get("id"), "result": {}})
    record({"event": "stdin-eof"})


if __name__ == "__main__":
    main()
