# Phase 3E implementation execution plan

Owner continuation of c58d57f is recorded in phase3e-approval. Parent review covers
the closed mission codec, fixed profile enum/factory/modes, narrow session/Leader
bridge, loop post-completion guard and real-core tests. Only TypeScript compilation
and JavaScript syntax checking have run; no new runtime test has executed.
Pin all four source/test inventories, compiled outputs, approval records, existing
Node26.7.0 Windows x64 ABI147 and native dependency hashes before execution.
Core/mock-team production and all 402 accepted test bodies remain byte-identical.

Only core-mission captures member.completeMission and checked context/mission/
snapshot readers. Binding validates an actual active Leader before capture; no
own task is required. Canonical private command/ID/attempt and continuation
capacity reserve before writing. Known receipts match actual command and mission
projections. After acceptance status(run) uses fresh completed(receipt), never
active(). Only a text continuation is allowed after any decision. Unknown writes
fence mission uncertainty despite verified adapter cleanup. Existing profiles
retain their active checks, quotas and validators; enum selection is closed.

Retain 402 tests and add 50 actual-core cases:
6 proven single/multiple/recovered x direct/context round trips with exact receipt
delivery, taskless Leader and replay; 6 actual ineligible-work rejections;
2 text/prose-only cases; 9 malformed/forged/mixed/unclosed tool turns;
4 accepted/rejected x post-decision tool refusals; 1 repeated context refusal;
4 SQLite completion abort/lost reply x accepted/rejected commands;
3 stop barriers; 4 SQLite core-stop failures before/after completion;
1 closed-store post-completion read; 3 continuation failures/history overrun;
1 real measured completion overrun; 1 independent closure/stale callback case;
2 observer stop/admitted dispatch cases; 1 binding/legacy factory refusal;
1 schema-bounds case; 1 actual closed-admission case. Expected total 452 tests.

Trusted setup uses only existing fixed core question/witness helpers to create,
settle and report tasks. The recovered case uses existing observe/handoff/start
APIs, with an independently proven successful replacement. No new runner/process
composition, fake core/reader/clock, SDK, network or credential. Actual SQLite
fault hooks restore in finally. A bounded 10025ms Atomics.wait after actual COMMIT
must produce unknown acknowledgement, not a successful operation timing claim.
Existing overrun cases stay. Dispose pumps/scripts/listeners/timers before store
close/private-root cleanup; replay precedes cleanup.

Mission profile: one loop/conversation, three requests, two tool attempts, one
optional context read and one completion. Eight controller checks maximum; the
largest valid flow uses three admissions, context validation, completion
validation and final receipt validation (six). Setup/internal bridge checks
belong to their one bounded operation. No tools or later run after the completion
attempt. Other profiles keep their existing limits, including question checks.

Run three builds/four import-capability gates and the full suite. Whole ceiling
is prior 1140 plus 180 seconds for 50 private native cases/witness setup, 5s
ambiguous cleanup and 10.025s deliberate overrun: 1320 seconds. Request 10s and
cleanup 5s limits stay unchanged. Rebuilds must reproduce compiled bytes. Keep
incremental raw streams/failed attempts under a fresh .git directory; never
silently retry or extend deadlines. Implementation evidence does not close the
separate Phase3E exit or provider/native/UI/release gates.
