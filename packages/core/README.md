# @tiye/core — internal Phase 1A and synthetic Phase 1B

Headless TypeScript command/event store on Windows x64, pinned Node 26.7.0 and
better-sqlite3 13.0.3. This is product core code, separate from the feasibility
snapshots. It has no effect runner, provider adapter, terminal, Git operation or
network listener. The public entry exports `CoreStore`, `CoreRefusal` and result
types; Phase 1B additionally exports `MockEffectStore`, `approvalBinding` and
their DTO types. Both SQLite connections remain private. Only the fixed test
coordinator executes the separate synthetic witness action.

## API and storage contract

The trusted coordinator must allocate an owned private local directory and verify
its current-user DACL and all ancestor reparse attributes before calling the core.
The test coordinator implements that verification in `test/private-root.ps1` using
Windows security descriptors. This is an internal composition requirement, not a
claim that a bare path string authenticates a caller. The core also checks root
identity, link ancestry, single-link regular database/sidecar files and fixed
inventory. UNC roots are refused; mapped-drive confinement or hostile same-user
mutation is not established. Production main-process storage allocation remains
later integration work.

- `CoreStore.create(directory)` requires an empty verified root and exclusively
  reserves `core.sqlite`. It never initializes an existing or failed database.
- `CoreStore.open(directory)` requires an existing recognized WAL database. It
  acquires ownership, validates exact schema/metadata/integrity, replays versioned
  events and compares command/task projections. It refuses rather than repairs.
- `execute(bytes)` accepts a maximum 16 KiB UTF-8 flat JSON object with exactly
  `type`, `version`, `commandId`, `taskId`, `title`. Type is `task.create`, version
  is the number 1, IDs are canonical lowercase UUID-v4 and title is 1–256 Unicode
  scalars / at most 1024 UTF-8 bytes, with no lone surrogates or normalization.
- Command hash uses the approved ordered-array encoding. Reordered object keys
  and numeric `1.0` produce the same canonical command. Duplicate members refuse.
- Same command ID/hash returns the durable original result; changed payload
  refuses. A new command targeting an existing task commits a durable rejection.
- Command decision, versioned event and task transition commit together. `snapshot()`
  independently replays events and refuses projection drift. This initial slice
  caps history at 10,000 events; no UI-scale or throughput qualification follows.
- `close()` releases ownership; callers must close in `finally`. Storage and
  validation errors propagate without a success response or automatic reset.

WAL, synchronous FULL, foreign keys, in-memory temporary storage and disabled
trusted-schema execution are explicit. SQLite exclusive locking
mode is a connection-lifetime lease on the tested build, including idle periods;
busy waiting is configured to 250 ms. The native file locks are released after a
process dies. No PID-based stale-lock recovery or permanent lock file is used.
SQLite may perform its own physical crash recovery on reopen; the application
does not migrate schemas, reconstruct missing records or reset corrupt files.
SQLite owns its WAL/SHM/journal lifecycle. The core never deletes sidecars.

Stored history is checked structurally, not signed. Power loss, storage hardware
durability, consistent whole-database rollback/substitution, hostile same-user
mutation, backup/restore, migrations, Electron ABI and WSL core execution remain
unqualified. These limits do not enable external effects.

## Build and verification

From `packages/core`, using pinned Node 26.7.0 on Windows x64:

```powershell
rtk proxy npm ci --ignore-scripts --no-audit --no-fund
rtk proxy npm run check
```

The lockfile pins dependencies and integrity digests. Installation scripts were
disabled. The reviewed package includes a Windows x64 N-API prebuild; the core
imports that fixed subpath without a compile/download fallback. Build tooling
and declaration packages are development-only. The dependency exposes broader
SQLite APIs, but the core does not expose its connection, extensions or backup
surfaces. Source import checks are a construction boundary, not an OS sandbox.

