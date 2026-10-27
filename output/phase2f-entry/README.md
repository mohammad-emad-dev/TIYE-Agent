# Next slice: owned mock-worker execution

27 October 2026 — proposal only; owner construction decision pending.

Phase2E exitb53dcb3 accepted handoffs and recovered mission completion with181
passing tests. The next practical milestone connects that logical core to actual
owned mock workers, giving an end-to-end team test before provider adapters or UI.

Review [AMENDMENT.md](AMENDMENT.md) and [CONTRACT.md](CONTRACT.md). A separate private
harness can run at most two fixed workers/six assignments inside disposable fixture
roots. Core claims commit before one-time delivery; worker prose cannot prove an
effect. Success requires verified exit and independent witness evidence. Failure
and stop preserve uncertainty until explicit owner resolution. No approval, retry,
abandonment or takeover is silently granted by the controller.

This is a new fixed synthetic process composition, so it needs its own scope
decision after Phase2E's exception ended. The proposal changes no code/tests,
runtime or architecture permission. After approval, source review/preflight must
include every new controller/worker/protocol/test file before execution. Existing
core import restrictions and schema7 remain; no schema8 or migration is proposed.
Provider/native transport, product UI, general process containment and release
remain HOLD. New source and bounded worker execution are authorized only by the
later recorded decision, not by this proposal or model advice.
