# First internal core contract — proposed

This contract becomes construction scope only after approval of
[the 11.2 amendment](AMENDMENT.md). It preserves Architecture 3.8 and the first
slice acceptance contract in the historical Phase 0 assessment. No core is claimed
implemented by this document.

## 1A: durable command and event store

Implementation target: a new TypeScript core package with a SQLite adapter using
the architecture's `better-sqlite3` selection. Initially qualify the Windows
Node test host on this workspace. Pin the exact runtime, package and lockfile
before execution; do not infer Electron ABI or WSL compatibility from it. The
package is a headless library. A separately owned test host provides bounded
stdio; there is no app server, network listener, terminal or provider adapter.

### Inputs and identity

- Initial command: `task.create` version 1 with `commandId`, `taskId`, `title`.
- Command/task IDs: caller-supplied UUID v4 in lowercase canonical hyphenated form. Reject
  malformed IDs. New command IDs cannot overwrite an existing task ID.
- Title: 1–256 Unicode scalar values, at most 1024 UTF-8 bytes; reject unpaired
  surrogates. Preserve text exactly; no implicit Unicode normalization.
- Exact schema, no unknown fields, duplicate JSON members, unsupported versions,
  nonfinite values or booleans masquerading as numeric versions. The parsed
  version must be the number 1; JSON spellings `1` and `1.0` canonicalize to 1.
- Hash SHA-256 of a schema-rebuilt ordered JSON array
  `["task.create",1,commandId,taskId,title]`, encoded as UTF-8 without a BOM or
  newline. This avoids dependence on incoming object member order. Every new
  command defines its own ordered array and rejects ambiguous input types.
- Same command ID and hash returns its original durable decision. Changed
  payload with the same command ID returns a conflict without adding events.
- Unknown command versions are refused at the boundary, without creating a
  durable command decision. Recognized commands with a semantic conflict are
  durably rejected so later redelivery returns the same decision.

### Required logical records

| Record | Keys and required contents |
| --- | --- |
| Metadata | Application/schema version 1; fixed database identity |
| Commands | Unique command ID, payload hash, schema version, accepted/rejected decision, bounded result |
| Events | Increasing integer sequence, unique event ID, type/version, task/command IDs, validated event body |
| Tasks | Unique task ID, exact title, current status, last applied event sequence |

Initial events: `task.created` v1 and `command.rejected` v1. A rejected duplicate
task reference produces no task transition. Repeated delivery creates no extra
event. An independent reducer rebuilds tasks and command decisions in sequence
from validated events; its result must equal the stored projections after reopen.
Each event includes the minimal stable decision data required for that rebuild.
No current time, random ID generation or mutable environment enters the reducer.
Event IDs are deterministic from the command ID and event ordinal; the exact
encoding is `commandId + ":" + ordinal`, with ordinal zero in 1A.

Use one SQLite writer, foreign keys, WAL and synchronous FULL. Command decision,
events and projections commit in one transaction. Explicitly bound command/result
records to 16 KiB and test-host records to 32 KiB. Validate input before opening
write transactions. Set SQLite busy waiting to at most 250 ms; a second writer
receives an explicit busy/refusal result;
never delete lock, WAL or database files to force access. Use a single owner lock
per database root and SQLite's own concurrency checks; no shared writer promise.

Fresh roots are created by the trusted test coordinator. The storage adapter opens
only the explicit database under that root, checks root ownership/access and
Windows reparse points at setup, and refuses existing unsupported schemas or
integrity failures without reset. Do not offer arbitrary paths over stdio.
Same-user hostile mutation, power-loss/torn-write guarantees, backup/restore and
schema migration are outside 1A. Unexpected versions or malformed history pause
startup. Database roots and any diagnostic records remain private to the fixture;
publish only allowed verdicts. Review the actual SQLite sidecar lifecycle before
implementation, and clean only roots explicitly owned by the current test.

### 1A exit criteria

1. Identical redelivery across a fresh process returns the same accepted or
   rejected decision, with unchanged event count; conflicting ID reuse refuses.
2. Task-ID conflict, Unicode title preservation and all input bounds behave as
   specified. Invalid input cannot mutate the store.
3. A rolled-back transaction leaves no command, event or task projection behind.
   The test uses real SQLite transactions and failure boundaries.
4. Reopen/replay yields byte-equivalent canonical projections and decisions.
   Missing, conflicting, malformed or unsupported event history refuses startup.