Ten real-filesystem/SQLite tests cover accepted/rejected redelivery, conflicts,
Unicode/input bounds, real transaction abort and SQLITE_FULL, corrupt/unsupported
or tampered history, fresh/open separation, hardlinks/junctions, idle owner
exclusion and controlled crashes immediately before/after actual commit.

The crash host instruments the SQLite SDK `exec` boundary only in test code,
pauses at a real COMMIT boundary, then the coordinator terminates its current
owned child and inspects the database in a fresh process. There are no production
crash flags or mocked in-memory databases. Child operation deadlines are ten
seconds, with at most five seconds for verified teardown. Test-root cleanup is
restricted to the current coordinator's generated private paths. Full host-crash
supervision is not qualified by these controlled child crashes.

## Phase 1B: durable synthetic effects

`MockEffectStore.create(directory)` and `.open(directory)` use a separate fresh
schema 2 database with the same private-root requirements. Schema 1 remains
supported by `CoreStore`; the two stores refuse each other's databases. No
migration or shared registry across schema 1 roots is implemented. Schema 2 stores command
decisions, events and replay-checked task/effect/approval projections atomically.
History is bounded to 1,000 events; projection writes rebuild the bounded tables.

- `plan(candidate)` accepts exactly `commandId`, `taskId`, `effectId`, `attemptId`,
  `targetId`, `payload`, `expiresAt`. IDs are lowercase UUID-v4. Payload follows
  the title scalar/byte limits above. Expiry is a nonnegative safe integer of
  Unix milliseconds. It returns durable `accepted` or `rejected`. A new command
  reusing a task, effect or attempt is rejected; conflicting command redelivery
  throws. Plan hashes use SHA-256 over the ordered JSON array
  `["mock.plan",1,commandId,taskId,effectId,attemptId,targetId,payload,expiresAt]`.
- `approvalBinding(plan)` hashes the ordered JSON array
  `["mock.approval",1,effectId,attemptId,targetId,"mock.record",payloadHash,expiresAt]`.
  Payload hash uses `["mock.record",1,targetId,payload]`. Encoding is UTF-8 without
  a trailing newline. `approve(effectId,binding)` accepts only that exact fixture
  binding on a planned effect. This is not authenticated human consent.
- `claim(effectId)` commits `dispatching` before returning the invocation. Missing
  approval refuses. An expired planned effect commits `cancelled` and returns
  `null`. A committed claim never returns again, including after a lost reply.
  The caller must not retry a dispatch. There is no product dispatcher here.
- `cancel(effectId)` cancels planned work; after claim it records `needs_attention`.
  It cannot revoke an invocation already issued. The synthetic worker separately
  checks expiry immediately before append; wall-clock rollback and interruption
  of an action already executing are not qualified.
- `settle(effectId,proofBytes)` accepts at most 16 KiB of canonical UTF-8 JSON
  from the trusted coordinator's fixed witness observer. Exactly one committed
  row matching all invocation fields completes the effect and task. Missing,
  malformed, unavailable, duplicate or conflicting evidence records attention.
  Attention never auto-resumes, including when later proof arrives. Only an
  explicit resolution command can close it. Completed matching settlement is idempotent;
  contradictory evidence after completion throws. Unrelated tasks can continue.
- `snapshot()` validates schema and replays every event against stored projections.
  `close()` must run in `finally`. Storage errors propagate; no reset or resend
  occurs. The connection-lifetime exclusive lease prevents a second idle owner.

`test/witness.cjs` performs the whole mock action as one independently committed
SQLite append in its own private root, recording every invocation without dedup.
The fixed observer runs after writer exit and returns up to two rows matching
either effect or attempt. Inputs and proof are trusted internal fixture traffic;
they are not an authentication protocol for an untrusted process. See the
[reviewed execution plan](../../output/phase1b-core/TEST-PLAN.md) and
[verification record](../../output/phase1b-core/README.md). The suite includes
Phase 1A regression tests and fresh-process crashes around planning, claiming and
settlement commits. No provider, native CLI, project operation or release follows.

