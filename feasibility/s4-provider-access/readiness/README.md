# S4 route declaration readiness

This preparatory package validates non-secret declaration syntax and returns
what remains pending before a native cohort. It never starts a provider CLI or
reads account configuration, credentials or authentication status. Earlier S4
research and fixture artifacts are unchanged.

## Input and output

`npm run assess` reads one JSON object from stdin, bounded to 4096 bytes. The
only accepted fields are `routeId`, `cli`, `modelId`, `providerId`, `authMethod`,
`accountPlan` and `accountCountry`; each must be a string of at most 160 characters.
Extra fields, arrays, nested values and nonstandard inherited/accessor shapes
are refused. Do not submit keys, tokens or personal account identifiers.

Use an exact route ID from [the recorded inventory](../routes.json). Provider and
model identities must use an explicit namespace, such as the public synthetic
`openai/synthetic-model`. That declaration identity is not necessarily the
argument a native CLI accepts; installed-native mapping remains open. Country
format is two uppercase letters; syntax alone does not validate a real country,
residence or regional service availability. No account details are inferred from
timezone or delegate aliases.

Auth-method matching reflects the previously recorded route categories. It
does not discover the active CLI's method or validate vendor permission.
OpenCode remains dependent on a separately reviewed underlying provider.

Missing values return `awaiting-account-declaration`; malformed or incompatible
input returns `not-run` and a fixed category. Even a complete declaration returns
`awaiting-policy-and-native-qualification`, with `liveEligible`, `fullS4Qualified`
and `productionEligible` false. A process exit of zero means assessment completed,
including pending results; it does not mean a provider test passed.

Outputs retain fixed categories, missing field names and a recognized route ID
where applicable. Model/account/region values and rejected input are not echoed
or stored. This is output projection, not a universal secret detector. The CLI's
input remains in its memory during assessment; this is not a secure secret store.

## Verification

Run `npm run check` in this directory. Twenty-five tests cover field omissions,
alias/block refusal, route/vendor/auth mismatch, unwanted fields, getters and
actual stdin CLI behavior. `evidence.json` records six public synthetic child
assessments with source hashes. No declaration body is retained in that evidence.

`npm run probe` records that measurement once and refuses to overwrite existing
evidence. The root S4, conditions and boundary packages have separate checks.
The probe invokes only this local readiness CLI through Node, with no provider
requests. Delegated model reviews are separate user-authorized calls.

## Current native status

The requested non-secret operator declaration has not been supplied in this
cohort. It remains pending. Public policy applicability and native authentication
remain unqualified even after a declaration is supplied; this assessment issues
no policy approval or request authorization. S4 remains partial.

Next, bind one supplied route to the account/product policy review, then prepare
its exact installed-native qualification task. Keep login in official
user-controlled tools and retain only sanitized, correlated task evidence.

Delegate outcomes and measured byte integrity are recorded in `review-seal.json`.
The parent owns implementation, tests and GitHub synchronization. This is a
feasibility component; it is not the completed application or native adapter.
Muse and Agy completed supplied-design reviews. MiMo timed out; Claude failed
with quota 429. Read-only tripwire changes correspond to concurrent parent edits.
Structured streams contain no tool events; Agy's plain-log audit has narrower
coverage. The parent retained the 4096-byte limit and existing output schema
rather than adopting Agy's proposed larger limit and renamed fields.