5. Unsupported schema, corrupt database, busy writer and failed storage writes
   yield explicit refusal without reset, replacement or a success response.
6. Fresh-process crash before commit leaves no accepted command; crash after
   commit preserves the exact decision once. Transaction visibility is checked
   independently after process exit, not inferred from a missing reply.
7. Each test child has a 10-second operation deadline, then at most five seconds
   of owned-child teardown. Unverified exit is a failed/unknown test, never pass.
8. Review imports and transitive runtime dependencies against the boundary below.
   Type/build checks, behavioral tests and replay/crash checks must pass on the
   same pinned source/runtime before 1A is accepted.

## 1B: mock effect lifecycle, after 1A

Add versioned effect, attempt and approval records. Effect IDs and attempt IDs use
the same UUID-v4 grammar, with distinct values for each attempt. The only effect
operation is `mock.record` v1, targeting one coordinator-created witness root.
No request can select a host path. An approval binds effect ID, exact operation,
target identity, canonical payload hash and attempt ID. Changed operations or
new attempts require new approval; fixture decisions are not human UI consent.

The task transition and `effect.planned` commit together before dispatch. A
separate atomic compare-and-set claim commits `effect.dispatching` and its attempt
before invoking the mock boundary. There is no automatic resend of a claimed
attempt. A still-planned effect may receive its first claim after restart, subject
to current fixture approval; that is not a resend. Completion/failure and the task
transition commit together in the outcome transaction.

The witness is a second SQLite database, owned by a separate mock test process
and outside the core database transaction. Every invocation appends a durable
row with an independent invocation sequence, effect/attempt IDs and payload hash.
It must not deduplicate requests: duplicate dispatch must be observable. The mock
action is precisely that append; there is no second hidden file action after it.
The witness commits with synchronous FULL before acknowledging the invocation.
Source and process composition are reviewed and frozen before executing 1B.

On recovery the core reads a bounded validated witness result for the exact
attempt. Exactly one matching committed row proves only this synthetic action;
record completion without calling the runner again. Zero rows, unreadable or
malformed witness, duplicate rows or mismatched hashes pause the task with
`effect.needs_attention`. A missing row does not authorize retry. The resolver
is a fixed deterministic policy in the core, not an agent/model judgment.
Attention requires a later explicit resolution command and cannot silently resume.
An unrelated recoverable task must still progress. Cancelled/deadline-expired
work cannot receive a new dispatch; a dispatched uncertain attempt stays paused.

| Crash boundary | Required outcome after recovery |
| --- | --- |
| Before plan transaction commit | No accepted plan and zero witness invocations |
| After plan commit, before claim | Original plan intact; at most one first dispatch after approval recheck |
| After claim, before witness append | Ambiguous attempt pauses; no automatic resend |
| After witness commit, before core outcome | One witness invocation; completion reconciled without a second dispatch |
| During outcome/reconciliation commit | Repeated fresh-process recovery converges or remains explicitly paused; no duplicate dispatch/events |

Inject witness/storage failure and a deliberately duplicated fixture invocation
to demonstrate refusal; idempotent mocks must not hide bugs. The crash host must
hold current child handles, supervise its owned runner/core independently, and
verify exit within the 10+5-second case budget. Never target an old PID or retain
an uncontrolled child while reporting success. Power-loss validation remains later
hardening, distinct from controlled process-crash tests.

## Enforced construction boundary and later promotion

The core package exposes command/store operations only. 1A has no runner interface
or dispatch entry point. Product core imports are limited to reviewed SQLite and
its pinned runtime dependencies, hashing and explicit storage-root access. Build
checks reject direct or dynamic provider SDK, HTTP/socket, child-process, PTY,
Electron, MCP, Git and credential-store imports. The trusted test host alone may
launch the fixed synthetic core/witness processes. Review transitive dependencies
before claiming that the package has no such runtime entry points; this is not an
OS sandbox against arbitrary same-user code.

1B introduces a fixed mock runner, never a generic command, URL, adapter registry
or plugin callback. New capabilities stop the slice pending the relevant review.
Before later integration, map accepted invariants to Architecture 3.8 and qualify
the actual adapter/main ownership, privacy and S1–S6 requirements in the ledger.
Acceptance of this slice does not promote a CLI, authorize an account route or
select a production terminal backend. No percentage completion follows from the
number of passing checks.