### Explicit attention resolution

`attention(effectId)` returns `{effectId,attemptId,attentionSequence}` only while
the effect is in `needs_attention`; unknown or terminal effects throw.
`attentionSequence` is the global event sequence of that effect's actual last
transition into attention. Rejected resolutions and unrelated events do not alter it.

`resolve(request, proofBytes?)` accepts exactly `commandId`, `effectId`, `attemptId`,
`attentionSequence`, `outcome`. IDs use the UUID grammar above; sequence is a
positive safe integer. The trusted fixture coordinator explicitly selects one of:

- `confirm_completed`: requires at most 16 KiB of canonical UTF-8 JSON proof from
  the fixed witness observer. Exactly one row must match the original invocation.
  The effect and task become `completed` together. Resolution never invokes the witness.
- `close_uncertain`: requires no proof argument. The effect and task become
  `abandoned`, preserving the original uncertain history. It does not assert that
  the action was cancelled, absent or completed.

Both require the exact current attention sequence and attempt. Well-formed requests
with unknown effects, mismatching state/attempt/sequence or nonmatching proof commit
a durable `rejected` decision without changing the effect/task. Malformed IDs,
unsupported outcomes, invalid sequence, missing/oversized/noncanonical JSON proof
(including BOM, whitespace and duplicate members), or unexpected proof for closure
throw before command admission. The whole stored event must also fit 16 KiB.

The SHA-256 command hash covers UTF-8 `JSON.stringify` of the ordered array
`["mock.resolve",1,commandId,effectId,attemptId,attentionSequence,outcome,proofHash]`.
Here `1` is a JSON number and `proofHash` is lowercase hexadecimal SHA-256 of
UTF-8 `JSON.stringify` of the parsed proof, or `null` for closure. There is no
normalization, BOM or trailing newline. Proof member order is significant and
the fixed observer supplies its canonical order. Changed request/proof with an
existing command ID throws without writing; exact redelivery returns its original
accepted/rejected decision, even at capacity. Plans and resolutions share the
command namespace. Correcting a rejected request requires a new command ID.

Each resolution is one version-1 logical command stored in a `resolve` event,
with canonical `{request,proof}` body. Replay independently derives its decision,
updates both projections atomically and compares them against storage. The schema
2 table layout is unchanged; older Phase 1B source refuses the unfamiliar event.
Do not downgrade a database after writing resolution events. This is an event
vocabulary extension with refusal on downgrade, not a schema migration.

The 1,000-event cap now reserves per-effect terminal capacity: four slots for an
unapproved planned effect (approval/claim/outcome/resolution), three if approved,
two while dispatching and one while in attention. Further traffic, including
durable rejections, cannot consume these reserved slots. At capacity admission
throws without a durable decision. Old stores that already exhausted this budget
remain readable but may refuse further writes; no repair/expansion is performed.
Reserved capacity does not qualify throughput or unbounded retention.

The [resolution evidence](../../output/attention-resolution/README.md) records
source review before execution and actual SQLite/process recovery checks.

### Shared task and effect registry

`TaskStore` is the preferred public name for the same class as `MockEffectStore`.
It uses the same schema 2 connection and lifecycle methods; it is not a wrapper,
second database or migration of `CoreStore`. `CoreStore` schema 1 and all previous
mock entry points remain supported within their historical contracts.

- `execute(bytes)` accepts the strict `task.create` v1 byte grammar described
  above, including the original ordered-array hash and `Decision` return shape.
  It commits a command decision and `task.create` event; only accepted creation
  inserts task state `created`. Duplicate task IDs durably reject without altering
  a task or title. Exact command redelivery returns its original decision, even
  after task state changes. Titles remain immutable in accepted creation events.
