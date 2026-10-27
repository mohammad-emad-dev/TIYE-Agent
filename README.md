# TIYE Agent

TIYE Agent is in architecture validation and approved internal core construction.
The repository contains product and technical documents, feasibility prototypes
and a bounded product command/event store. The complete team engine and product
remain unimplemented. The [Phase 0 assessment](output/phase0-readiness/ASSESSMENT.md)
is the historical 16 October baseline; full integration readiness remains HOLD.

The project owner approved the [internal Phase 1A exception](output/phase1a-core/APPROVAL.md).
The [first product core](packages/core/README.md) now implements durable task
commands, SQLite events and replay, with [source-bound verification](output/phase1a-core/README.md).
The [synthetic Phase 1B slice](output/phase1b-core/README.md) adds durable planning,
exact fixture approval, one-time claims and independent mock-witness reconciliation.
It uses fresh schema 2 databases; migration from schema 1 is not implemented.
Real effects and provider integrations remain closed.
The [explicit resolution follow-up](output/attention-resolution/README.md) lets
the trusted synthetic coordinator confirm completion from existing witness proof
or close an uncertain attempt as abandoned. Neither outcome retries an action.
The [shared registry](output/task-registry/README.md) now creates tasks and attaches
synthetic effects in one store, with a common command namespace and event-backed
task titles. This is the core basis for later team orchestration; no migration or
complete team engine is implemented yet.
The owner [approved Phase 2A construction](output/phase2a-approval/README.md)
against the frozen [engine entry contract](output/team-engine-entry/CONTRACT.md).
The bounded synthetic engine is now authorized for development; actual source
review and preflight remain required before execution.
The [first Phase 2A component](output/phase2a-session/README.md) implements durable
session creation and bound roster contexts in fresh schema 3 stores. The
[durable inbox component](output/phase2a-inboxes/README.md) adds per-member FIFO
queues and atomic planning reservations with concurrency limits. The
[session stop component](output/phase2a-stop/README.md) atomically cancels queued
and planned assignments and closes new session admission. The
[assigned lifecycle component](output/phase2a-lifecycle/README.md) adds member
reports, explicit recovery and reservation-preserving stop for dispatched mock
work. Assigned claims are admitted only to the fixed synthetic test composition;
the [Phase 2A exit review](output/phase2a-exit/README.md) records the bounded
acceptance decision and remaining Architecture 4 features. No real provider
action is admitted. This review grants no new construction scope.
The owner subsequently instructed continuation of the specifically presented
[Phase2B question amendment](output/phase2b-approval/README.md). The
[question component](output/phase2b-questions/README.md) adds durable questions,
escalation and answers on fresh schema4, retaining blocked-task reservations.
This remains internal synthetic construction with provider/native integration HOLD.
This supersedes the historical unimplemented-core and pending-construction wording
for this bounded slice only. Team engine, real effects, full integration and release
remain outside its scope; provider/native gates are unchanged. The original
[entry proposal](output/phase1-entry-review/README.md) remains a frozen baseline.

## Document order

The owner [admitted Phase3A construction](output/phase3a-approval/README.md) for
the [offline API adapter foundation](packages/api-adapter/README.md). It provides
bounded lifecycle, validated text streaming and conservative cancellation through
one fixed scripted transport. Response completion is separate from core task
completion. Provider calls, credentials, tools, core binding and UI remain pending.

The approved [Phase2F owned mock workers](output/phase2f-workers/README.md) connect
the schema7 core to fixed owned child processes in a private synthetic harness.
Claims commit before one-time invocation delivery; success requires verified exit
and independent witness proof. Stop, uncertainty and storage errors preserve
durable history. The core remains unchanged. The [Phase2F exit review](output/phase2f-exit/README.md)
records bounded acceptance and the same-chunk stop regression fix; provider/native
integration, the product UI and release remain HOLD.

1. [Product Specification](architecture/TIYE-Agent-Product-Specification.md) defines the user-facing behavior.
2. [Technical Architecture](architecture/TIYE-Agent-Architecture.md) defines the implementation contract and records changes to the specification in Part C.
3. [Feasibility Test Plan](architecture/TIYE-Agent-Feasibility-Test-Plan.md) defines the evidence required before building product code.
4. [Product Plan](architecture/TIYE-Agent-Product-Plan.md) preserves the earlier planning discussion. Where it differs from the later documents, use the specification and architecture.

## Feasibility record and remaining integration gates

