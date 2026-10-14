# S3 worktree feasibility prototype

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

The lifecycle registry is in memory. Restart recovery, interprocess locking and
atomic protection against filesystem replacement remain unbuilt. Refusal is
conservative; uncertain cleanup retains the fixture. This prototype does not
contain arbitrary processes or qualify file ownership watching.

**Full S3 remains partial.** The bounded shared-cache comparison passes;
generic shared dependencies, real project setup, native CLI
attribution, push approval/bypasses, ownership watcher/revert, checkpoints,
approved final merge and the Windows compatibility matrix are still open.
See [the measured results](RESULTS.md).