- `planForTask(candidate)` accepts the same exact `MockPlan` fields as `plan`, but
  requires an existing task in `created`. Its `task.plan` event atomically attaches
  the effect and changes that task to `planned`. Effect/attempt IDs remain unique
  across both planning entry points. A missing task, non-created state or reused
  effect/attempt commits a rejected decision without a task/effect transition.
  Each task admits at most one effect in this slice, including after closure.
- The new planning hash uses the ordered JSON array
  `["task.mock.plan",1,commandId,taskId,effectId,attemptId,targetId,payload,expiresAt]`.
  Encoding follows the existing UTF-8 SHA-256 contract. `plan` retains its original
  `mock.plan` domain and auto-creation behavior; it rejects any existing task ID.
  The same command ID cannot move between creation, either planning path or
  resolution. Type-bound hash mismatch throws without an event. Durable semantic
  rejections each consume one event, so replay can recover their original result.
- `registry()` returns `{taskId,title,state,effectId}` rows in accepted task
  insertion order, derived from validated event/projection order. Created tasks
  have their exact title and initially no effect. Legacy auto-planned tasks have
  title `null`; rejected creates/plans never supply titles or registry rows.
  Lifecycle changes appear in this same view, without a cache or second writer.

All event, command and materialized projection writes use one SQLite transaction.
Titles are event-backed; startup replays their command hashes and refuses drift.
Public methods are synchronous and contain no asynchronous yield or callback;
the trusted coordinator serializes calls on its owned instance. Sharing a live
connection with worker threads or hostile reentrant input objects is unsupported.
The exclusive connection lease still excludes another process owner.

Creation/planning use the existing event limit and terminal reserves. A created
task reserves no future effect slots: later planning may refuse at capacity.
Reserved capacity for already admitted effects remains protected. No retention,
transfer between old roots, automatic schema migration or real action is added.
Schema tables are unchanged; older readers refuse unfamiliar `task.create` and
`task.plan` events. Do not downgrade a database after using the new entry points.
See [shared-registry evidence](../../output/task-registry/README.md).

## Phase 2A: bounded synthetic team engine

The [explicit Phase 2A approval](../../output/phase2a-approval/README.md) covers
the [frozen contract](../../output/team-engine-entry/CONTRACT.md). This internal
library uses the existing fixed core/witness test composition. Full product
integration, provider/native execution and release remain HOLD. The complete
[Phase 2A exit review](../../output/phase2a-exit/README.md) records the bounded
contract decision, requirement coverage and deferred product behavior.

`TaskStore.createEngine(directory)` creates fresh schema 3 with the existing
command/event/task/effect/approval tables plus a sessions projection. `openEngine`
requires that version; ordinary create/open remain schema 2. There is no new
writer, queue database, migration, reset, import or downgrade. Old readers refuse
unfamiliar engine events. Assignment/result/recovery/attention-sequence views are
derived by replay; task/session projections are materialized and checked.

### Bound handles and commands

The trusted coordinator retains the raw store. `owner()` exposes frozen
`createSession(bytes)`, `stop(bytes)`, `recover(bytes)` and `session()` operations.
`member(memberId)` exposes frozen `context()`, `enqueue(bytes)`, `report(bytes)`
and `inbox()` operations. `scheduler()` exposes frozen `start(bytes)` and
`inboxes()`. Context includes immutable identity/name/instructions, session and
leader/member role. Members cannot choose a different actor or privileged handle
through wire input. These are trusted in-process roles, not hostile-code isolation
or authenticated UI/MCP identities. The fixed report test host binds its coder
handle in coordinator code, never from a member ID in wire data.

There is one immutable session with 1-5 distinct members, one roster leader and
`maxConcurrent` from 1 through roster size. Creation is documented in the
[session plan](../../output/phase2a-session/TEST-PLAN.md); enqueue/start fields and
hashes in the [inbox plan](../../output/phase2a-inboxes/TEST-PLAN.md). Only the
leader can enqueue a created core task for a roster member. FIFO uses accepted
enqueue sequence. Start reserves that member and a global slot and attaches the
exact effect plan in one event/transaction. Every member, including the leader,
can hold at most one active reservation; waiting for approval counts toward it.
Task/effect/attempt identities remain unique across legacy and assigned work.

