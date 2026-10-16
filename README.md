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
after owned launcher termination; survivor-present cleanup is still untested.
The [WSL mock PTY capture](output/s6-pty/README.md) now verifies synthetic
ASCII/Unicode/multiline paste, Linux resize/SIGINT events and normal mock exit
through Electron, xterm and the requested experimental ConPTY backend.
Full [S6](feasibility/s6-wsl/PLAN.md),
S4 route qualification, unresolved
S5 limits and the remaining S1–S3 requirements stay visible in the readiness ledger.

The event store implementation must follow Architecture 3.8: persist command and effect intent before external action, reconcile uncertain outcomes after a crash, and avoid automatic duplicate execution.
