# S3 qualification summary

**Status: partial.** Twelve verified cohorts support bounded feasibility
findings. They do not qualify full S3, all providers or production use.
The machine-readable [assessment](evidence/assessment.json) records source
versions, evidence hashes, scope and open requirements for each section.

| Section | Established within the recorded fixture | Remaining qualification |
|---|---|---|
| S3.1 Worktree basics | Owned lifecycle, offline local dependency setup, merges/conflict abort; private modules/shared cache and junction comparison | A4/representative project setup/cost and broader dependency matrix |
| S3.2 Attribution | Synthetic author/committer/trailers; one standalone Muse shell identity and parent fallback commit; whole member-range audit | Each supported CLI creating commits, overrides/extra trailers, shared-service propagation and durable bindings |
| S3.3 Push | Simulated approval and leases against local bare remote; three hook bypasses observed | Provider CLI reporting, authenticated remote route, real approval UI and durable broker |
| S3.4 Ownership | Controlled polling and fixture-approved selective recovery | Native CLI bursts, outside-worktree observations and user/Leader approval/notification |
| S3.5 Checkpoints | Raw files, fresh ordinary Git reader, safety snapshots, shadow storage and tiny timing observations | Complete rollback semantics, global reconstruction, member suspension, approval/event coordination and representative timing |
| S3.6 Final merge | Pinned fast-forward transfer and dirty/divergent/stale refusal | Real diff approval, Leader/integration test gates and interrupted-merge reconciliation |
| S3.7 Windows | 303-character ASCII path, casing guards, CRLF recovery and exclusive-lock refusal through explicit wrappers | Other volumes/sharing modes/path policies, antivirus contribution and production adoption |

All rows remain **partial**. The underlying observations and limitations are
described in [RESULTS.md](RESULTS.md). Current protocol/prototype coverage is
separate from native provider behavior, user-interface approval and permitted
provider access.

## Evidence provenance

`npm run assess` regenerates the deterministic assessment using existing
evidence and local Git history. It performs no new native/model cohort and
does not modify earlier records. `npm run assess:check` verifies that the saved
assessment still matches its inputs.

For each selected cohort it checks latest/sealed byte equality, SHA-256,
manifest, platform, recorded versions, result and the existing cohort pass
predicate. It verifies qualification bytes and measured source hashes at the
Git commit which introduced that qualification. It then compares those
recorded source hashes with the workspace. Missing history, incompatible
versions or corrupted inputs fail the check. Recover the required history or
inspect the mismatch before regenerating; regeneration does not relax checks.

Two cohorts use **historical source only**: `basics` and `checkpoints`. Their
original source is recoverable at the assessment's recorded commits, but some
measured files have since changed. Other cohorts' recorded source bytes match
the current files. Neither label establishes a fresh execution on the current
machine or complete coverage of every runtime dependency. Assessment validity
is evidence verification, not a new runtime qualification.

## Decisions supported by the evidence

- Keep owned worktrees as the default editing layout, with explicit Windows
  creation/removal wrappers for their tested preflights.
- Use private `node_modules` with a shared cache as the tested dependency
  candidate; the observed junction replacement does not prove generic sharing
  isolation or a speedup.
- Audit member commit ranges and retain parent-created fallback attribution
  as a bounded candidate. CLI defaults do not enforce author identity or trailers.
- Describe CLI hook controls as bypassable and ownership monitoring as detection.
- Retain reviewed selective recovery, safety checkpoints and conservative
  refusal. Controlled writers and explicit approval remain necessary.
- Keep final merge limited to clean, pinned fast-forward histories in this
  prototype. Refusals leave the integration result available.

## S4 entry conditions

Read-only provider documentation research and installed CLI inventory may
begin while S3 remains partial. This does not clear full implementation or
release gates. No provider access classification has been made here.

The next research step is defined in
[the S4 entry plan](../s4-provider-access/ENTRY-PLAN.md). It distinguishes vendor,
model, CLI and access route, and records native capability separately from
permitted use. Delegation success is evidence about that invocation only.
It does not establish subscription eligibility or approval for third-party
access. The open S3 requirements stay visible during S4 work.