All engine byte DTOs require compact canonical UTF-8 JSON, at most 16 KiB, exact
fields, numeric version 1 and lowercase UUID-v4 IDs. Duplicate fields, BOM,
whitespace aliases, invalid UTF-8 or extra actor fields refuse before admission.
Commands share one ledger with all core commands. Exact ID/hash redelivery
returns the original result before state/capacity/fence checks. Changed hash or
cross-type ID reuse throws. New semantic rejections consume one event when space
exists; lack of space throws without recording a decision.

### Reports and assigned effect state

Report DTO: `{type:"team.task.report",version:1,commandId,sessionId,taskId,status,
summary}`. Status is `done` or `failed`; summary uses existing 1-256 Unicode scalar
and 1024 UTF-8 byte bounds, without lone surrogates. Hash is SHA-256 UTF-8 JSON of
`["team.task.report",1,actor,commandId,sessionId,taskId,status,summary]` without a
trailing newline. Actor comes from the member handle.

A matching member can report only its nonclosed started assignment. `done`
requires a completed effect and active session. `failed` requires completed,
cancelled or explicitly abandoned effect, including after stop. Dispatching or
uncertain effects cannot release a slot through result prose. Accepted report
stores `{status,summary}` on the derived assignment, sets task done/failed and
closes its reservation/budget atomically. New reports after closure reject; exact
report retries keep their original decision. Lifetime assignment history remains.

Assigned effect completion alone leaves the task `running` with its slot held.
An approved normal in-flight effect also shows `running`. Explicitly recovered
dispatching work shows `reconciling`; uncertainty, cancellation or abandonment
awaiting failed report shows `needs_attention`. Unassigned effects retain their
earlier vocabulary. These labels describe synthetic logical state, not CLI proof.

Existing raw effect methods now support assigned effects: exact approval and an
active session are required before claim; one committed claim never returns
again. Expiry cancels an unclaimed plan and returns null, leaving failed reporting
to close the active assignment. Raw cancellation also retains its reservation
until report; cancellation of dispatched work records attention. Settlement and
explicit resolution reuse the existing fixed witness predicate and exact attention
sequence. Active confirmed resolution returns to running awaiting report; explicit
abandonment awaits failed report. There is no automatic action or witness invocation.

### Explicit recovery and stop

Recovery DTO: `{type:"team.session.recover",version:1,commandId,sessionId}`; hash
`["team.session.recover",1,"owner",commandId,sessionId]`. One owner event acknowledges
every newly interrupted dispatched assignment in the session, setting its
`recoveryAcknowledged` flag and task `reconciling`. Each affected assignment spends
one held event unit, atomically. New recovery commands with no unacknowledged
dispatch reject without consuming assignment budgets. Exact retries never spend
again. The sole attempt cannot start another recovery phase.

Open replays only and captures a local fence for unacknowledged dispatching work.
Until acknowledgement, new event appends refuse with `engine-recovery-required`,
except owner stop/recover. Ledger retries and read/no-op calls remain available.
The exclusive SQLite lifetime lease excludes another owner; stale closed handles
refuse. This is a connection-local admission fence rebuilt on every open, not a
new durable lock or process identity. The trusted owner requests recovery after
reopen; calling it conservatively on a live claim also acknowledges the phase
and never resends or revokes the invocation. The coordinator must observe the
fixed witness only after its writer exits. Exactly one matching row reconciles;
zero, duplicate, conflicting or unavailable evidence requires explicit resolution.

