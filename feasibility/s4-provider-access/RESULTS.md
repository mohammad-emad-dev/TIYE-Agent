# S4 provider access — first research cohort

Reviewed 2026-10-14. **S4 remains partial.** This cohort records primary
documentation and local version/help commands. It does not test login, inspect
credentials, approve account access or qualify production integration.

## Documented routes

| Route | Documentation finding | TIYE status |
|---|---|---|
| Codex | Subscription/API authentication, noninteractive CLI and SDK integration documented | Candidate A; applicability and native integration unreviewed |
| Unmodified Claude Code | User sign-in and scripted operation documented; product hosting has conditions | Candidate A; commercial conditions and approval integration open |
| Gemini CLI | Google login, API/Vertex and headless operation documented | Candidate A; orchestration scope open, command unavailable locally |
| OpenCode V2 | Provider-specific authentication methods | Underlying vendor/access method unresolved |

OpenAI recommends API-key authentication for programmatic workflows; its account
automation options have separate constraints. Sources: [authentication](https://learn.chatgpt.com/docs/auth),
[noninteractive execution](https://learn.chatgpt.com/docs/non-interactive-mode),
[SDK integration](https://learn.chatgpt.com/docs/codex-sdk).

Anthropic distinguishes running the unmodified binary with each user's own
authentication/billing from collecting or intermediating Claude.ai credentials.
The latter route is blocked here. Full commercial agreement and product-condition
review remains open. Sources: [authentication](https://code.claude.com/docs/en/authentication),
[headless operation](https://code.claude.com/docs/en/headless),
[product conditions](https://code.claude.com/docs/en/legal-and-compliance).

Google expressly restricts direct third-party access to CLI backing services
through Gemini CLI OAuth. That reuse route is blocked; official CLI orchestration
needs its own scope review. Sources: [authentication](https://geminicli.com/docs/get-started/authentication/),
[headless operation](https://geminicli.com/docs/cli/headless/),
[terms guidance](https://geminicli.com/docs/resources/tos-privacy/).

OpenCode's installed V2 uses CLI-managed SQLite credentials. Authentication
support does not establish underlying provider permission. No service environment
changes were made. Source: [V2 providers](https://dev.opencode.ai/v2/docs/cli/providers).

## Local observation

| CLI | Version command |
|---|---|
| Codex | 0.157.1 |
| Claude Code | 2.1.294 |
| OpenCode | 2.0.28 |
| MiMo | 0.1.15 |
| Agy | 1.3.5 |
| Gemini | Failed; separate PATH lookup also found no command |

Help markers are textual observations, not native feature qualification. Current
documentation may describe features newer than an installed binary. Agy is a
separate executable and supplies no Gemini CLI parity evidence.

The requested Atria/Muse/Agy aliases remain unresolved for actual vendor,
endpoint and access permission. Delegate model requests are separate review
activity and establish no S4 entitlement or free-tier guarantee.

## Next bounded step

Review exact product/account conditions for the proposed local orchestration
routes, then define native qualification cohorts for approved routes. Full
agreements, billing/pricing, third-party login/approval handling and native
authentication behavior remain open. S1–S3, S5 and S6 gates also remain open;
this research does not imply a completed application.

## Verification

Run `npm run check` in this directory. It verifies conservative route flags,
citations and sealed bytes, with regression checks against unsupported promotion.
These checks cannot establish legal applicability or independently verify web
content. The seal is a local integrity record, not an external attestation.

Muse completed its supplied-facts review; MiMo timed out and Claude failed with
quota 429. The authorized Agy fallback completed. Claude's read-only tripwire
flag corresponds to parent-created research files during its run; the recorded
structured events contain no tool calls. Agy has plain logs, so its zero observed
tool markers are not a complete structured tool audit. Reviewers received the
earlier supplied facts; the parent added the subsequently verified policy findings.

`evidence/cli-inventory.json` stores command results and output hashes, without
raw help/error text. `scripts/inventory-cli.js` reproduces that limited inventory
when explicitly invoked from the repository root; it overwrites the inventory,
so a new review/seal is required afterward. It executes only fixed version/help
commands, never authentication or configuration commands.
