# Phase 0 readiness — 16 October 2026

**Decision: HOLD Phase 1 construction.** The repository contains architecture,
feasibility prototypes and bounded measurements. It does not yet contain the
product core service, event store or team engine. This assessment records the
current construction gate; it is not a completion percentage or a release verdict.

The [build order](../../architecture/TIYE-Agent-Architecture.md#112-internal-build-order)
still applies. No feasibility gate is waived here. The recent input-latency
diagnostic series is finished; further captures require a new question and a
bounded protocol, rather than continuing that series automatically.

## Gate ledger

Statuses describe qualification against the
[test plan](../../architecture/TIYE-Agent-Feasibility-Test-Plan.md), not whether
individual fixture checks passed. Older result sections describe their own
snapshots; later bounded observations do not erase earlier failures.

| Gate | Current qualification | Evidence and established scope | Open requirements and next decision |
|---|---|---|---|
| S1 — display and lifecycle | Partial | [Recorded results](../../feasibility/s1-terminal/RESULTS.md): mock lifecycle, Job Object and identity-based teardown probes; narrow installed OpenCode startup/Unicode observations | Complete the chosen CLI's terminal parity, interactive approval/input/resize/paste/Ctrl+C checks; resolve the Unicode capture/display limitation; qualify descendant races, abnormal recovery and the intended platform matrix. Fixture teardown is not arbitrary vendor-tree containment. |
| S2 — control | Partial | [Recorded results](../../feasibility/s2-control/RESULTS.md): bounded task/tool/briefing, permissions, approval, cancellation and saved-grant suspension observations on specific OpenCode versions | Consolidate the supported CLI/version capability matrix; qualify remaining native error/authentication/network/hang/resume signals. Keep injected faults distinct from native observations. Production approval/input integration belongs to later construction and cannot be a prerequisite requiring the finished UI. |
| S3 — worktrees | Partial | [Assessment](../../feasibility/s3-worktrees/ASSESSMENT.md): twelve verified evidence cohorts; all seven requirement rows remain partial | Representative project setup/cost, native commit attribution and CLI behavior, authenticated push route, watcher limits, rollback/merge recovery and broader Windows cases remain open. Hook bypasses and detection limits must remain explicit; production approval UI is later work. |
| S4 — provider access | Partial; no qualified product route | [Research](../../feasibility/s4-provider-access/RESULTS.md), [declaration checks](../../feasibility/s4-provider-access/readiness/README.md) and [subsequent Agy decision](../../feasibility/s4-provider-access/antigravity-consumer/route.json) | The Agy operator declaration was received after the earlier readiness cohort; it is not still missing for that route. Its consumer wrapper is excluded from integration and delegation. Select a separately authorized candidate with exact provider/model/authentication/account applicability, then qualify its installed native behavior. Delegate success does not establish product access eligibility. |
| S5 — performance | Partial; bounded latency series complete | [Latest two-capture comparison](../../feasibility/s5-performance/ui/input-backend-pair/README.md) and [saved comparison](../s5-input-backend-pair/comparison.json) | Both ordinary-input populations stayed below 100 ms in those captures; historical spikes remain unresolved. No cause, fix or product backend selection follows. Short captures do not close hour/memory settling, idle coverage, whole-tree recovery or platform requirements. Decide an explicit acceptance/remediation plan for these remaining limits before declaring the gate closed. |
| S6 — WSL | Not run; development distribution prerequisite pending | [Read-only inventory](wsl-prerequisites.json): Windows WSL queries succeeded; WSL 2.7.14.0 reports one registered distribution, `docker-desktop` | A development distribution has not been selected. No Linux CLI, terminal, path, Git/worktree interoperability, environment propagation, Windows tool-server connectivity or graceful/crash cleanup has been tested. Inventory success is not S6 success or failure. |

## WSL finding and next execution step

The parent ran only these WSL queries, each through `rtk proxy`:
`wsl.exe --status`, `wsl.exe --version`, and `wsl.exe --list --quiet`.
All returned exit 0 with empty stderr. The saved inventory includes command
times, output lengths/hashes and selected facts. Raw output is not retained;
those hashes do not let a reader independently reconstruct the observations.
An earlier exploratory invocation of the same queries preceded the saved capture.

No distribution was launched or inspected. Use a separate user-designated
development distribution for S6; this assessment does not authorize treating
Docker's managed environment as the test workspace. Installation/selection is
pending the operator's response.

After selection, the next bounded task is **S6 prerequisite discovery**, not
the full S6 experiment: record the distribution/version, Linux Git/Node and CLI
availability, and the intended test root and Git ownership side. Keep provider
requests behind S4 route qualification. Then write a bounded S6 protocol covering
all nine test-plan steps, including both filesystem locations, connectivity and
identity-verified cleanup. A mock-only probe may test mechanics, but cannot
qualify real CLI behavior. Do not infer Windows Job Object coverage inside WSL.

## Entry conditions for core construction

The developer owns evidence collection and the gate recommendation. The project
owner decides product scope and any explicit architecture change. Neither a
delegate review nor this document clears Phase 1.

Before changing HOLD to ready:

1. Reconcile S1–S6 against the test plan into a supported provider/CLI/version/
   environment matrix, with evidence for each supported claim and explicit
   limitations. Close the relevant feasibility requirements. If a capability is
   to be deferred or excluded, record a separately approved scope/architecture
   decision; do not silently count it as passed.
2. Resolve the S4 route decision, S6 environment prerequisite and S5 acceptance/
   remediation decision in the ledger. Repeating latency measurements without
   a decision criterion does not close S5.
3. Adopt the first core slice below against architecture 3.8 and 2.3, including
   durable identity, ownership and uncertain-effect handling. Product UI,
   complete adapters and production approval integration are later phases;
   requiring them before the core would invert the construction order.

## First core slice acceptance contract — proposed, not implemented

Follow the existing
[durable command/effect contract](../../architecture/TIYE-Agent-Architecture.md#38-durable-command-and-external-effect-contract).
Start with a headless local service and SQLite log using mock effects only.
Do not transplant frozen measurement harness snapshots into product code.

| Area | Required observable behavior |
|---|---|
| Command identity | A stable `command_id` returns its recorded acceptance/rejection on redelivery. Conflicting payload reuse is refused without executing another effect. A stable `task_id` survives recovery. |
| Commit before action | Command state changes and `effect.planned` commit in one transaction before the mock effect runner is allowed to act. A failed/rolled-back transaction produces no external action. |
| Outcome and replay | The effect outcome and task transition commit together. Reopening the database and replaying ordered events rebuilds the same projections. Persist event schema versions from the first slice. |
| Uncertainty | Crash after dispatch but before recorded completion requires inspection. Proven completion is recorded without replaying the action; an ambiguous mock effect produces `effect.needs_attention` and pauses the affected task. No automatic resend. |
| Approval binding | An effect requiring approval cannot execute without the matching effect/target/operation approval. Changed operations and new attempts require a new approval. A test fixture supplies decisions; no production UI claim follows. |
| Recovery verification | A child-process test harness injects bounded crashes before plan commit, after commit before dispatch, after action before outcome commit, and during reconciliation. Repeated recovery converges or remains explicitly paused, without duplicate effects. Verify using a separate durable mock witness, not an in-memory counter lost with the service. |
| Failure isolation | A paused uncertain task does not authorize a duplicate member launch or block unrelated recoverable tasks. Main-owned process reconciliation is an explicit interface contract; real PTY integration follows its own qualification. |

Specify the transaction schema, IPC boundary, error categories and crash-test
timeouts when this slice is authorized. This is an acceptance contract, not a
claim that these behaviors already exist. Exactly-once execution across external
systems is not promised.

## Review and verification scope

Muse Spark 1.3 Free xhigh, Space Bunny Free xhigh and DeepSeek V4.1 Flash Free
max completed context-only reviews. They received the supplied project summary,
not independent workspace evidence, and did not inspect the later WSL finding.
The parent verified paths, claims and changes. Delegate artifact hashes and
observed tool-event counts are in [review metadata](review.json).

Retained review points: distinguish inventory from S6, keep Phase 1 on hold,
avoid cyclic prerequisites and retain S5's fixed-order limits. Rejected points:
successful timing observations remain descriptive measurements; S4 is an open
qualification decision, not a permanent prohibition on all future routes; merely
recording HOLD is not an entry condition that clears it.

The requested exact Codex model was previously unsupported on the account and
was not retried. The recorded consumer Agy route remains excluded and was not
invoked. Fallback reviews do not establish equivalent model coverage. No model,
authentication, credential or service configuration was changed.
