# TIYE Agent

TIYE Agent is in architecture validation. The repository contains product and technical documents, terminal/control/worktree prototypes, provider-access research and performance experiments. The product core service, event store and team engine are not implemented. The [Phase 0 readiness assessment](output/phase0-readiness/ASSESSMENT.md) consolidates the evidence and remaining requirements as of 16 October 2026; product construction remains on hold.

## Document order

1. [Product Specification](architecture/TIYE-Agent-Product-Specification.md) defines the user-facing behavior.
2. [Technical Architecture](architecture/TIYE-Agent-Architecture.md) defines the implementation contract and records changes to the specification in Part C.
3. [Feasibility Test Plan](architecture/TIYE-Agent-Feasibility-Test-Plan.md) defines the evidence required before building product code.
4. [Product Plan](architecture/TIYE-Agent-Product-Plan.md) preserves the earlier planning discussion. Where it differs from the later documents, use the specification and architecture.

## Next implementation gate

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
