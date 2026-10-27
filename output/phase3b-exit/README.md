# Phase 3B exit review

The approved offline conversation loop passes its bounded exit contract. This
adds two real-core regression cases and no production changes. The cases prove
the ordering at final acceptance: a durable stop before acceptance rejects the
response; a stop from the accepted completion notification preserves the result.
Assertions run outside isolated subscriber callbacks so failures reach the test.

Parent review traced the fixed tool frame through whole-turn validation, local
closure, queued advancement, fresh bound-session checks, reserved read attempt,
immutable member profile, actual continuation input and final acceptance. It
also reviewed identity fences, quotas, uncertainty retention and fixture disposal.
The existing 309 cases are retained. Full verification requires 311 passes and
all three builds and four import/capability boundary gates.

Architecture mapping remains partial: 4.2 has only the bound get_my_context
subset; 5.1 has a fixed offline adapter lifecycle; 5.3 has a bounded in-memory
request/tool/result/continuation loop. The complete team tool set and production
API adapter are unfinished. Synchronous core read timing detects an overrun
after return and does not preempt SQLite.

This closes the Phase 3B construction exception only. It authorizes no subsequent
construction scope. Real provider formats, SDK/HTTPS/credentials, authenticated
transport, mutating tools, task dispatch/reporting through the loop, durable loop
recovery, UI, packaging and release need later qualification. No product-wide
completion percentage or production readiness is inferred from the test count.

Run `rtk proxy python -X utf8 -B output/phase3b-exit/verify.py` from the repository
root to check source, compiled, dependency, approval and historical artifact seals.
`evidence.json` records the actual qualification; `verification.json` records
measured command results. Raw streams remain local under .git.
