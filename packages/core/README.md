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
migration or shared live task registry is implemented. Schema 2 stores command
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
