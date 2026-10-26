# Phase 2C: explicit synthetic mission completion

Proposal only. Target: Architecture4.2 `complete_mission`, internal logical subset.
Baseline: Phase2B exit95bd198 with125 passing tests. This is the next small engine
capability, not an adapter, UI or release stage.

## 1 Storage and compatibility

Keep TaskStore, one synchronous connection/writer, shared event/command ledger,
private-root validation and exclusive lifetime lease. Add explicit
`createMissionEngine(directory)` / `openMissionEngine(directory)` recognizing
fresh schema5 only. Schema5 has exactly schema4's tables and STRICT definitions;
metadata version5 identifies the expanded session/event vocabulary. No extra
database, projection table, migration, import, repair, reset or downgrade.
Existing schema1–4 openers and behavior remain unchanged, including question
roots. New completion entry points refuse older roots before admission.

Active/stopped session projection rows keep their existing shapes. An accepted
completion changes status to `completed` and adds exactly
`completion:{summary,completedBy,sequence}`. `completedBy` is the immutable Leader
UUID; sequence is the accepted global event sequence. This field is absent on
active/stopped sessions. Never infer completion from task counts during open.
Replay independently derives the status/summary/actor/sequence and compares every
stored projection. Drift refuses open; no automatic reconstruction is persisted.

## 2 Command, authority and idempotency

Proposed frozen member handle method `completeMission(bytes)` and read method
`mission()`; owner gets `mission()` only. Each member's mission read is the same
detached view with exactly `{sessionId,status,completion}`. Status is `active`,
`stopped` or `completed`; completion is null before success, otherwise exactly
`{summary,completedBy,sequence}`. Owner mission() returns null before a session
exists; member handles retain their existing roster/session binding requirements.
No roster, instructions, question content, ledger material or budget counters are
included. Mutating any returned object cannot alter subsequent views or storage.
Coordinator snapshots retain complete trusted projections as before. No raw store,
actor/recipient/executable selection is supplied by member wire data. Trusted
in-process roles do not authenticate hostile code sharing the process.

DTO exactly:
`{type:"team.mission.complete",version:1,commandId,sessionId,summary}`.
Use existing compact canonical UTF-8 <=16KiB, exact fields, lowercase UUID-v4,
numeric version1 and summary1–256 Unicode scalars / <=1024 UTF-8 bytes, without
lone surrogates or normalization. No task IDs, success flags, actor or resume state
may be supplied. Summary is data, never an instruction to execute anything.

Hash is SHA-256 over UTF-8 JSON of the ordered array without trailing newline:
`["team.mission.complete",1,actor,commandId,sessionId,summary]`.
Actor is bound by the member handle. Same shared command namespace as every prior
command. Exact ID/hash retry returns original accepted/rejected decision before
current session state, capacity and recovery fence. Changed type/payload/actor
refuses without writes. Malformed bytes refuse before ledger admission.

One event, type `team.mission.complete`, exact body `{command,actor,result}`.
Result is `accepted` or `rejected`; replay independently validates command, actor,
hash, eligibility and outcome. Semantic rejection spends one unreserved event or
refuses without a recorded decision when no unreserved capacity remains.

## 3 Completion predicate and closure

Only the immutable roster Leader may complete the matching active session. It
needs no active assignment/reservation of its own. The owner or other member
cannot complete through a completion API. At least one assignment must exist.

All of the following must hold simultaneously in the event-derived state:

- Every accepted core/legacy task in this root has a matching assignment belonging
  to this session. Extra created or unassigned legacy planned tasks prevent success.
- Every assignment is closed, task state is `done`, and its stored explicit member
  result has status `done`. Failed/cancelled assignments prevent mission success.
- Every assignment's sole effect is `completed` under the existing independent
  witness predicate, and no assignment or question event reservation remains.
- No question is open and no effect is planned, dispatching, reconciling,
  needs_attention, cancelled or abandoned. All accepted effects must correspond
  to those completed assigned tasks. No uncertainty is resolved by summary prose.

This conservative slice offers success completion only. A root containing failed,
cancelled or legacy unassigned work can be stopped, not labelled successful through
this command. There is no repair/retry/reassignment/failure override here.

