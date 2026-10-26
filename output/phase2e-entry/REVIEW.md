# Handoff proposal review

27 October 2026. Parent examined the current inbox, failure and mission predicates
against the proposed atomic handoff and recovered-mission semantics. This is design
review only: no new engine code, test or runtime composition was executed.

## Important design boundaries

The handoff is Leader-directed and creates a fresh queued task, never a new attempt
on an existing task. It preserves the predecessor and its effect, failure notice,
questions, result and approvals. Fresh successor identity plus exactly one edge
per predecessor makes accepted history acyclic and nonbranching. All chains share
the10-record bound and ordinary100 lifetime assignment ceiling.

| Illustrative history | Mission eligibility under proposed schema7 |
| --- | --- |
| A failed with closed notice, handoff A to B, B explicitly done | Eligible if every other root task also satisfies the predicate; A remains failed |
| A failed to B failed to C done, each failure closed and each edge accepted | Eligible under the same root-wide checks; both failures remain recorded |
| A failed to B done, unrelated D failed without an accepted outgoing edge | Refuse; D is uncovered |
| A failure awaiting reconciliation, proposed A to B | Handoff refuses; uncertainty still owns its slot |
| A failed to B queued/blocked/uncertain/failed without a successful terminal chain | Refuse completion |
| Stop after A to B, cancelling queued B | No new handoff or successful completion in that stopped session |

These are design examples, not executed test results. Successful mission eligibility
does not rewrite failed tasks or claim an abandoned effect did not happen. Existing
explicit observation/reconciliation/abandonment and all successor approval gates
remain. The new task is not automatically executed and semantic duplication across
distinct approved effects is not deduplicated by the lineage record.

Capacity charges one event plus eight NEW held assignment units, with the existing
active global terminal slot unchanged. Eight available units are insufficient;
nine suffice only when every other admission condition holds. No allocation is
split across events, and no failed predecessor's released budget is spent twice.
Handoff title provenance and target FIFO tail sequence come from the accepted
handoff event, not fabricated task.create/enqueue decisions. Member views expose
only permitted lineage metadata, not private question/failure payloads.

## Requested model reviews

GPT-6 Luna max, Flint40B Free and DeepSeek V4.1 Flash Free max each timed out at
60 seconds without a verdict. None counts as agreement, pass or implementation
verification. Each received the same initial supplied contract. The parent then
clarified one sentence: handoff queues work that still requires approval, rather
than calling it newly approved work. No model re-review of that final wording is
claimed. Final wording and scope were parent-reviewed.

Reported untracked output/phase2e-entry entries predate dispatch and are not
attributed delegate changes. review.json retains safe summaries/digests; raw relay
artifacts stay local. Accepted baseline2aa8abf and158-test evidence remain intact.
The next action is the owner's decision on this concrete pushed scope; dependent
provider/native/UI and release gates remain HOLD.
