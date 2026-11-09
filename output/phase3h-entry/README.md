# Phase 3H proposal: bounded Leader failure view

8 November 2026 — proposal only; construction pending owner decision.

[Phase 3G exit](../phase3g-exit/README.md) at `96e0016` retained 552 passing
tests and accepted the bounded Leader-handoff contract. The next proposed
package exposes the existing schema7 Leader-visible failure projection through
one fixed offline read-only profile: the Leader reads closed and awaiting
failure notices for its active session, with reason, summary and reconciliation
state. No failure observation, task creation, handoff, scheduler, approval,
claim or invocation capability reaches the loop.

The [amendment](AMENDMENT.md) and [contract](CONTRACT.md) define the exact
proposed scope. Eligibility uses one fresh replay-checked projection; the core
stays authoritative and no write occurs. Rehabilitation stays explicit,
historical and Leader-authorized; this slice only makes failures visible.

This is a bounded subset of Architecture 4.2/4.7, not a complete supervision
tool. It preserves schema7, core/mock-team production code and all old adapter
profiles. Providers, authenticated transport, durable loop recovery, file
ownership and effects, UI, packaging and release remain unfinished.

Run `rtk proxy python -X utf8 -B output/phase3h-entry/verify.py` from the root
to verify this proposal and its unchanged source baseline once sealed. This
checker does not run the proposed composition or repeat the engine test suite.
`evidence.json`/`verification.json` seal the accepted source baseline.
