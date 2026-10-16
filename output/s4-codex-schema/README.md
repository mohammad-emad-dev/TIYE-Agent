# Codex 0.157.1 declared protocol surface — 16 October 2026

**Schema generation and offline verification passed.** This capture describes
what the pinned Linux binary declares, without starting a protocol session or
making a model request. S4/S6 remain partial; Phase 1 construction remains on HOLD.
It adds to the [Linux installation and route review](../s4-codex-candidate/README.md)
without modifying that evidence or selecting a new product transport.

## Capture

The [protocol](../../feasibility/s6-wsl/codex-schema/protocol.json) and native
[Linux worker](../../feasibility/s6-wsl/codex-schema/linux.py)/
[host coordinator](../../feasibility/s6-wsl/codex-schema/run.py) were saved before
execution. The worker verified the existing Codex executable's SHA-256 against
the installation capture, then ran one attempt each:

1. `--version`: `codex-cli 0.157.1`.
2. `app-server generate-json-schema --help`: confirmed the output flag.
3. `app-server generate-json-schema --out <fresh-owned-directory>`.

All three exits were 0, with empty stderr. No retry or timeout occurred. No
experimental opt-in was supplied. Each child had a 12-second limit; the Windows
WSL stage had a 45-second limit. The worker was non-root UID 1000 and used a
fresh marker-owned Linux `/tmp` directory, isolated HOME/CODEX_HOME/TMPDIR and a
fixed PATH/locale. The retained root is in [native evidence](evidence.json).

The result contains **314 JSON files**, totaling **3,587,035 uncompressed bytes**,
preserved exactly in [schemas.zip](schemas.zip), a 514,747-byte archive. The
manifest records each file's length and SHA-256. [Raw worker stdout](stdout.bin)
includes the ZIP transport encoding, command streams and metadata; the host
also retains [raw worker stderr](stderr.bin). Measured source and executable
hashes matched after execution. No installed package or binary is duplicated in Git.

The [official documentation](https://learn.chatgpt.com/docs/app-server#message-schema)
describes version-specific schema generation. It also labels app-server as
experimental and unsupported for production workloads. This capture supplies
versioned declarations, not a production support or access decision.

## Adapter implications from the saved schemas

The reproducible [capability map](capabilities.json) links selected methods to
their envelope requirements and parameter shapes. These are declarations only.

| Surface | Recorded shape | Consequence for a later prototype |
|---|---|---|
| Initialization | Client request `initialize`; `clientInfo` required; client notification `initialized` | Preserve the handshake boundary; order has not been exercised here |
| Work lifecycle | `thread/start`, `thread/resume`, `turn/start`, `turn/interrupt` | Keep thread and turn identities distinct; interrupt requires both IDs |
| Completion | `turn/completed` requires `threadId` and `turn`; `turn` requires `id`, `items`, `status`; status enum includes completed/interrupted/failed/inProgress | Correlate owned thread/turn IDs; completed is protocol completion only, and task success requires inspecting returned results/application outcome |
| Streaming/resolution | `item/agentMessage/delta` and `serverRequest/resolved` declared as server notifications | Do not infer runtime ordering, delivery or recovery from presence |
| Command/file approval | Server requests carry request IDs plus required threadId/turnId/itemId/startedAtMs; command approvalId and command text may be null/omitted | Bind replies to the server request and exact operation context; item ID alone is insufficient; nullable text cannot be treated as a guaranteed shell preview |
| Command decisions | accept, acceptForSession, decline, cancel, execpolicy amendment and network-policy amendment variants | Keep single-operation, session and persistent grants separate; this does not qualify enforcement |
| File grantRoot | Schema description marks the field unstable and questions whether it is honored | No containment or reliable session-grant claim |
| Model/effort | Model selection field present; effort type is a nonempty string | No model or `max` entitlement follows from schema acceptance |

The default generated output also contains unstable fields. In particular,
`v2/LoginAccountParams.json` labels the `chatgptAuthTokens` login variant
**internal-use-only / do not use**. TIYE must not adopt that login variant based
on this capture. This finding is specific to that variant in 0.157.1; it does
not decide whether a separately approved Sign in with ChatGPT/Responses provider
route is available. Current online documentation cannot silently override the
installed version's own warning.

This cohort sends no handshake, account-read, login, thread, turn or approval
message. Schema generation is not runtime authentication or protocol behavior.
The harness does not read the user's existing credentials or export auth variables.
No syscall/network audit or OS containment is claimed. The absence of warnings
in this capture does not qualify the helper-alias setup that warned in the earlier
version/help cohort; these are separately recorded environments and commands.

## Verification

From the repository root:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/codex-schema/check.py
```

The [offline checker](../../feasibility/s6-wsl/codex-schema/check.py) verifies
the recorded native-source and prior-installation hashes, raw/result/ZIP agreement,
all member lengths/hashes and the derived capability map. It launches no CLI,
reads no credential and sends no signal. It was added after capture to analyze
the saved bytes; it was not part of the native prelaunch source freeze.
`--write-summary` creates a new capability map exclusively and refuses an existing
one. The native coordinator likewise refuses existing evidence.

Next: implement a bounded **offline protocol replay fixture** for completion
correlation, error/interruption handling and distinct approval scopes, using
these exact schema declarations. Keep the unresolved commercial access question
and [unsent clarification draft](../s4-codex-candidate/PROVIDER-CLARIFICATION.md)
visible. Runtime provider tests and construction remain separate gates.

## Review

[Review metadata](review.json) records requested models, outcomes, artifact hashes
and event audits. Reviewers receive supplied facts; they do not independently
inspect the workspace or native results. The parent owns the capture, source
review, offline verification and documentation checks. Delegation success does
not qualify product access.

The first two relay calls collided on one timestamp-based artifact directory;
their streams interleaved and were not accepted as independent provenance.
Both reviews were repeated with explicit separate directories. GPT-6 Luna max
and Muse Spark 1.3 Free xhigh completed those fresh context-only reviews with
zero observed tool events. The parent retained the corrected completion rule
and separate approval scopes. Gemini stayed excluded; no fallback was needed.
