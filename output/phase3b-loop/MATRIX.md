# Implementation coverage

| Approved behavior | Actual evidence |
| --- | --- |
| Fixed offline composition | Three builds/four boundary checks, explicit loop profile, no installs/network/credentials/core runtime imports, unchanged core/mock-team bytes |
| Bound reader and result round trip | Real schema7 member context, matching assistant-call/tool-result pair in actual submitted snapshot, scripted reply validates/uses the profile, unchanged core projection/events |
| Isolation and authority | Two real members, duplicate/foreign binding refusal, immutable profile/history, unknown tool/args/context/call IDs rejected, legacy factory still refuses loops/tools |
| Tool completion proof | Candidate/end without closure does not read, mixed/duplicate/truncated/malformed/extra/error/disconnect turns fail, one accepted tool event only after full proof |
| Finite work/history | Two runs,3 requests/2 reads per run,6 lifetime requests, duplicate run/call refusal, read reservation before invocation,32KiB/eight-message history and64KiB conversation cap |
| Stop and error truth | Four owned stop gates, admission stop before creation, successful read retained without continuation, actual SQLite stop abort/lost reply, closed/stopped/invalid core profile refusal |
| Uncertainty and old work | Ambiguous continuation and throwing abort, one creation/abort, no retry, captured callbacks cannot affect later conversation, reentrant next-run scheduling |
| Cleanup and observers | Real scripts/core, bounded async subscriber diagnostics, owned pump/gate disposal and adapter listener/timer/waiter cleanup before closing generated roots |
| Acceptance record |273 retained tests plus36 new tests; complete four-package source/compiled/native preflight, finite780-second budget, raw streams local and safe hashes public |

This implements the bounded offline send/tool/result/continue foundation of
Architecture5.3 and only the existing read-only MemberContext subset of4.2.
Metadata/binding checks are distinct from tool-read attempts. Synchronous SQLite
overrun detection does not preempt blocked native calls; no such wall-time
guarantee is inferred. Actual request/cleanup bounds remain10/5 seconds.

Provider formats, SDK/HTTP/key handling, MCP/authentication, mutating tools,
permission/file/command enforcement, core task dispatch/reporting, durable loop
recovery, UI and release remain outside scope. Scripted local closure is no proof
of remote cancellation. Implementation qualification does not close Phase3B exit.
