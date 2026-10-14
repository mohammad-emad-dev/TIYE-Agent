# S4 account and product conditions supplement

Reviewed 14 October 2026. Public conditions have been recorded for proposed
routes. Account applicability, native authentication and release qualification
remain pending. The first research cohort remains preserved at commit `6002573`.

## Decisions for TIYE

| Route | Engineering decision | Remaining prerequisite |
|---|---|---|
| Codex | Separate subscription, API and Enterprise automation adapters | Account/product-policy mapping and exact native behavior |
| Claude Code | Preserve the published binary, auth choices and per-user billing | Applicable commercial conditions and approval integration |
| Gemini | Separate CLI orchestration, Developer API and Vertex | CLI scope clarification, account edition and native installation |
| OpenCode | Declare underlying provider/access method per route | Non-secret identity declaration and provider-specific sources |

These are design decisions inferred from the recorded sources. They grant no
entitlement, account acceptance or model availability. Timezone does not prove
residence; delegate aliases do not identify service vendors.

### Source conditions

OpenAI's [Services Agreement, 2.2](https://openai.com/policies/services-agreement/)
describes API application integration. [Codex authentication](https://learn.chatgpt.com/docs/auth)
documents a separate CLI account model. The [ROW](https://openai.com/policies/row-terms-of-use/)
and [Europe](https://openai.com/policies/terms-of-use/) consumer terms need regional
applicability mapping. Their extraction restrictions should not be silently
treated as either permission or a universal ban on official Codex workflows.
[Service terms](https://openai.com/policies/service-terms/) also affect generated code licenses.

Anthropic's [product conditions](https://code.claude.com/docs/en/legal-and-compliance)
define a conditional unmodified-CLI route. [Commercial terms A/D](https://www.anthropic.com/legal/commercial-terms)
and [consumer terms 3.7](https://www.anthropic.com/legal/consumer-terms) must be read
with that route. TIYE has not established an applicable accepted agreement.

Google's [CLI route guidance](https://geminicli.com/docs/resources/tos-privacy/)
and [Code Assist index](https://developers.google.com/gemini-code-assist/resources/privacy-notices)
select agreements by account edition. [General terms](https://policies.google.com/terms),
[Google One](https://one.google.com/terms-of-service) and [Cloud terms](https://cloud.google.com/terms)
do not establish blanket wrapper permission. [API conditions](https://ai.google.dev/gemini-api/terms)
require separate age/region, paid/unpaid data and confirmation handling. These
conditions cannot be assigned to Muse or Agy from a model name alone.

## Native qualification plan

1. Implement a local boundary fixture with fake CLI responses, owned synthetic
   files and no model requests. Verify prerequisite gating, sanitized evidence,
   failure categories and selective cleanup. This fixture is **planned**, not run.
2. For a proposed live route, record exact executable/version/model, a non-secret
   account/access-method declaration, applicable agreements/regions, reviewed
   policy scope and approval boundary. Keep auth in the official user-controlled
   tool; do not collect credential files or tokens.
3. Once prerequisites and authorization exist, run one public synthetic task in
   an owned disposable workspace. Bind completion to the request/process and
   record sanitized outcome and cleanup. Quota, auth or unsupported-model errors
   are failure/unavailable evidence. Agy does not qualify Gemini CLI.

The plan itself authorizes no live request. The existing user-authorized delegate
reviews are separate work. Incorporated usage/privacy/service policies, account
contracts, billing and exact product scope still require route-specific review;
this cohort does not claim an exhaustive legal assessment.

## Check and evidence

Run `npm run check` from this directory, and the existing S4 root check separately.
The checks verify citations, prerequisite completeness, conservative flags and
sealed bytes. They do not establish policy truth or account entitlement.
`review.json` contains dated paraphrases, not copied agreements. `seal.json`
records integrity and delegate review outcomes; it is not an external attestation.

Muse and the authorized Agy fallback completed supplied-facts reviews. MiMo
timed out; Claude failed with quota 429. Read-only tripwire changes correspond
to parent edits made during review and are recorded in the seal. Structured
delegate streams had no tool events; Agy's plain-log marker inspection has less
coverage. The parent checked the sources and implemented the supplement.

The review does not require a separately negotiated bilateral contract merely
because one delegate proposed it. Applicable agreement acceptance remains an
unresolved account fact. API-key workflow guidance comes from Codex auth docs;
Services Agreement 2.2 addresses API application integration separately.

Revisit the mapping when a provider changes terms, binary, authentication method,
account edition, region, distribution model or billing route.
