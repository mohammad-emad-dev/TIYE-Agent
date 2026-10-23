# Proposed amendment to Architecture 11.2

23 October 2026 · **Proposal only — owner approval pending**

## Decision to approve

Permit internal Phase 1A construction now under the following text, to be added
to Architecture 11.2 only after the project owner explicitly approves it:

> Internal construction exception: while S1–S6 remain partial, the team may build
> and test a headless local core and event store using owned disposable databases.
> Phase 1A has no external effect runner. Subsequent Phase 1B may add only the
> separately reviewed synthetic witness/effect implementation described in the
> first-core contract. Neither slice admits providers, native CLIs, terminal
> control, real project operations, Git, networking, exports or release. This
> exception changes construction sequencing only. S1–S6 evidence and limitations
> remain mandatory before their dependent integrations and before release. The
> complete product release scope and remaining build order are unchanged.

The complete [first-core contract](CORE-SLICE.md) and the scope in this amendment
are the approval target. Approval of the three model reviews alone is insufficient.
This does not approve a source hash for code that has not yet been written.

## What the next implementation task delivers

**Phase 1A:** product core sources separate from frozen feasibility harnesses;
transactional command acceptance, a versioned SQLite event log, deterministic
projection rebuild, safe reopen/refusal behavior and fresh-process tests. No
effect dispatcher or mock action is included in 1A.

**Phase 1B:** follows acceptance of 1A and a separate review of the actual new
mock-witness source and test-host composition. It implements durable planning,
claiming, fixture approval, one-attempt mock dispatch and crash reconciliation.
This amendment permits developing that scoped source after 1A; execution waits
for its parent-reviewed source-bound test plan. A provider or real-project effect
requires another applicable integration decision.

## Activation and limits

- The current broad Phase 1 gate stays HOLD until this amendment is approved.
- If approved, record the owner's explicit response, date and this proposal's
  artifact digest in a separate approval record; then apply the text to 11.2.
- The resulting permission is `INTERNAL_1A_ONLY`, not full Phase 1 readiness,
  native admission, provider entitlement or release approval.
- It lasts only through the scoped 1A/1B internal milestone and ends at its exit
  review. The owner may revoke it at any time. Changed scope or newly reachable
  external effects stop the slice pending a new decision.
- Installation/build/runtime dependencies and the actual owned database root
  must be reviewed before the first run. No native package installation or
  platform isolation guarantee is approved by this document.
- The implementation must not import frozen harness source as product core.
  Existing evidence remains historical and immutable.
- Open feasibility work resumes when its listed integration dependency is
  scheduled. Successful mock tests cannot close S1–S6 or native admission.

## Alternatives considered

**Keep all construction on HOLD:** consistent with today's architecture, but
prevents testing the durable core until unrelated integration qualification is
finished. If this amendment is rejected, continue against the explicit gap ledger.

**Declare the current full gate ready:** unsupported by the evidence and rejected.
Current model delegation and passing synthetic checks do not qualify product routes.

**Start adapters, UI or native exports first:** conflicts with the documented
core-first build order and introduces effects before durable recovery is ready.

## Owner response

An explicit response such as **“Approve the internal Phase 1A amendment”** approves
this exact bounded proposal. Until that response, no product core is implemented
under this exception. Merely verifying or committing this proposal does not activate it.
