# Codex offline protocol replay — 16 October 2026

**14 behavior tests and a 17-step synthetic replay passed.** This implements a
small client-policy prototype against selected declarations from the
[captured Codex 0.157.1 schemas](../s4-codex-schema/README.md). It runs no Codex
process, WSL command, socket, login or provider task. S4/S6 remain partial and
Phase 1 construction remains on HOLD.

## What was implemented

The [replay client](../../feasibility/s6-wsl/codex-replay/replay.py) owns one
preselected thread/turn for a single connection-like fixture. Client response IDs
and server approval IDs occupy separate maps; integer `7` and string `"7"` remain
different. Empty string IDs, boolean IDs and integers outside signed int64 are
refused by this prototype's policy. No runtime request was sent to establish the
fixture's ownership context.

| Behavior | Verified result in the local prototype |
|---|---|
| Completion correlation | Foreign thread and stale turn completion packets leave the owned turn running |
| Completion status | completed changes only protocol state; task success stays unknown. failed/interrupted are distinct; inProgress remains nonterminal |
| RPC responses | Matching acknowledgement/error updates its request record, not turn completion; unknown IDs do not consume a pending response |
| Duplicate/conflicting outcomes | Exact duplicates are idempotent; conflicting responses or terminal packets enter needs-attention |
| Approval callback identity | Full packet fingerprint and typed server request ID bind a callback; matching item ID alone grants no authority |
| Single-use reply planning | accept/decline/cancel can produce one planned response per pending callback; repeated decisions cannot produce another |
| Wider approval scopes | acceptForSession, execpolicy amendments and network-policy amendments are classified separately and all refused without a reply |
| Resolution and late packets | Owned resolution closes a known callback; an unmatched owned resolution leaves a tombstone that prevents later revival; terminal states block new/pending reply plans |
| Malformed input | Selected missing/type-invalid contexts, ambiguous envelopes, bad JSON, duplicate keys, non-JSON numeric constants and packets over 65,536 bytes are refused |

The callback fingerprint covers canonical JSON re-encoding of the entire decoded
packet: sorted keys, compact separators and UTF-8. It is not a raw-wire hash;
whitespace or key-order changes alone do not create a different callback.
Request IDs accept only nonempty strings or exact integer values in the selected
range; float-valued IDs, including overflow-to-infinity floats, are refused.
The callback fingerprint is not proof of a human approval, a complete semantic
operation preview or the identity of a process effect. Nullable command text is
accepted structurally, and the nullable-command test explicitly declines it.
No UI or informed-consent mechanism is implemented. A returned `reply-planned`
object is local data and is never transmitted or executed.

Wider-grant refusal rejects that proposed decision, not the callback itself.
The callback remains pending for a later explicit single-operation decision or
denial; no session/persistent grant is produced in either case. The transcript
records every refused decision, including its distinct scope. This fixture
implements no session approval cache or persistent policy amendments. An
unmatched resolution tombstone is a conservative single-fixture rule, not a
claim that Codex forbids request-ID reuse across connections. All state is in
memory and does not survive restart. Unmatched client responses explicitly return
`ignored-response` and never enter the server-approval map. This differs from
the tombstone policy for an owned but unmatched approval-resolution notification.

The checks use selected required-field lists and status declarations from the
schema ZIP plus explicit client-policy guards. This is **not full JSON Schema
validation** or coverage of every native message. Unmodeled methods return an
unmodeled result without generating a reply. The decoder handles one complete
JSON value; it is not a streaming JSONL framer or a complete encoding policy.

## Evidence and verification

The [protocol](../../feasibility/s6-wsl/codex-replay/protocol.json) scopes the
fixture. [Behavior tests](../../feasibility/s6-wsl/codex-replay/test_replay.py)
use real state and synthetic protocol packets without internal mocks or new
dependencies. Related input variants use subtests. The native/provider boundary
is simulated; actual server ordering, enforcement, approval persistence and
commercial eligibility are not tested.

The [recorder/checker](../../feasibility/s6-wsl/codex-replay/run.py) froze source
and schema-archive hashes, ran the test suite with a 30-second deadline, then
saved the [synthetic transcript](transcript.json). Its walkthrough encodes and
decodes JSON packets at the receive boundary and records input, result, protocol
state and unknown task-success state at every step. It produces one planned
denial, refuses all three wider-grant categories, then records completed,
duplicate and conflicting terminal packets. These are deliberately scripted
observations, not a transcript from Codex.

[Evidence metadata](evidence.json) hashes the exact transcript and test streams.
[Test stderr](tests.stderr.bin) contains unittest's normal verbose output and
`OK`; [test stdout](tests.stdout.bin) is empty. Exploratory unit-test runs preceded
the sealed recording. The recorder refuses existing output; it does not replace
a prior result to make a test pass.

From the repository root:

```powershell
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/codex-replay -p test_replay.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-replay/run.py --check
```

The first command re-runs the 14 behavior tests. The second verifies stored
source/artifact hashes and rederives the deterministic walkthrough. Both passed;
neither starts a CLI or contacts a provider. Earlier schema, installation and
recovery evidence remain unchanged.

## Limits and next step

This is feasibility code, not the core service, event store or a production
Codex adapter. It does not establish transport ordering, partial-read behavior,
reconnect/session boundaries, durable ownership, concurrent access, request
timeouts or actual effect execution. It never reports a completed task because
there is no application outcome verifier in this fixture.

Next: add a bounded byte-stream fixture for partial/coalesced JSONL messages,
UTF-8 decoding, size limits and disconnect handling. That can test client
transport handling offline while the
[commercial integration scope](../s4-codex-candidate/README.md) remains unresolved.
Keep native provider qualification and the construction gate separate.

## Review

[Review metadata](review.json) records exact model attempts and artifacts.
Supplied-context reviews do not independently inspect the workspace or verify
the tests. The parent implements, reviews and verifies the fixture, using
test-guard for behavior coverage and docs-guard for claims and links. Gemini
remains excluded under the existing consumer-route decision.

GPT-6 Luna max and Muse Spark 1.3 Free xhigh timed out without findings. The
authorized Space Bunny Free xhigh fallback completed a supplied-policy review;
DeepSeek V4.1 Flash Free max timed out. All recorded streams had zero observed
tool events. Space's fingerprint/ID clarification was retained. Its proposal to
close a callback after refusing a wider decision was not adopted: the stated
policy refuses that grant scope and permits a later explicit operation decision
or denial. The transcript already records each refused scope. The parent checked
these distinctions against the code and behavior tests.
