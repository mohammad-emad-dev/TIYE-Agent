# Offline JSONL framing and disconnect fixture

Recorded 16 October 2026. **11 behavior tests and a 9-step synthetic transcript
passed. S4/S6 remain partial; Phase 1 construction remains HOLD.**

This separate Python fixture wraps the [frozen replay policy](../s4-codex-replay/README.md)
without changing it. Inputs use the [captured Codex 0.157.1 declarations](../s4-codex-schema/README.md).
No CLI, WSL process, socket, authentication, provider request or reply transmission
runs inside this fixture. Host model reviews are separate activities in [review.json](review.json).

## Measured local behavior

- Every two-part byte split and one-byte delivery of a short Arabic/Japanese/emoji
  stream produces the same two decoded records. Multiple records in one chunk,
  LF and CRLF delimiters are exercised.
- The default line limit is 65,536 bytes **including an optional trailing CR and
  excluding LF**. The input-chunk limit is 262,144 bytes. Exact default boundaries
  and one-byte excesses are tested. At most 256 packets are accepted per `feed`
  call; this is a per-call budget, not a lifetime message limit.
- Strict UTF-8 decoding occurs only after a full delimited record arrives. The
  frozen decoder rejects duplicate keys, NaN/Infinity literals and non-objects.
  The new layer also rejects BOM/blank records, exponent overflow to nonfinite
  values and escaped lone surrogates before fingerprinting. JSON whitespace is
  permitted inside records; one final CR is removed before decoding.
- Accepted prefix events are returned before the first malformed record or
  exhausted frame budget. The suffix and buffered bytes are discarded and the
  stream is permanently quarantined. An oversized input chunk is rejected as a
  whole, including any otherwise valid prefix in that chunk.
- Any nonempty EOF buffer is truncation, even if it contains valid JSON without
  LF. An EOF with no buffered bytes closes the connection. Closing a running turn
  sets the local policy status to `needs-attention`; clean EOF after protocol
  completion preserves `protocol-completed`. Truncation overrides either status.
- Pending reply plans cannot be used through the connection after a disconnect,
  framing failure or modeled protocol error. An open connection still permits
  only the frozen policy's single-use local reply plan.

Wire errors return ordered failure events; they do not raise from `feed`. Calls
after closure raise `ReplayError`. The low-level framer requires immutable `bytes`;
other Python input types are caller errors. Callers must inspect returned events
and connection state. The replay session and framer are private by convention,
not a Python sandbox or an enforcement boundary against code bypassing the wrapper.

These limits and disconnect transitions are **TIYE fixture policies**, not measured
Codex runtime limits or disconnect behavior. Protocol completion never proves task
success: every transcript snapshot has `taskSuccess: null`. The transcript keeps
prior observations; the final snapshot alone is not a history or durable ledger.

## Evidence and reproduction

Sources: [framing.py](../../feasibility/s6-wsl/codex-framing/framing.py),
[test_framing.py](../../feasibility/s6-wsl/codex-framing/test_framing.py),
[run.py](../../feasibility/s6-wsl/codex-framing/run.py).
Hashes and flags: [evidence.json](evidence.json).
Raw unittest streams: [stderr](tests.stderr.bin), [stdout](tests.stdout.bin).
Public synthetic inputs and decisions: [transcript.json](transcript.json).

From the repository root with Python 3:

```powershell
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/codex-framing -p test_framing.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-framing/run.py --check
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-replay/run.py --check
```

`--check` verifies saved hashes and regenerates the in-memory transcript without
overwriting evidence. Running the recorder without `--check` refuses the existing
output directory. Sources and input replay files are hashed in the final record.
Exploratory tests preceded recording; one exploratory test incorrectly expected
valid JSON nested 2,000 levels deep to be rejected by this host's Python parser.
That assumption was removed before recording; no nesting-depth policy is claimed.
Missing captured schemas are a gate failure, not a skipped test.

## Remaining work

No real stdio transport, outbound queue, write acknowledgement, backpressure,
reconnect/resume, callback replay, timeout, process identity, durable state or
concurrent recovery is qualified. A new object in the transcript is an independent
synthetic scenario, not a reconnect or permission to replay an old callback.
Native authentication, model access and commercial provider scope remain open
under the [candidate route assessment](../s4-codex-candidate/README.md).

Next: a bounded subprocess stdio fixture with a synthetic peer to exercise actual
pipe reads, write failures and process exit, while preserving the provider gate.
