# Phase 2B: durable synthetic questions and answers

**Proposed only — approval pending.** This contract is part of [AMENDMENT.md](AMENDMENT.md).
It extends the accepted Phase 2A engine, not the complete Architecture 4 feature set.

## 1. Storage and execution boundary

Reuse `TaskStore` and its existing synchronous writer, shared command namespace,
event/replay machinery, private-root validation and lifetime exclusive SQLite lease.
No queue database, independent writer, wrapper transaction or new executable.

Proposed explicit factories `TaskStore.createQuestionEngine(directory)` and
`openQuestionEngine(directory)` recognize fresh schema 4 only. Retain existing schema
1/2/3 operation semantics and exact opener behavior. No import, migration, reset,
expansion or downgrade. Question entry points require a schema 4 root and refuse
on older roots rather than returning fabricated success or an empty question view.
The schema 4 opener refuses schema 1–3 or unknown roots without a read-only
fallback; their existing version-specific openers remain available separately.
Schema 4 contains the schema 3 tables plus one STRICT `questions(id,value)`
projection, following the existing projection representation. The implementation
review pins exact schema SQL, event bodies and source hashes before execution.
Old readers refuse the unfamiliar version/events; existing roots are not altered.

Questions, routes, answers and blocked task state derive from the same event
transaction and must match stored projections on open. Existing assignment and
attention views retain their source-of-truth relationship to events. Preserve
schema 1–3 behavior and all 100 accepted regression tests.
The log is authoritative: disagreement with a question/task projection refuses
open, without automatically rebuilding, repairing or trusting the projection.

The only runnable composition remains the fixed owned core host and independent
witness, with reviewed operation additions and role binding. No script/executable,
actor, recipient handle or privileged store may be selected by member wire data.
No UI, MCP or network transport is introduced. These are trusted in-process
coordinator roles, not authentication against hostile code in that process.

## 2. Question eligibility and routing

- Retain one immutable session, 1–5 members, one roster Leader, per-member FIFO,
  configured concurrency, one effect/attempt per task and 100 lifetime assignments.
- An active session's matching member may ask only for its nonclosed started
  assignment. The attached effect must be `planned` or proven `completed`.
  Dispatched, reconciling, uncertain, abandoned, cancelled or terminal assignments
  cannot acquire a new question. Completed effects can still await result reports.
- At most one accepted question over an assignment's lifetime, and at most 20
  accepted questions over the session's lifetime. Answer/cancellation frees no
  lifetime question budget. Question IDs stay unique within question history.
  This counts open + answered + cancelled accepted records, never only closed
  questions. Rejected asks create no question record or lifetime slot.
- A non-Leader's question routes to the immutable Leader. The Leader's own
  question routes to the owner. Recipient is derived, never a DTO field.
- The receiving Leader may escalate a non-Leader's still-open question once to
  the owner, retaining its question/task/author identity. It creates no second
  question, needs no Leader task/reservation and spends no second lifetime slot.
- Only the current recipient may answer: the Leader before escalation, owner
  after escalation or for a Leader-authored question. The author cannot answer
  its own question through another member's handle. Old recipient authority
  expires on escalation. Trusted owner access is still bound in coordinator code.

Proposed member handle additions: `ask(bytes)`, `escalate(bytes)`, `answer(bytes)`
and `questions()`. Escalation and answering durably reject non-Leader members
where not authorized; no caller-selected role field. Owner handle additions:
`answer(bytes)` and `questions()`. No raw store/factory is passed to members.

The owner is the trusted coordinator role, literal `owner`, independent of the
member roster. It has no implied member UUID and cannot be chosen through a
member DTO. The Leader is the one immutable roster UUID, bound by its handle.

| Open question origin/current route | May escalate | May answer |
| --- | --- | --- |
| Non-Leader author / Leader | That receiving Leader only | That Leader only |
| Non-Leader author / owner after escalation | Nobody; escalation is single-hop | Owner handle only |
| Leader author / owner directly | Nobody; already owner-directed | Owner handle only |

Queries return detached copies: every member sees its own authored questions;
the Leader additionally sees member questions initially routed to it, including
their escalation/answer history. The owner sees owner-directed direct/escalated
questions. Closed visible history remains available; a member never gains another
member's prompt/answer merely by naming a question ID. Coordinator snapshots may
contain the complete bounded question projection, as with other trusted views.

| Query handle | Visible question history |
| --- | --- |
| Non-Leader member | Own authored questions and answers only |
| Leader member | Own authored questions plus all questions initially routed to that Leader, even after escalation |
| Owner | Direct or escalated owner-directed questions and answers only |

