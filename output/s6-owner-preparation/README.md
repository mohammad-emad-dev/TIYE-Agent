# S6 live owner preparation boundary

Added an owner request handler around the descriptor-backed preparation adapter.
The handler authenticates both the connection origin and each message sender
against a process pinned before the request. It derives directory identities
from its own retained handles and checks live worker-stop evidence before and
after measurement. It produces a synthetic manifest without copying any data.

The [protocol](PROTOCOL.md) defines exact wire fields, the two-second operation
deadline, the 64-entry non-evicting nonce ledger, authentication, failure ordering
and fresh cgroup/pidfd checks. A valid request's nonce remains spent after a later
failure or lost response. Invalid senders cannot spend an enrolled request.

## Live verification

Fifteen tests passed in normal and optimized Linux owner/test interpreters under
Ubuntu WSL. Fixture helper processes remain ordinary Python in both runs. Each
run starts a fresh delegated systemd user service with a 45-second runtime limit,
control-group kill policy and two-second stop timeout. Every test uses a new
private source under `/dev/shm`, an empty private destination under `/tmp`, a
uniquely named worker cgroup, actual requester processes and held process handles.
The cgroup is retained before starting its synthetic worker and descendant.

Tests cover:

- Stopped-worker success with independently checked content digest and binding
- Live original workers and an exited parent with a live descendant
- Repopulated groups despite original pidfd exit, including during measurement
- Wrong connection origin and an inherited socket's different message sender
- Replay, exhausted ledger and refusal without evicting the first spent nonce
- Malformed/oversized packets, session drift, invalid paths and numeric bounds
- Descriptor-transfer refusal and descriptor closure after ancillary truncation
- Requester death during content measurement and no resulting manifest
- Spent nonces after preparation fails, without a cached-success fallback
- Removed cgroup, closed owner, ordinary-directory/regular-file stop-evidence refusal
- Receive deadline expiry and unchanged empty destinations

The actors, kernel credentials, pidfds and cgroup evidence are real. The two
measurement-race tests intercept `os.read` at the filesystem boundary and perform
actual group repopulation or pidfd-targeted requester termination. Internal owner,
identity and preparation helpers are not mocked. Teardown targets only actors and
directories created by the current test. No old PIDs or previous fixtures are used.

Run from the repository root on Windows with the configured UID-1000 Ubuntu user
service manager and cgroup-v2 delegation available:

```powershell
rtk proxy python -B feasibility/s6-wsl/owner-preparation/check.py
rtk proxy python -O -B feasibility/s6-wsl/owner-preparation/check.py
```

The default verifies saved verdicts and source/artifact/reference hashes offline.
Add `--develop` for the live tests. Host and Linux source checks bind each run to
the same code before and after execution. Private diagnostics and reports remain
under `.git/tiye-owner-preparation/`; [public verdicts](verification.json) omit raw
process identities, runtime paths and file-content fingerprints. Hashes detect
drift without signed provenance. Earlier sealed cohorts remain unchanged.

## Reviews and remaining scope

GPT-6 Luna at max and Flint 40B Free completed supplied-design reviews. Their
findings led to explicit limits, non-evicting replay handling, per-message sender
credentials and precise snapshot/deadline limitations. DeepSeek V4.1 Flash Free
at max timed out without a final review. [Review outcomes](review.json) distinguish
these statuses. The parent implemented and reviewed the code, tests and docs and
reran both modes; the delegated reviews were not final-code audits.

This is a new synthetic Linux owner component. It is not yet connected to the
previous Windows-supervised held-mount keeper or an authenticated product client.
Trusted coordinator enrollment, descriptor provenance and group membership setup
are fixture inputs. The checks do not establish exclusive reply-recipient identity,
hostile same-user isolation, atomic writer exclusion or durable recovery after
owner exit/reboot. The handler's time checks are not an interruptible I/O watchdog.

Export execution, copy/readback, grant consumption, source release and native
admission remain disabled. Product core, event store and team engine remain
unimplemented. L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD;
C0 configuration and final-PATH observation remain pending.

Next: connect this request boundary to the existing supervised keeper and verify
the same checks through its held source and original worker-group evidence, before
connecting any consent/grant or copy executor.