The original preconstruction gate below is historical for the approved internal
Phase 1A/1B slices. Its remaining requirements still govern dependent integrations;
the internal exception does not mark them passed or admit native execution.

Run feasibility tests S1 through S6 and record versions, measurements, and pass/partial/fail results in the forms provided by the test plan. S1 must validate main-owned terminals and process cleanup; S2 must establish a reliable delegated-task round trip; S3 must measure worktrees and verify the stated permission limits. Update the architecture from the results before starting the core event store and team engine.

The bounded input-latency diagnostic series is complete; it does not close S5.
Ubuntu is initialized and its [bounded prerequisite discovery](output/s6-discovery/README.md)
is complete: Linux-native Git is available; Node and candidate agent CLIs were
not found on the tested Linux PATH. The [path/Git fixture](output/s6-path-git/README.md)
completed on Ubuntu's filesystem but failed repository initialization on the
Windows-mounted temporary path. The [native Windows/cross-side cohort](output/s6-cross-git/README.md)
then verified owner-side controls and recorded both peer reads refusing access;
keep one Git execution side per project. The [WSL mock tool connection](output/s6-connectivity/README.md)
completed through an interop pipe relay; direct loopback was refused in NAT mode.
The shutdown connect check was inconclusive, with a later empty listener table.
The [WSL launch fixture](output/s6-environment/README.md) now verifies a public
allowlisted environment tuple, synthetic Git identity inputs and decoded mock
briefing text in a root process and its descendant. The
[WSL lifecycle fixture](output/s6-lifecycle/README.md) now records graceful
mock shutdown, start-time mismatch refusal and absence of both Linux identities
after owned launcher termination; that cohort did not exercise survivor cleanup.
The [WSL mock PTY capture](output/s6-pty/README.md) now verifies synthetic
ASCII/Unicode/multiline paste, Linux resize/SIGINT events and normal mock exit
through Electron, xterm and the requested experimental ConPTY backend.
The [current nine-row S6 assessment](output/s6-assessment/README.md) consolidates
these bounded observations and preserves the original failures. It supersedes the
historical S6 status in the Phase 0 snapshot and initial plan; S6 remains partial.
The subsequent [live-survivor recovery capture](output/s6-recovery/README.md)
now records two live Linux mocks after an intentional Electron main crash,
restart admission/mismatch refusals, pidfd-bound supervisor signaling and verified
absence of both original identities before expiry. This controlled detached
fixture does not qualify provider trees or concurrent recovery. Next is an
eligible Linux-native CLI route under S4 before provider-backed S6 work. The
[Codex candidate review](output/s4-codex-candidate/README.md) now records a pinned
Linux Codex 0.157.1 installation and successful version/help checks. Account
declaration is complete; commercial integration scope and native authentication
remain unqualified. The prepared provider clarification draft has not been sent.
The [subsequent schema capture](output/s4-codex-schema/README.md) records 314
version-specific JSON declarations for lifecycle and approval surfaces. These
are not runtime capability or access qualification; the captured external-token
login variant carries an internal-use-only warning. Next is offline protocol
replay for completion correlation and distinct approval scopes.
The [offline replay fixture](output/s4-codex-replay/README.md) now verifies those
client-policy cases with 14 behavior tests and a 17-step synthetic transcript.
It plans no transport activity and qualifies no provider behavior. Next is
bounded JSONL byte-stream framing and disconnect handling.
The [offline framing fixture](output/s4-codex-framing/README.md) now verifies
that local policy with 11 behavior tests and a 9-step synthetic transcript,
including split UTF-8, byte budgets, malformed records and revoked reply plans
after closure. It qualifies no native transport. Next is a bounded subprocess
stdio fixture using a synthetic peer for actual pipes and exit handling.
The [native Windows synthetic stdio capture](output/s4-codex-stdio/README.md)
now covers eight scenarios with eight capture tests: Unicode input/output,
peer-observed denial, pending approval at EOF, truncation, nonzero exit, a real
closed-input write error, bounded stdout/stderr floods and deadline cleanup.
Only the owned synthetic direct child is covered; no real CLI or provider route
is qualified. Next are independent stdout/process lifetime and blocked-writer
cases with a synthetic peer.
The subsequent [pipe-lifetime capture](output/s4-codex-pipe-lifecycle/README.md)
now records peer acknowledgement of a control probe after stdout EOF, separately
from process exit, and continued stdout/stderr reads during a blocked writer.
Three adversarial scenarios and six capture tests passed; write cancellation
remains uncertain and no callback is retried. Next is consolidation of the
transport evidence and remaining real-CLI/provider qualification requirements.
The [dated transport readiness consolidation](output/s4-codex-transport-assessment/README.md)
now maps six evidence cohorts to eight open requirement groups and overlays all
nine partial S6 rows. It includes a conditional Linux native plan; selected-route
scope, native authentication and model access remain unqualified. The prepared
provider inquiry is still unsent. This summary supersedes earlier next-step
pointers for this Codex workstream and does not clear Phase 1.
Full [S6](output/s6-assessment/README.md),
S4 route qualification, unresolved
S5 limits and the remaining S1–S3 requirements stay visible in the readiness ledger.

