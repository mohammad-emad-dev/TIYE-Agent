# Phase 2A durable inboxes and planning reservations

23 October 2026 — parent source review before first execution

Authority: explicit Phase 2A approval at `4ce785d`, proposal `8f2d0a2`. Session
foundation accepted at `8ba0f17` with 55 tests. This component implements durable
enqueue and atomic planning start only, not dispatch or the full engine exit.

## Reviewed composition

Parent reviewed `engine-inbox.ts`, extraction of existing mock-plan helpers,
shared canonical decoding, reducer/store/type changes and fixed host/test changes.
Existing private-root allocator, owned-child supervisor, runtime/native dependency
and fixed witness remain the only execution composition. No dependency/executable
or generic launcher is added. Preflight pins actual source/test/compiled files,
runtime version and installed dependency/prebuild hashes before each run. Source
changes require another reviewed preflight. Raw captures stay local in `.git`.

No SQL table is added. Assignments/budgets are deterministic event-derived records;
queued task states remain materialized in the existing replay-checked task table.
Session-only schema 3 roots keep their table format. Old source refuses new event
vocabulary. There is no migration, reset or queue database.

## Exact command grammar

Inputs use shared max-16-KiB compact canonical UTF-8 JSON: no BOM, duplicate keys,
extra fields or spellings that change on JSON re-encoding. Closed DTO validation
rebuilds fields; object member order does not affect ordered-array command hashing.
IDs are lowercase UUID-v4. Type/version/actor and every payload field are hashed.

Enqueue: `{type:"team.task.enqueue",version:1,commandId,sessionId,taskId,memberId}`.
SHA-256 covers UTF-8 JSON.stringify of
`["team.task.enqueue",1,actorMemberId,commandId,sessionId,taskId,memberId]`.
Actor comes from the bound member handle. Accept only the active session's leader,
roster target member, created unassigned task and lifetime assignment count <100.
Accept sets task queued and assignment effectId null, enqueueSequence equal to the
accepted event sequence, remainingEvents 8. Unknown/stale/unauthorized semantic
requests durably reject without moving the queue.

Start: `{type:"team.task.start",version:1,commandId,sessionId,memberId,taskId,
effectId,attemptId,targetId,payload,expiresAt}`. SHA-256 covers UTF-8 JSON.stringify
of `["team.task.start",1,"scheduler",commandId,sessionId,memberId,taskId,effectId,
attemptId,targetId,payload,expiresAt]`. Fixed actor is supplied by the coordinator's
scheduler handle. Mock plan validation preserves the existing payload/deadline
contract. Start plans work; expiry is not proof of action eligibility.

Accept only the named oldest queued task for that member, idle member, global cap
available and globally unique effect/attempt IDs. One canonical event atomically
records the effect plan, member/global reservation and waiting_approval task state;
remaining budget becomes 7. A new exact approval consumes another event/budget
unit and exposes logical running state. Approval still holds the reservation.

Each event type equals its DTO type, with canonical `{command,actor,result}` body.
One pure predicate determines API and replay decisions; replay independently
checks result and command hash against stored projections. All decisions, events
and materialized rows share the existing SQLite transaction. Tasks are globally
unique within one database and there is at most one session, so task ID keys cannot
collide across current assignments. Rejected enqueues never affect accepted FIFO.

The command ledger is keyed by command ID across all command types and actors.
Exact redelivery checks its hash/result before current state or capacity; changed
payload, actor or cross-type reuse throws without an event. Schema 2 rejects all
engine events. New schema 3 snapshot includes derived assignments; no cache is used.

## Temporary dispatch boundary and capacity

Assigned effects cannot mutate through claim, cancel, settle or resolution until
engine stop/recovery/terminal handling is implemented and source-qualified. Checks
are in replay as well as API preconditions, covering raw core paths. Effect approval
is permitted, but neither running task status nor approval authorizes dispatch.
Independent witness records remain empty for assigned tasks in this component.
Unassigned legacy effects preserve their prior behavior. Direct plan/task.plan
cannot attach to a task already queued or active in an engine assignment.

No assignment releases its slot in this component, including after approval.
Future result/stop/resolution must implement terminal release under the already
approved full contract. Do not infer that this component qualifies that behavior.

On every append require E + sum(assignment remainingEvents) + legacy reserves for
unassigned effects + session stop reserve <=1,000. Each accepted enqueue reserves
8; accepted start and first approval decrement by 1. Rejection/idempotent replay
does not reduce a held budget. Assigned plans are not counted twice in legacy
reserves. Semantic rejections need unreserved space or fail admission. An admitted
start/approval can still proceed at full reserved capacity. Capacity may bind before
the lifetime ceiling of 100; the current component cannot qualify budget release
after terminal reports because that functionality is not yet implemented.

## Planned real SQLite/process gates

- Retain all 55 regression tests.
- Stable FIFO, one active slot/member, global cap while awaiting approval and
  across approval; another eligible member may reserve concurrently.
- Bound leader authority, malformed/canonical wire refusal, namespace conflicts
  and exact rejected redelivery after later task creation/state changes.
- Global effect/attempt uniqueness including unassigned work, and direct planning
  and assigned dispatch bypass refusal without writes or witness invocations.
- Actual SQLite trigger abort during effect projection insertion leaves no plan,
  command, event, phantom slot or queue-head loss.
- Near-limit valid history protects budget from rejections, admits start/approval,
  keeps exact redelivery available and refuses extra unreserved traffic.
- Real admission pressure stops before exceeding capacity and preserves the last
  unassigned task/inbox; no claimed test of post-terminal lifetime ceiling reuse.
- Tampered actor/result, event-type binding or materialized queued status refuses.
- Fresh held-child crashes before/after enqueue/start COMMIT, then fresh-process
  observation and exact redelivery yield one decision/assignment/effect.

Children have ten-second operation deadlines and five-second verified teardown.
Only actual SQLite SDK COMMIT barriers are instrumented, outside production core.
No provider, native CLI, terminal, MCP/network server, credentials, project/Git
operation, export or release is involved. Full Phase 2A remains in progress;
native/provider integration and release remain HOLD.
