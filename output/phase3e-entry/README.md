# Phase 3E proposal: Leader-only durable mission completion

Baseline: [Phase 3D exit](../phase3d-exit/README.md), accepted at 119b176 with
402 passing tests. The next slice connects complete_mission to the existing core
through an explicit offline Leader profile. This closes the bounded workflow
from reported task results to a durable mission completion decision.

The [amendment](AMENDMENT.md) and [contract](CONTRACT.md) require an owner scope
decision. No runtime implementation or new native execution is included here.

The core keeps its existing eligibility rules, including task/effect proof,
questions and recovered replacement chains. An accepted completion closes core
session admission. Its receipt may enter one text-only continuation under an
exact completed-session check; ordinary active-session checks cannot authorize
that special path. A failed reply cannot undo the durable mission decision.

Existing factories and their outcomes remain unchanged. Provider integration,
generic/rejecting adapters, full team tools, durable loop recovery, UI and release
remain pending.
