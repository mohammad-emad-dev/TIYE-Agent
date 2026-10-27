# Proposed internal Phase 3B amendment

27 October 2026 — proposal; owner decision pending.

Add this bounded exception to Architecture11.2 with [CONTRACT.md](CONTRACT.md):
after Phase3A acceptance at11eee3b, permit a private `packages/api-loop/` and an
explicit loop-only profile in api-adapter. They may orchestrate up to three
sequential scripted requests per conversation and two conversations/six requests
per adapter, through a single read-only get_my_context bridge to the existing core.
Use at most two bound members in one private session per test scenario.

The bridge alone may call existing core snapshot/member/context readers. No core
or mock-team source/schema change. Tool results may enter a bounded structured
conversation; no model-selected role/handle, core writer or executable is exposed.
Tool calls run only after their entire response and local closure validate.
Preserve every273-test acceptance case, including legacy tool rejection and
subscriber isolation. Provider execution remains disabled.

Keep pinned runtime/dependencies and fixed in-memory scripted transport; no SDK
or install. No HTTP/key access, provider formats, arbitrary callback/script/tool
loader, MCP, filesystem/command/Git effect, process launch, mutating team tool,
automatic approval/request retry, durable loop resume, UI, migration/reset or
release. Actual source/test/compiled/runtime/native preflight precedes execution.
Permission covers this exact contract through its Phase3B exit review.

## Decision boundary

[Architecture11.2](../../architecture/TIYE-Agent-Architecture.md) ended the Phase3A
exception at its exit. Its [decision](../phase3a-exit/decision.json) grants no new
construction scope. This proposal adds a core-reading capability and a new
tool/continuation protocol, so an owner scope decision is needed before coding.
A response such as **Approve the internal Phase 3B amendment** approves this
amendment and linked contract at the pushed revision. Record the exact response,
revision and artifact hashes. Model feedback or proposal verification cannot
authorize construction or open provider/readiness gates.
