# Explicit synthetic mission completion

26 October 2026. Implemented within the [approved Phase2C contract](../phase2c-entry/CONTRACT.md)
frozen at58187f8. [Approval](../phase2c-approval/approval.json) retains the exact
owner response, frozen proposal and digests. Full Phase2C exit review remains pending.

Fresh schema5 adds no tables: schema4 SQL is retained with metadata version5.
Explicit MissionEngine factories refuse older roots; schema1–4 regressions pass.
The immutable Leader can complete a nonempty session without a task of its own,
only when all root tasks belong to closed assignments with explicit successful
reports and completed effects. No open question/budget or hidden legacy work is
allowed. The completion command changes only session summary/actor/sequence and
status in the shared event/decision transaction. It invokes nothing.

Completed sessions reject fresh admission, including raw task.create/plan/task.plan.
API state checks and independent replay prevent mutating lifecycle bypasses.
Exact past decisions and genuine no-op observations remain available. The existing
active terminal reserve funds stop OR completion, allowing success at event1000.
Owner/member mission reads expose only detached sessionId/status/completion;
question text, roster, ledger and budget internals are excluded.

Parent-reviewed source, tests, compiled files, actual Node26.7.0 Windows x64 ABI147
and installed native/dependency hashes were captured before execution. All138 tests
passed, retaining125 baseline cases and adding13 mission cases. The build and AST
import-boundary check passed. Real SQLite abort/tamper fixtures, independent witness
counts and fresh owned-child before/after COMMIT crashes substantiate the bounded
result; raw captures stay local. See TEST-PLAN.md, verification.json and evidence.json.

GPT-6 Luna max, Flint40B Free and DeepSeek V4.1 Flash Free max supplied-module
implementation reviews each timed out at60 seconds without a verdict. Their reports
listed already-existing working-tree changes, not attributed delegate edits.
Acceptance rests on parent source review and source-bound direct execution.
The earlier Luna proposal review is separate from implementation verification.

Trusted coordinator roles, fixed synthetic witnesses and controlled child crashes
define the boundary. No provider/UI/terminal/MCP action, migration, throughput,
hostile in-process isolation, Electron/WSL ABI or whole-host/power-loss claim.
Provider/native integration and release remain HOLD.

Verify: `rtk proxy python -X utf8 -B output/phase2c-mission/verify.py`.