The event store implementation must follow Architecture 3.8: persist command and effect intent before external action, reconcile uncertain outcomes after a crash, and avoid automatic duplicate execution.

The [Codex route refresh of 16 October 2026](output/s4-codex-route-refresh/README.md)
now records a current official-documentation review. TIYE's paid desktop route
remains unqualified; the existing provider clarification draft is ready and
unsent. Provider guidance and applicable onboarding are the next dependency for
authenticated Linux qualification. This refresh does not clear Phase 1.

The subsequent [authorized OpenAI outreach](output/s4-codex-outreach/README.md)
was submitted through the official interest form; its receipt was confirmed.
This supersedes earlier unsent status only. Provider guidance and product
eligibility remain pending; Phase 1 remains HOLD.

The [prepared Linux native protocol](output/s4-codex-native-protocol/README.md)
defines bounded handshake, authentication, task, approval and cleanup cases.
It is preparation only; a reviewed launcher and the applicable entry conditions
are required before execution. No new native qualification is claimed.

The [first U0 launcher implementation](output/s4-codex-u0-launcher/README.md)
now has synthetic subprocess tests, strict handshake handling, bounded capture
and a persistent launch block. Native admission is still pending independent
watchdog, ownership/recovery and privacy checks; no Linux Codex run is claimed.

The [corrected Windows watchdog component](output/s4-codex-u0-watchdog-v2/README.md) adds
creation-time Job Object assignment and a separate supervisor, with six synthetic
cases including descendant survival and owner crashes. U0 integration, Linux
ownership/recovery and native admission remain pending; Phase 1 remains HOLD.
The first saved capture exposed a job-accounting/process-exit race and is
[preserved as a failed baseline](output/s4-codex-u0-watchdog/STATUS.md).

The [synthetic Windows U0 supervision integration](output/s4-codex-u0-supervised/README.md)
now combines the frozen transport and watchdog with six tests covering eight
controlled cases. This is not a native WSL integration or admission record.

The [Linux ownership component](output/s6-linux-owner/README.md) now exercises
orphan adoption across separate sessions, identity-bound refusal and TERM/KILL
escalation in four controlled Ubuntu cases. This advances Stop/cleanup behavior;
it does not establish arbitrary provider-tree containment or owner-crash recovery.
Next is a separately reviewed Linux/native host integration and capture/privacy
review. Product core construction remains on HOLD under the existing gate.

The [active Linux Stop capture](output/s6-linux-stop/README.md) adds three cases
where the root and separate-session child are alive when Stop begins. It records
TERM/KILL escalation and adoption after forced root death, with independent
exit witnesses and a live unrelated sentinel. This is controlled component
evidence; native provider admission and the product construction gate remain open.

The [Linux transient-service capture](output/s6-linux-service/README.md) now tests
manager-backed cleanup after main-process crash and runtime expiry, plus normal
main exit and mismatched-invocation refusal. This supplies a lifecycle-boundary
candidate for native integration, with independent pidfd and cgroup witnesses.
It does not qualify Windows-owner crash, hostile service/cgroup escape or provider
access; the existing admission and construction gates remain open.

The [managed Linux mock transport](output/s6-service-transport/README.md) composes
the protocol transport with the service lifecycle in three Ubuntu cases. It
records valid handshakes, foreign-response rejection without notification, and
cleanup after worker exit/crash. Integration exposed and corrected a Linux
stdin-close compatibility defect in a new source cohort. Live Windows forwarding
and worker failure during an active handshake remain open; no native admission
or product construction gate is cleared.

