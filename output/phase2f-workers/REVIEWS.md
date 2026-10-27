# Reviews before first execution

Requested models were dispatched read-only through codex-delegate and
opencode-delegate. GPT-6 Luna max completed its initial invocation but reported
that policy blocked shell reads, so it gave no verdict. A source-embedded Luna
retry timed out at 60 seconds without a final report. Flint 40B Free and DeepSeek
V4.1 Flash Free max each timed out at 60 seconds without a verdict. None counts
as review approval or test evidence. Existing working-tree paths in relay
`touchedFiles` were already present before dispatch; the parent owns this patch.

Parent review checked the complete new package, accepted unchanged core sources,
private-root fixtures and independent fixed witness helper. Only owned-worker
and witness adapters launch children; executable and script paths are fixed.
The worker graph imports only protocol, target storage and reviewed core SDK
helpers. It receives its witness root and target identity, never the engine path.
No shell, detached process, injected executable/environment, process discovery,
PID adoption, credential forwarding or worker descendant launcher is present.

Claims precede a single write attempt; transport failures never resend. Success
waits for complete stdout plus verified exit and independent proof. Storage
exceptions freeze local dispatch, clean up owned handles and preserve durable
state; command records support only explicit fixture redelivery. Intentional
stop commits before interruption, keeps late results from settling, and retains
uncertainty. Same-user process isolation and whole-host crash containment are
not claimed.

Tests were reviewed for real processes/SQLite, deterministic barriers, finite
fault modes, explicit fixture authority, failure assertions and finally cleanup.
Before execution the reviewed inventory, compiled core, runtime, dependencies
and finite plan are sealed by capture.py. Any changed source requires a fresh
preflight and rerun; failed captures are retained locally.

The first full run completed 223 tests: 220 passed and three abort-injection tests
failed because their TEMP trigger survived an earlier unrelated commit. The core
correctly refused that unexpected temporary schema. The injector now removes
the trigger immediately after unrelated commits; rollback still removes the
trigger within its failed transaction. The other 39 harness tests and all 181
baseline tests passed in that run. It is retained locally and is not qualifying
evidence. The second preflight reviews this fixture change and adds explicit
checks of the original witness root identity before and after observation.
