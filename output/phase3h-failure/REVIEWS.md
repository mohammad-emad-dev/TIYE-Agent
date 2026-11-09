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

## Scope statement

This remains a restricted subset of Architecture4.2/4.7/offline5.1/5.3: one
read-only `get_failures` tool over the existing failure projection, no core
writes, no observation, no handoff authorization. Core/mock-team production
code and schema7 are unchanged; all 552 prior cases are retained.