Stop DTO/hash remains `{type:"team.session.stop",version:1,commandId,sessionId}` /
`["team.session.stop",1,"owner",commandId,sessionId]`. Active session only accepts;
stop is terminal for that immutable session. One event closes admission, cancels
queued/planned work and releases those reservations, retaining lifetime history.
Dispatched work becomes attention and keeps its reservation/budget; existing
attention keeps its original sequence. Completed/abandoned effects awaiting report
retain their reservation and may receive only failed reporting after stop.
Explicit resolution of stopped attention closes the assignment cancelled on
confirmed completion or failed on abandonment, never done. No new starts,
approvals or raw claims can revive stopped work. No OS termination is implied.

### Capacity and evidence

At most 100 assignments over the lifetime of the session; closing one frees live
occupancy, never lifetime capacity. Enqueue reserves eight future events: start,
approval, claim, recovery, settlement, resolution, report and a spare. Accepted
lifecycle events spend one unit; a composite recovery spends one per affected
assignment. Closure releases unused units. Rejections/no-op recovery cannot spend
held units. Composite session stop uses its global one-event reserve; it does not
spend an assignment unit. Assigned effects are excluded from legacy reserves.

Every append requires event count + remaining assignment budgets + unassigned
legacy reserves + active-session stop reserve <= 1,000. Stop may commit as event
1,000. Capacity can bind before the assignment ceiling. No unbounded crash history
or throughput claim follows. Source/compiled/native preflight, independent witness
counts, real SQLite rollback and controlled commit-crash cases are recorded in
the [lifecycle plan](../../output/phase2a-lifecycle/TEST-PLAN.md) and
[verification](../../output/phase2a-lifecycle/README.md). Historical sealed reports
remain bound to their qualifying commits and do not describe current admission.

## Phase 2B: durable questions and answers

The [scope activation](../../output/phase2b-approval/README.md) records the owner's
instruction to continue after presentation and clarification of the frozen
question amendment at2766d76. The [contract](../../output/phase2b-entry/CONTRACT.md)
defines this bounded internal extension. No provider, UI, network or new runner.

`TaskStore.createQuestionEngine(directory)` / `openQuestionEngine(directory)` use
fresh schema4 only: schema3's exact tables plus STRICT `questions(id,value)`.
Schemas1-3 retain their existing entry points and operation semantics. Wrong
openers refuse; no migration, repair, read-only fallback, reset or downgrade.
Every question event, command, question projection and task view shares the
existing transaction/writer. Replay refuses projection drift on open.

Member handles add `ask(bytes)`, `escalate(bytes)`, `answer(bytes)`, `questions()`;
owner handles add `answer(bytes)`, `questions()`. These operations require schema4
and refuse on older roots. Actor identity is bound in trusted coordinator code,
never selected in a wire field. The owner role is independent of roster UUIDs.

Question DTOs require existing compact canonical UTF-8 JSON <=16KiB, exact fields,
numeric version1, lowercase UUID-v4 IDs and existing text scalar/byte limits.
Exact type/version/actor/payload hash arrays are specified in the contract.
Shared-ledger exact retries precede state, capacity and recovery checks; changed
payload/type/actor conflicts refuse. Semantic rejections consume unreserved space
or refuse without a durable result. Options are0-3 distinct bounded strings;
answer is exactly `{kind:"option",index}` or `{kind:"text",text}`. Index is a safe
integer; out-of-list choices durably reject. Text is never interpreted as code.

- Ask: `team.question.ask` v1 with commandId/sessionId/taskId/questionId/text/options.
  Only the matching member's active nonclosed started assignment with planned or
  completed effect is eligible. Non-Leader routes to Leader; Leader routes owner.
  One accepted question per assignment and20 lifetime questions per session,
  including answered/cancelled history. Opening blocks its task and holds its slot.
- Escalate: `team.question.escalate` with commandId/sessionId/questionId. Only the
  current receiving Leader may route the same open member question once to owner;
  no Leader task or additional lifetime question is needed. Old recipient loses
  answer authority. Direct Leader questions are already owner-directed.
