# Phase 1B coverage approval record

**Recorded:** 2026-11-09
**Kind:** Coverage determination derived from an existing owner approval — **not a
new owner approval**.

## Authority

On 23 October 2026 the project owner answered **“Approve the internal Phase 1A
amendment”** to the question identifying the proposal at `2107f5c` and the
first-core contract. That response is retained verbatim with artifact hashes in
[output/phase1a-core/approval.json](../phase1a-core/approval.json).

The approved amendment is explicit that Phase 1B is included:

> Subsequent Phase 1B may add only the separately reviewed synthetic
> witness/effect implementation described in the first-core contract.

[output/phase1-entry-review/AMENDMENT.md](../phase1-entry-review/AMENDMENT.md)
also requires Phase 1A acceptance and a separate review of the actual new
mock-witness source and test-host composition before 1B execution.
[output/phase1b-core/TEST-PLAN.md](../phase1b-core/TEST-PLAN.md) records that
separately reviewed composition and the owner's continued-implementation
instruction before the frozen execution.

## Activation

| Condition | Record |
|---|---|
| Owner approved the amendment that permits 1B | `output/phase1a-core/approval.json` |
| Phase 1A accepted | `4f237b1`, recorded in `output/phase1a-core/README.md` |
| Separate 1B source/test review frozen before execution | `output/phase1b-core/TEST-PLAN.md` and `preflight.json` |
| 1B implementation | `11e4905` |

**Scope:** `INTERNAL_PHASE1B_SYNTHETIC_EFFECTS_ONLY` — durable plans, exact
fixture approval, one-time claims, a fixed mock witness and crash reconciliation.
No provider, native CLI, terminal, real project, Git, network, export or release
capability is admitted.

## The `phase1bExecutionAllowed:false` flag

The Phase 1A approval JSON records `phase1bExecutionAllowed: false`. That flag is
retained unchanged because `output/phase1a-core/evidence.json` binds the approval
file's SHA-256 and its verifier asserts the historical value. It is a
point-in-time 1A activation snapshot, not a permanent prohibition: the approved
amendment expressly permits 1B after 1A acceptance and separate review, which
occurred before `11e4905`.

This record supplies the later 1B coverage determination
([approval.json](approval.json)). It does not rewrite the historical 1A artifact
and does not claim a new owner response.
