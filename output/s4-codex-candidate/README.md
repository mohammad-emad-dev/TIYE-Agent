# Codex Linux prerequisite and S4 route review — 16 October 2026

**Linux version/help prerequisite completed; product access remains unqualified.**
The operator selected official Codex and supplied the required non-secret account
plan/country. Those account values are not retained in these public artifacts.
The proposed model is `gpt-6-luna` with `max` effort. No Linux login, authentication
status command, app-server session or model request ran in this cohort.

## Measured Linux availability

The [pinned protocol](../../feasibility/s6-wsl/codex-prerequisite/protocol.json)
selected the official [0.157.1 release](https://github.com/openai/codex/releases/tag/rust-v0.157.1)
to match the previously observed Windows CLI version. It is not a claim about the
latest release. The downloaded Linux x86-64 package's SHA-256 matched the
[published asset digest](https://github.com/openai/codex/releases/expanded_assets/rust-v0.157.1).
This verifies a same-publisher digest, not an independent signature attestation.

| Observation | Result |
|---|---|
| Platform | Explicit Ubuntu selection, UID 1000, x86_64 |
| Installed executable | Native ELF `package/bin/codex` in a fresh directory under `~/.local/share/tiye-feasibility` |
| Version | `codex-cli 0.157.1`, exit 0 |
| CLI help | `--help`, exit 0; model option present |
| App-server help | `app-server --help`, exit 0; listen option present; no server started |
| Package | 147,755,238 compressed bytes; 44 extracted file hashes recorded |
| Executable SHA-256 | `3e2584f3f3829a43a0495011a1cecb2facbe64a2403e2b682351fd9c2983f970` |

The [installation evidence](installation.json) records the selected binary and
file inventory. The archive digest is separately pinned in the protocol. No package or executable
is committed to Git; the host archive and Linux installation are retained locally.

Each CLI command retained the warning that helper PATH aliases could not be
created under the isolated temporary directory. The commands nevertheless exited
0. Helper creation and full runtime startup are **not qualified**. No environment
repair or native retry was used to suppress that warning.

The [installer](../../feasibility/s6-wsl/codex-prerequisite/linux.py) rejects
absolute/traversal archive names, links and special entries, and bounds entry
count and expanded size before extracting regular files/directories. It does
not run a downloaded installer script. Commands use explicit executable paths,
isolated HOME/CODEX_HOME, a public allowlisted environment and bounded subprocess
timeouts. The harness does not read existing credential files or export account
secrets. This is not a syscall audit or a sandbox against a malicious binary.

There was one download and one Linux install/help stage, no retry. The protocol
sets a 90-second download check, a 45-second Linux stage and ten seconds per CLI
command. Network reads also have a 30-second timeout; the download deadline is
checked between reads rather than being a hard interruption during a blocked
read. No timeout occurred. The [host coordinator](../../feasibility/s6-wsl/codex-prerequisite/run.py)
records outcomes and raw projected Linux stdout/stderr; command stdout and stderr
are nested separately in that JSON. Outer Linux stderr was empty; CLI stderr was
not. Failure-time process-tree cleanup was not exercised.

## Route conclusions for TIYE

TIYE's [specification](../../architecture/TIYE-Agent-Product-Specification.md)
defines paid plans and a Free tier. Local execution and direct user billing do
not themselves establish provider permission for that distribution model.

| Proposed access route | Current decision |
|---|---|
| Legacy Codex app-server managed ChatGPT authentication | Not approved for TIYE. The docs exclude commercial/hosted services while discussing continued existing local/open-source use. Resolve how TIYE's paid local app falls within that scope before relying on it; do not generalize this finding into a ban on every CLI workflow. [Auth endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints) |
| Official CLI with the user's account | Account declaration received; installed Linux version/help measured. Permission for TIYE's orchestration scope, applicable account conditions and actual native authentication/model behavior remain unresolved. [Authentication](https://learn.chatgpt.com/docs/auth) |
| Sign in with ChatGPT | Exploratory alternative. Current documentation describes limited commercial availability and selected private clients; TIYE has no recorded acceptance or client authorization. Identity sign-in and inference permission are separate. [Quickstart](https://developers.openai.com/siwc/quickstart), [client-ID request](https://developers.openai.com/siwc/request-client-id) |
| API-key access | A separate usage-billed route, not selected or authorized as a substitute by this task. [Authentication](https://learn.chatgpt.com/docs/auth) |

The [model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
lists `max` effort, and the [Codex changelog](https://learn.chatgpt.com/docs/changelog)
documents the CLI model slug. Neither establishes this Linux installation's
account entitlement or successful inference. Regional availability and account
applicability still need review; syntax validation is insufficient.

These are engineering eligibility decisions based on dated documentation, not
a comprehensive legal determination. Earlier [S4 research](../../feasibility/s4-provider-access/RESULTS.md)
and sealed evidence remain unchanged. The [route record](route.json) keeps all
qualification/production flags false. S4 and S6 remain partial; Phase 1 remains
on HOLD. Host-side delegate calls are separate authorized review activity.

## Concrete next step

Use the prepared [provider clarification draft](PROVIDER-CLARIFICATION.md) to
resolve the paid local desktop scope and any required commercial onboarding.
It has not been sent or submitted. No app registration, token exchange, API
billing switch or product-scope change has been made. A partner/client selection
must not be inferred from a public sign-in button or a working personal account.

After an eligible route is established, scope one disposable Linux native task
with exact model, account applicability, approval boundaries, failure categories,
owned process cleanup and sanitized completion evidence. Keep tokens within the
official user-controlled mechanism. The installed binary is ready for that
separate protocol; this cohort does not authorize inference by itself.

## Verification and review

The [offline checker](../../feasibility/s6-wsl/codex-prerequisite/check.py) passed:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/codex-prerequisite/check.py
```

It checks frozen source hashes, saved raw/result agreement, the recorded asset
digest, ELF selection and command outcomes without accessing the retained package
or launching a CLI. It does not verify the current website, entitlement or login.
Use a new cohort for future native measurements; the coordinator refuses this
existing output directory.

GPT-6 Luna max and Muse Spark 1.3 Free xhigh completed supplied-facts reviews,
with no observed tool events. They did not inspect the package, workspace or
native results. The parent implemented and verified the installation and used
docs-guard to check this report. [Review metadata](review.json) records artifact
hashes and dispositions. Gemini stayed excluded; no fallback was needed.
