# Review and dispositions

Parent implemented and reviewed this slice directly; no delegate relay was
invoked — no execution-capable delegation was available in the session, and
review.json is intentionally absent for an implementation that has not yet
executed its qualification run.

Review method: full static review of every new and changed module against the
actual core, adapter, and controller semantics, with each behavioral claim
traced through the real control flow (loop step/dispatch/gate ordering,
adapter record/finish/closed paths, script turn grammar, engine reduce
functions, replay projection comparison, and the capacity ledger). The build
and test suite have **not** executed at the time of writing — the tool safety
classifier rejected every script invocation — so this document records
defects found by review, not test results.

## Defects found and corrected during review

1. `FAILURE_MODES` missing from the adapter index import and the profile
   lookup — both build-time failures for the `failure` profile. Fixed.
2. `Run.history` and `Outcome.history` unions excluded `FailureMessage`.
   Fixed in loop.ts and types.ts.
3. `failure-context` ended its final turn with empty prose, which the history
   validator rejects (empty `assistant.text`), failing the run. The script now
   sends a bounded closing text on turn 2.
4. Forged-argument/call/context modes never emitted a read on turn 1, so they
   would have completed normally instead of exercising frame refusal. Turn-1
   read emission extended to those modes.
5. `failure-two-reads` never reached a second read: the receipt branch consumed
   turn 2 first. An explicit turn-2 read branch now precedes it.
6. `failure-after-tool` never fired: its turn-1 read was missing from the read
   emission list. Added.
7. The bridge silently filtered foreign-session notices — replaced with an
   explicit `failure-foreign-notice` refusal (open, never silently drop).
8. Read-path failure initially mapped to `failed` because no uncertainty flag
   existed for reads; `failureUncertain` now feeds fail/stop so aborted
   snapshots, measured overruns, and bridge refusals fence to
   `needs_attention` without retry.
9. Continuation ambiguity after a completed read expected `needs_attention`;
   corrected to `failed` — a read-only profile has no durable intent to
   reconcile, matching the 3B loop precedent.
10. The aborted-snapshot test injected a fault on `COMMIT` and the overrun test
    on `COMMIT`, neither of which a read issues; both now fault
    `store.snapshot` deterministically on the read call.
11. The capacity fixture seeded rejected rows against a member id, producing a
    projection-drift refusal on reopen; it now seeds a real task first, as the
    3F fixture does.
12. The capacity test asserted a read failure that cannot occur (reads do not
    append); replaced with success-without-consumption proof.
13. Two tautological assertions (`deepEqual(durable, {...durable})`) replaced
    with pre-run snapshots.
14. The observer test listened for a `kind` field on loop events (which carry
    `type`) and would have thrown; rewritten as the finished-notification stop
    case.
15. The verifier protected `protocol.ts`/`scripted.ts`, which this slice must
    change; the protected list now excludes them and covers the frozen bridge
    and contract modules instead.
16. Suite counts were inconsistent across plan, capture, and verifier; all now
    state 36 focused, 588 total.

## Qualification rerun corrections — 9 November 2026

The first qualification attempt stopped at `build-adapter` with exit 2.
`failure-contract.ts:18` passed a `string` to
`ReadonlyArray<'crash' | 'hang' | 'rate_limit' | 'auth' | 'network'>.includes`.
The reviewed source declares `REASONS` as a const tuple; the runtime-validation
cast did not widen the receiver. Corrected to
`(REASONS as readonly string[]).includes(...)`. Accepted reasons remain the same
closed union and unknown reasons still refuse; no behavior or scope change.

The second attempt stopped at `build-loop` with exit 2: `core-failure.ts`
declared `const projection=checked()` but never read the value. Corrected to
`checked();`, preserving the fresh replay-checked snapshot and roster-drift
validation. No behavior or scope change.

The failed runs' incremental streams remain under `.git/tiye-phase3h-failure/`.
A new preflight is required before the rerun; there is no silent retry.

## Focused-stage corrections — 9 November 2026

After both builds passed, the focused suite exposed further defects that static
review had missed. Each is listed with its cause and the correction made; all
remain inside the approved read-only failure-view scope.

17. The mixed fixture's third notice was rejected: a member holding an
    awaiting-reconciliation task cannot start another task. The fixture now
    seeds its closed notice on the other session member, and the assertions
    derive `memberRef`/`role` from the recorded notice rather than assuming
    one member for all notices.
18. The focused suite hung after that repair: `adapter.ts` normalized events
    for `loop`, `report-loop`, `question-loop`, `mission-loop`,
    `coordination-loop` and `handoff-loop` but omitted `failure-loop` from the
    run-id/turn/received-bytes list, so `loop.accept` ignored every failure
    adapter event and the run never settled. `failure-loop` was added to the
    same list.
19. The mixed-read test looped a single set of failure-content assertions over
    both `failure-view` and `failure-context`, but the approved contract admits
    exactly one read: `get_my_context` **or** `get_failures` (CONTRACT.md,
    "Bounds and stop ordering"; README.md repeats it). `failure-context` is
    the context-only continuation — turn 1 reads context, turn 2 emits bounded
    prose. The test was split into the direct mixed-read case and a
    context-continuation case that asserts one context read, no failure view
    and unchanged durability. No implementation behavior was broadened.
20. The open-question case started its uncertain task on a member that already
    held an active task. It now starts on the Leader, the only free member.
21. `failure-after-tool` and `failure-two-reads` finished `failed` instead of
    `needs_attention`. The generic `tool-after-report-or-context` guard
    consumed the event as a generic violation, bypassing the reviewed
    read-uncertainty fencing (defect 8 above). Failure-profile reads are now
    excluded from that generic guard, and a valid tool after the admitted read
    takes an explicit branch that counts the call, marks `failureUncertain`
    and fences to `needs_attention` before any core access. Exactly one read
    remains admitted, and there is still no retry.
22. Test expectations were corrected where they disagreed with the settled
    3B/3F precedent: the closed-store continuation expects one request, and
    the ambiguous-creation continuation expects `needs_attention`.
23. The suite stood at 35 cases against the planned 36; the combined
    awaiting/closed reconciliation test was split into its two explicit cases.
24. The review also confirmed the history validator's single-pair cap: with
    one admitted read per conversation, a history can contain at most one
    context or failure pair. No validator change was needed (an earlier
    two-slot attempt was discarded as scope drift).

After these corrections the focused suite ran 36 tests with 36 passes and no
failures. This document is sealed by the qualification preflight that follows.

## Scope statement

This remains a restricted subset of Architecture4.2/4.7/offline5.1/5.3: one
read-only `get_failures` tool over the existing failure projection, no core
writes, no observation, no handoff authorization. Core/mock-team production
code and schema7 are unchanged; all 552 prior cases are retained.
