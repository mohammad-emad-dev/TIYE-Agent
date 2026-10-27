# Implementation review

Luna max completed a focused turn-controller review. The parent adopted explicit
live checks after status validation and a terminal-event guard before any later
data can affect accounting/history. Request generation is tracked before adapter
admission as well as run/turn/request identity. The fixed bridge itself invokes
no user callbacks, but the guards make loop ownership self-contained.

Flint40B Free's relay failed without a report; the outer adapter reported
adapter_timeout. DeepSeekV4.1 Flash Free max returned a completed report while
its outer adapter reported adapter_timeout. Both status layers/raw hashes are
recorded. None is approval or proof of passing tests.

The parent rejected DeepSeek's suggestion to exempt an end candidate from the
10-second closure deadline: the approved contract requires full transcript AND
verified closure within the request operation. End alone cannot authorize a read.
Its second suggestion assumed a remote provider behind verified local closure.
This composition has only fixed local scripts, advertises no remote verification
and already retains disconnect/unverified cleanup. Changing all legacy local
faults to remote uncertainty would alter accepted behavior; the new loop instead
fences failures and never retries. Real remote execution remains unqualified.

Parent review checked actual schemas/factories, immutable context, exact submitted
tool-result snapshots, budget reservation, one owned pump and cleanup ordering.
Legacy API inputs/modes remain separate. Tool results are validated and used by
the real fixed transport. Core/mock-team source is unchanged; only the small
bridge can invoke existing core readers. No writer methods or SDK/runtime core
imports enter the loop/adapter. All36 new tests were reviewed before execution,
including actual SQLite stop abort/lost reply, closed/stopped stores, invalid real
member profile, deterministic stop gates, stale callbacks and no invented core
task completion. Boundaries, compiled/runtime/native bytes and the finite matrix
must be sealed before the first execution.

The first preflight stopped at the loop boundary check before any tests: its
writer-name guard also matched the native Promise.resolve and an internal run
completion callback. The callback was renamed and only the literal built-in
Promise.resolve received an exception; SDK resolve and all other writer methods
remain forbidden. attempts.json retains that failed preflight and hashes. A fresh
reviewed preflight then passed all builds/boundaries and the full309-test suite.
