# S6 descriptor-backed export preparation

Added a Linux read-only adapter that measures an explicit synthetic file selection
and produces the existing bounded export request. It accepts already opened source
and destination directory descriptors plus a `SelectionRequest`. The supplied
`Binding` must match both descriptors' measured device and inode identities.

The adapter opens independent directory descriptions, preserving caller handles
and their directory cursors. All path and metadata validation precedes content
reads. Ancestors and files remain pinned until a final name-to-descriptor and
metadata check. It hashes only the originally measured byte count, checks file
metadata again, and validates the serialized packet with the frozen request parser.
Invalid metadata raises `ValueError`; filesystem failures propagate as `OSError`.
Neither returns a partial request. Callers must pause and obtain fresh evidence
after refusal rather than reuse an earlier result.

The destination must already exist, be empty and have a different device identity.
Directory ownership must match the current effective user and permissions must be
0700. Selected files must be regular, owned by that user, mode 0600 and have one
link. Descendants must remain on the source device. Symlinks and special files are
refused. Destination emptiness is checked before reading and again before return.
The adapter writes no source or destination data and issues no grants.

## Verification

Fourteen tests passed in Ubuntu WSL using both normal and optimized Linux Python.
The Windows driver checks source hashes in both environments before and after each
run. Tests use only private owned fixtures under Linux `/dev/shm` and `/tmp`; they
require a non-root user and distinct source/destination devices. Fixture setup and
teardown create and remove only those temporary test directories.

Coverage includes measured digests and empty files, caller descriptor/cursor
preservation, path aliases including ancestor case aliases, packet and metadata
bounds before filesystem opens, symlinks, hardlinks, FIFOs, directory selections,
permission refusal, incorrect root binding, occupied destination, individual and
aggregate content bounds, file mutation, leaf/ancestor replacement, earlier-file
mutation while a later file is read, destination mutation and failure-path handle
closure. Mutation tests intercept the filesystem `os.read` boundary and perform
real writes or renames; they do not mock the adapter's internal helpers.

From the repository root on Windows with the configured Ubuntu distribution:

```powershell
rtk proxy python -B feasibility/s6-wsl/export-preparation/check.py
rtk proxy python -O -B feasibility/s6-wsl/export-preparation/check.py
```

The default checks saved verdicts and source/artifact/reference hashes offline.
Add `--develop` to run the Linux fixtures. Private diagnostics and source-bound run
reports stay under `.git/tiye-export-preparation/`. The public
[verification record](verification.json) contains closed verdicts without runtime
paths, inode values or selected-file content digests. Evidence hashes detect
drift; they do not provide signed provenance. Prior sealed cohorts are unchanged.

## Review and limits

GPT-6 Luna at max completed a supplied-design review. Its requirements for
independent directory descriptions, final destination/path checks and final packet
bounds were incorporated. Flint 40B Free and DeepSeek V4.1 Flash Free at max were
requested separately but each timed out without a final review. See
[review outcomes](review.json). These were design reviews, not final-code audits.
The parent implemented and reviewed code, tests and documentation, and reran both
Linux test modes.

This is a fixture qualification of the preparation adapter, not an authenticated
keeper integration. Caller metadata and descriptors do not establish a live owner,
session custody, stopped writers or human consent. Stamp checks are observations
across an interval, not a filesystem snapshot or a guarantee against hostile
same-user mutations. `O_NONBLOCK` prevents FIFO-open stalls but does not bound
regular-file I/O latency. No disk capacity reservation or filesystem quota is
established. The driver deadline is a fixture bound, not a product watchdog.

No export execution, copy, grant consumption, source release, cleanup authority or
native admission is enabled. Product core, event store and team engine remain
unimplemented. L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD;
C0 configuration and final-PATH observation are still pending.

Next: bind preparation to the held owner through authenticated communication and
fresh writer-stop/custody checks, then qualify the grant-to-executor boundary
before implementing copying and readback.
