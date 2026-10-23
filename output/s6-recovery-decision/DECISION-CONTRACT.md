# Recovery decision and explicit-export contract

Status: executable offline presentation prototype. This is an S6 recovery
addendum, not permission to begin product construction or admit a native CLI.
The product core, event store and team engine remain unimplemented.

## User-facing decisions

| Observation | Message | Suggested next step |
| --- | --- | --- |
| Original observer currently authenticates held custody | Data is held | Inspect with the original observer |
| Pre-pinned inspector authenticates custody after observer loss | Data is held | Inspect with the pinned inspector |
| Only saved evidence is available | Live custody is unconfirmed | Reconnect a live owner |
| Previous holder ended | Custody is unconfirmed | Pause and reconcile |
| Original observer and inspector ended | No authorized live reader | Keep recovery paused and review |
| Live authority has not been established | Recovery is paused | Reconcile live authority |

These statuses describe observations. They do not claim that current runtime
authentication has been implemented by this module. The `current-bound`
input examples are synthetic contract cases; the saved-fixture examples always
use `historical` provenance and `none` authority. Historical states never become
current solely because their source/artifact hashes match.

An invalid or absent receipt does not erase independently verified custody.
Normal terminal evidence does not prove retention. A verified fixed-fixture copy
does not qualify an exporter for arbitrary native data. Each claim has its own
closed enum; no generic `verified` flag is accepted. Unknown overall outcome and
unverified cleanup persist independently of those claims.

The ended inspector slot has no replacement operation. If no authorized reader
survives, do not offer an automatic reconnect that enrolls a different process.
If the holder ended, do not claim that data remains held or that a receipt can
reconstruct its mount descriptor.

## Explicit export requirements

The current implementation always returns `exportExecutionAllowed: false`,
`exportPreparation: blocked-unqualified-exporter` and an empty command list.
The following requirements specify future implementation work, not present
capabilities or an active grant.

| Requirement ID | Required evidence before a future export |
| --- | --- |
| `qualified-export-executor` | A separately tested exporter for the actual data scope; the fixed-fixture copier is insufficient |
| `fresh-authenticated-owner` | An authorized live observer or inspector, revalidated at request execution |
| `pinned-session-and-mount` | Original held identities, session generation and mount descriptor binding |
| `worker-stop-evidence` | The designated writer tree is stopped under its pinned identities and cgroup |
| `bounded-selected-inventory` | An explicit selection, entry/type/depth/byte bounds and stable inventory digest |
| `explicit-per-export-grant` | A concrete reviewed request bound to selection, destination, byte budget, generation and a single-use nonce |
| `private-separate-destination` | A new private destination outside the source mount, with checked identity and permissions |
| `destination-capacity-and-write-accounting` | Reserved capacity and charge-before-write accounting; partial writes remain uncertain |
| `copy-fsync-readback-and-manifest-match` | Bounded copy, durability operations, reopened readback and matching manifest |
| `source-custody-retained` | Original source references remain held throughout failure and successful export |

The reviewer must see the selected entries, destination and budget before an
export grant is requested. General project work, inspection or GitHub sync
permission is not a reusable data-export grant. Credentials and unrelated paths
must not be added by a generic recursive traversal. Unsupported inventory stays
held; there is no fallback that follows arbitrary links or copies a native home.

A grant must become unusable after source/destination identity drift, ownership
loss, selection changes, expiry or one attempted execution. A failed or uncertain
copy must not automatically retry. Preserve source custody and private partial
output; do not turn a write error into deletion authority.

Successful export would establish a separately verified copy receipt. It would
not establish cleanup, native admission, safe relaunch or permission to discard
the original. Any later release decision needs its own contract and evidence.

## Main/core integration boundary

1. The trusted process owner produces observations from live pidfds, authenticated
   peers, held descriptors and verified records. A renderer cannot submit enum
   claims as proof of authority. This prototype validates claim consistency;
   it does not authenticate their source.
2. The core stores decisions and observed outcomes, with session generation and
   provenance. A saved row is historical after restart until revalidated by the
   live owner. The saved-evidence adapter here deliberately cannot perform that
   upgrade.
3. The presentation layer renders the returned messages and suggested steps.
   It must not convert those step strings into commands or enabled actions.
   This module's output is never an IPC capability or an authorization token.
4. A future export request crosses a separate main-owned boundary. Main checks
   every export prerequisite again and consumes the concrete grant. It must not
   trust a cached view model, renderer boolean or receipt filename.
5. Record export completion, partial failure and unknown delivery separately in
   the eventual event log. Keep original cleanup and external-effect outcomes
   independent; unknown actions are never replayed automatically.

These boundaries follow the architecture's external-effect recovery rules and
the native contract's private retention/unknown-ownership requirements. No event
store or live IPC implementation is added by this step.
