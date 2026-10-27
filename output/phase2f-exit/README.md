# Phase 2F exit review

This review assesses the fixed owned-worker contract frozen at4405293 and the
implementation atf4d95a0. The owner delegated that exact scope and continued this
exit review. It does not authorize a new integration or construction phase.

Parent review found and reproduced a real bug: stop followed by invoke within
one input chunk appended a witness record after stop acceptance. The worker now
rejects frames after exit and invocation after any accepted stop, including a
fixture mode that deliberately ignores stop for teardown testing. Four actual
child-process regressions cover both stop modes, duplicate invocation and extra
actor fields; a fifth check refuses the core database as a witness before launch.

`red-verification.json` records the expected failure with one actual append;
`verification.json` records the final combined suite. `MATRIX.md` maps the
contract and remaining Architecture4 scope; `decision.json` records the verdict.
`verify.py` checks source/compiled/native hashes, execution records, approval,
historical seals and the exit decision. Raw streams and delegate transcripts
remain local; public records expose safe summaries and digests.

Provider/native integration, UI and release remain HOLD. These fixed same-user
workers do not provide hostile-code isolation or whole-host crash containment.