Visible records include question/task/session IDs, author, prompt/options, route,
escalation status, question status, answer/answer actor and accepted event sequences.
They exclude command-ledger material, other members' unrelated questions and
internal remaining-event counters. Copies cannot mutate stored history.

## 3. Closed commands and durable decisions

All proposed DTOs use compact canonical UTF-8 JSON, at most 16 KiB, exact fields,
numeric version 1 and existing lowercase UUID-v4 grammar. No BOM, whitespace
aliases, duplicate keys, caller actor/recipient fields or invalid UTF-8. Text uses
existing 1–256 Unicode scalar / 1024 UTF-8 byte bounds, no lone surrogates, no
normalization. Options are 0–3 distinct bounded strings; zero means free text only.

| Command | Exact fields in addition to type/version/commandId/sessionId | Actor and result |
| --- | --- | --- |
| `team.question.ask` | `taskId`, `questionId`, `text`, `options` | Matching assignment member; create one open question, derive route and block task |
| `team.question.escalate` | `questionId` | Current receiving Leader; reroute same open member question to owner once |
| `team.question.answer` | `questionId`, `answer` | Current recipient; store immutable answer and unblock that same assignment |

Answer is exactly `{kind:"option",index}` or `{kind:"text",text}`. Option index is
a non-boolean safe integer within the immutable option list; free text uses the bounds
above. Free text is allowed even when options exist. Unsupported shape/type or
text bounds refuse before admission. A syntactically valid index outside that
question's options, unknown question, wrong session/role, closed question or
ineligible task durably rejects when unreserved space exists.
These are closed object shapes, not an instruction to complete a task. Option
strings must be distinct by exact string equality without normalization. Prompt
and answer text remain data; no command, path or tool invocation is interpreted.

Hash SHA-256 over UTF-8 JSON of these ordered arrays without a trailing newline:

- Ask: `[type,1,actor,commandId,sessionId,taskId,questionId,text,options]`.
- Escalate: `[type,1,actor,commandId,sessionId,questionId]`.
- Answer: `[type,1,actor,commandId,sessionId,questionId,answer.kind,value]`, where
  value is the numeric index or original bounded text according to kind.

Actor is the bound member UUID or literal owner role. Commands share the existing
ledger with session/task/effect commands. Exact ID/hash redelivery returns its
original result before current state, question limits, recovery fence or capacity.
Conflicting payload/type/actor refuses without a write. Malformed input refuses
before ledger admission. New rejected/no-op commands consume only unreserved
event space or refuse without a recorded decision. They cannot spend held units.

Each command produces one event with matching type and exact `{command,actor,result}`
body. Replay independently derives decision, hash, route, question budget and task
view. No question transition is split across independently committed events.
Derived question history binds its opening, optional escalation and closing to
their actual global event sequences. Stop cancellation uses the same accepted
stop sequence for every affected question; callers cannot supply those bindings.

## 4. Blocked state, answer and existing effects

Accepted ask changes the task to `blocked`; its started assignment keeps its
member/global slot, effect/attempt identity and existing remaining event budget.
A queued task behind it cannot start; unrelated eligible members may progress.
Escalation preserves blocked state and the original reservation.

While a question is open, refuse new report, approval, claim, raw cancellation,
settlement and resolution mutations for that assignment at BOTH public entry and
replay validation paths. Exact earlier ledger decisions and true read/no-op calls
remain available; they cannot change the question or replay an invocation. No
returned claim may bypass the question gate. Unassigned legacy work keeps its
existing contract; unrelated assigned work retains normal eligibility checks.
Command-oriented APIs retain durable semantic rejection when space exists;
void/claim APIs refuse before a new mutation or invocation. Rejected resolutions
and unchanged idempotent observations need not be forbidden as though they mutated
an effect. Replay must independently prevent any accepted bypass transition.

Accepted answer records the answer and actor, closes the question and releases
its question-only unused budget. It restores `waiting_approval` for an unapproved
planned effect, `running` for an approved plan, or `running` for a completed effect
awaiting report. Derive from current validated effect/approval state, not caller
prose or a caller-supplied resume status. Answer does not approve, claim, start,
report, retry or invoke anything. A later claim/report must still pass its normal
checks. Expired planned effects cannot gain an execution right through an answer.
For a completed effect this means report-only eligibility; its sole committed
attempt can never be claimed again. Closing a question never closes a task.

Stop cancels all open questions in the same composite stop event, releases their
question-only budgets and preserves prompt/route history without an answer.
Existing effect/assignment stop rules still determine cancellation versus retained
terminal/uncertain reservations. Thus a stopped completed effect awaiting report
can require failed reporting; question cancellation cannot infer task done.
For that completed-effect case, remove the blocked overlay and restore `running`
awaiting failed reporting. No task may remain blocked by a closed question.
New answer/escalation after stop rejects; exact old decisions stay unchanged.

