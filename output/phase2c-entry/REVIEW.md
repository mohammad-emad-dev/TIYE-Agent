# Proposal review and dispositions

26 October 2026. Parent review selected explicit mission completion as the next
Architecture4.2 engine behavior after durable questions. It closes the internal
success workflow before adapter or UI work. No engine code or tests changed.

GPT-6 Luna max completed a supplied-contract design review. Its three observations:

1. Clarify recovery exemption versus post-completion rejection. Accepted wording
   fix: exemption covers only the local write fence; normal state predicates still
   reject new recovery after success. No special fence-clearing behavior is added.
2. Clarify durable rejection at event1000. The original general unreserved-capacity
   rule already applied; now task.create/raw plan closure text repeats it explicitly.
3. Define mission view fields. Accepted: exact sessionId/status/completion view,
   null handling, no question/roster/ledger/budget fields and detached copies.

Flint40B Free and DeepSeek V4.1 Flash Free max each timed out at60 seconds without
a verdict. No timeout counts as approval or implementation verification. Reviews
used the initial supplied contract, not repository-wide source auditing. The final
wording above was parent-reviewed; no claim of model re-review is made.

All relay reports list the already-created untracked output/phase2c-entry directory.
That status predates dispatch and is not evidence of delegate-authored changes.
The parent compared the brief's original supplied contract to the pre-revision
contract and checked working-tree scope. Safe report summaries/digests are retained;
raw relay data stays local. Accepted source/native evidence remains bound to95bd198.

The proposal requires at least one successful assignment and rejects every live,
failed/cancelled or unassigned task/effect. This intentionally admits only success
completion. Existing stop remains the terminal path for unsuccessful sessions;
retry/reassignment or success-with-failures would need a separate product decision.
The conservative root-wide predicate avoids falsely completing while legacy work
remains. The single terminal reserve funds either stop or completion, never both.
