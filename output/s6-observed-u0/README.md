# Supervised synthetic initialize runner with startup observation

20 October 2026

Connected the startup observer to the same Linux service and fixed protocol child
owned by the scheduled Windows/Ubuntu composition. It now checks helper state
before readiness is exposed and after independently witnessed group cleanup.
The service main exchanges the two initialize-only fixture packets with its child.

**Codex was not launched. Native execution and U0 admission remain disabled.**
L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. This verifies an
integrated synthetic runner, not a successful native U0 handshake.

## Connected lifecycle

1. The Windows collector prepares the independent Ubuntu observer, then starts
   the existing private Job guardian/heartbeat owner under the shared schedule.
2. The transient Linux service main creates the observer's exclusive private
   root and takes the empty-helper before snapshot. It launches only the fixed
   Python protocol child, in a new session but inside the service cgroup, with
   the five-key HOME/CODEX_HOME/TMPDIR/PATH/LC_ALL environment.
3. The main writes `initialize`, reads one bounded strict UTF-8 reply, checks
   correlation and exact fixture fields, then locally writes `initialized`.
   Startup identities, root device/inode and local-write verdict are persisted
   through the service's charged worker record.
4. The independent observer binds the exact invocation/cgroup and live main/child
   pidfds. It opens and holds the separate startup-root descriptor and child
   executable descriptor, checks the active helper snapshot, and only then emits
   ready to the Windows collector. Loss injection follows that readiness.
5. Owner loss or heartbeat silence ends the Linux main's lease. Systemd cleans
   the owned cgroup. The independent observer requires signaled held pidfds,
   absent original process entries, empty/removed cgroup and surviving unrelated
   sentinel before taking the retained-helper snapshot.

The fixed child intentionally leaves its helper aliases for uncertain-state
review. Helper removal and natural native EOF/zero-exit behavior are not claimed.
Windows held process signals and positive Job-empty are also required for full
coordinator cleanup credit. Guardian loss therefore remains unknown despite
successful independent Linux startup and cleanup observations.

## Protocol and clock boundaries

The fixture accepts only the fixed initialize request and initialized
notification. The controller limits its initialize-response buffer to 4096 bytes
and waits at most two Linux monotonic seconds for that response. Duplicate JSON
members, nonfinite values, invalid UTF-8, wrong/type-confused IDs and stale home
fields are refused. Notification writing follows reply validation. No account,
login, thread, turn, approval or model request is sent by this runtime.

An initialized local write has **no peer-receipt credit**. The fixture may consume
it, but the runner does not use an acknowledgment or other proof of receipt.
This fixed exchange does not qualify a general native JSON-RPC session, complete
raw protocol capture, delayed extra packets, malformed/oversized/timed-out live
reply variants or arbitrary blocking stdin writes. Stderr is DEVNULL for this
fixed child, which would not satisfy native capture requirements.

The host coordinator keeps its original single origin, work/cleanup/observation
cutoffs and phase bounds. Before/active observation falls within initialization;
retained observation falls within final observation and must complete before the
shared cleanup cutoff. The independent Windows five-second watchdog, Linux
one-second receipt lease and 20-second service runtime fallback are unchanged.
The protocol exchange occurs before the main enters its lease loop. Loss in that
pre-lease startup window is not qualified by these after-ready injection cases;
missing readiness or terminal evidence cannot earn a passing result. Native
hard deadlines, blocked I/O, suspension and collector loss remain unqualified.

## Source and resource domains

`build.py` composes immutable Python components with a new extension into a
compressed generated `linux_runtime.py`. Decompression is bounded to 128 KiB
before execution and rejects incomplete streams, trailing data and wrong source
schemas. The saved generated file must exactly match regeneration. The new
composition's fingerprint covers its wrappers, generated file, component sources
and sealed runtime dependencies. Older source files and manifests are unchanged.
These local hashes are consistency checks, not independent build attestation.

The existing Windows shared collector/worker metadata accounting and Linux
128 KiB service-content ledger remain in use. The separate startup helper root
uses the observer's 128 KiB **detective snapshot bound**, not a charge-before-write
ledger or filesystem quota. Its retention/alias content is not silently charged
to the service ledger. Arbitrary native runtime writes and aggregate disk/RSS
limits remain open. The 128 KiB decompression bound is a third, distinct measure;
it bounds decoded source bytes, not parser/compiler memory.

Raw root paths, identities, observer records and diagnostics remain in protected
storage. [Public observations](observations.json) contain only verdicts and
relative phase timings. The separate harness records the full source set before
running and refuses a source change afterward. Retained Linux roots and uncertain
helper aliases are not automatically deleted or relaunched.

## Verification

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/observed-u0/check.py --develop
rtk proxy python -B -O -X utf8 feasibility/s6-wsl/observed-u0/check.py --develop
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/observed-u0 -p test_publication.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/observed-u0/check.py
```

Five development tests pass: three live compositions (owner exit, heartbeat stall
and guardian loss), strict reply refusal, and compressed-source bound/schema
refusal. Two publication tests reject source/reference/artifact drift and
startup/receipt/native/unknown verdict promotion. Both suites pass in normal and
optimized Windows harness modes. The composed Linux runtime and fixed child use
`-I -S -B` in both; Linux `-O` is not separately qualified. Default checks are
offline and launch neither WSL nor Codex.

Luna and GLM completed supplied-context design reviews; DeepSeek timed out. None
reviewed final sources or ran the tests. [Review](review.json) records adopted
findings, rejected claims and remaining gaps. Prior saved cohort checks pass.

**Next:** complete the native launch profile's write inventory and final
PATH/configuration observation method, then review the exact source/binary/input
binding for separate initialize-only admission. This synthetic result does not
resolve those native behaviors or authenticated provider eligibility.
