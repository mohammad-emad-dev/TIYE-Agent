# Review and dispositions

The Codex and OpenCode delegate relays were invoked for a read-only review of
this exit slice with the requested models. The Codex relay (Luna max) failed to
start a session and exited with code 1 without a report; the OpenCode relay
(Flint 40B Free) failed with a missing relay artifact and exited with code 2.
Neither supplies an independent review verdict. delegates.json preserves the
statuses and the raw relay outcome hashes.

Parent independently reviewed both new tests against the actual coordination
bridge, the loop finish/stop paths and the engine-stop reduction: the
finished-observer stop is accepted because the session stays active (this
profile has no completed-session exception) and cancels the accepted queued
assignment while the completed conversation and the historical receipt remain
unchanged; the lost-acknowledgement case consumes the single attempt, refuses a
later run through loop admission, sends no continuation and leaves the durable
accepted command decision unacknowledged to the terminated run. No production
change was necessary in this exit slice. Both tests use actual schema7 stores,
assert outside isolated observers and reopen/replay actual durable state before
cleanup.

The two new tests are appended to the retained 51 coordination cases;
production bytes and all old profiles remain identical to implementation
0b6e3c3. Existing operation deadlines and conservative overrun/uncertain
cleanup expectations remain unchanged. Scope is fixed/trusted/offline; future
providers, rejecting-stop adapters and hostile boundaries require their own
admission and evidence.
