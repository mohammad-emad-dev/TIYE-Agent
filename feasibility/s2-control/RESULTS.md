# S2.1 result — OpenCode MCP attachment without a model request (feasibility slice)

## Saved approvals and project scope (13 October 2026)

**PASS for this five-phase cohort; full S2 remains open.** OpenCode 2.0.28
and Muse Spark free `xhigh` were exercised through the real native terminal.
Two disposable Git roots used randomized initial commit messages, and their
native project IDs were confirmed distinct before any saved decision. Both
project-filtered saved-rule lists were initially empty.

| Phase | Observed result |
|---|---|
| Native Always allow | One Right key, then verified Always allow selection twice and Enter; one exact command completed, marker `approved`; one owned saved rule appeared |
| Fresh session, same project | Same command and shell-ask policy; no pending request observed or decision input; command completed, marker `approvedapproved` |
| Independent project | Same command and shell-ask policy; exact correlated request stayed pending twice, marker absent; no approval delivered |
| Configured deny precedence | Fresh session in the first project while the saved rule remained; targeted deny produced actual `permission.rejected`; no third append |
| Revoked rule | Owned saved row removed by ID; fresh same-project session returned to a twice-observed pending request; no third append |

The same-project observation survived deletion of the additional session and
client. It establishes bounded reuse across sessions; the shared backend was
not restarted, so disk/crash durability is not qualified. The independent
project test uses a separate Git root, not a worktree of the first project.
The resulting assessment does not generalize the proposed shell prefix's safety.

Every phase requires the exact accepted fresh prompt, model/variant, tool
command/input/current directory, one shell tool and no fallback tools or
assistant errors. Completed and denied phases require quiescent completed
turns; pending phases require the exact request/message/tool correlation.
Two stable snapshots, separated by at least one second, include marker-byte
checks. Phase deadlines are 90 seconds; UI IPC deadlines are five seconds.
New sessions verify agent, location, permissions, model and project identity.
The parent sends no permission-reply API requests; OpenCode's native TUI
handles the Always decision.

Selecting Always allow changes the card body to the tool's proposed saved
patterns. The probe first validates the ordinary command pane and its selected
palette, then checks the proposed-pattern pane with the same palette, native
heading, choice positions and selected Always allow twice. The `uiInspection`
fields retain the ordinary command-pane diagnostic: its `visible: false` /
missing command are expected in this different pane, and are not the saved-pane
acceptance predicate. Acceptance is recorded separately as
`uiAlwaysSelectedTwice` and verified by `savedAlwaysScreen` before Enter.

