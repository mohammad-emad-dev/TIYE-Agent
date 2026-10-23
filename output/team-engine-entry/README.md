# Next construction step: internal mock team engine

23 October 2026 — **owner approval pending; engine not implemented**

The shared core is accepted at `ab8da5f`, with a recorded 45-test verification.
The next step is a bounded headless team engine using synthetic tasks and the
existing fixed mock witness. No real model, terminal or project action is added.

## Proposed first engine slice

- One session with an immutable roster of up to five members and one leader.
- Durable FIFO inboxes, one active reservation per member and a global cap.
- Atomic task start and synthetic effect planning in the existing core machinery.
- Explicit member result reporting; successful witness evidence alone cannot
  declare an engine task complete.
- Logical session stop and recovery that preserve uncertainty and prevent resend.
- Capacity reserved for admitted stop, reconciliation and terminal work.

[AMENDMENT.md](AMENDMENT.md) is the proposed addition to Architecture 11.2.
[CONTRACT.md](CONTRACT.md) defines the commands, actor boundary, states, capacity
rule, recovery cases, required tests and deferred features. These are the exact
approval target. Fresh schema 3 storage is proposed; no existing database migration
or generic process launcher is included.

## Why approval is needed now

The approved [first-core amendment](../phase1-entry-review/AMENDMENT.md) ends at
the internal 1A/1B milestone and requires a new decision when scope changes.
Architecture 11.2 lists the team engine as the next phase. The bounded engine
contract is now concrete and reviewable; it does not inherit execution permission
from the earlier core's tests or from the delegated model reviews.

**“Approve the internal Phase 2A amendment”** approves this amendment and contract.
After that response, record its frozen commit/digests and apply the architecture
addition. Implementation then starts; first execution additionally requires the
actual source/test/runtime composition to be reviewed and recorded before launch.

## Review and checks

GPT-6 Luna/max returned a design review. Flint 40B Free and DeepSeek V4.1 Flash
Free/max timed out and supplied no verdict. [Review](review.json) records the
statuses and report digests; it is not final-code acceptance.

The parent amended the draft in response to the completed review: authoritative
task-state mapping, coordinator-bound actor handles, one-event composite commands,
an explicit eight-event assignment budget plus session-stop reserve, and a lifetime
100-assignment limit. The delegated review concerns the original draft; the amended
proposal received parent review. Implementation must prove the capacity budget and
all API fences before its source-bound tests are accepted.

The relays reported the already-untracked proposal directory as touched. The
parent verified both pre-review draft files matched their copies in the supplied
brief before making the documented amendments; there is no attributed delegate edit.

Run `rtk proxy python -X utf8 -B output/team-engine-entry/verify.py` to check this
proposal's hashes, links, baseline history and unchanged core package inventory.
No engine tests were run, and the historical 45 tests were not rerun for this
documentation task. Raw relay reports remain local; only digests/statuses are public.

Full team behavior, leader takeover, questions, MCP/authenticated callers, UI,
provider/native CLI integration, file ownership, migration and release remain
outside this entry decision. Native/provider integration and release stay **HOLD**.
