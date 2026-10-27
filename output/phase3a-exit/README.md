# Phase 3A exit review

This review covers the exact offline API-adapter contract atb138d72 and accepted
implementation3b24e82. It introduces no provider, transport endpoint, credential,
tool, core-store binding or new construction scope.

Two source-bound failing runs reproduced unhandled async subscriber rejection
and cross-generation notification reordering. The fix catches Promise rejection,
serializes observer invocation, uses distinct subscription tokens, respects queued
unsubscribe and clears subscribers after terminal delivery. A fixed abort-throw
mode verifies conservative bounded stop when cancellation itself throws.

The final suite retains266 tests plus seven exit regressions. `decision.json`
records the bounded verdict, `MATRIX.md` maps the contract, and `verification.json`
records actual counts and hashes. `red-async-*` and `red-order-*` retain expected
failure evidence; raw streams remain local. `verify.py` checks source/compiled/
native hashes, approval, historical seals and the exit decision.

This closes only the approved scripted foundation. Real provider formats/HTTPS,
API agent loops, team tools, core integration, permissions, UI and release remain
unimplemented or unqualified by this scope. Async application work is not waited
on by protocol closure; notification invocation order is FIFO, Promise settlement
order is application-owned. Scripted local closure proves no remote cancellation.
