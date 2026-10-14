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

The lifecycle registry is in memory. Restart recovery, interprocess locking and
atomic protection against filesystem replacement remain unbuilt. Refusal is
conservative; uncertain cleanup retains the fixture. This prototype does not
contain arbitrary processes or qualify file ownership watching.

**Full S3 remains partial.** Shared dependencies, real project setup, native CLI
attribution, push approval/bypasses, ownership watcher/revert, checkpoints,
approved final merge and the Windows compatibility matrix are still open.
See [the measured results](RESULTS.md).
