# Corrected Windows watchdog component — 17 October 2026

The new [source](../../feasibility/s6-wsl/codex-u0-watchdog-v2/) implements a separate
Windows Job Object supervisor. **Six synthetic Windows process tests passed.**
No WSL or Linux Codex process was launched. The
[earlier U0 launcher](../s4-codex-u0-launcher/README.md) remains unchanged and
unadmitted for native execution. This component is not wired into it yet.


The first saved capture failed a shutdown race and remains [preserved](../s4-codex-u0-watchdog/STATUS.md). This version waits for the root process handle separately from job accounting before deciding cleanup is complete.

## Behavior and observations

`ChildJob` creates a suspended process assigned to an unnamed job at creation.
The caller records ownership before explicitly calling `resume()`. No breakaway
limits or inheritable job handles are enabled. The supervisor polls job membership
separately from root exit and applies a wall-clock task deadline. It terminates
the assigned job on expiry, then observes cleanup separately.

| Case | Observed witness |
| --- | --- |
| Normal exit | Root exit 0, empty job, independently held root handle signaled |
| Nonzero exit | Root exit 7 preserved by the supervisor, rather than replaced with cleanup success |
| Task deadline | Root and child observed live beforehand; job termination requested after the 2 s deadline; both independently held handles signaled |
| Root exits with child alive | Root exit 0 observed while child handle still unsignaled; deadline subsequently terminates the remaining child |
| Watchdog abruptly killed | Assigned root and child handles became signaled; an unrelated sentinel remained live; no normal completion report appeared |
| Owner killed before resume | Suspended child's held handle became signaled; its startup marker never appeared |

Each held process handle is checked against the fixture's recorded PID and Windows
creation time before the experiment's termination action. The tests signal only
owned supervisor processes or job/process handles. An unrelated sentinel is
stopped separately by its own test-owned process handle during teardown.

The deadline tests require stop-decision lateness below 0.5 s on this host. Stop
decision time, termination-request return time, cleanup observation time and total
elapsed time are separate fields in [observations.json](observations.json).
Membership counts are explicitly snapshots taken before the stop decision.
The ordinary post-stop observation budget is 2 s; error-path library cleanup can
perform an additional bounded attempt. These are fixture limits and observations,
not platform latency guarantees. Supervisor exit 124 denotes deadline expiry;
normal exit preserves the root's exit code. Empty-job observation alone does not
establish a successful task result.

## Design grounding and review

The parent checked Microsoft's [job documentation](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
and [creation-time job attribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
The implementation uses `STARTUPINFOEXW` and a job-list attribute rather than
leaving job assignment until after process creation. Attribute keys were checked
against Microsoft's [SDK header](https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/um/WinBase.h).
This avoids a source-level unassigned-child gap; the tests cover a child suspended
after creation, not a forced crash inside the kernel's creation operation.

GPT-6 Luna supplied the initial wrapper as source in its reply. The parent reviewed
it, added creation-time assignment and explicit resume, and implemented the
supervisor and tests. Muse reviewed an earlier supplied snapshot. Parent
dispositions and artifact hashes are in [review.json](review.json); the final
revision was reviewed by the parent. Both delegates completed, so DeepSeek fallback
was unnecessary. Gemini was not dispatched under the recorded route exclusion.

The Codex relay emitted a configured MCP authentication-startup diagnostic; no
agent tool events were observed and no account/configuration changes were made.
That diagnostic is not evidence of network silence. Delegated generation and
review do not independently verify workspace state or runtime behavior.

## Verification and remaining work

From the project root:

```powershell
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/codex-u0-watchdog -p test_watchdog.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-u0-watchdog-v2/run.py
```

The first command reruns the synthetic cases. The second checks the saved source,
artifact hashes and results without launching a process. The capture command
`run.py --capture` is for a new exclusive synthetic record; it refuses an existing
input or evidence record. Development tests preceded the final saved capture.

These results cover the assigned Windows processes on the recorded host. They
do not prove Linux process death, prevent all service-mediated launches, or qualify
filesystem/network isolation or credential access. Test processes inherit the
synthetic runner's environment. No Windows 10 compatibility matrix was exercised.
Process creation, kernel scheduling and file writes by the watchdog itself are
not independently hard-bounded by this component. Kill-on-close is not a hardware
power-loss or reboot recovery mechanism.

Next: connect the component to a new U0 host version, qualify Linux ownership and
recovery independently, and review private capture access before native admission.
Authenticated cases also need the applicable provider integration route.
S4/S6 remain partial; Phase 1 remains **HOLD**.
