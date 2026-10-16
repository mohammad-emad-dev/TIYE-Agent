# S6 Ubuntu-to-Windows mock team tools — 16 October 2026

**Partial result:** under the observed WSL **NAT** mode, direct Ubuntu loopback
was refused. A WSL interoperability pipe relay completed the same authenticated
mock MCP exchanges as the native Windows positive control. The relay result is
a distinct route; it does not turn direct networking into a pass.

| Route | Observed result |
|---|---|
| Windows Python → Windows loopback MCP server | Two-member round trip completed |
| Ubuntu Python → `127.0.0.1` at the Windows server's port | `ConnectionRefusedError` at the first request; no server tool calls |
| Ubuntu Python → Windows `node.exe` over interop/stdin → Windows loopback MCP server | Two-member round trip completed |

Recorded runtime versions: Ubuntu Python 3.14.4, Windows Node v26.7.0 and the
existing MCP SDK 1.32.1. These are capture facts, not general compatibility claims.
`wslinfo --networking-mode` returned `nat`; mirrored and other networking modes
were not enabled or tested. No gateway-address/LAN listener was attempted.

## What the successful routes checked

Each route initialized member-a and member-b sessions, sent initialized
notifications, listed the three existing team tools, and called `report_result`
once per member. JSON-RPC response IDs and exact feasibility acknowledgement
text matched. The Windows server independently logged the expected per-run
summary marker for both members in each successful route. This is a synthetic
tool acknowledgement with no engine effect or real model.

Each successful route observed HTTP 401 for missing token, bad token and
member-b's token with member-a's session. Server logs independently retain the
corresponding authentication and session-ownership rejection markers. Both owned
sessions were deleted with HTTP 200 and matching server session-close records.
The direct-loopback route stopped at its first refused connection; these auth
and session checks were **not** exercised over that route.

## Implementation and evidence

The [protocol](../../feasibility/s6-wsl/connectivity/protocol.json) was saved
before launch. The [coordinator](../../feasibility/s6-wsl/connectivity/run.py)
started the **unchanged** [S2 team-tools server](../../feasibility/s2-control/src/team-tools-server.js)
on Windows `127.0.0.1` at an OS-assigned ephemeral port. Its child handle and
ready message identify the owned fixture. The shared OpenCode service on 40900
was not used or changed.

The [client](../../feasibility/s6-wsl/connectivity/client.py) uses Python's standard
library and parses bounded JSON/SSE replies. The [pipe relay](../../feasibility/s6-wsl/connectivity/relay.cjs)
uses one Windows Node process per HTTP exchange, with fixed loopback `/mcp`
destination and no additional listener. Node's Windows path was resolved and
converted for Ubuntu explicitly. Linux Node is not installed or implied.
Interop was exercised successfully; it remains a dependency of this route.

There was one attempt per route with no retry. The coordinator has a 180-second
deadline and each client a 25-second limit; direct HTTP uses three seconds,
the relay HTTP timeout five seconds, and its client subprocess seven seconds.
Response bodies are limited to 64 KiB. The overall timeout path and helper
failure cleanup were not exercised by this capture.

Per-run member credentials, summary marker and session IDs stayed in process
memory/stdin. They were not written as request/response transcripts. Client
artifacts contain projected operation/status/match fields; server logs omit
credentials, session IDs and argument contents. Runtime-token/marker values were
checked against outputs before persistence. The stored hashes cover these
projected artifacts, not raw token-bearing wire bytes. This is not a universal
secret detector or a secure credential store.

The [manifest](evidence.json) retains source/artifact hashes and distinct route
outcomes; all measured source hashes matched after execution. Startup discovery
also checked local Python/Node versions and converted the Windows Node path.
Earlier unsealed availability/mode queries preceded this measured capture.

## Shutdown observations and original nonzero exit

Both successful routes closed their sessions. The parent terminated only its
owned Windows server process handle and observed its exit. This was Windows
handle termination, **not graceful product shutdown**. The immediate post-exit
connect check was inconclusive (`null` in the manifest), and a separate diagnostic
connection also timed out. The original coordinator therefore exited **1**;
its gate outcome and frozen source are preserved.

A later [Windows listener-table observation](listener-observation.json), using
the [read-only observer](../../feasibility/s6-wsl/connectivity/observe-listener.ps1),
found zero TCP listeners at that exact port. This supplements the exit evidence;
it does not rewrite the earlier connect check as connection-refused. The reason
for the post-exit connection timeouts was not isolated. No whole-process-tree,
abnormal-recovery or helper-cleanup guarantee follows.

Verify the saved **partial** observations without network or provider activity:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/connectivity/check.py
```

Checker success verifies the direct refusal, successful control/relay exchanges
and later listener observation. It is not full-S6 qualification or proof that
every cleanup path passed. The launcher refuses the existing evidence directory.

## Architecture consequence and next step

Keep Windows team tools loopback-bound. The tested interop pipe relay is a
feasibility candidate for WSL NAT; direct WSL loopback remains unsupported by this
capture. No firewall rule, WSL networking mode, host network configuration or
LAN/wildcard bind was changed. The existing S2 mock remains separate from the
product service and from provider access qualification.

Next, measure explicit allowlisted briefing/environment propagation through WSL
and retain process-identity/recovery requirements for a separate bounded test.
Electron PTY behavior, provider CLI behavior, other networking modes and full S6
remain open. Phase 1 construction is not cleared by this transport result.

## Delegated review

Muse Spark 1.3 Free xhigh and the authorized Space Bunny Free xhigh and DeepSeek
V4.1 Flash Free max fallbacks completed supplied-context reviews. They did not
inspect the workspace or measured outcomes; structured streams contain zero
observed tool events. The parent implemented and verified this capture. See
[review metadata](review.json). The previously unsupported exact Codex model
and excluded consumer Agy route were not invoked.

Retained advice: distinguish routes, correlate server records, preserve cleanup
limits and keep runtime credentials out of persisted transcripts. The relay
starts with **Ubuntu Python**, not Windows Python. The unchanged S2 server has
no custom HTTP auth-failure response marker; client 401s are corroborated by its
server-side log markers instead. No unsupported attribution/header claim follows.