The [live Linux protocol interruption capture](output/s6-service-inflight/README.md)
adds four cases covering worker crash and explicit Stop while initialization is
pending or the peer has received initialized. All three original process
instances must be removed before teardown, with independent pidfd/cgroup checks
and an unrelated live sentinel. Protocol completion remains unobserved after
worker death. Windows-supervisor integration and native admission remain open.

The [Windows/WSL ownership capture](output/s6-cross-owner/README.md) now connects
the Job Object supervisor to a Linux service through a receipt-driven heartbeat
lease. Two mock cases kill the Windows watchdog or owner while Linux protocol
work is live. Windows handle exit and Linux pidfd/cgroup cleanup are observed
independently; failed process statuses and uncertain protocol completion remain
visible. Live protocol forwarding, capture/privacy review and native admission
remain open.

The [dated launcher admission review](output/launcher-admission-review/README.md)
now indexes nine mock cohorts and five remaining requirements: one native-capable
launcher, its Stop/uncertainty cases, ambient-access review, capture privacy and
separate source-bound admission. All nine existing offline checkers pass; this
review launches no native process and grants no admission. Its
[next implementation brief](output/launcher-admission-review/NEXT-STEP.md) defines
the unified mock launcher before any native attempt. Phase 1 remains HOLD.

The [unified mock launcher](output/s6-unified-mock/README.md) now forwards actual
protocol bytes across Windows, WSL and a managed Linux service, with a separate
ownership heartbeat. Three wire cases and native-flag refusal verify handshake
success, positive parser rejection, peer receipts and independent Windows/Linux
cleanup under a new frozen budget profile. Normal Stop and uncertain-failure
cases on this exact path, privacy and native admission remain open.

The [unified launcher interruption cohort](output/s6-unified-lifecycle/README.md)
adds real pending Stop, initialized owner loss and transport loss, with independent
Windows/Linux cleanup witnesses and a conservative process-restart attempt fence.
Blocked writes and privacy/admission reviews remain open; native execution stays
disabled and Phase 1 remains HOLD.

The [synthetic pending-write cohort](output/s6-unified-write-pressure/README.md)
measures real suspended drains on the unified path and preserves uncertain
attempts across process restart. Its 8 MiB synthetic writes qualify plumbing
only; native protocol admission and privacy reviews remain open.

The [18 October launcher evidence review](output/launcher-evidence-review/README.md)
reconciles the three distinct unified source sets and their 16 saved test
executions. L1/L2 remain partial, P1/P2 open and A1 blocked. The next bounded
implementation consolidates the existing mock regressions on one source tree;
this review grants no native execution permission.

The [consolidated mock launcher](output/s6-consolidated-launcher/README.md)
runs forwarding/refusal, lifecycle and synthetic pending-write scenarios on one
source set, alongside native-refusal and candidate-preparation guards. Native
execution stays disabled; ambient-access and capture-permission reviews remain.

The [consolidated capture access review](output/s6-capture-access-review/README.md)
binds the sealed launcher to current Windows DACL and Linux path metadata.
Broad inherited Windows grants and missing historical Linux paths leave privacy
requirements open. Next is protected private storage for future captures;
native execution remains disabled and Phase 1 remains HOLD.

The [private capture storage prototype](output/s6-private-capture-store/README.md)
creates and checks protected Windows directories/files before synthetic payloads,
refuses existing/reparse paths and preserves uncertain or failed cleanup records.
It is not yet integrated with the launcher. Alternate-account denial and privacy
requirements remain open; the next step is a new mock capture using this store.

The [private launcher capture](output/s6-private-launcher/README.md) now connects
that storage to clean completion, pending Stop and uncertain owner loss. It
retains raw configuration/streams/journals privately and publishes only selected
verdicts. Five live tests cover those paths and two storage launch gates. The
remaining private mock matrix and privacy/native-admission requirements stay open.

The [private mock lifecycle matrix](output/s6-private-matrix/README.md) extends
that path to all nine wire/lifecycle/pressure scenarios with four storage guards.
Raw data stays private and pressure delivery remains uncertain. The source-bound
assessment keeps L1/L2 partial, P1/P2 open and native admission blocked; next is
bounded ambient-access qualification with synthetic resources.

The [owned ambient-access probe](output/s6-ambient-access/README.md) now measures
same-account reads/writes outside fresh HOME, a mode-000 read denial and owned
Unix/loopback connections from the managed mock peer. Resource and process cleanup
are checked separately. These observations support the documented shared-account
CLI trust model; credentials, confinement and native admission remain unqualified.
