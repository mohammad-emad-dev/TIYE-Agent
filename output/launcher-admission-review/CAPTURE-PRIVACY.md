# Capture and ambient-access review surfaces

Status: **not reviewed for a unified native launcher**. This is a concrete review
plan. It does not assert that any credential exists, inspect a secret, or certify
privacy controls. All conclusions must bind to the exact L1 source/binary/input
set before P1 or P2 can close.

## P1: accessible state and effects

| Surface | Existing evidence | Required review |
| --- | --- | --- |
| Windows environment and WSLENV | Original U0 uses an allowlist; the copied Job helper inherits its launching environment | Trace the final process chain and effective environments, not just the outer configuration; do not publish credential values |
| Linux identity and fresh runtime directories | Mocks check UID 1000 and private runtime roots; original U0 plans fresh HOME/CODEX_HOME/TMPDIR | Confirm effective UID/GID/groups, permissions and actual candidate defaults in the unified path |
| Other readable credential/configuration paths | No absence or containment proof | Review accessible Linux home/config, Windows mounts, credential helpers, keyrings and relevant sockets through metadata/configuration analysis; do not copy or dump account files |
| Network and service access | No network-isolation qualification | Record actual allowed access and any enforced restrictions; lack of requested auth/model calls does not establish lack of network activity |
| Native binary and startup behavior | Version/help installation and pinned executable digest | Recheck identity and source-bound argv; review the selected version's startup/configuration behavior before calling the runtime unauthenticated |
| Linux process cgroup | Controlled lifecycle cleanup is measured | Keep lifecycle evidence separate from credential, filesystem and network isolation |

Record each conclusion as enforced, observed, unresolved or not applicable with
evidence. Explicitly unresolved access must remain visible in the admission
decision and result labels; it cannot be silently converted to isolation. A
run that unexpectedly loads account state cannot be relabelled unauthenticated
merely because the harness sent no auth request.

## P2: retention and publication

| Data | Private capture | Public derivative |
| --- | --- | --- |
| Native stdout/stderr and unexpected output | Retain original bytes outside Git in a separately reviewed location | Never publish wholesale; inspect before choosing safe fields/excerpts |
| Account, tokens and session credentials | Do not request or echo secrets; unexpected sensitive output remains private | Exclude values and identifiers that expose private account/session state |
| Runtime paths, configuration and user agent | May reveal usernames, installed tools, local endpoints or paths | Inspect each field; publish only necessary sanitized values |
| Protocol IDs, write states and cleanup results | Preserve exact correlation privately | Publish allowlisted non-secret correlation/outcome fields and uncertainty labels |
| Hashes and provenance | Raw native hashes stay in the private manifest | A sanitized derivative has its own public hash; retain its relationship to raw evidence privately |

Before capture, review effective Windows owner/ACL inheritance on the actual
capture location and Linux runtime ownership/mode on the actual root. A path
under `.git` is excluded from Git by location, but is not an ACL or encryption
guarantee. Also review what the terminal/tool output would display while an
operator inspects or exports a native capture. Do not decode private native
streams into public chat/tool logs to perform the inspection.

Before publishing, inspect both streams, structured fields, error messages and
configuration/argv artifacts. A field allowlist and manual content review are
required; a regex scrub is not proof of safe publication. Publish a limited
outcome when a safe transcript cannot be produced. Keep originals unchanged and
label sanitized derivatives explicitly.

Freeze retention, access, export and cleanup ownership in the admission record.
The existing protocol retains runtime fixtures; no recursive deletion or automatic
unlock is authorized by this review. Unknown cleanup/outcome means pause and
reconcile, not retry or silently regenerate a capture.
