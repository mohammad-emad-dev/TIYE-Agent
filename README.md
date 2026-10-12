# TIYE Agent

TIYE Agent is currently in architecture validation. The repository contains product and technical documents, an isolated [S1 terminal prototype](feasibility/s1-terminal/README.md), and an [S2 control-channel fixture](feasibility/s2-control/README.md). The [S1 results](feasibility/s1-terminal/RESULTS.md) and [S2.1 results](feasibility/s2-control/RESULTS.md) record bounded observations; both feasibility gates remain open.

## Document order

1. [Product Specification](architecture/TIYE-Agent-Product-Specification.md) defines the user-facing behavior.
2. [Technical Architecture](architecture/TIYE-Agent-Architecture.md) defines the implementation contract and records changes to the specification in Part C.
3. [Feasibility Test Plan](architecture/TIYE-Agent-Feasibility-Test-Plan.md) defines the evidence required before building product code.
4. [Product Plan](architecture/TIYE-Agent-Product-Plan.md) preserves the earlier planning discussion. Where it differs from the later documents, use the specification and architecture.

## Next implementation gate

Run feasibility tests S1 through S6 and record versions, measurements, and pass/partial/fail results in the forms provided by the test plan. S1 must validate main-owned terminals and process cleanup; S2 must establish a reliable delegated-task round trip; S3 must measure worktrees and verify the stated permission limits. Update the architecture from the results before starting the core event store and team engine.

The event store implementation must follow Architecture 3.8: persist command and effect intent before external action, reconcile uncertain outcomes after a crash, and avoid automatic duplicate execution.
