# @tiye/core — internal Phase 1A

Headless TypeScript command/event store on Windows x64, pinned Node 26.7.0 and
better-sqlite3 13.0.3. This is product core code, separate from the feasibility
snapshots. It has no effect runner, provider adapter, terminal, Git operation or
network listener. The public entry exports `CoreStore`, `CoreRefusal` and result
types; the SQLite connection remains private.

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
