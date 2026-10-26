# Next engine slice: task-failure observations

26 October 2026 — proposal only; construction approval pending.

The139-test Phase2C exit at1bbb391 closed explicit successful mission completion.
The next useful engine step handles unsuccessful work: the trusted owner records
a task failure, the Leader receives a durable notice, and uncertainty keeps its
slot until reconciled. A failure summary cannot declare success or hide a possible
effect. Question cancellation, notice and task state share one event transaction.

Review [AMENDMENT.md](AMENDMENT.md) and [CONTRACT.md](CONTRACT.md). This task-scoped
subset prepares Architecture4.7's logical handoff. It does not claim a live member
health monitor, automatic detector, process termination, takeover or succession.
Those need later integration. UI, providers/native transport and release remain HOLD.

The proposal pins fresh schema6, closed commands/roles/views, lifecycle transitions,
existing budget use, stop/recovery order and required SQLite/crash checks. It changes
no engine source/tests, runtime or architecture permission. Accepted baseline and
historical evidence remain unchanged. After approval, implementation can proceed
through its bounded exit review without another design round for this contract.