Open reconstructs pending/answered/cancelled questions and blocked views without
answering or resuming work automatically. Existing recovery of another interrupted
assignment leaves blocked questions untouched. Its connection-local new-write
fence applies to ask/escalate/answer as well, including owner answers: acknowledge
recovery or stop before a new question command. No new exemption or replayed action.
After recovery clears that fence, an authorized recipient explicitly answers the
still-open question through the normal command. Recovery itself neither supplies
an answer nor changes its blocked task, recipient or question budget.

## 5. Event capacity and question lifetime

Retain the hard 1,000-event limit. A new accepted ask needs room for its one event
plus two held question-only future event units: escalation and answer. This is
additional to, and never taken from, the existing eight-unit assignment budget.
Direct owner questions conservatively hold both units; unused units release on
answer/stop. Accepted escalation spends one; answer spends one then releases any
leftover. Stop spends the existing global stop slot, not question/assignment units.

Before every append require:

```text
event count + remaining assignment budgets + remaining question budgets
  + unassigned legacy effect reserves + active-session stop reserve <= 1,000
```

Accepted question admission must hold all its future units
atomically or refuse before writes. Rejected/no-op traffic cannot consume them.
Exact retries spend nothing again. Answer/stop cannot release any reservation or
budget twice. Reopen cannot recreate released units or reset lifetime counts.

The question limit 20 and assignment limit 100 count all accepted history, not
only currently open records. Admission can bind earlier from event capacity.
No unbounded conversation, retention or crash/rejection traffic is promised.

Illustrative capacity accounting for one active approved plan (no legacy effects):

| Point | Events | Assignment units | Question units | Stop unit | Total |
| --- | --- | --- | --- | --- | --- |
| Before ask | 100 | 6 | 0 | 1 | 107 |
| After accepted ask | 101 | 6 | 2 | 1 | 110 |
| After escalation | 102 | 6 | 1 | 1 | 110 |
| After answer | 103 | 6 | 0 | 1 | 110 |

An answer without escalation instead reaches 102 + 6 + 0 + 1 = 109, releasing
the unused escalation unit. These are design arithmetic examples, not runtime
test results. The existing assignment units never pay for question traffic.

## 6. Required exit evidence

After owner approval, parent review must bind actual source, tests, exact schema/
events, compiled files, measured runtime and installed native hashes BEFORE first
execution. Retain the 100-test baseline and frozen historical evidence. Publish
verdicts/digests; raw captures remain local. Fresh schema 4 only, same fixed hosts.

Required real SQLite/public-boundary cases:

1. Matching-member ask and detached role-filtered views; malformed wire/text/options,
   caller actor/recipient injection, wrong role/session/task and duplicate ID refusal.
2. Member-to-Leader answer, Leader-to-owner question and same-question escalation
   without a Leader task; original recipient loses answer authority after escalation.
3. Unapproved planned, approved planned and proven completed pre-question states:
   blocked view, no early occupancy release, no raw claim/report/mutation bypass,
   correct answer state, no automatic action and expired-plan refusal.
4. FIFO/global cap while blocked; unrelated member completes; direct planning
   cannot attach another effect or bypass assignment ownership.
5. Stop with questions in both routes and mixed work; question budgets cancel in
   the same event; uncertainty stays reserved; completed effects never infer done.
6. Open/recovery while another assignment is interrupted and one is blocked:
   question/answer history and fence survive, recovery neither answers nor resends.
7. Actual SQLite aborts during ask/escalate/answer/stop projection writes; fresh
   owned-child crashes before/after their COMMIT and fresh observer redelivery.
8. Capacity pressure preserves held answer and full-capacity stop; escalation and
   answer spend exactly once; rejected traffic cannot spend reserved units; full
   20-question and one-question-per-assignment lifetime ceilings survive closure.
9. Changed stored actor, route, answer, command hash, budget and blocked/terminal
   projection refuse reopen without repair, reset or silent migration. Independent
   witness counts show no action while blocked or duplicate action after answer.

Children retain ten-second operation bounds and at most five seconds verified
owned-handle teardown. Whole-host/power loss, hostile same-user substitution,
Electron/WSL ABI, authenticated callers, UI, real providers, leader succession,
automatic supervision, mission completion, context summarization, worktrees and
terminal input remain outside this slice. The Phase 2B exit review maps precisely
which Architecture 4 question behavior is implemented and still deferred.
