# Next bounded implementation: consolidate mock regressions

This is an implementation brief, not an admission. Keep native execution
disabled and preserve every existing measured cohort.

## Deliverable

Create one new source tree and one exclusive capture. Use a fixed set of mock
peer variants, not an arbitrary executable selector. Every case must use the same
host, framing/transport, worker, ownership/lease/service and witness sources.
Configuration chooses a declared fixture scenario; it must not switch in a
different implementation. Hash every helper and bind profile and scenario input.

The existing union contains these 12 case IDs. They describe the next regression
scope, not achieved coverage on the new artifact:

| Group | Existing case IDs |
| --- | --- |
| Forwarding/refusal | `valid`, `foreign`, `invalid-raw` |
| Lifecycle | `stop-pending`, `owner-loss`, `transport-loss` |
| Synthetic pressure | `pressure-stop`, `pressure-owner-loss`, `pressure-transport-loss` |
| Shared guards | `native-refusal`, `partial-journal-refusal`, `cleanup-hook-failure` |

Scenario count is not test-count arithmetic. Shared guards may be parameterized;
phase-specific assertions must retain their actual intervention and peer receipts.
Do not replay an unknown attempt merely to get a passing case.

## Required preservation

- Keep actual protocol bytes on the Windows/WSL/service path and ownership
  heartbeat/control separate. Valid completion requires peer receipt plus direct
  reaping and independent Windows/Linux cleanup evidence.
- Keep strict foreign-response and invalid-byte refusal. No initialized
  notification may follow those refusals. Save original synthetic bytes.
- Keep observer barriers, held Windows identities and Linux pidfds/cgroup/sentinel
  witnesses before intervention. Assert cleanup before teardown. A unit not-found
  observation does not imply successful terminal Result.
- Keep uncertainty visible: local drain is not delivery; owner death cannot
  fabricate a host result. Keep the one-path journal's conservative fresh-process
  refusal and callback-failure close/reap regression.
- Keep the reviewed 90/75/30/15/5/60/5/1-second mock bounds and independent cleanup
  limits, or document and measure a deliberate change. The existing fast cases
  do not qualify every deadline, manager failure or suspend/resume boundary.
- Keep the 8 MiB pressure workload explicitly synthetic. It must not pass through
  or weaken the 16 KiB encoder merely to relabel the workload as native protocol.

## Candidate preparation

Freeze the future candidate input and planned argv separately from actual launch.
Add mock-testable checks for candidate path/digest/config changes against that
prepared input, including refusal cases. The same source must still refuse native
execution. These guard tests do not count as executing or admitting the native
binary. The live candidate recheck and ambient/capture reviews must be bound to
the eventual exact source/binary/input set before separate A1 consideration.

A bounded U0 needs a fixed prepared attempt location and no automatic retry of an
unknown attempt. It does not need the product's full reconnect/recovery engine,
cross-directory deduplication or concurrent production attempt database first.

## Exit and follow-up

Record actual case outcomes, unknown states and failures without weakening gates.
Run the final source-bound suite once it is ready, preserve its output, then
review the resulting L1/L2 coverage. Do not mark L1/L2 complete by this brief or
by combining the earlier captures. P1/P2 assess the exact resulting artifact and
effective capture paths next; A1 remains separate and blocked meanwhile.
