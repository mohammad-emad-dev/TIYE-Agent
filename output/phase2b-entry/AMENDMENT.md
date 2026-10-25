# Proposed Phase 2B construction amendment

25 October 2026 — **PROPOSAL; owner approval pending**

## Decision requested

Approve this addition to Architecture 11.2 together with the linked
[construction contract](CONTRACT.md):

> Following bounded Phase 2A acceptance at `3d84035`, permit internal Phase 2B
> construction of durable synthetic questions and answers: a member asks its
> Leader, the Leader may escalate that same question to the owner, and the
> authorized recipient answers explicitly. A pending question blocks its task
> while retaining its reservation. Questions, answers, escalation, stop and
> resumed task views share the existing SQLite writer, command ledger and
> deterministic replay. Use fresh schema 4 roots, with no migration or reset of
> schemas 1–3. Execute only the existing fixed owned core/witness composition
> after parent review of actual source/tests and source-bound runtime/native
> preflight. This adds no process launcher, generic dispatcher, provider/native
> CLI, terminal, MCP/network server, credentials, real project/Git/export action,
> licensing, UI or release. Existing integration and feasibility gates remain.

The proposal admits one bounded question per assignment, at most 20 per session,
and the exact roles, eligibility, commands and budget rules in CONTRACT.md.
It does not admit arbitrary chat, automatic answers, retries/reassignment,
Leader succession, automatic failure supervision or mission completion.

Approval authorizes development of this exact slice. First execution additionally
requires parent review of actual source, fixed test composition, compiled files,
runtime and installed native dependency hashes. The exception ends at the Phase
2B exit review. Changed scope or newly reachable effects require their applicable
decision; the complete product still ships together.

## Why approval is required

Architecture 11.2 and the explicitly approved Phase 2A amendment end the previous
construction exception at its exit review. The [recorded exit decision](../phase2a-exit/decision.json)
accepts the bounded engine and expressly grants no new construction scope.
The general request to continue advances preparation of this concrete proposal;
it does not pre-approve an unwritten extension to that frozen amendment.

An explicit response such as **“Approve the internal Phase 2B amendment”** approves
this amendment and its linked contract. Record that response, date, frozen commit
and artifact digests separately before changing source or Architecture 11.2.
Model feedback is advisory and cannot substitute for that owner decision.
Until then this is a proposal, with no engine development/execution authorization.
