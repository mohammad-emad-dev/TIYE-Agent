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

## Phase 2A: session foundation

The owner approved bounded internal engine construction at proposal `8f2d0a2`;
the [approval record](../../output/phase2a-approval/README.md) activates that scope.
This first component adds a durable session/roster only; the full engine is still
under construction. Its inbox/planning extension is described below; engine
dispatch, reporting and stop/recovery are not yet admitted.

- `TaskStore.createEngine(directory)` creates fresh schema 3 with the existing
  command/event/task/effect/approval tables plus a sessions projection table.
  `openEngine(directory)` requires that exact version; ordinary create/open still
  use schema 2. There is no automatic migration, reset or downgrade.
- `store.owner()` returns a frozen coordinator handle with `createSession(bytes)`
  and `session()`. Creation returns durable accepted/rejected; session returns a
  fresh roster snapshot or null. One accepted roster is allowed per database.
- `store.member(memberId)` returns a frozen handle with `context()` bound to a
  member in the accepted roster. It exposes that member's identity, name,
  instructions, session ID and leader/member role, with no owner operation or raw
  store. The coordinator retains the store; the handles do not authenticate
  hostile code already executing inside that coordinator.
- Session commands and task/effect commands share the same SQLite ledger and
  transaction path. Exact redelivery survives reopen; changed payload or command
  ID reuse across types refuses. Failed writes roll back all projections.

The closed session DTO, canonical wire/hash format and planned behavioral checks
are specified in the [source-reviewed execution plan](../../output/phase2a-session/TEST-PLAN.md).
Its wire grammar requires compact canonical JSON rather than the task-create
lexer's whitespace/numeric alias allowances. Both text validators share the same
Unicode/byte bounds. A session reserves one event for future logical stop; this
component does not implement stop or the later assignment-capacity budget.

See [session verification](../../output/phase2a-session/README.md). Fresh schema 3
and schema 2 use the same owner/lease, storage validation, replay and effect code;
there is no independent engine writer. The inbox/planning extension adds logical
reservations; dispatch, result reporting and stop/recovery remain ahead. Full integration
and release remain HOLD.

### Durable inboxes and planning reservations

Schema 3 member handles now expose `enqueue(bytes)` and `inbox()` in addition to
their bound `context()`. Only the session leader's enqueue can be accepted; another
member receives a durable rejection. Actor identity is taken from the handle,
never a wire field. `inbox()` exposes only that bound member's queued task IDs and
active task ID. The trusted coordinator alone retains `store.scheduler()`, whose
frozen handle exposes `start(bytes)` and `inboxes()` for the roster.

Enqueue requires an existing created task, a member in the active session and no
previous assignment of that task. Accepted event sequence defines per-member FIFO.
Start requires that member's oldest queued task, no other active task for that
member and room under `maxConcurrent`. It atomically reserves the slot and records
one exact synthetic effect plan. Waiting for approval holds the slot; approval
does not free it. Global effect/attempt identity uniqueness spans legacy and
assigned plans. A single immutable session and store-wide unique task IDs make
task ID an unambiguous assignment key.

Queue assignments and remaining budgets are derived from canonical engine events
in the existing database; no SQL table or second queue writer is added. Task
queued/waiting_approval/running views are materialized and replay-checked in the
existing task projection. Session-only schema 3 roots keep their table layout;
old source refuses the new inbox event types. Snapshot adds derived `assignments`.

**This component admits planning only.** Assigned-effect claim/cancel/settle/resolve
mutations are refused while engine stop, recovery and terminal handling remain
unqualified. Approval may label an active reservation `running`, meaning logical
admitted work only; it is never proof of dispatch or CLI activity. Registry states
cannot authorize an action. Every assigned effect stays planned, and no slot is
released automatically. Unassigned legacy effects keep their prior qualified
lifecycle. Raw planning entry points cannot attach another effect to assigned tasks.

Each accepted enqueue holds eight future events; start and a new exact approval
consume one each. Assigned effects are excluded from legacy effect reserves to
avoid double counting. Every append must fit event count + assignment budgets +
unassigned effect reserves + one session-stop slot <= 1,000. Rejected requests
consume only unreserved space or refuse admission; they cannot spend held budget.
Exact redelivery remains available at capacity. The lifetime ceiling is 100
assignments, but capacity can bind earlier while terminal budget release is absent.

The exact DTO/hash contract, source review and tests are in the
[inbox execution plan](../../output/phase2a-inboxes/TEST-PLAN.md) and
[verification summary](../../output/phase2a-inboxes/README.md). Full Phase 2A is
still in progress; existing approval covers its remaining stop/recovery/result work.
