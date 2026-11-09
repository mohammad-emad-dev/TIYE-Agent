# Review and dispositions

Parent implemented, qualified and reviewed this slice directly; no external
delegate relay was invoked. `delegates.json` records the empty relay set.

The exit review re-read the approved contract, the seal in
`output/phase3h-failure/evidence.json` and the actual qualification streams
before accepting. The contract's read bound is exact: one conversation admits
one read, either `get_my_context` or `get_failures`. A valid tool emitted after
that read refuses before any core reread and fences uncertainty without retry.
The bridge exposes only the existing Leader-visible failure projection, mapped
to roster `memberRef`s; raw member UUIDs, effect payloads, questions, handoff
lineages, paths and foreign sessions stay out. Durable commands, assignments,
failures and handoffs are identical before and after a read.

Qualification defects were found and corrected inside the approved scope, not
waived: two compile errors (`REASONS` receiver widening and an unused
`projection` binding), the omitted `failure-loop` event normalization that
stalled the loop, mixed-fixture occupancy seeding, and the read-uncertainty
fencing for a valid tool after the admitted read. One test had attributed a
second failure read to the context-only mode, contrary to the approved
single-read contract; the test and plan were corrected and no implementation
behavior was broadened. Details are in
[REVIEWS.md](../phase3h-failure/REVIEWS.md).

The 36 new actual-core cases and all 552 prior cases pass (588 total).
Core/mock-team production code, schema7, old profiles and historical evidence
are unchanged. This is a fixed, trusted, offline subset; providers, native
integration, rejecting/generic adapters, durable recovery, full team tools,
files/commands, UI, packaging and release remain their own admission work.