Accepted completion changes only session status/completion metadata, in the same
transaction as event and decision. It never closes a task, releases a live slot,
answers a question, approves/claims/reports an effect or invokes a witness.
Task/report/question/effect histories remain byte-equivalent in logical values.

Completed is terminal for this immutable session. New enqueue/start/ask/escalate/
answer/complete/stop/recovery commands cannot succeed. Existing exact ledger retries
and read/true no-op calls remain available. New core task.create and both raw plan
entry points durably reject on schema5 after completion; before completion they
retain current semantics. As with all semantic rejections, these rejections are
ledgered only when unreserved capacity exists; at event1000 they refuse before
admission without a new decision. Any raw approval/claim/cancel/settle/accepted resolution that would mutate a
completed session's task/effect must refuse at both API and replay paths. Rejected
resolutions and unchanged observations remain available under existing rules.
No new accepted legacy effect or task can silently reopen the completed mission.

Owner stop before completion retains its existing semantics and prevents later
success. New stop after completion rejects; it cannot change completed to stopped.
No implicit next mission, session restart or admission reopening is introduced.

## 4 Capacity and recovery

Reuse the one active-session terminal event reserve: stop OR successful completion
consumes that unit; they are mutually exclusive terminal transitions. It is not a
second reserved slot. Before completion, question/assignment/legacy reserves retain
their existing formula; after success those are zero by eligibility and active
session reserve becomes zero. A valid completion can commit as event1000.
New rejected commands cannot spend the terminal unit. Exact retries spend nothing.
Rejected premature completion cannot steal lifecycle/question/terminal capacity.

The existing connection-local interrupted recovery fence applies to new completion
commands. Exact earlier ledger decisions precede it. Owner stop/recover retain their
existing exemptions from the connection-local write fence only, not from their
state predicates; new recovery after completion must reject because no interrupted
assignment can exist. There is no special fence-clearing command or completed-state
mutation. Completion gets no fence exemption. Recovery never implies completion.
Open replays completed state and summary without emitting an event or invoking any
action. Fresh retry after a lost reply observes one accepted completion decision.

## 5 Required exit evidence

Parent source/test review must pin actual schema SQL, event shapes, guards,
compiled bytes, measured runtime and native/dependency hashes before execution.
Retain all125 accepted tests and historical seals. Add real SQLite/public-boundary
checks covering:

1. Exact schema5/wrong openers and older-root completion refusal; schema1–4
   regressions. Empty mission, wrong member/session and malformed wire/summary/
   actor injection refuse or durably reject according to command grammar.
2. Leader with no task completes a nonempty all-done session. Detached mission
   views, summary/actor/global sequence, unchanged task/effect/question histories,
   and independent witness counts prove no automatic action.
3. Each premature condition: queued, waiting approval, blocked, dispatching,
   reconciling, attention, completed-effect-awaiting-report, failed/cancelled,
   unassigned created/legacy effect and open question. No bypass by result prose.
4. Closure guards for every mutating public path and independent injected replay
   events, especially raw task.create/plan/task.plan. New stop/recovery/completion
   reject, exact previous commands retain original decisions, no reopened admission.
5. Actual SQLite projection-write abort rolls back status, summary, event, ledger
   and all histories. Fresh owned children crash before/after actual COMMIT;
   fresh observer and exact retry recover one decision without witness activity.
6. Held terminal reserve: premature/rejected traffic cannot spend it; successful
   completion at event1000, read/retry after reopen, new unreserved traffic refuses.
   Reopen recovery fence and stop-versus-complete ordering are explicit cases.
7. Altered stored completion actor/summary/sequence/status, command hash or accepted
   event decision refuses open without repair. Admission capacity and exact retries
   are independently counted, not accepted from model claims.

Use only the existing fixed owned host/witness composition with reviewed coordinator
role selection. Existing child10-second operation and5-second owned teardown bounds
remain. Whole-suite capture retains streams and a bounded420-second deadline unless
measured evidence justifies a separately documented aggregate change. No whole-host
power-loss, hostile in-process isolation, throughput, Electron/WSL ABI, provider
transport, automatic supervisor, Leader succession, context summary, UI, worktree,
file merge, MCP or release qualification follows. Exit maps precisely the internal
Architecture4.2 subset and ends this construction exception.
