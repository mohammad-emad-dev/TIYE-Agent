# Attention resolution coverage record

**Recorded:** 2026-11-09
**Kind:** Coverage determination derived from existing owner approvals — **not a
new owner approval**.

## Coverage

The explicit synthetic attention-resolution slice is a Phase 1B follow-up. It is
covered by the Phase 1B coverage record in
[output/phase1b-approval/approval.json](../phase1b-approval/approval.json), which
derives from the owner's 23 October 2026 approval of the Phase 1 amendment.

The approved first-core contract requires this behavior:

> Attention requires a later explicit resolution command and cannot silently
> resume.

See [output/phase1-entry-review/CORE-SLICE.md](../phase1-entry-review/CORE-SLICE.md).
The [implementation evidence](README.md) adds only two explicit fixture outcomes:
confirm completion from an existing exact single-row witness observation, or close
the uncertain attempt as `abandoned`. Neither outcome reopens approval, creates an
attempt, invokes the witness again or retries an action.

**Scope:** `EXPLICIT_SYNTHETIC_ATTENTION_RESOLUTION_ONLY`.
**Implementation:** `ace16a6`.
**New external effect:** none. **Retry allowed:** none. **Provider/native
integration:** HOLD. **Release:** not allowed.
