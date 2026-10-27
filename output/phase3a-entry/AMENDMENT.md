# Proposed internal Phase 3A amendment

27 October 2026 — proposal; owner construction decision pending.

Add this bounded construction exception to Architecture11.2 with
[CONTRACT.md](CONTRACT.md): after the accepted Phase2F exit at7d97aa2, permit a
private `packages/api-adapter/` TypeScript package implementing a narrowed common
adapter lifecycle and normalized text streaming, against a single reviewed
scripted in-memory transport. Retain all228 accepted tests and source seals.
Do not modify the core, owned-worker implementation or schema7.

The trusted fixture fixes session/member context and the scripted response mode.
Each adapter has one active request and at most six lifetime admitted requests;
test scenarios use at most two adapters. Request creation is at most once, with
bounded output, cancellation, late-event isolation and conservative unknown state.
Adapter response completion is not task completion, tool permission or approval.

Use the pinned runtime and existing TypeScript/test tools; install no dependency.
No SDK/provider HTTP, credential access, arbitrary transport/program loading,
worker/process launch, MCP, tool execution, real filesystem/project/Git action,
terminal/UI, schema migration/reset, automatic request retry or release.
First execution requires parent review and a preflight pinning every new source,
test, compiled file and existing runtime/native dependency. This exception covers
the exact Phase3A contract through its exit review; it grants no real integration.

## Decision boundary

[Architecture11.2](../../architecture/TIYE-Agent-Architecture.md) ended the Phase2F
exception at its exit. The [accepted exit decision](../phase2f-exit/decision.json)
sets `newConstructionAuthorized` to false. This proposal introduces a new adapter
package and asynchronous transport composition, so its concrete scope needs an
owner decision before implementation. A response such as **Approve the internal
Phase 3A amendment** approves this amendment and linked contract at their pushed
revision. Record the exact response, revision and digests before construction.
Delegate feedback and proposal verification do not grant that decision.
