# S3 worktree feasibility prototype

`npm run probe:checkpoints` verifies bounded Git-backed checkpoints and a fresh
Node process reopening their storage. `git-checkpoints.js` snapshots tracked and
non-ignored untracked ordinary files as raw blobs, using an isolated index.
A copy of the real index supplies the staged-tree fingerprint. The reachable
manifest binds the session, sequence, canonical member/common Git fingerprints,
branch, HEAD, staged tree and file hashes. Create-only `refs/tiye/*` publication
uses expected-zero CAS; callers must supply the trusted expected commit ID.

Recovery loads and verifies the checkpoint, prepares one file, then consumes
one privately bound fixture approval. It refuses stale target/HEAD/index,
active Git operations, unsafe paths and links. A new safety checkpoint must
persist before writing only that file. The native fixture distinguishes staged
and working contents, loads original untracked bytes, preserves unrelated dirty
work, and verifies exact real-index bytes. The fresh reader validates its pinned
fixture roots and native registration; it does not rebuild the app's lifecycle
or session registry. No provider creates these recovery approvals or writes.

Limits are 1,000 files, 1 MiB per file and 8 MiB total, with ASCII relative paths
and SHA-1 repositories only. Deleted paths are omitted; executable modes are
not preserved. The staged tree is a fingerprint, not an index restoration
payload. Failed capture can leave unreachable Git objects. Refs are reachable
Git storage, not secret or excluded from mirror pushes. Cleanup removes the
exact owned disposable roots, including their checkpoint objects.
This qualifies storage across a process boundary, not atomic recovery, durable
event-store coordination, writer suspension, approval UI or power-loss recovery.
See `evidence/checkpoints-qualification.json` and the sealed observation.

This begins S3.1 with a disposable Windows Git fixture. `npm run probe` makes
no model requests and uses no remote repository. The probe creates a fresh
source root plus a separate worktree base, integration and two member branches.

`scripts/worktree-lifecycle.js` keeps a private ownership registry. Targets must
be new direct children of its canonical base outside the source root. Create
rejects existing targets and unsafe selections. Remove revalidates the target,
recorded branch, common Git directory and native worktree registry. It refuses
changed ownership, links, locks, active Git operations, tracked/untracked changes
and ignored artifacts. It does not force removal or delete branch refs.

`npm run check` uses real disposable Git to check refusal cases, including an
in-progress merge whose status is clean. The native probe measures three
worktree creations, one offline local dependency install, fixture settings copy,
concurrent Node writers, clean different-file merges and an exact same-file
conflict. Merge abort must restore the integration HEAD, tree and index tree.
Source-root file bytes, branch, HEAD, status and index bytes must remain unchanged;
new branch refs and worktree metadata inside `.git` necessarily change.

Setup uses the installed npm CLI beside Node, a fixture-local npm cache,
`--offline --ignore-scripts --no-audit --no-fund --global=false --install-links`.
Only one local file dependency is installed. Copied settings contain synthetic
fixture data. Generated member artifacts are removed only after worktree and
canonical target checks; nested links are rejected before recursive deletion.
Worktrees are then removed without force. Both exact temp directories are
removed only after the native registry contains the original source root alone.

`npm run probe:dependencies` compares separate `node_modules` folders using one
owned npm cache against a Windows junction to another owned member's modules.
Four disposable worktrees use local file packages and the same offline install
flags. Adding a package must execute successfully in the private member while
the donor's manifest, lock and installed file hashes remain unchanged. The
probe records whether npm preserves, replaces or mutates the junction target.
In the measured version npm replaced the junction with a private install.
An owned-link helper unlinks only a verified junction; a separate real-filesystem
test proves donor preservation and refusal of a foreign target.
Timings and logical bytes are observations, not a speedup or disk-saving claim.
See the content-addressed dependency evidence and qualification in `evidence/`.

`npm run probe:attribution` runs a Node child and an engine fixture through
native Git with explicit member author and fixture engine committer variables.
Each controlled member/merge commit carries one `Tiye-Session` trailer. The
audit reads actual commit metadata, message hashes and native parsed trailers;
it rejects missing/duplicate session trailers and an overridden author. Two
non-fast-forward merges must preserve member commit IDs and metadata.
The launch helper removes inherited `GIT_*` values before setting attribution.
Environment defaults are advisory: raw Git receives no automatic trailer, and
`--author` can override the configured author. Native provider CLI launches,
automatic trailer insertion and production commit orchestration remain open.

