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
not found on the tested Linux PATH. The next S6 work is local path/Git fixtures
under the [S6 plan](feasibility/s6-wsl/PLAN.md). S4 route qualification, unresolved
S5 limits and the remaining S1–S3 requirements stay visible in the readiness ledger.

The event store implementation must follow Architecture 3.8: persist command and effect intent before external action, reconcile uncertain outcomes after a crash, and avoid automatic duplicate execution.