Saved rows must match the owned project, shell action, exact tool-proposed
pattern set, unique safe IDs and a creation time after the decision began.
Only those validated rows are removed. The final project-filtered list was
empty; the second project acquired no saved rule. The scoped APIs were checked
against the [OpenCode V2 API reference](https://opencode.ai/v2/docs/api), and the
tested relation to configured deny follows the
[V2 permission documentation](https://opencode.ai/v2/docs/permissions).
The observed denial, marker bytes and restored pending request provide the
qualification evidence.

All five sessions were deleted and their private client trees/Windows Jobs
verified gone, with six captured processes per client. The original client is
closed before location eviction so its polling has ended during cleanup.
Both exact temp paths and the MCP fixture were removed; all fixture file checks
for the original project passed. Shared service identity and final version
remained 2.0.28, and selected config fingerprints stayed unchanged. No unrelated
saved rules, global settings or service lifecycle were changed.

### Preserved failures and evidence

Two earlier attempts stopped after navigating to Always allow, before Enter:
the original command-pane parser did not recognize the proposed-pattern view.
No command executed and no saved rule was created. Both failed records remain
failed. Each retained second-project directory was recovered separately using
its creation-time window, random root commit and clean fixture scope, then
verified to have no sessions or saved rules before exact eviction/removal.
Those recovery records preserve the cleanup result without changing the failed
measurements. The cause of the earlier other-project retention was not determined.
The final probe checks session absence before removing the other
project and permits bounded filesystem retries only for its verified exact path.
The original-project fixture refuses temp removal if an owned saved rule remains.

The final record is sealed in a separate content-hash archive. Prior version,
deny-profile and terminal-approval archive bytes are unchanged. The previous
terminal capability assessment is copied byte for byte and matches its prior
qualification hash. Historical source hashes describe their original fixture
revisions; the current shared fixture adds only the custom initial commit and
an owned-cleanup guard used by this probe.

- [Saved approval measurement](evidence/supplements/saved-approvals/0719a9c02b6d2f879acf5d34f62ceab119d1335e812f6e71df999dea10874342/2.0.28/saved-approvals.json)
- [Supplement manifest](evidence/supplements/saved-approvals/0719a9c02b6d2f879acf5d34f62ceab119d1335e812f6e71df999dea10874342/2.0.28/manifest.json)
- [Qualification and integrity summary](evidence/saved-approvals-qualification.json)
- [Current preliminary assessment](capabilities/opencode-permissions.json)
- [Preserved terminal assessment](capabilities/opencode-permissions-terminal-approvals-2.0.28.json)
- [First failed attempt](evidence/saved-approvals-first.json) / [exact recovery](evidence/saved-approvals-recovery-first.json)
- [Second failed attempt](evidence/saved-approvals-second.json) / [exact recovery](evidence/saved-approvals-recovery.json)

Verification: **87 offline checks**, script syntax, measured source/evidence/staged
byte hashes and diff whitespace checks passed. Coverage rejects foreign/old/
duplicate/unproposed saved rows, stale/wrong-model/extra tool phases, wrong
native pane or pattern, incomplete phases, missing keyboard input, failed
revocation, version drift and owned cleanup failure. Muse free `xhigh` completed
a supplied-facts review; the parent checked its identified risks against the
implementation and live records. MiMo Atria and Claude Atria `xhigh` timed out.
Captured delegate events contained no tool calls; Claude's changed-file warning
matched the parent's concurrent edits. `productionEligible` and every
`productGuarantee` remain false. Other layouts/themes, foreground interaction,
accessibility, OS containment and backend-restart/worktree behavior remain open.

## Native terminal approval decisions (13 October 2026)

**PASS for two bounded native terminal decisions; full S2 remains open.**
Fresh OpenCode 2.0.28 sessions used Muse Spark free `xhigh`, shell `ask`, edit
`deny` and the owned MCP fixture. The parent typed each task through the real
Electron/xterm/node-pty terminal, then delivered the decision with programmatic
keyboard events. The observer performed only scoped GET requests; OpenCode's
own TUI handled the reply transport. Session setup and cleanup still use their
existing scoped management APIs.

| Case | Keyboard input | Backend and file result |
|---|---|---|
| Reject | Right twice (six PTY-bound bytes), then Enter (one byte) | One original shell tool ended `aborted`; zero completed commands, zero pending requests, marker absent |
| Allow once | Enter (one byte) on the observed default choice | First exact shell command completed once; a distinct second request/tool stayed pending twice; marker exactly `approved` at both observations and after cleanup |

The exact command is the harmless local append defined in
`scripts/run-terminal-approvals.js`. Before confirming, the observer checks
the accepted fresh prompt, exact original command/input/cwd and pending
session/action/resource/message/tool correlation. It inspects the native
permission card and its three labels, positions and selected colors twice.
Reject navigates first, then rechecks the selected Reject choice twice before
Enter. Allow once confirms only a twice-observed selected Allow once. No Enter
was sent on Always allow. Repeated checks are separated by at least one second;
the overall observation deadline is 90 seconds and each UI IPC request has a
five-second deadline. No blind keyboard retry or fallback API decision occurs.

`terminal-main.js` sends keyDown/keyUp via Electron `sendInputEvent`; xterm's
`onData` reaches the existing preload/IPC bridge and PTY write path. The child
returns the captured input bytes over owned-process IPC; the parent checks
exact arrow/Enter sequences and ignores only known xterm focus reports. The
rendered screen and cell styles are read from the xterm buffer. Raw screens,
model text, errors, session IDs, commands, temp paths and credentials are not
committed in measurement records; only hashes, counts, fixed categories and
booleans are retained. Screen hashes can differ during redraws; identity,
command, choices and selection must continue matching.

Both cases verified the configured and executed model, permission array,
agent, location, session deletion, client process tree/Windows Job, location
eviction, MCP fixture and exact temp cleanup. Six captured client processes
were gone per case. The shared service identity and final version stayed
2.0.28, and selected config fingerprints were unchanged. There were no MCP
tool calls. The allow-once repeat request was interrupted during cleanup;
it did not add another marker append. Reject finished with quiescent completed
turns, including the expected aborted error, rather than requiring a normal
idle timestamp.

### Reconnaissance and preserved attempts

Two reconnaissance records preserve a failed optional screenshot path: Electron
returned no image, so the parent could not proceed. No decision or command ran,
and precise cleanup passed. Later pending-only reconnaissance confirmed the
native labels and selection using the xterm buffer. Screenshots are not part
of the final probe. Two decision cohorts also remain failed because the initial
screen parser did not accept the native border/warning decoration; zero decision
inputs were sent. A subsequent two-case run passed, and is preserved as
`terminal-approvals-pre-refinement.json`. The final fresh cohort adds a scoped
GET-only observer and two marker reads at the second pending approval. Only
that final cohort qualifies the current capability assessment.

The supplement has its own content-hash archive and immutable manifest, keeping
the version and deny-profile archives intact. The prior capability JSON is
preserved byte for byte and matches the earlier qualification hash. Older
qualification summaries describe their original builder revisions, not the
extended current builder. Qualification rejects failed/incomplete/duplicate
cohorts, missing UI/keystroke evidence, parent API mutations, version drift,
incomplete marker observations and failed cleanup. `productionEligible` and
every `productGuarantee` remain false.

- [Final terminal measurement](evidence/supplements/terminal-approvals/139d3d2c62ddf3a556578b62043e9b944bce9347cde9cf350a2f5eb77a7ee01e/2.0.28/terminal-approvals.json)
- [Supplement manifest](evidence/supplements/terminal-approvals/139d3d2c62ddf3a556578b62043e9b944bce9347cde9cf350a2f5eb77a7ee01e/2.0.28/manifest.json)
- [Qualification and integrity summary](evidence/terminal-approvals-qualification.json)
- [Terminal preliminary assessment](capabilities/opencode-permissions-terminal-approvals-2.0.28.json)
- [Preserved deny-profile assessment](capabilities/opencode-permissions-denied-profiles-2.0.28.json)
- [Failed first decision cohort](evidence/terminal-approvals-first.json)
- [Failed second decision cohort](evidence/terminal-approvals-second.json)

Verification: **82 offline checks**, script syntax, source/evidence/staged-byte
hashes and diff whitespace checks passed. New coverage rejects malformed cards,
wrong selection/command/positions, extra or missing input bytes, mutation or
foreign-session observation, API-only false qualification, missing marker
samples, version drift and cleanup failure. Muse free `xhigh` and Claude Atria
`xhigh` completed supplied-facts reviews; the parent verified the concrete
acceptance details in code and live records. MiMo Atria timed out. Captured
delegate events contained no tool calls; Claude's changed-file warning matched
the parent's concurrent edits.

Saved always approvals, other terminal layouts/themes, foreground human
interaction, accessibility and OS containment remain untested. The two native
choices align with the [OpenCode V2 approval documentation](https://opencode.ai/v2/docs/permissions),
but this qualification rests on the observed terminal and backend effects.

## Supplemental deny-profile observations (13 October 2026)

**OBSERVED_WITH_LIMITS: all five diagnostic measurements completed; three
targeted native denials passed. Full S2 remains open.** Each fresh owned service
session used OpenCode 2.0.28, Muse Spark free `xhigh`, API-configured permissions
and a prompt typed through the real Electron/xterm/node-pty terminal.

| Case | Native policy/input | Observed result |
|---|---|---|
| `shell-off` | `shell` deny `*`; one exact harmless marker command requested | `provider.auth`, HTTP 403; zero tool calls; permission pass false |
| `file-deny-profile` | `read`, `edit`, `glob`, `grep` deny `*`; read of `protected.txt` requested | `provider.auth`, HTTP 403; zero tool calls; permission pass false |
| `targeted-read-deny` | `read` allow `*`, then deny `protected.txt` | One matching read call; actual `permission.rejected` error |
| `targeted-glob-deny` | `glob` allow `*`, then deny `protected*.txt` | One matching glob call in the fixture directory; actual `permission.rejected` error |
| `targeted-grep-deny` | `grep` allow `*`, then deny `TIYE_DENIED_PROFILE_` | One matching grep call, local path and `protected.txt` include; actual `permission.rejected` error |

The shell command appends a harmless local marker through `rtk proxy node`;
its exact bytes and each prompt/policy are defined in
`scripts/run-denied-profiles.js` and bound by source, prompt and profile SHA-256
hashes. No approval was answered or requested. Each outcome required the exact
accepted prompt, fresh assistant turns and two identical completed message
snapshots at least one second apart. Native qualification additionally requires
exactly one expected call, its native permission error, no fallback tools and
no assistant error. A provider failure after a tool call cannot pass as either
the isolated native denial or the before-tools compatibility observation.

Protected bytes stayed unchanged; no command marker appeared. A fresh random
128-bit canary in each protected file was absent from session-message data.
Only its fixed prefix was supplied for grep; the full canary, prompts, tool
inputs, model text, raw errors, session IDs, credentials and temp paths are not
stored in these redacted records. The canary checks these message observations,
not every possible downstream provider or external data route.

Each case cleaned up its owned session, terminal process tree/Windows Job,
location, MCP fixture and exact temp directory, verifying six captured client
processes gone per case. Shared service identity and final version remained
2.0.28; selected config fingerprints stayed unchanged. No retries or global
service reconfiguration were used. These checks establish clean measurement
completion, not full deny-profile compatibility.

The current preliminary assessment records shell `off` as
`blocked-for-tested-model`, and file `none` as `partial-native-controls`.
Targeted denials do not qualify full file none or OS containment. Approved shell
commands, attachments, plugins and other access routes need separate evidence;
the provider failures do not establish their root cause. Resource meanings were
checked against [OpenCode's V2 tool documentation](https://opencode.ai/v2/docs/tools):
read uses a file path, while glob/grep permission resources are their patterns.

Supplemental bytes are sealed in a separate content-hash directory; the initial
2.0.28 manifest and five records were preserved. The builder rejects incomplete,
duplicate, inconsistent or version-drifted diagnostics, leakage, failed cleanup
and any claim of a native pass from the provider-blocked cases. It also verifies
the supplemental manifest and bytes before publishing the capability assessment.
The prior capability JSON is copied byte for byte; its hash still matches the
earlier revalidation summary. That summary's script hashes describe its original
commit `acbc066`, rather than this extended builder.

- [Supplemental measurement](evidence/supplements/denied-profiles/c76bec928185266f07395d9d0c19cff7e019408855cac68c874067e4821d654f/2.0.28/denied-profiles.json)
- [Supplemental manifest](evidence/supplements/denied-profiles/c76bec928185266f07395d9d0c19cff7e019408855cac68c874067e4821d654f/2.0.28/manifest.json)
- [Deny-profile capability assessment](capabilities/opencode-permissions-denied-profiles-2.0.28.json)
- [Preserved initial 2.0.28 assessment](capabilities/opencode-permissions-revalidation-2.0.28.json)
- [Supplement qualification and integrity summary](evidence/denied-profiles-qualification.json)

Verification: **76 offline checks**, script syntax checks, source/evidence hashes
and diff whitespace checks passed. New negative cases cover false denials,
wrong resources/directories, duplicate calls, stale turns, canary leakage,
provider/scanner errors, version drift, cleanup failure and inconsistent aggregates.
Muse free `xhigh` completed a supplied-facts review, identifying acceptance
details the parent checked in the implementation. MiMo Atria and Claude Atria
`xhigh` timed out and supplied no completed reviews. Their captured event streams
contained no tool calls; Claude's changed-file warning matched the parent's edits.

## OpenCode 2.0.28 permission and ACP revalidation (13 October 2026)

**PASS for this bounded revalidation cohort; full S2 remains open.** Native
CLI help reports 2.0.28. Five fresh permission sessions used Muse Spark free
`xhigh` through the real terminal; the selected and executed model references,
agent, location and permission arrays were verified. Each final service version
also remained 2.0.28, with unchanged service identity and selected configs.

| Permission case | Current result |
|---|---|
| `allow-edit-control` | One exact allowed edit; protected file unchanged, no approval |
| `auto-shell` | One exact harmless command under configured shell allow; expected marker, no approval |
| `deny-edit` | Actual targeted edit rejected as `permission.rejected`; protected bytes unchanged |
| `reject-shell` | Correlated request rejected; no command execution or marker |
| `allow-once-shell` | First command completed once; distinct repeat request remained pending twice |

Native ACP initialized protocol 1 with version matching preflight 2.0.28.
The unsupported-method case returned RPC `-32601`, and the following own-project
session list was empty and healthy without a model request. All three injected
fault contracts passed again: deadline, deliberate exit and malformed protocol.
Those cases retain their injected-source labels and do not establish native
hang or provider-error patterns.

The live ACP streaming run confirmed Muse free and `xhigh`, received two chunks
from the same owned assistant (156 then 311 cumulative text code units), sent
one cancellation notification and received `stopReason: cancelled`. Counters
continued tracking late chunks and stayed stable across the bounded follow-up
interval. There were zero tool calls and approval requests. Session deletion,
private Windows Job/process cleanup, exact temp cleanup and shared-service/config
checks passed. These observations qualify the tested routes on 2.0.28 only.

### Version qualification and preserved evidence

`reviewed-version.js` accepts only exact reviewed 2.0.22 or 2.0.28 labels, with
optional native `opencode ` / `v` prefixes. Unknown versions, suffixes and prefix
lookalikes fail. ACP compares its native initialization version to the preflight
shared service version before creating/generating a task. Final identity checks
still reject mid-run service changes. Permission assessment requires complete
unique passing cohorts and an inventory of the same reviewed version; fresh
2.0.28 records must contain a matching final service version.

Before latest files changed, nine 2.0.22 source records were archived byte for
byte, including its raw prior assessment and earlier provider-rejection evidence.
Five passing 2.0.28 sources were then sealed. Each manifest binds file names,
original repository paths and SHA-256 hashes. The helper refuses a differing
replacement, detects corrupted reads and rejects unsafe/reserved file names.
Scoped Git attributes preserve exact evidence and measured source bytes across
Windows checkouts, so newline conversion does not invalidate those hashes.
The builder verifies that its current permission sources equal sealed bytes
before publishing a new assessment. This write policy is not OS protection or
the signed capability-update system planned for the product. The raw older
assessment's hashed input records are located through its archive manifest;
context-document references retain their original repository meaning.

- [2.0.22 archive manifest](evidence/versions/2.0.22/manifest.json)
- [2.0.28 archive manifest](evidence/versions/2.0.28/manifest.json)
- [Current permission controls](evidence/versions/2.0.28/permission-controls-latest.json)
- [Current denial/reject/once outcomes](evidence/versions/2.0.28/approval-outcomes-latest.json)
- [Current native help inventory](evidence/versions/2.0.28/permission-options-latest.json)
- [Current ACP streaming evidence](evidence/versions/2.0.28/acp-stream-cancel-latest.json)
- [Current ACP native-error and injected-fault evidence](evidence/versions/2.0.28/acp-faults-latest.json)
- [Initial 2.0.28 preliminary permission assessment](capabilities/opencode-permissions-revalidation-2.0.28.json)
- [Cohort version and integrity summary](evidence/version-revalidation-latest.json)

That initial assessment uses stable versioned references. Read-only remains partial;
allowed edits, shell ask and configured shell allow have bounded observations.
File `none`, OS containment, combined profiles, the terminal approval UI and
`--auto` launch behavior remain unverified. Shell `off` is **unverified for
2.0.28**, with its 2.0.22 provider rejection retained as historical evidence;
no coding reliability result was carried forward. `productionEligible: false`
and every `productGuarantee: false` remain. Documented permission vocabulary was
checked against [OpenCode's V2 permission documentation](https://opencode.ai/v2/docs/permissions);
documentation is kept separate from observed enforcement.

Verification: **71 offline checks**, all S2 script syntax checks and diff
whitespace checks passed. Added coverage rejects unknown/mixed/drifted versions,
missing final-version evidence, immutable-archive replacement, path/reserved-name
collisions and corruption. Existing failed records remain unchanged, and older
milestone links now resolve to their archived measurements.

Muse free `xhigh` completed a supplied-facts design review. The parent verified
parsing rules, source hashes, version capture points, cohort gates, archive
integrity and every live record. MiMo Atria and Claude Atria `xhigh` timed out
after four minutes without final reviews; their recorded events contain no tool
calls. Claude's tripwire detected the parent's concurrent edits, which were
reviewed directly. No model was substituted.

Next: test shell-off compatibility and denied profiles on 2.0.28. General native
hang/auth/network/rate-limit behavior, other CLIs/models/WSL, S3-S6 feasibility
and the core event store/team engine/full product UI remain open.

## S2.5 cancellation of an already executing local command (13 October 2026)

**PASS for the fresh OpenCode 2.0.28 / Muse Spark free `xhigh` measurement.
Full S2.5 remains open.** The native terminal submitted one exact shell command
to an owned disposable session. After two observations correlating its pending
request, assistant, tool and command, the parent replied `once`. No persistent
approval, retry or fallback model tool was requested.

The preinstalled fixture starts a Node root and exactly one Node child. Each
writes a run nonce, PID/parent metadata and an increasing heartbeat file.
The script bytes are hashed before model submission and committed into the
disposable project's baseline. Root/child markers must match that nonce and
fresh Windows process identities; the child must belong to the root, the root
to the service tree, and captured descendants must exclude protected service,
client and orchestrator PIDs. A PID with a different creation time cannot
establish continued execution of the old process.

| Final measurement check | Observed |
|---|---|
| Native version before / after cleanup | 2.0.28 / 2.0.28 |
| Selected and executed model/effort | Muse Spark free, `xhigh`, confirmed |
| Exact approval correlated twice / once reply accepted | Passed / 1 reply |
| Same running original tool, unfinished assistant, no pending approval | Verified twice |
| Root heartbeat before / at interruption | 2 / 10 |
| Child heartbeat before / at interruption | 1 / 10 |
| Captured command-tree process identities | 3 |
| First / second own-session interrupt | `true` / `false` |
| Original tool after interruption | `error`, type `aborted` |
| Completed turns, no pending approvals, stable conversation | Verified twice |
| Captured command creations gone and heartbeat counts stable | Verified twice |
| Interrupt through stable cancellation observation | 3318 ms |
| Root/child normal-completion markers | Absent |
| Parent fallback termination | Unused |
| Same marker values and script, stopped heartbeats after client cleanup | Verified |
| Client Job and six captured client processes gone | Verified |
| Own session/location/MCP fixture/exact temp directory cleanup | Verified |
| Shared PID/version and selected config fingerprints | Unchanged |

Execution observation has a 30-second deadline after approval. Samples are
separated by a one-second wait plus API/inventory overhead. Both counters must
increase; a pending tool alone is insufficient. Cancellation has a separate
30-second deadline and requires the original aborted tool, quiescent completed
turns, absent process identities, unchanged markers/script and stable heartbeat
counts across two observations. The normal child/root lifetimes are 90/95
seconds, well outside the final observed cancellation interval. Timings include
polling overhead and are not a product latency guarantee.

If cancellation leaves captured command processes alive, the probe fails.
Its cleanup path rechecks each captured PID/creation identity and terminates
verified descendants before their parents; fallback use cannot satisfy the
native cancellation gate. That fallback was not exercised in the passing run.
The shared service and terminal client are excluded from command targets.
Directory deletion requires separately verified command termination and owned
session/location cleanup. Unverified cleanup retains the exact directory.

### Failed first run, exact recovery and version change

The [first record](evidence/command-cancel-first.json) remains
`PARTIAL_OR_FAILED`. It started against OpenCode 2.0.22 and verified executing
heartbeats, scoped cancellation, the aborted original tool, three command-tree
creations gone and stopped heartbeat files. Final location eviction and the
whole-run service identity comparison failed, so the temp directory was retained.
Later diagnostics reported native CLI/service 2.0.28, an empty owned-session
list and absent command PIDs. The cause and exact timing of the version change
are undetermined; the first run cannot qualify the complete lifecycle.

[Exact post-run recovery](evidence/command-cancel-recovery.json) verified
the retained directory against the first run's fixture hash and creation window,
checked command absence and heartbeat stability, evicted only its location from
a separate control directory, confirmed current service identity and removed
that exact directory. This does not rewrite the failed first record.

The service cleanup helper now makes its location-eviction/list/info management
requests from the workspace control directory, with only the owned disposable
directory in the eviction parameter. This avoids using the target as the
management client's working directory after eviction. The
[fresh final measurement](evidence/command-cancel-latest.json) on 2.0.28 passed
all lifecycle gates with this helper. The installed service was accessed through
the native CLI; no explicit upgrade, global stop or restart command was issued.

Verification: **68 offline harness checks**, all S2 script syntax checks and
diff whitespace checks passed. New negative cases reject stale or mismatched
process metadata, PID reuse, invalid ancestry, one-sided heartbeat growth,
pending-only activity, duplicate/wrong tools, provider errors, normal completion,
live processes after tool abortion, fallback cleanup and failed service/location
or final file cleanup. Published records contain hashes, counts and fixed
outcomes; raw command/nonce/path/process/tool/session identities and model text
are kept out of them.

Muse free `xhigh` completed its supplied-facts design review, highlighting
identity correlation, sampling bounds, cleanup and evidence scope. The parent
implemented and verified the probe. MiMo Atria and Claude Atria `xhigh` timed
out after four minutes without final reviews. Their recorded events contain
no tool calls. Claude's Git tripwire observed the parent's concurrent edits;
the actual changes were reviewed directly. No model was substituted.

Limits: one harmless local fixture and its child on this Windows host, native
terminal input with API approval/cancellation. This does not prove terminal
Ctrl+C, arbitrary shell-tree termination, file isolation, provider billing
cessation, native hang diagnosis or durable external-effect rollback/replay.
Earlier 2.0.22 permission and ACP observations remain historical evidence;
they do not automatically qualify 2.0.28. Next: revalidate those controls on
the current installed version before extending adapter capability data. Full
S2, later feasibility gates and core implementation remain open.

## S2.5 ACP request deadlines and error contracts (13 October 2026)

**PASS for three injected process contracts and one native protocol-error
measurement. Full S2.5 remains open.** The request client now rejects pending
work on process/pipe closure, explicit local shutdown, malformed JSON or
invalid response envelopes. It clears pending timers and keeps the first
terminal client failure. Remote RPC errors are rejected individually and
leave the transport usable. UTF-8 bytes split between pipe reads are decoded
without corrupting text counters.

| Case | Evidence source | Final observation |
|---|---|---|
| No response to a received request | Owned scripted fixture | `acp.deadline` at 504 ms, process still alive |
| Deliberate exit with a pending request | Owned scripted fixture | `acp.transport` at 2 ms; exit code 23 confirmed afterward |
| Malformed JSON with a pending request | Owned scripted fixture | `acp.protocol` at 1 ms |
| Unsupported RPC method | Native OpenCode 2.0.22 ACP | `acp.remote`, code `-32601`, 1 ms; next project session-list request succeeded |

Each injected fixture joins a Windows Job before launch, answers a readiness
request and has its process identities captured before fault delivery. Exactly
one fault request was received per fixture; no retry was sent. The native case
initialized protocol 1 and created no session or generation request. All four
cases verified owned process cleanup, expected directory contents, exact temp
removal, unchanged shared-service PID/version and selected config fingerprints.
Timings are observations including pipe/event scheduling; the probe's local
bounds are not product latency guarantees.

The failure categories are `acp.deadline`, `acp.transport`, `acp.protocol` and
`acp.remote`. Only an integer RPC error code is retained; remote message/data,
stderr and credentials are excluded. A numeric code such as the injected
unit-test value 401 is still a remote RPC error, not evidence of provider auth
failure. Default request/prompt deadlines remain 15/90 seconds. A deadline
removes only its pending request. Protocol/transport failure makes the client
unusable and rejects all remaining requests. `client.close()` is local
shutdown and rejects pending calls as transport failures; it is not a vendor
cancellation acknowledgment. Execution is recorded as unknown at failure.
Owned process cleanup provides separate evidence of local termination.

The [first run](evidence/acp-faults-first.json) remains failed. Its crash case
observed pipe closure before Node exposed the child's exit code; the request
correctly rejected, but the immediate exit-code gate was inconclusive. The
corrected runner awaits the bounded exit observation after recording request
failure. The [final run](evidence/versions/2.0.22/acp-faults-latest.json) passed all four cases.
Cleanup uncertainty now preserves a failed record and the exact directory,
and stops further cases rather than continuing with unverified ownership.

The [live streaming regression](evidence/versions/2.0.22/acp-stream-cancel-latest.json) also
passed on Muse Spark free `xhigh`: two same-assistant chunks, 151/305 cumulative
text code units, `stopReason: cancelled`, stable late-chunk counters, no tools
or approvals, deleted session and six captured processes gone. The prior
stronger-guard record is retained separately below. This rerun verifies the
normal native path after request-lifecycle changes.

Verification: **63 offline harness checks**, all S2 script syntax checks and
diff whitespace checks passed. New checks cover error redaction, deadlines,
late replies, multiple pending requests, process/pipe/local shutdown,
malformed/oversized protocol and split UTF-8 chunks. No dependency was added.

Muse free `xhigh` completed a supplied-facts design review. It highlighted
settlement races, exit-observation timing, redaction, ownership and unknown
execution state; these were checked by the parent. MiMo Atria and Claude
Atria `xhigh` timed out after four minutes without final reviews. Recorded
events contain no tool calls. Claude's Git tripwire detected the parent's
concurrent edits; the actual diff was reviewed directly. No model substitution
occurred.

This is request-boundary hardening in the feasibility harness. It does not
prove a suspended native OpenCode process, native hang diagnosis, actual
provider auth/network/rate-limit patterns, command termination or external
effect reconciliation. Next: cancellation of an already executing harmless
command in an owned disposable session. Full S2 and the core implementation
remain open.

## S2.5 live text-stream cancellation through native ACP (13 October 2026)

**PASS for the final native ACP measurement; full S2.5 remains open.**
OpenCode 2.0.22 confirmed Muse Spark free and `xhigh` through configuration
responses before a text-only prompt in a disposable project. Two live
`agent_message_chunk` notifications from the same owned assistant caused
one `session/cancel` notification. The prompt returned `stopReason: cancelled`.

| Final measurement check | Observed |
|---|---|
| Protocol 1, OpenCode version, selected model and effort | Confirmed |
| First / second cumulative text code units | 158 / 614 |
| Own assistant text chunks / total text code units | 2 / 614 |
| Reasoning or foreign-session updates accepted as text proof | None |
| Cancellation response | `cancelled` |
| Late own text chunks during observation | None |
| Text counters after 500 ms settling, then one second observation | Stable |
| Tool calls / approval requests | 0 / 0 |
| Owned session deleted and its project session list empty | Verified |
| Owned Windows Job and six captured processes gone | Verified |
| Only owned config file present, exact disposable directory removed | Verified |
| Shared service PID/version and selected config fingerprints | Unchanged |

The launcher waits for its parent to attach the Windows Job before starting
native ACP. Its private backend and descendants therefore inherit ownership;
the existing shared service stays outside that tree. ACP uses the native CLI's
normal service startup and authentication. This is an additional control-channel
feasibility route, not a production TIYE adapter implementation.

### Preserved attempts and observation limits

1. [First terminal/API snapshot attempt](evidence/stream-cancel-first.json)
   failed before observing text growth. Cleanup succeeded.
2. [Second terminal/API snapshot attempt](evidence/stream-cancel-second.json)
   also failed: 127 polls ended with 17,197 text code units in a completed
   response. No pair of growing, unfinished text snapshots was observed.
   The existing `stream-cancel-latest.json` preserves this failed route.
3. [First ACP attempt](evidence/acp-stream-cancel-first.json) confirmed the
   model but did not confirm the effort echo. It sent no generation prompt;
   owned cleanup succeeded. The cause remains undetermined.
4. [Second ACP attempt](evidence/acp-stream-cancel-second.json) confirmed
   `xhigh`, received two same-assistant text chunks and returned `cancelled`.
   Its original stability check stopped counting after cancellation, so
   that stability flag alone was insufficient evidence of a quiet stream.
5. [Final ACP measurement for this milestone](evidence/acp-stream-cancel-strong-guard.json) reran the
   probe with counters that keep tracking late chunks. It passed the stronger
   observation and all ownership/cleanup checks. A regression check exercises
   a late chunk after cancellation and verifies it is still counted.

Upstream separates live text deltas from stored text-block completion:
[session event definitions](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-event.ts)
and [message updater](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/message-updater.ts).
This explains the snapshot route's limitation; the two failed measurements
do not establish streaming cancellation through that route. The generic
[native API command](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/handlers/api.ts)
buffers response text, so it does not provide a live SSE reader. A bounded
anonymous loopback event preflight returned HTTP 401. No credential files,
pairing codes or authentication settings were used or changed for that preflight.

The [native ACP entry point](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/handlers/acp.ts)
starts its private backend. Its [configuration implementation](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/acp/config-option.ts)
and [stream translation](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/acp/translate.ts)
provided the configuration echoes and live chunk channel used by this probe.
These upstream links are references; recorded native responses and source
hashes bind the installed-version observations.

Verification: **58 offline harness checks**, all S2 script syntax checks and
diff whitespace checks passed. Evidence stores fixed outcomes, counts and
hashes; raw model text, session/message IDs and credentials are excluded.
The observed quiet interval is bounded and does not prove upstream billing
cessation or rollback of external effects.

Muse free `xhigh` completed a supplied-facts design review; the parent ran
and inspected the live probes. MiMo Atria and Claude Atria `xhigh` timed out
after four minutes without final reviews. MiMo performed 13 workspace reads
despite its no-read brief; the recorded tool events contain no writes, shell
calls or subagent calls. Claude's tripwire reported the parent's concurrent
edits, which were reviewed directly. No model was substituted.

Remaining gates include terminal Ctrl+C, shared-session streaming
cancellation, executing commands, hangs, auth/network/rate-limit signals,
service/host crashes and durable external-effect reconciliation. Next:
bounded hang/error signals. The event store, team engine and full product UI
remain unbuilt; this result does not close S2 or the later feasibility gates.

## S2.5 client disconnect while a tool awaits approval (13 October 2026)

**PASS for this bounded live probe; full S2.5 remains open.** OpenCode
2.0.22 with Muse Spark free `xhigh` received one exact harmless shell-command
request through the native terminal, in a fresh disposable project/session.
The session used shell `ask`; no approval reply was sent.

| Check | Observed |
|---|---|
| Accepted prompt, one exact pending shell tool and unfinished assistant | Verified twice |
| Request/session/message/tool identity and command correlation | Verified |
| Owned native CLI PID/creation identity rechecked before termination | Passed |
| PTY exit code | 1 |
| Native exit observation plus old-client Job cleanup | 1597 ms |
| Same pending request and running tool after old client tree was gone | Verified twice |
| Owned session and shared service identity across client crash | Preserved |
| First own-session interrupt / second interrupt | `true` / `false` |
| Original tool after interrupt | `error`, type `aborted` |
| Completed turns, no pending approvals, stable cancellation snapshot | Verified twice |
| Interrupt-to-stable-cancellation observation | 1781 ms |
| Marker before crash, after crash, after cancellation and final cleanup | Absent |
| Final session/client/location/MCP fixture/temp cleanup | Verified |
| Selected configs and disposable file scope | Unchanged |

This is active work waiting for an approval, not a token-streaming model
response or an executing shell command. The source pending request must
join the accepted prompt's own session, assistant and tool call, exact
command and working directory. The assistant turn is unfinished and the
tool is running. Before/after client termination, the same request, source
message and tool IDs must persist. Missing, replaced or completed operations
cannot satisfy the disconnect gate.

The CLI process was deliberately terminated only after matching and
rechecking its PID/creation identity within the owned client tree. The
Electron client observed the PTY exit before its Windows Job closed; that
tree was verified gone. No shared service was terminated or restarted.
Backend work still awaited approval after the client was gone. The later
own-session interrupt actually acted, and its idempotency check found no
remaining execution. This directly shows that client termination alone
did not cancel this backend operation.

Cancellation requires the original tool to serialize an `aborted` error,
zero completed shell calls, no remaining permission requests and completed
assistant turns. Two successive quiescent observations must have the same
conversation fingerprint. Provider/scanner failures or a different tool's
error do not count. Normal idle is recorded separately from quiescence;
this trial also returned a usable idle timestamp during final cleanup.
Recorded timings include polling/API/cleanup overhead and are not product
latency guarantees.

- [Live phase, cancellation and cleanup evidence](evidence/active-disconnect-latest.json)
- Runner: `scripts/run-active-disconnect.js`
- Classifier: `scripts/active-disconnect-evidence.js`
- Shared process ownership helper: `scripts/client-crash.js`
- Verification: 54 offline harness checks and all S2 script syntax checks passed.

The existing idle-recovery probe now imports the same crash and session
identity helpers; their behavior was moved without changing its task flow.
The live active-disconnect probe exercised those helpers. Failure records
retain the completed phase flags and a fixed failing stage. Raw tool inputs,
permission messages, session/request/message/process IDs and credentials
are not persisted. Previous permission and idle-recovery evidence remains
unchanged.

Muse free `xhigh` completed its supplied-facts design review; it explicitly
did not independently verify the live evidence. The parent ran and inspected
the probe and checks. MiMo Atria and Claude Atria `xhigh` timed out after four
minutes without final reviews. Claude's tripwire detected the parent's
concurrent edits, which were reviewed directly. No model was substituted.

Limits: one approval-waiting operation on this model/version/Windows host.
No executing command, in-flight external effect, token-stream cancellation,
service/host crash, hang recovery, auth/network mutation or durable TIYE
effect reconciliation is proven. Next: token-stream cancellation and scoped
hang/error signals. Full S2 remains open.

## S2.5 idle native-client crash and session resume (13 October 2026)

**PASS for two fresh measurements; full S2.5 remains open.** Both used
OpenCode 2.0.22, Muse Spark free `xhigh`, a disposable project and an owned
service session. A first terminal prompt supplied member, role and a random
checkpoint value. Its exact JSON acknowledgment completed without tools,
followed by two idle observations, before the induced client crash.

| Check | First measurement | Final measurement |
|---|---|---|
| Native CLI PID/creation identity matched and rechecked in owned tree | Passed | Passed |
| PTY exit code after intentional native CLI termination | 1 | 1 |
| Exit observation plus old-client tree cleanup | 1594 ms | 1501 ms |
| Shared service and owned-session identity preserved | Yes | Yes |
| Prior conversation fingerprint unchanged | Yes | Yes |
| Fresh terminal attached to the same session | Passed | Passed |
| New value-free query recalled exact checkpoint JSON | Passed | Passed |
| New recall reply, no tools/errors, two idle observations | Passed | Passed |
| Both client Jobs and final session/location/fixture/temp cleanup | Passed | Passed |
| File scope and selected configs | Unchanged | Unchanged |

The exit timings include first-client Job cleanup, not just process exit;
they are observations from this Windows host, not a performance threshold.
Only the native CLI process was intentionally terminated. Its PID came from
node-pty metadata and had to belong to the captured client tree; the PID and
creation timestamp were checked again immediately before termination. The
Electron client then observed the native PTY exit before the old Job closed.
The shared service was outside that tree and kept the same identity.

After the crash, the own-session interrupt API reported no active execution
and the session remained idle. Its ID, creation time, model, agent, permission
rules and location were preserved. Conversation fingerprints bind IDs,
contents, model and turn timestamps; listing order and UI metadata are not
part of the comparison. The final measurement also binds finish/error/agent
fields and rejects invalid creation identities or missing exit codes.

The relaunch used a new Electron/xterm/node-pty client and Windows Job,
with the existing owned session supplied through `--session`. The recall
query contained field names only, without the checkpoint/member/role values.
All prior assistant IDs were excluded, and only replies after the accepted
query could satisfy exact JSON matching. Raw profiles, nonce values, model
reply text, session IDs, process IDs and credentials are not persisted in
the evidence. The fixture made zero team-tool calls, and the disposable Git
project had only its generated OpenCode config beyond its initial files.

- [First measurement](evidence/client-recovery-first.json)
- [Final measurement and source hashes](evidence/client-recovery-latest.json)
- Runner: `scripts/run-client-recovery.js`; ownership/integrity gate: `scripts/recovery-evidence.js`
- Reused terminal startup: `scripts/terminal-client.js`
- Verification: 51 offline harness checks and all S2 script syntax checks passed.

Terminal startup was extracted from the prior task harness for the real
relaunch caller. Each startup returns its process state even on failure,
so the parent retains cleanup ownership. Recovery explicitly transfers that
ownership to the new client before checking relaunch success. Fixed failure
records retain completed phase flags and the failing stage; they never turn
an exception into success. The final live measurement exercised the updated
ownership, fingerprint and failure-recording code.

Muse free `xhigh` completed its supplied-facts read-only review. MiMo Atria
and Claude Atria `xhigh` timed out after four minutes without final reviews.
Claude's tripwire saw the parent's concurrent edits, which were reviewed
directly. No models were substituted.

Limits: one short checkpoint exchange per fresh session and an idle-client
termination. This does not prove service/host crash recovery, in-flight
generation/effect reconciliation, durable TIYE restart journaling, long
context, compaction, hang detection or recovery from auth/network/rate-limit
errors. Approval detection/reject behavior remains documented in the earlier
S2.4 measurements. Next: bounded in-flight client-disconnect and cancellation
signals, then remaining S2.5 error cases without mutating shared credentials
or machine-wide network settings. Full S2 remains open.

## S2.4 allowed controls and preliminary capability mapping (13 October 2026)

**PASS for the final two controls; overall S2.4 remains PARTIAL.** Fresh
OpenCode 2.0.22 sessions with Muse Spark free `xhigh` received tasks through
the native Electron/xterm/node-pty terminal.

| Final control | Observed |
|---|---|
| Allowed edit under wildcard edit allow + protected.txt deny | One exact completed edit to editable.txt; expected changed bytes before/after stopping |
| Protected file in paired control | Original bytes unchanged |
| Shell under configured edit/shell allow | One exact completed harmless command |
| Command marker before/after stopping | Exactly `approved` |
| Approval replies / pending requests observed | 0 / 0 in both controls |
| Owned session, client Job, location, MCP fixture and temp cleanup | 2/2 verified |
| Selected configs / shared service identity | Unchanged |

The first edit control produced the expected bytes but made three completed
tool calls, so the strict one-call gate failed. The initial classifier did
not retain tool-kind counts; it cannot identify the two extra tools from
the preserved record. That failed measurement is unchanged. A stricter
one-tool-only instruction and fixed tool-kind diagnostics passed a fresh
edit trial. The shell control passed in both measurements. These are bounded
controls, not a new reporting-reliability cohort or causal wording comparison.

- [First control measurement](evidence/permission-controls-first.json)
- [Final control measurement and source hashes](evidence/versions/2.0.22/permission-controls-latest.json)
- [Installed launch-help inventory](evidence/versions/2.0.22/permission-options-latest.json)
- [Preliminary permission assessment for that milestone](evidence/versions/2.0.22/opencode-permissions.json)
- Runner: `scripts/run-permission-controls.js`; assessment builder: `scripts/build-permission-capabilities.js`
- Verification: 48 offline harness checks and all S2 script syntax checks passed.

### Product-setting mapping for this model and host

| Setting | Assessment | Practical limit |
|---|---|---|
| File none | Unverified | No complete combined no-file-access profile tested |
| File read-only | Partial native policy evidence | Denied edit observed; approved shell can write, and OS containment is unproven |
| File read and edit | Bounded native controls passed | Paired allowed edit and earlier coding tasks; arbitrary access and combined profiles untested |
| Terminal off | Blocked for tested free model | Historical HTTP 403 precedes tool execution; it cannot establish command-denial enforcement |
| Terminal ask | Bounded native controls passed | Pending request, reject and once through API; approval UI and saved approvals untested |
| Terminal auto | Bounded configured-policy control passed | One exact command under shell allow; `--auto` itself and unrestricted commands untested |

The assessment separates documented rules, observed outcomes, provider
compatibility and OS enforcement. Every mode has `productGuarantee: false`;
the file has `productionEligible: false`. It is a feasibility assessment,
not production adapter data. The builder rejects failed, missing, duplicate,
wrong-version or cleanup-incomplete cohorts and stores hashes of its evidence.
Worktree separation and an ownership watcher remain the proposed detection
fallback; S3 has not validated that fallback yet.

Installed interactive and `run` help were captured in full. Permission-relevant
launch mechanisms include `--auto`, run's `--agent`, an owned `--session`,
project rules and documented agent-scoped rules. Configured session policy
was verified in live probes. Agent-scoped config, plan-mode exceptions and
`--auto` behavior are inventoried without claiming live coverage. The action
inventory follows [OpenCode V2 permissions](https://opencode.ai/v2/docs/permissions);
CLI-specific flags come from the captured installed help.

Muse free `xhigh` completed its supplied-facts review. MiMo Atria and Claude
Atria `xhigh` timed out after four minutes without final reviews. MiMo made
nine read calls to the workspace despite the no-tools review instruction;
event inspection showed no write/shell calls. Claude's tripwire detected
the parent's concurrent changes, which were reviewed directly. No models
were substituted.

Next: S2.5 error and recovery signals, starting with owned-client crash and
resume behavior. Full file/terminal profile combinations, file none, shell
off compatibility, read-only containment and approval UI remain explicit
permission gaps. Full S2 and production-adapter eligibility remain open.

## S2.4 controlled denial and approval outcomes (13 October 2026)

**PASS for the final three-case batch; full S2.4 remains open.** OpenCode
2.0.22 with Muse Spark free `xhigh` received each task through the native
terminal in a fresh disposable project and session.

| Final case | Observed |
|---|---|
| Targeted edit denial | One `edit` call to protected.txt, `permission.rejected`, original bytes unchanged |
| Reject shell | Reply `reject` accepted; original tool aborted; zero completed commands and no marker |
| Approve shell once | Reply `once` accepted; one completed command; distinct second call/request for the identical command pending twice |
| Marker before stopping / after client cleanup | Exactly `approved` / exactly `approved` |
| Owned session, client Job, location, MCP fixture and temp cleanup | 3/3 verified |
| Selected configs and shared service identity | Unchanged |

The controlled edit policy allows `edit` generally and appends a deny for
`protected.txt`, leaving the tool available for an actual attempt. The
earlier broad-deny sessions remain inconclusive because they made no attempt.
The final classifier resolves the input path against the owned project;
same-basename external files, other tools and provider/scanner errors do not
establish the denial. This is observed denial under these rules, not proof
that every other file remains editable or that all permission layers are isolated.

Both shell decisions require two observations of the exact own-session
request, joined to assistant ID, tool-call ID, command and project working
directory. Unexpected input fields or commands are not approved. The reply
decision is recorded as a fixed value; request IDs and raw arguments remain
in memory. No `always` reply is sent. For approval once, the second request
is left unanswered and the marker is checked before and after session/client
shutdown. Rejection requires removal of the pending request, a terminal
error on the replied-to call, and two observations of a completed turn.

### Failure measurements and recovery

The first batch stopped after rejection. OpenCode serialized the rejected
shell turn as `aborted` and omitted its normal idle timestamp. The old cleanup
gate therefore retained the owned session/project. The parent recovered
only that project after verifying its session identity/location, two scoped
interrupts with no remaining execution, completed assistant turns, terminal
tool states, and no pending permissions. It then deleted that session,
verified an empty own-directory session list, evicted the exact location,
verified the same service PID and removed the exact verified temp child.
The client Job and MCP fixture had already stopped. No shared service was restarted.

The cleanup harness now records `quiescentVerified` separately when normal
idle is absent. That proof requires stopped execution plus completed turns,
terminal tools and no approvals; running tools, unfinished messages, stale
completion times and unknown pending lists fail. Rejection remains an
aborted terminal turn, not a normal idle conversation or proven resumed work.

The first and second edit measurements failed classification because the
classifier initially checked a V1-style `filePath` field and an internal
error name. Inspection of the [V2 edit input](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/tool/plugin/edit.ts)
and [error serialization](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/to-session-error.ts)
confirmed `path` and `permission.rejected`. Both measurements remain unchanged;
the corrected classifier passed a fresh final attempt. The second batch's
reject and once cases passed before the additional pre-stop marker check;
the final batch exercised that check as well.

- [First batch, including cleanup failure](evidence/approval-outcomes-first.json)
- [Second batch, including classifier failure](evidence/approval-outcomes-second.json)
- [Final three-case measurement and source hashes](evidence/versions/2.0.22/approval-outcomes-latest.json)
- Runner: `scripts/run-approval-outcomes.js`
- Verification: 44 offline harness checks and all S2 script syntax checks passed.

After the final measurement, supported-case and malformed-message guards
were tightened with offline coverage. The stored source hashes describe
the versions used for that measurement; these later guards do not turn an
earlier failed trial into a pass.

Muse free `xhigh` and Claude Atria `xhigh` completed supplied-facts read-only
reviews. Correlation, reply mode, pre/post-stop marker checks, denial evidence
and lifecycle distinctions were addressed. Claude's tripwire saw the parent's
concurrent edits, which were reviewed directly. MiMo Atria timed out after
four minutes without a final review. No model was substituted.

Limits: these are API-mediated approval decisions following terminal-origin
tool calls; the approval UI itself is not exercised. Saved approvals,
allow-always, a paired non-protected edit control, the full file/terminal
capability matrix, and OS isolation remain unproven. The free-model shell-off
403 remains unresolved. Next: complete the remaining S2.4 capability mapping
and the S2.5 error/recovery checks. Full S2 remains open.

## S2.4 shell approval and edit-denied session probes (13 October 2026)

**PARTIAL; S2.4 remains open.** Two sequential measurements each used two
fresh OpenCode 2.0.22 sessions with Muse Spark free `xhigh` through the native
Electron/xterm/node-pty terminal. No approval was answered.

| Check | Initial measurement | Repeat |
|---|---|---|
| Exact shell tool paused at a correlated own-session approval | Passed | Passed, same request observed twice |
| Completed shell calls / command marker created | 0 / no | 0 / no |
| Protected file bytes unchanged in edit-denied case | Yes | Yes |
| Actual edit attempt / configured-denial tool error | None / none | None / none |
| Owned session, Job client, location, fixture and temp cleanup | Passed | Passed |
| Selected configs and shared service identity unchanged | Yes | Yes |

The created sessions returned the requested build agent, model, location
and permission array. Both edit cases finished without any tool call. The
file invariance is useful, but it cannot establish enforcement against an
attempted edit. The harness deliberately leaves this case failed rather
than counting a prose response or no-op as a denied operation. A controlled
attempted-edit test remains necessary.

Shell evidence checks the pending request's session, action, exact command,
source assistant ID and tool-call ID against a running shell tool. The
second measurement adds two observations of the same pending request. After
interrupting and deleting the owned session and closing the client Job,
the parent checks original file bytes, marker absence and fixture file scope.
No real project files were assigned to either live task.

- [Initial measurement](evidence/permissions-initial.json)
- [Repeat measurement and source hashes](evidence/permissions-latest.json)
- Runner: `scripts/run-permissions.js`; classifier: `scripts/permission-evidence.js`
- Verification: 40 offline harness checks and all S2 script syntax checks passed.

The final pass-classifier extraction and timeout guard were verified against
the preserved measurement through offline tests. Raw tool inputs, permission
messages, session IDs, credentials and model reply text are not persisted.
Typed denial recognition at this historical measurement had only synthetic
coverage. Its V1-style path/error assumptions were corrected and exercised
in the later controlled-denial batch above.

Muse free `xhigh` and Claude Atria `xhigh` completed supplied-facts read-only
reviews. Their concerns about correlation, absent-tool false positives,
post-stop byte checks and cleanup were addressed. Claude's tripwire detected
the parent's concurrent edits, which were reviewed directly. MiMo Atria
timed out after four minutes without a final review. No models were substituted.

The probe uses the permission subset documented by [OpenCode V2](https://opencode.ai/v2/docs/permissions)
and the own-session permission-list route from its [OpenAPI schema](https://opencode.ai/v2/openapi.json).
The configured-denial tag is checked against [V2 Core permission source](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/permission.ts);
an upstream HTTP 403 is not a tool denial. Shell runs with host-user authority,
so this is an approval behavior observation, not an OS sandbox guarantee.

Next: controlled edit-denial evidence, approval reject/allow-once outcomes
in disposable projects, and the remaining file/terminal capability matrix.
The previously observed free-model shell-off 403 remains unresolved. Auth,
network, rate-limit, crash, hang and resume signals under S2.5 remain open.

## S2.3 first-message briefing retention (13 October 2026)

**PASS for this short-session probe; full S2 remains open.** Three fresh
OpenCode 2.0.22 sessions with Muse Spark free `xhigh` received a briefing
through the native Electron/xterm/node-pty terminal as their first user
message. Each completed T1, reported once, and recalled its exact assigned
profile in a later JSON-only reply.

| Check | Observed |
|---|---|
| First-message briefing accepted, then idle without tools | 3/3 |
| Later T1 report and assigned-file scope | 3/3 |
| Recall of self, role, leader, teammates, owned files, completion tool | 3/3 exact matches |
| Recall input accepted; post-query reply completed without tools | 3/3 |
| Generated test cases | 9 passed |
| Independent correctness cases | 24 passed |
| Offline harness checks | 37 passed |

Leader/teammate identifiers differed between trials. Their values and the
worker role were delivered only in the initial briefing, not the coding
task or recall question. The task reinforced ownership and completion-tool
values; the fixture acknowledgment also named the current member. Thus
those fields do not independently prove unrepeated memory. The profiles
describe test metadata, not a running multi-member team.

Before recall, the harness verified the coding turn was idle and recorded
all existing assistant IDs. It checked only later assistant replies after
the accepted recall message, with two idle observations and a completed
turn. User echoes and older replies could not satisfy the check. Exact JSON
field/value matching rejected generic claims, wrong-trial identities,
missing or extra fields, and unfinished replies. Raw briefing/recall reply
text, credentials, and session IDs are not persisted in the evidence.

- [Phase and cleanup evidence](evidence/briefing-latest.json)
- [Independent code validation](evidence/briefing-validation.json)
- Registered profiles and prompts: `scripts/briefing-cases.js`
- Reviewed generated code: `evidence/briefing`

The parent reviewed all three functions and test files before the 33
correctness checks. Model identity, input, report acknowledgment, member,
file scope, log hygiene, owned session/client/location cleanup, fixture
shutdown, temporary removal, and unchanged selected configs/service
identity passed. Service 40900 stayed running; prior evidence was preserved.

Muse free `xhigh` completed its supplied-facts read-only design review.
Both MiMo Atria and Claude Atria `xhigh` timed out after four minutes without
final reviews. Claude's tripwire saw the parent's concurrent edits, which
were reviewed directly. No model was substituted.

Limits: one compatible coding task and short context per session. No
compaction, long-session retention, resume, conflicting role instruction,
permission enforcement, or actual team coordination is proven. First
terminal message is the tested delivery method; persistent config/launch
role mechanisms are not assessed here. Next: S2.4 permission behavior and
S2.5 approval, error, and recovery signals.

## S2.2 wordings, ask-leader, and induced omission (13 October 2026)

**PASS for these bounded probes; full S2 remains open.** This batch is
separate from the earlier ten-run reliability cohort and preserves its
evidence. All runs used fresh projects, tokens, and sessions with OpenCode
2.0.22, Muse Spark free `xhigh`, and `member-a` through the real terminal.

| Case | Observed |
|---|---|
| Wording A, original instruction | 3/3 unassisted reports |
| Wording B, completion protocol | 3/3 unassisted reports |
| Wording C, deliverable instruction | 3/3 unassisted reports |
| `ask_leader` ambiguity task | One exact question, correct acknowledgment, no report or coding call, no task-file changes |
| Induced omission | No initial report, verified idle; one accepted terminal reminder recovered one correct report |
| Correctness after code review | 30 generated and 80 independent cases passed |
| Offline harness checks | 30 passed |

The three wordings are tied in this three-trial-per-wording sample. They
preserve the same function contract, tests, and file/command constraints,
with slight phrasing changes in the task description as well as the
reporting instruction. No causal or statistical superiority is claimed.
The earlier ten-run wording remains the established baseline.

The question asked how `clamp` should behave when min exceeds max. The
model called `ask_leader` with the prescribed text and correct member.
The SDK server independently recorded its argument match. The prompt
explicitly distinguishes the fixture acknowledgment from a real decision.
The harness stopped the owned session after the call; a real Leader answer,
continued waiting, and resumed implementation remain untested.

In the induced-omission control, the prompt required completing the files
but withholding a report until reminded. The model ended its turn and
two successive session checks showed idle after task submission, without
an attempted report. Initial reporting remained false. One reminder was
delivered through xterm paste/Enter and matched in the accepted API user
message. Exactly one `report_result` then reached the fixture with the
expected summary/status and acknowledgment. Initial observation took
12.530 seconds; the whole report/reminder observation took 21.971 seconds
after submitted-input confirmation. This proves one controlled recovery,
not recovery rates for natural omissions or crashes.

- [Per-case measurement](evidence/instructions-latest.json)
- [Correctness and outcome validation](evidence/instructions-validation.json)
- Exact prompts: `scripts/instruction-cases.js`
- Captured code: `evidence/instructions`

The parent reviewed all ten generated functions and test files before
executing the 110 correctness checks. Validation hashes bind the files,
independent checker, and source evidence. Every case verified model,
member, input, exact tool arguments and acknowledgment, file scope,
fixture/log hygiene, and owned cleanup. Selected configs and service
identity remained unchanged; no T1 temporary project remained. Service
40900 was not changed or restarted. Older evidence and LinkedIn assets
were preserved.

Muse free `xhigh` completed the supplied-facts read-only review; its state
comparison included the pre-existing `output/` assets only. Both MiMo
Atria and Claude Atria `xhigh` timed out after four minutes without final
reviews. Claude's tripwire recorded the parent's concurrent edits, which
were inspected directly. No model was substituted.

Next: S2.3 briefing retention, S2.4 permission behavior, and S2.5 approval,
error, and recovery signals. S1 display parity and other feasibility gates
also remain open before building the core event store and team engine.

## S2.2 ten-run identical-wording measurement (13 October 2026)

**PASS for this reporting measurement; full S2 remains open.** All ten
fresh terminal T1 trials reported correctly without assistance through
OpenCode 2.0.22 with `opencode/muse-spark-1.3-contributor-free#xhigh`.
The caller was `member-a` in every trial; projects, tokens, and sessions
were recreated for each. The wording was unchanged from the earlier T1
slice, including the prescribed result summary. No direct SDK tool-call
or parent-side implementation substituted for the terminal task.

| Measurement | Observed |
|---|---|
| Initial reports | 10/10 (threshold: at least 9/10) |
| Reports within a budget of one nudge per task | 10/10; zero nudges used |
| Actual nudge recovery | Unexercised |
| Generated test cases | 30 passed |
| Independent correctness cases | 80 passed |
| Offline harness checks | 28 passed |
| Initial report time, measured after submitted-input confirmation | 7.542–23.280 seconds; median 10.626 seconds |

The parent reviewed all ten captured functions and test files before
executing them. Each run passed its three generated tests and eight
independent boundary, fractional, and negative-interval examples. No
skipped or TODO tests were accepted. Validation fingerprints bind the
captured code, independent checker, and measurement evidence to these
results. No failed trial was replaced or removed from the denominator.

- [Per-trial measurement](evidence/reliability-latest.json)
- [Correctness validation](evidence/reliability-validation.json)
- Captured code: `evidence/reliability/run-01` through `run-10`

Every trial verified terminal input, accepted prompt, exact acknowledgment,
model selection and executed model, member attribution, task-file scope,
fixture/log checks, and controlled owned cleanup. Selected configs and
service identity remained unchanged. No temporary T1 project remained.
The service stayed on 40900. The earlier two-task evidence was preserved.

The conditional one-nudge path is implemented but was not exercised by
this cohort: each initial report arrived successfully. It requires an
accepted task, no attempted report, no provider error, existing task files,
and idle state after task delivery. Any nudge uses the same terminal path,
and an initial miss stays a miss. This is not evidence of successful
recovery from an actual omitted report.

Delegation: Muse free `xhigh` completed the supplied-facts read-only review.
Its before/after state included only the pre-existing LinkedIn `output/`
assets. Both MiMo Atria and Claude Atria `xhigh` timed out after four
minutes with no final review. Claude's change tripwire reflects the
parent's concurrent implementation edits, which were reviewed directly.
No model was substituted.

Limit: a ten-trial cohort on one small task, one wording, one member/model,
and one host does not establish general production reliability. Next:
compare three instruction wordings, test `ask_leader`, and exercise nudge
recovery separately before completing the remaining S2 gates.

## Terminal T1 validation and startup recovery (13 October 2026)

**PASS for this two-task slice.** Both members completed T1 through the
native OpenCode TUI in Electron/xterm/node-pty with the approved Muse Spark
free `xhigh` model. Each created `clamp.js` and three `node:test` cases,
reported once with the correct member and summary, and needed no nudge.
The parent reviewed both generated functions and test files. The six
generated tests plus sixteen independent boundary, fractional, and negative
interval examples passed (22 total). Hashes bind the validation to its
source evidence and captured files.

- [Terminal round-trip evidence](evidence/terminal-task-latest.json)
- [Independent correctness validation](evidence/terminal-task-validation.json)
- [Service startup recovery evidence](evidence/service-startup-latest.json)

The startup blocker was a reserved port: the local log reported managed
port 49374 unavailable; Windows listed exclusion range 49361–49460.
A same-user loopback bind check passed on 40900. The documented
`opencode service set port 40900` and `opencode service start` commands
restored service availability; `service get port` returned 40900.
This changes the persistent local service port. No Windows reservation,
authentication configuration, or unrelated process was modified. This
matches the failure described in the
[upstream Windows startup report](https://github.com/anomalyco/opencode/issues/41746).

Two harness corrections were needed before validation: xterm emitted two
focus reports around input, and the TUI stored one additional boundary
whitespace character in the user message. Focus replies are classified
separately; other extra bytes, duplicate paste, and missing Enter fail.
Prompt comparison trims boundary whitespace only and preserves every
internal character. Actual accepted prompt and model identity checks passed.

The first live attempt also showed that evicting a location while its TUI
was open allowed it to remain loaded. Cleanup now interrupts and verifies
idle for the owned session, removes the session, closes the client Job,
then evicts the owned location. Both final runs verified six captured
process identities gone, location/session removal, fixture shutdown,
temporary project removal, log hygiene, unchanged selected configs, and
unchanged shared service PID/version. The two retained projects from the
failed cleanup attempt were subsequently evicted from their own working
directories and removed after confirming their session lists were empty.

Verification: 21 offline harness checks and 22 task correctness tests pass.
Muse free `xhigh` completed its supplied-facts review without edits.
Both MiMo Atria and Claude Atria `xhigh` reviews timed out after four
minutes; neither supplied a final review. Claude's change tripwire reflects
the parent's concurrent implementation edits. No model was substituted.

The ten-run S2.2 threshold, alternative wordings, one-nudge behavior, and
`ask_leader` task remain unmeasured. Full S2 and S1 stay open. Next: begin
the controlled repeated task/report measurements.

## Terminal T1 attempt (13 October 2026, later run)

**BLOCKED before session creation.** Both member attempts failed while
requesting service information. `opencode service status` returned `stopped`;
the native API command and a separate `opencode service start` attempt
returned “Timed out waiting for the background service to start.” No
terminal was launched for T1, no prompt was submitted, and no result tool
was called. This does not measure reporting reliability or reverse the
earlier successful marker invocation.

Added an opt-in terminal harness and disposable T1 Git fixture. Its
completion detector requires actual accepted user input and a completed,
member-matching tool acknowledgment. A round trip alone remains PARTIAL
until the retained generated code receives independent review and tests.
The shared service is not restarted or globally reloaded. The attempted
start did not establish a running service. All command wrappers finished.

The failed initial attempts retained their temporary projects; both exact
paths were inspected and removed after confirming failure occurred before
session creation. The runner now removes its project on that specific
pre-session failure path. Uncertain session-creation failures still retain
the project for recovery. The latest attempt records cleanup separately.
See [`terminal-task-latest.json`](evidence/terminal-task-latest.json).

Verification: 14 offline rejection tests, all S2 JavaScript syntax checks,
the xterm renderer bundle, and Electron loading the rebuilt node-pty module
passed. These checks do not prove live terminal input or task correctness.

Delegation: Claude `Atria-Dawn-Preview` `xhigh` completed a read-only design
review. Its change tripwire saw the parent's concurrent edits; no delegate
editing tool was available. MiMo `atria/Atria-Dawn-Preview` timed out after
four minutes. Muse free `xhigh` delegation failed during service startup
and supplied no review. No model substitution occurred.

Next: restore a working OpenCode service, run terminal T1, inspect and test
the generated function, then begin the ten-run reporting/nudge measurements.

## Service-backed invocation slice (13 October 2026)

**PASS for this invocation slice:** both members called `report_result`
exactly once through native OpenCode 2.0.22 using
`opencode/muse-spark-1.3-contributor-free#xhigh`. Each call had the correct
member, exact unique summary marker, and `done` status. The server recorded
the match; the CLI emitted a completed tool event with the exact fixture
acknowledgment. There were no other observed tool calls. Actual assistant
message models also matched the approved provider, model, and variant.
See [`service-tool-call-latest.json`](evidence/service-tool-call-latest.json).

The earlier private-instance explanation was too broad. Service-backed
requests also returned 403 with shell denied. Changing the probe to the
`plan` agent with edits denied and shell approval required allowed model
execution. This agrees with an
[upstream reproduction of the shell-denial/free-tier interaction](https://github.com/anomalyco/opencode/issues/50627).
No credentials, client-identification headers, or provider checks were
changed. The private path has not been retested under this profile.

An initial model request sent before catalog readiness completed without
calling the tool. Waiting for the owned project's `/api/mcp` connected
status before prompt delivery produced real calls for both members.
The successful event shape also validates the existing acknowledgment
matcher against real CLI output.

Cleanup passed: only the created session was interrupted, its idle state
was checked, deletion was verified in the session listing, and only its
temporary location was evicted and checked absent. Client Job Object
assignment and process cleanup, fixture shutdown, exact temporary path
removal, selected config fingerprints, and log hygiene passed. Shared
service PID/version were unchanged. Tokens, session IDs, arguments,
provider bodies, and model text are not persisted in the evidence.

The final profile exposes some default plan tools and requires approval
for shell actions. No shell action or automatic approval occurred. This
is not proof that shell-off works with the free model, or that production
role/file permissions are enforced. The exact full CLI tool catalog,
terminal-delivered T1, ten-run S2.2 reliability, and ask-leader behavior
remain separate gates.

Delegation: Muse free `xhigh` and Claude `Atria-Dawn-Preview` `xhigh`
completed read-only reviews; MiMo `atria/Atria-Dawn-Preview` timed out
after four minutes. Claude's tripwire recorded the orchestrator's
concurrent implementation edits, which were inspected independently.
Offline rejection tests and syntax/diff checks pass.

Next: deliver a real T1 task through the terminal, then run the repeated
reporting and nudge measurements specified in S2.2.

## Model invocation slice (13 October 2026)

The new opt-in `npm run probe:tool-call` is implemented, but the actual
tool invocation gate **fails** with the approved free Muse model.
OpenCode 2.0.22 returned `provider.auth`, HTTP 403, for both members before
any tool call. Its diagnostic message was: “OpenCode's free tier can only
be used from within OpenCode.” Direct API prompt delivery, native
`run --server` against the private instance, and native `run --standalone`
all encountered that restriction. The committed runner uses the last,
simplest native path; it does not change credentials or bypass the check.

[`evidence/tool-call-latest.json`](evidence/tool-call-latest.json) records
zero server reports and no CLI acknowledgment for each member. The native
process was assigned to the S1 kill-on-close Job Object before prompt
delivery. Each run captured four process identities before submission;
cleanup, selected config fingerprints, fixture shutdown, exact temporary
directory removal, and log hygiene passed. Startup/provider bodies,
bearer tokens, summary markers, and session IDs are not persisted.

The runner requires both a matching server call and a structured CLI
acknowledgment for a future pass. The positive acknowledgment matcher is
still unverified against a real successful tool call. Local negative
checks reject prose-only output, malformed events, wrong marker, wrong
status, wrong tool, and duplicate completed reports. These checks do not
prove model reliability or production permissions.

The default no-model probe was rerun: private MCP attachment, direct SDK
tools and acknowledgments, auth/session checks, and cleanup still pass;
the overall result remains PARTIAL because exact CLI tool exposure is
unproven. Syntax and diff checks pass.

Requested delegation: Muse Spark free `xhigh` completed its read-only
evidence review through the existing OpenCode service. MiMo
`atria/Atria-Dawn-Preview` and Claude `Atria-Dawn-Preview` `xhigh` each
timed out after four minutes without a review. Claude's read-only
tripwire observed the orchestrator's concurrent implementation edits;
those files were independently inspected. No Atria review is claimed.

Next: test a supported service-backed invocation path with interruption
of only the owned session and disposable member configuration. The
contrast with the successful Muse review suggests a private-instance
restriction; its precise cause is not established. S2.2 terminal delivery,
ten-run reliability, role permissions, and the core team engine remain open.

## Persistent private CLI slice (12 October 2026)

Verdict remains **PARTIAL**, with private CLI server attachment now proven
for both members. `scripts/persistent-cli.js` launches the installed native
OpenCode 2.0.22 executable beside its npm shim with `serve --stdio`, loopback
hostname, and port zero. It keeps stdin open, assigns the process to the
existing S1 kill-on-close Job Object controller, then polls `/api/mcp` at
most eight times. Startup output and its generated API password stay in
memory; only fixed status fields and timings enter the evidence.

Two independent complete probe runs observed `absent` → `pending` →
`connected` for each member. Each private instance opened one MCP session
and requested `tools/list`. Closing stdin and the controller released the
owned processes; Job Object read-back and exact captured PID/creation
identity checks passed for both. The fixture server then stopped and its
owned temporary directories were removed. Auth, session ownership, direct
SDK tools/acknowledgments, config snapshots, and log hygiene still pass.

This supports a startup/lifetime explanation for the empty single-shot
API listing; the exact internal cause is not established. The same
persistent API instance reports different states as it remains alive.
The [`/api/mcp` response schema](https://opencode.ai/v2/docs/api) returns
server names and status, without a tool-name catalog. Therefore connected
status and a received `tools/list` request cannot satisfy the exact-tools
gate. `cli.persistentDiscoversServer=true` records this narrower result;
`cli.discoversServer` still describes the original default CLI listing.

The persistent fixture currently requires Windows and the installed npm
shim/native-executable layout. Job assignment occurs after native launch
and before API polling. It reuses the S1 controller without modifying S1.
The eight-request bound includes up to four seconds per API request; it
is not an overall eight-second timeout. A private startup, API, inventory,
containment, or cleanup error produces a failure rather than a pass.

All three requested delegates completed read-only diagnoses with no file
changes: MiMo `atria/Atria-Dawn-Preview`, OpenCode
`opencode/muse-spark-1.3-contributor-free` with `xhigh`, and Claude
`Atria-Dawn-Preview` with `xhigh`. The orchestrator implemented and ran
the fixture independently. Syntax checks and the S1 typecheck/build pass.

Next: prove tool availability through an actual CLI tool invocation with
the approved free model, then begin S2.2 reliability measurements. No
model request or task round trip was made by this fixture.

## Prior diagnostic slice (12 October 2026)

This section records the preceding committed slice at `66cba44`.

Verdict remains **PARTIAL**. The current runner uses canonical V2
`mcp.servers.<name>` with `disabled: false`, checks `mcp list` from each
temporary member project, and observes only fixed protocol method names.
The SDK's transport callback chaining was checked in the installed SDK.
No payload, token, session ID, or argument name is logged by this observer.

Independent runs still returned an empty standalone API server list and
`No MCP servers configured` from both project listings. The fixture did
observe CLI `tools/list` requests before the SDK client proof. This
distinguishes catalog requests from merely completing `initialize`; it
does not prove that OpenCode retained the catalog or exposed tools to a
model. The earlier hypothesis that OpenCode never lists tools is therefore
unsupported. The cause of the empty API result remains unknown.

See `evidence/latest.json` `cli.beforeSdk` for aggregate counts before the
SDK client starts. Per-phase counts are observation windows; delayed CLI
activity can cross a boundary. Direct SDK tool listing, acknowledgments,
auth rejection, session ownership, loopback binding, config snapshots,
and controlled fixture teardown still pass. Syntax checks and the S1
typecheck/build pass. S2.2 remains unattempted.

Delegation outcome: both Atria reviews timed out. Muse was interrupted
after an out-of-scope cleanup of temporary `tiye-*` paths, including older
diagnostic folders. Committed project files were intact. Its incomplete
private-server implementation was discarded. The orchestrator implemented
and verified the smaller diagnostic changes recorded here.
Stopping the CLI wrapper did not stop service-owned session execution.
The orchestrator used the session interrupt API; it first reported
`interrupted=true`, then `interrupted=false` on a second call. A process
inventory subsequently showed only the pre-existing OpenCode service,
with no fixture or private OpenCode process remaining. Future delegation
must stop the service-owned session as well as its CLI wrapper.

The next experiment should keep an owned private OpenCode server alive
and poll its catalog state, with verified process-tree teardown. A single
connected status is insufficient to close S2.1; exact tool exposure must
still be proven. That prior fixture added no such server lifecycle.

## Prior baseline (historical)

The remaining sections describe the preceding committed slice at
`efdf070`; method details and phase counts below are historical.

**Verdict: PARTIAL** (12 October 2026, Windows 11; `npm run probe` →
`PARTIAL` line, `evidence/latest.json` `result="partial"`; rerun
reproducible across two consecutive runs).

## Scope

S2.1 attaching the tools only (Test Plan S2.1 steps 1–4 + A5 team-tools
server on loopback with per-member tokens). Architecture 4.2 tools
`report_result`, `ask_leader`, `delegate_task`. No model request; S2.2 NOT
claimed. S1 files untouched.

## Method

- `src/team-tools-server.js`: stateful Streamable HTTP server on the
  official `@modelcontextprotocol/sdk` 1.32.1 transport (the one justified
  protocol dependency; `POST` + `GET` SSE + `DELETE` all served by the
  SDK). Three tools with minimal zod schemas; `tools/call` returns a
  feasibility ack only ("no engine effect"); schema violations never reach
  handlers. Every `/mcp` request needs a known per-run bearer token
  (`401` first); each SDK session is bound to the member whose token
  opened it (cross-member session use → `401`, unknown session → `404`).
  Logs tool name + member identity + bounded metadata (session
  open/close, validation boolean, top-level argument count) — never
  tokens, session IDs, or argument contents, names, or values.
- `scripts/run-probe.js` (`npm run probe`): per-run random tokens (never
  printed/hardcoded), loopback server, installed `opencode mcp list`
  with disposable config (`OPENCODE_CONFIG_CONTENT`, then
  `OPENCODE_CONFIG` temp-file fallback) for `member-a` / `member-b`, plus
  in-process `debug config` per member project, a private
  `api --standalone GET /api/mcp` per member project, per-phase SDK
  session-contact counts on the fixture, and SDK-client protocol proof
  (`initialize` + `tools/list` + one bounded `tools/call` ack +
  `DELETE`, cross-member `401`, bad/missing-token `401` incl. `GET`).
  `netstat` loopback-bind check, global/project untouched check,
  redacted `evidence/latest.json`. Bounded timeouts; server SIGTERM +
  temp-dir removal on handled paths.
- Docs used: remote MCP `type="remote"`, `url`, `headers`,
  `oauth=false`; `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT`; config
  files merge (no total-isolation claim).

## Outcome

| Check | Result | Evidence |
|---|---|---|
| Server binds loopback-only | Pass | `netstat`: `TCP 127.0.0.1:<port> LISTENING`, no `0.0.0.0:<port>` wildcard (per-run port; see `evidence/latest.json`) |
| Per-member bearer auth | Pass | Bad-token `POST`/`GET` 401, missing-auth `POST` 401, all before SDK handling |
| SDK sessions + ownership | Pass | Session per member; cross-member session use 401; `DELETE` closes sessions |
| Three tools listed at protocol level | Pass | SDK `listTools` returns exactly `report_result,ask_leader,delegate_task` for both members |
| Bounded `tools/call` ack + attribution | Pass | `report_result` ack names the calling member for both; server log shows `tool-call … tool=report_result` with `member-a`/`member-b` |
| Log hygiene | Pass | No token substring, no session ID, no argument values/names (`leaksToken=false leaksContent=false`) |
| Global/project config untouched | Pass | Existence+size+mtime unchanged for global `~/.config/opencode/opencode.json`, repo-root and fixture `opencode.json` (all absent before/after) |
| Disposable config plumbing loads | Pass | `opencode debug config` in per-member temp CWD shows the `tiye-team-tools` remote document (`Authorization: ***`, `disabled: false`) |
| `opencode mcp list` shows server/tools | **Not proven** | Default `mcp list` prints `No MCP servers configured` for both members (exit 0), via content and file config |
| Private `api --standalone` shows server | **Not proven** | `data=[]` for both member projects (exit 0) despite correct CWD location |
| Model round trip (S2.2) | Not attempted | No prompt submitted, no model called |

## Distinguishing measurement (observed, not inferred)

Per-phase SDK `session-open` counts on the fixture server:

- `mcp list` phase: **0 sessions** for both member tokens — the CLI never
  dialed the fixture. Consistent with `mcp list` serving from the
  persistent background service (live at `127.0.0.1:49374` during the
  run; `mcp list` accepts no `--standalone` flag), but the service's
  internals were not inspected, so this remains consistency, not proof.
- `api --standalone` phase: **1 session per member token** — the private
  instance loaded the disposable project config, dialed the fixture, and
  completed `initialize` with the member token, yet still reported
  `data=[]`. So the handshake path (config → dial → SDK session) works
  against a private instance; why the server is then absent from its
  listing is unobserved by this fixture (it logs `tools/call`, not
  whether the CLI issued `tools/list`).

Net: transport incompatibility at the handshake level is ruled out for a
private instance; CLI-side tool exposure is still **UNPROVEN**. No S2.2
claim.

## Standing caveats

- Config merge: disposable config adds on top of global settings; total
  isolation from global settings is NOT claimed.
- Loopback + bearer tokens are feasibility-only; no production-auth claim.
- This acknowledgment-only fixture exposes `delegate_task` to both test
  members and does not enforce Leader-only tool access. S2.4 still needs
  that authorization test before any engine effect is attached.
- Exit codes: runner uses 0 pass / 2 partial / 1 fail; the `rtk` shell
  wrapper reports any non-zero as 1, so the source of truth is the
  `PARTIAL` stdout line and `evidence/latest.json`.
- S1 files and other modes preserved (only `feasibility/s2-control/`
  added; Temp-only diagnostics never committed).

## Existing-check regression

- `rtk npm run check` in `feasibility/s1-terminal` (tsc + esbuild): PASS
  (rerun 12 Oct 2026 after this slice; no S1 file modified).

## Versions tested

Windows 11; Node.js v26.7.0; `@modelcontextprotocol/sdk` 1.32.1 (exact);
installed OpenCode v2.0.22 (version via `--version`, no model request).

## What remains unproven

S2.2 task round trip (`report_result` reliability, `ask_leader` behavior,
nudges); S2.3 briefing delivery; S2.4 permissions mapping; S2.5
approval/error signals; CLI-side tool exposure (why a session-holding
private instance still lists `data=[]`); vendor-CLI parity beyond
OpenCode; WSL (S6).
