# Fixed owned mock team

Private Phase 2F test composition over the unchanged schema7 core. It launches
only the reviewed `worker.cjs` using the current pinned Node executable. This
package is not a provider adapter or a general program runner.

Trusted fixtures allocate private roots and enqueue tasks. `MockTeam` accepts up
to six closed job descriptors and two roster members. `prepare(taskId)` requests
a FIFO assignment; the fixture separately approves its effect. `run()` returns
at quiescence and does not approve, answer questions, reconcile uncertainty,
handoff work or complete missions. Call `close()` in `finally` before closing the
store or removing roots.

Every invocation follows a committed claim and is sent at most once. Success
requires a complete bounded transcript, verified exit zero and one matching
post-exit observation from the independent witness helper. Storage exceptions
freeze dispatch and clean up owned handles. The caller inspects durable state
and may explicitly redeliver recorded commands; the controller never retries
claims or invocations.

`stop()` fences local dispatch and commits the owner stop before interruption.
Teardown uses only handles created by this controller, with a 200 ms cooperative
grace and a five second verified-close limit. Worker operations have a ten second
deadline. Stopped uncertain work retains its core slot. No persisted PID adoption
or whole-host crash containment is claimed. These same-user processes are not an
OS sandbox. The public environment allowlist omits inherited credentials and
Node injection options.

Validation is captured with both package inventories in
`output/phase2f-workers/`; the separate Phase 2F exit review remains required.
