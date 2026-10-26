# Phase 2D exit review

27 October 2026. The approved internal failure-observation contract atf4ef14f is
accepted within its bounded synthetic test environment. Production source remains
unchanged from233e723. See MATRIX.md and decision.json for requirements and limits.

All158 tests passed:157 retained plus one integration case with both stop orders.
Build and import-boundary checks passed. The new case proves that confirmed and
abandoned effects after stop both close their failed tasks failed, with no member
result fabricated. Closing one leaves the other reserved. Fresh SQLite event reads
verify actual notice opening/closing sequence bindings; reopen and exact retries
leave state and independent witness counts unchanged. Preflight binds source/test,
compiled bytes, measured runtime and installed native files before execution.
Raw TAP remains local; verification.json contains safe digests and counts.

GPT-6 Luna max, Flint40B Free and DeepSeek V4.1 Flash Free max each timed out after
60 seconds without a verdict. None counts as a pass. Each reviewed supplied module
text only; reported working-tree entries predated dispatch. Parent review covered
actual module/store/replay/stop/recovery integration and tests. Historical evidence
and the delegated owner's exact scope response remain intact at qualifying commits.

Phase2D construction permission ends at this exit. Next is a concrete bounded
proposal and its applicable scope decision before new construction. Live failure
detection, automatic takeover/Leader succession, UI, providers/terminals/network/MCP
and release remain outstanding. No migration/reset, hostile in-process isolation,
whole-host/power-loss, throughput or Electron/WSL ABI qualification is claimed.

Verify: `rtk proxy python -X utf8 -B output/phase2d-exit/verify.py`.
