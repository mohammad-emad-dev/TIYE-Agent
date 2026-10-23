# Synthetic export-request and grant contract

Status: executable offline prototype. No export executor, live authentication,
destination creation, copy, release, event store or native admission is added.
All approvals in the tests are synthetic calls, not human authorization.

## Closed request schema

The input is UTF-8 JSON bytes with exactly these fields:

| Field | Version 1 requirement |
| --- | --- |
| `version` | Integer 1; booleans are refused |
| `scope` | `synthetic-export-plan-v1` |
| `session` | 32 lowercase hexadecimal characters |
| `generation` | Integer 1 through 2³¹−1 |
| `ownerEpoch` | 32 lowercase hexadecimal characters; a different owner invalidates the binding |
| `source` | Exact `device`/`inode` integer record |
| `destination` | Exact `device`/`inode` record, on a different device from the source |
| `nonce` | 32 lowercase hexadecimal characters; issued only once per registry lifetime |
| `validForSeconds` | Integer 1 through 60, measured from grant issuance with a monotonic clock |
| `byteBudget` | Integer 1 through 131072 |
| `files` | Explicit list of 1 through 64 selected regular-file descriptions |

Each file description has exactly `path`, `bytes` and `sha256`. File size is an
integer from 0 through 65536 and the digest is 64 lowercase hexadecimal
characters. The aggregate size cannot exceed the request's byte budget. Device
identifiers are unsigned 64-bit integers; inode identifiers are positive unsigned
64-bit integers. These are identity *claims*, not opened or authenticated handles.

Paths are relative portable-ASCII selections: at most six components, 64
characters per component and 384 overall. Components use letters, digits,
underscore/hyphen and internal single-dot separators. Absolute paths, dot
segments, empty components, hidden names, backslashes, colons, whitespace,
non-ASCII characters and the implementation's reserved component names are
refused. Duplicate/case-fold aliases and file/parent selection collisions are
refused. Links, directories and extra metadata fields are unsupported.

The JSON envelope is limited to 16384 bytes. Duplicate JSON members and
non-finite constants are refused. These are prototype selection/metadata limits,
not OS quotas or proof that selected files exist, match their digests, are regular
files or can be copied safely. A future executor must inspect actual descriptors
and refuse links, identity drift or unsupported content independently.

## Review and binding

`review_request` returns the selected paths/digests/sizes, source/destination
identity claims, session/generation/owner epoch, lifetime, total bytes and budget.
It includes a canonical request digest. JSON member order, formatting and list
order do not change that digest; the file selection is sorted before hashing.
Every substantive request field, including nonce and lifetime, is bound by it.

A future trusted main process must display the concrete destination and selected
inventory before obtaining approval. This prototype has no such UI and cannot
authenticate approval. The `issue_reviewed` entry point accepts a synthetic
reviewed digest and independently supplied `Binding` value for contract testing.
It is not a public IPC endpoint and a matching digest is not human consent.

The current binding argument must eventually come from the live process owner,
not from a renderer echoing the request. Actual pidfds, mount/destination handles,
permissions, stopped writers and freshness checks remain separate unimplemented
prerequisites. The frozen binding value here validates consistency only.

## One-shot lifecycle

1. Parse and review the bounded request. Issuance requires an exact reviewed
   digest and matching independent binding snapshot.
2. Under the registry lock, issue an unpredictable identifier and 256-bit random
   bearer secret. Store its secret digest, immutable request/binding snapshot and
   monotonic deadline. The request nonce cannot be issued again in that registry,
   even after consumption or failure.
3. A consume attempt first validates the ticket's shape and atomically recognizes
   its identifier plus constant-time secret-digest match. An unknown/wrong secret
   does not burn another grant. A recognized ticket is removed under the lock
   before parsing the attempted request or checking its current binding/expiry.
4. Changed/malformed input, expired or regressed time, or binding drift fails and
   leaves that recognized ticket permanently spent. No validation failure restores
   it. Simultaneous consumers can produce at most one validated plan.
5. Success returns a plan summary with `commands: []` and
   `exportExecutionAllowed: false`. Cleanup, retry, deletion, release and native
   execution remain disabled; overall outcome remains unknown.

There is no separate caller-visible ID that can burn a grant without the bearer
secret. The binding is checked after recognition so drift cannot preserve a
recognized grant for replay. This intentionally does not require a matching
caller-supplied binding before the one-shot transition.

The registry admits at most 64 distinct nonces over its lifetime. Tickets and the
registry refuse pickle serialization; secrets are omitted from ticket repr and
public examples. There is no loader or restoration path. A new registry rejects
old tickets, but does not provide a durable cross-restart ledger of old requests.
It must not be recreated per attempt to bypass nonce limits. Future persistent
effect/approval handling belongs to the trusted main/core design.

No claim is made against hostile code already executing inside the Python
process. Ticket secrecy, actual human consent and trusted binding production
must be enforced by the future application boundary. The prototype has no
authority to perform an export even after a successful consume.
