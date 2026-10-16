# S6 allowlisted environment and mock briefing — 16 October 2026

**Bounded propagation passed.** Three Windows-launched WSL invocations completed
with exit 0 and empty stderr. No provider CLI or model was involved.

| Case | Observation |
|---|---|
| Decoy import control | A public synthetic variable supplied through the launch-local `WSLENV` mapping arrived in the unfiltered Ubuntu control process |
| Explicit allowlist | Seven selected values arrived exactly in the non-root Ubuntu process and its explicitly configured Python descendant; the decoy was absent from both |
| Baseline | All seven selected keys were absent, not empty; the decoy was absent in both processes and no Git identity query was scheduled |
| Invalid builder inputs | An unknown key and a NUL-containing environment value were refused before any native launch |

The selected values include a sentinel with spaces, Arabic/Japanese text,
quotes, a literal `$HOME`, literal `$(printf injected)` and an embedded LF.
Synthetic Git author/committer names, emails and fixed dates produced the exact
expected `git var GIT_AUTHOR_IDENT` / `GIT_COMMITTER_IDENT` strings. No commit was
created; this is identity-input evidence, not CLI commit attribution or a guarantee
that another program will preserve those identities.

## Briefing transport

Both the explicit and baseline launches sent the same public four-line mock
briefing through JSON stdin, including its final LF. In both root processes and
both descendants, the **decoded text re-encoded as UTF-8** had 131 bytes and hash
`be3657d01b0e60bdf01934efe859f1ab7e4538679ae9ff3ef86e7feb8a5cc226`.
The per-run public task marker also matched.

JSON uses Python's default Unicode escaping. The hash is of the decoded briefing
text, not the raw JSON wire representation. This capture tests LF text; it does
not establish arbitrary binary or CRLF transport fidelity. The mock does not
interpret a role, retain model context or demonstrate instruction adherence.

## Launch contract and evidence

The [protocol](../../feasibility/s6-wsl/environment/protocol.json),
[coordinator](../../feasibility/s6-wsl/environment/run.py) and
[mock](../../feasibility/s6-wsl/environment/mock.py) were frozen before launch.
The Windows coordinator uses argument arrays, no shell, and explicitly selects
`Ubuntu` with working directory `/tmp`. The filtered cases use `/usr/bin/env -i`,
a fixed Linux PATH, `C.UTF-8`, disabled system/global Git configuration and the
seven permitted values. The descendant receives its own explicitly built
environment and briefing. No environment dump or user credential read occurs.

The decoy is a positive/negative control: its initial import was independently
observed before testing removal. The seven desired values use explicit Linux
`env` arguments; they were **not** transported by a seven-key `WSLENV` mapping.
The observation qualifies neither every WSLENV flag nor arbitrary inheritance.
All retained values are public fixture data. The argument path is not a credential
delivery mechanism or sandbox, and filtering these keys does not contain a process
running with the user's filesystem privileges.

Each root invocation had a 30-second timeout, the cohort a 120-second deadline,
and each mock descendant/Git subprocess a five-second timeout. No timeout or
retry occurred. [Evidence](evidence.json) retains exact commands, selected public
observations, elapsed durations, raw stdout/stderr hashes and source hashes.
Both invalid builder cases had zero native launches. Timeout cleanup is untested;
this cohort establishes no process-tree cleanup behavior.

Verify the saved capture without executing WSL or Git:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/environment/check.py
```

The checker pins this fixture's key set, text/hash, control outcomes and Git
identities; it does not qualify general application behavior. The native
coordinator refuses its existing evidence directory. Preserve these bytes for
future comparisons rather than regenerating the capture in place.

## Architecture consequence and next step

For the prototype's WSL launch adapter, build the permitted environment explicitly
and pass briefing content through structured stdin to a trusted local bridge.
The tested path supports the fixed public tuple above. Provider-specific
instruction delivery and permission behavior still need their own qualification.
No global environment, WSL configuration, package, network rule or project Git
configuration was changed by this fixture.

Next: controlled Linux process identity, graceful stop and abnormal-main-exit
observations with local mocks. PTY behavior, real CLI briefing semantics,
abnormal recovery, other environments and full S6 remain open. Phase 1 is not
cleared by these launch mechanics.

## Review

Muse Spark 1.3 Free xhigh, Space Bunny Free xhigh and DeepSeek V4.1 Flash Free
max completed supplied-context reviews, without inspecting the workspace or the
measured results. Their structured streams contain zero tool events. The parent
implemented and verified the capture; provenance is in [review metadata](review.json).
The previously unsupported exact Codex model and excluded consumer Agy route
were not dispatched.

Retained advice: pin the expected key set independently, distinguish absent from
empty, test literal argv values and separate text delivery from semantic adherence.
No raw-wire byte claim is made for text-mode JSON decoding. A positive decoy
import control was added; its result is a bounded import observation rather than
portable WSLENV support. A poisoned identity baseline and additional native
retries were not adopted; the baseline's no-lookup behavior is defined by the
frozen source and its empty result, not an independent syscall audit.