- Answer: `team.question.answer` with commandId/sessionId/questionId/answer. Only
  current recipient may answer. It closes the question and restores waiting_approval
  for an unapproved plan or running for an approved/completed effect. It never
  approves, starts, dispatches or reports. Completed effects remain report-only.

While open, question gates prevent new raw approval/claim/cancel/settle/resolution
mutations and report acceptance in both APIs and replay. Exact decisions, true
no-op observations and rejected commands remain available. FIFO/member/global cap
still includes blocked work; unrelated eligible members can progress. Expired
plans cannot gain an invocation by answering a question.

`questions()` returns detached visible history without internal remaining-event
counters: non-Leaders see own authored records; Leader additionally sees questions
initially routed to it; owner sees owner-directed direct/escalated records. Fields
include IDs, author, prompt/options, route, escalation/status, answer/answer actor,
and actual opening/escalation/closing event sequences. Coordinator snapshots also
expose the replay-checked internal question budget; no privileged store is passed
to members. These are in-process trust boundaries, not authenticated transport.

Stop cancels open questions in the existing one-event session stop transaction,
binding all cancellations to that actual stop sequence and releasing question
budgets. Queued/planned tasks cancel; completed blocked tasks restore running
awaiting failed reporting after stop; other uncertain effects retain reservations.
No closed question leaves a blocked overlay or infers done. New replies/escalation
after stop reject. Open replays only; global interrupted-attempt recovery fences
new question commands too. Recovery does not answer or unblock pending questions;
the authorized recipient explicitly answers after acknowledgement clears the fence.

Ask reserves two ADDITIONAL question units (escalation/answer), while existing
assignment units remain untouched. Escalation spends1; answer spends1 and releases
leftover; composite stop uses global1 and releases question budgets. Rejection
cannot spend held units. Capacity is events + assignment units + question units +
unassigned legacy reserves + active stop unit <=1000. Neither question nor task
closure resets lifetime counts. Direct owner answers release the unused escalation
unit. Source/test/runtime/native preflight and real SQLite/process evidence are in
the [question verification](../../output/phase2b-questions/README.md). Full Phase2B
exit review is still separate; product providers/native integration remain HOLD.

## Phase 2C: explicit mission completion

The [owner approval](../../output/phase2c-approval/README.md) activates the
[contract](../../output/phase2c-entry/CONTRACT.md) frozen at58187f8.
`TaskStore.createMissionEngine(directory)` / `openMissionEngine(directory)` use
fresh schema5 only, with schema4's exact tables and a new event/session vocabulary.
Schemas1–4 retain separate exact openers. No migration, reset or new runner.

Member handles add `completeMission(bytes)`; only the bound Leader can succeed,
without needing a task itself. DTO is exactly team.mission.complete v1 with
commandId/sessionId/summary, using existing canonical byte/text bounds. Hash is
SHA-256 UTF-8 JSON of `[type,1,actor,commandId,sessionId,summary]`. Exact retries
precede state/capacity/recovery; changed payload/actor/type refuses. One event
atomically records decision, completed session and summary/actor/global sequence.

All tasks must belong to closed assignments with explicit done results and proven
completed effects. Empty, unassigned, failed, cancelled, queued, blocked or uncertain
work prevents success. Completion never reports a task or invokes an effect. New
admission rejects after completion, including raw task.create/plan/task.plan;
accepted mutation bypasses refuse replay. Rejections require unreserved capacity.
Historical decisions/read/no-ops remain available. Stop and successful completion
share the active session's one terminal reserve, allowing completion at event1000.

Owner/member `mission()` returns only detached `{sessionId,status,completion}`;
completion is null until success then `{summary,completedBy,sequence}`. Owner read
before a session is null; member access retains roster binding. No question content
or ledger/budget material is included. These methods refuse older roots. The
existing recovery fence applies; recovery never completes a mission automatically.
Only trusted coordinator roles and fixed synthetic witnesses are qualified.
