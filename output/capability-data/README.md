# Capability data — draft real-CLI entries

**Date:** 2026-11-10
**Status:** **DRAFT feasibility data — not promoted.**
All entries are `productionEligible: false` with `promotion: "HOLD"`. They
record what the bounded real-CLI cohorts observed, not a runtime adapter
registry, provider permission or release approval.

## Files

| File | CLI | Status | Basis |
|---|---|---|---|
| [codex.json](codex.json) | Codex CLI | Partial | S1 Windows 0.164.0; S2 bounded scenarios; S6 WSL partial (0.157.1) |
| [claude-code.json](claude-code.json) | Claude Code | Display-only | S1 Windows 2.1.321 only |
| [opencode.json](opencode.json) | OpenCode | Blocked | S1 Windows 2.2.5 (paste/Unicode fail, teardown inconclusive); prior 2.0.28 permission evidence |
| [gemini-cli.json](gemini-cli.json) | Gemini CLI | Not tested | Command absent; installation refused by cohort rules |

## Field rules

- Short JSON files follow the C3 template in
  `architecture/TIYE-Agent-Feasibility-Test-Plan.md`: `id`, `displayName`,
  `testedVersions`, `detection`, `environments`, `launch`, `teamTools`,
  `resume`, `approvals`, `errors`, `login`.
- Additional `qualification`, `evidence` and `asOf` fields are draft metadata,
  not architecture fields. Do not consume them in a runtime adapter.
- `null` means **not established**, never “supported with a default”.
- `login.class` A–D is only assigned where S4 has a recorded decision. Codex is
  class A **by owner exception, verbal-only, not evidence-qualified**; the other
  entries have no class.
- `testedVersions` is proven only by the installed `--version` launch probe.
  TUI first-semver lines are not proof.

## Non-claims

- No entry is a supported member.
- No capability data is signed or shippable as a data update.
- No provider integration, login member, API member or release is admitted.
- OpenCode 2.2.5 was observed with an active updater and five failed plugins;
  its results are host-state-specific.
- S2 was executed only for Codex because the other S4 routes remain unqualified.
- Gemini was not installed and therefore has no results.
