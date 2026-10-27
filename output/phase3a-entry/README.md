# Next slice: API adapter lifecycle and streaming

27 October 2026 — proposed construction scope; owner decision pending.

The [Phase2F exit](../phase2f-exit/README.md) accepted the fixed owned-worker
contract with228 passing tests. Architecture11.2 next calls for API-first adapters.
The next implementation milestone is a private TypeScript adapter package with
the common lifecycle and validated streaming events, exercised through one fixed
scripted in-memory API transport. This establishes the boundary that later real
provider transports and the UI will use.

Review [AMENDMENT.md](AMENDMENT.md) and [CONTRACT.md](CONTRACT.md). The proposed
package admits at most one request per member at a time, creates each admitted
request once, rejects duplicate identities, bounds stream memory and keeps late
events tied to their original request. Cancellation or a disconnected stream
does not prove remote work stopped. Text completion never completes a core task.

This proposal adds no implementation, test execution, dependency or network
access. The accepted core and worker packages remain byte-identical. Construction
starts after the owner decides on this frozen proposal and the actual new source
and test composition pass parent review. Provider credentials/HTTPS, tools, agent
loops, core dispatch binding, terminals, UI, filesystem actions and release remain
outside this slice. It is a narrow adapter foundation, not a working provider
integration or the complete MemberAdapter implementation.