`npm run probe:cli-attribution` makes a model request to the authorized Muse
xhigh route. It launches OpenCode 2.0.28 in a private standalone server with
explicit attribution variables. A disposable copy of the installed OpenCode
relay adds only `--standalone`; the original skill and shared service stay intact.
The member runs one fixed `rtk proxy node attribution-task.cjs` shell command.
The worker checks native Git identities and canonical location, then edits one
fixture file. The parent checks the correlated completed shell event, exact
JSON output, file bytes, worker/task integrity and unchanged HEAD before making
the fallback commit itself. Raw native artifacts remain in an owned temp relay
directory for diagnostics; committed evidence contains only the bounded proof.
This qualifies this standalone CLI-to-shell path and parent fallback commit,
not the shared-service launch, CLI-created commits or automatic session trailers.

`npm run probe:trailer-policy` makes no model requests. Its integration gate
audits all introduced commits from a pinned base, including an invalid earlier
commit behind a valid tip. Each supported commit must have the expected member
author, fixture committer and one matching raw/parsed session trailer. Empty,
over-50-commit, non-linear, wrong-session and already-integrated selections are
rejected. The gate privately binds each decision, rechecks both HEADs and owned
worktree state, and merges the exact inspected SHA with an engine session trailer.
Decisions are consumed when the Git operation starts; uncertain results require
a new audit. Rejected member history is preserved rather than silently amended.
This is a feasibility gate for engine-controlled integration. It does not stop
a CLI from committing or merging directly and has no durable or atomic lock.

`npm run probe:push-policy` uses two owned worktrees and one disposable local
bare remote. It makes no model requests and contacts no user/network remote.
Only the fixture enables worktree-specific Git configuration and installs a
pre-push hook on member A. The hook defaults to deny and matches one exact
process grant. A separate engine prototype privately binds fixture approval to
member HEAD, local target, ref, expected remote tip and force intent, consumes
the approval before Git starts, and pushes the exact SHA with a pinned lease.
Push subprocesses ignore global/system Git config and allow only file transport.
Native bypass controls use `--no-verify`, a hooks-path override and unhooked
member B. This proves the hook is advisory. Approval is simulated by the parent;
the production broker, user approval UI, credentials and provider CLI push
qualification are not implemented. All Git mutations target disposable fixtures.

`npm run probe:ownership` polls one owned worktree every 100 ms plus scan time.
It captures an in-memory working-tree checkpoint and an exact assigned-file
list, queues new unauthorized modified/deleted/added file states, and stops on
an unverified snapshot or a full notification queue. `.git` is excluded. The
prototype supports ordinary files up to 1 MiB each, 1,000 files and 8 MiB total;
links and unsupported entries are refused. It does not qualify directory-only,
transient, metadata-only or out-of-worktree changes.
Recovery requires a privately bound fixture approval, unchanged checkpoint
HEAD/index tree and unchanged target observation. It restores only one file's
checkpoint bytes or unlinks the exact newly added file, preserving assigned edits
and initial untracked checkpoint content. Each recovery attempt consumes its
approval, including a refusal; a new observation and review are needed to retry.
Closing stops polling; explicit scans
and reviewed recovery remain available. No bulk Git reset or automatic revert
is performed. Writers must be controlled: checks are not atomic with file I/O.
User approval UI, durable checkpoints and production watcher integration remain
unbuilt. The probe makes no model requests and never edits the user's files.

The lifecycle registry is in memory. Restart recovery, interprocess locking and
atomic protection against filesystem replacement remain unbuilt. Refusal is
conservative; uncertain cleanup retains the fixture. This prototype does not
contain arbitrary processes or qualify file ownership watching.

**Full S3 remains partial.** The bounded shared-cache comparison passes;
generic shared dependencies, real project setup, native CLI
attribution, push approval/bypasses, ownership watcher/revert, checkpoints,
approved final merge and the Windows compatibility matrix are still open.
See [the measured results](RESULTS.md).
