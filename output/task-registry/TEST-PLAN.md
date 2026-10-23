# Shared internal task registry — source review before execution

23 October 2026

The owner requested continued core implementation. This bounded convergence
keeps the approved internal 1A/1B construction surface: owned local databases and
the fixed synthetic witness only. It adds no migration, new process capability,
provider, native CLI, project operation or release route.

The parent reviewed model/store/entry-point changes, fixed mock host, registry
tests and the existing capacity fixture before execution. Existing witness,
private-root allocation, process supervisor, runtime/dependencies and their
constraints are retained. `preflight.json` pins actual package/test source,
compiled files, runtime version and installed dependency/prebuild hashes before
each recorded run. Corrections require a new reviewed preflight. Raw captures
remain in `.git`; public records contain digests and verdicts.

## Composition and contract

The preferred `TaskStore` export aliases the existing schema 2 class, with one
connection, command ledger and event history. It gains strict task creation,
explicit planning against an existing created task and a derived registry.
It does not combine schema 1 files, reset storage or copy/migrate an older root.
Accepted creation owns a task title; rejected commands never replace it.
Accepted task insertion order comes from replayed history, not sorted object keys.
Legacy auto-planned tasks retain title `null`. Every task has at most one effect.

New event vocabulary: `task.create` with validated CreateTask DTO and `task.plan`
with validated MockPlan DTO. Their commands share one ID namespace with old
planning and resolution. Hashes are type-bound; exact redelivery checks the
ledger before current task state. Semantic rejection consumes one event and
decision, with no task/effect transition. Malformed input and hash conflicts
throw before writes. Full encoding and APIs are in the package README.

Events, decisions and all JSON-valued SQLite projection rows commit in one
transaction. JSON projections are not external files. The pure reducer validates
history and compares stored projections on every operation. Public operations
are synchronous with no yield/callback; trusted coordinator calls are serialized.
Reentrant hostile objects and shared worker-thread connections are unsupported.
Existing exclusive native connection ownership remains enforced.

## Test plan

- Retain all 34 core/effect/attention regressions.
- Creation, Unicode titles, duplicate-title protection, stable registry ordering,
  strict malformed-byte refusal and durable redelivery across reopen.
- Same command/decision/hash contract as the original CoreStore on actual files.
- Created task -> attached effect -> claimed -> single independent witness ->
  completed, visible through one registry. Coexistence with legacy unnamed tasks.
- Missing-task rejection remains rejected after task creation; wrong task state,
  effect/attempt reuse and cross-entry-point command IDs cannot attach/overwrite.
- Real SQLite abort triggered at the SDK transaction boundary during task
  projection insertion leaves no event, command or task behind.
- Tampering with an event-backed title without changing its ledger hash refuses
  startup; no repair/reset is attempted.
- New creation/planning traffic cannot consume the slot reserved for terminal
  attention resolution in the near-limit real SQLite history fixture.
- Fresh-process crashes immediately before/after COMMIT for task creation and
  effect attachment. Fresh recovery redelivery produces one decision/effect;
  independent witness remains empty before any claim/action.

Each child is supervised using its current owned handle, with a 10-second
operation deadline and 5-second verified teardown. Roots are private disposable
Windows directories from the existing trusted coordinator. No provider or real
action occurs. The sole append action remains independently committed by the
fixed witness after claim; no deduplication is introduced.

## Review decisions and limits

GPT-6 Luna, Flint and DeepSeek supplied design reviews; parent final source review
and executed gates determine acceptance. Suggested separate projection repair and
zero-event durable rejections are not adopted: projections already commit inside
SQLite and rejected decisions must remain replayable. The draft's stray old
test-count reference is superseded by the 34-test accepted baseline and actual
recorded TAP totals. A review does not qualify final code or provider behavior.

New events make older readers refuse; schema 2 layout is unchanged. Migration,
retention, throughput, Electron/WSL runtime, power loss and hostile mutation remain
unqualified. Team engine and production integrations require their later scope
review. Full native/provider integration and release remain HOLD.
