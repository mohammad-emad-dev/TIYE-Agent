# S4 offline boundary fixture

This is an executable feasibility fixture, separate from the application and
native provider adapters. It launches only the fixed `fake-cli.js` through the
current Node executable. No provider CLI, credentials, configuration or model
request is involved in the fixture. Delegated reviews are separate model calls.

## Verified behavior

- Every missing declared prerequisite prevents fake execution. Exact route IDs
  come from the preserved S4 inventory; blocked reuse routes and unknown aliases
  are refused. Complete declarations allow only a fake task. Live mode is refused.
- Seven real local child executions distinguish success, auth, quota, unsupported
  model, invalid JSON, mismatched request identity and nonzero exit.
- Retained outcomes contain only fixed state/category enums and numeric exit
  codes. Arbitrary raw text, synthetic tokens, prompts and account fields are
  discarded. This is output allowlisting, not a general-purpose secret detector.
- Cleanup requires an in-memory owned handle, unchanged marker and canonical
  root, no active child and exact contents. Foreign handles, changed markers,
  hardlinked markers and unexpected files are refused. Sibling marker bytes are
  preserved. Removal uses exact unlink/rmdir operations, never a recursive tree
  deletion. The child has a bounded timeout affecting only its owned process.

The Windows probe passed seven scenarios and nine missing-prerequisite checks.
`evidence.json` binds measured sources and prior research bytes. **S4 remains
partial:** fake success establishes no access rights or native authentication.

## Run

From this directory:

```text
npm run check
```

`npm run probe` captures the fake-only measurement and refuses to overwrite an
existing `evidence.json`. A new measurement requires a separately reviewed
artifact, rather than replacing preserved evidence.

The sibling S4 root and `conditions` packages retain their independent checks.
The new fixture adds 28 tests and introduces no dependencies.

## Limits and next step

Prerequisite declarations are simulated input. This fixture cannot verify
account agreements, identity, permission UI or provider policy. It is not an OS
sandbox and does not address hostile concurrent filesystem replacement, durable
ownership across process restarts, or descendant-process supervision. No public
API accepts an executable, credential path or PID. Owned handles are process-local.

Next, select one actual access route using a non-secret account/access-method
declaration and resolve its policy scope. Then define the exact native cohort
with public synthetic input, official user-controlled authentication, request
correlation, sanitized evidence and owned cleanup. The existing research plan
does not itself grant authorization or entitlement for that live request.

Muse supplied a design review. MiMo/Claude/fallback outcomes are recorded in
`review-seal.json`; the parent implemented and verified this fixture. The seal
is local integrity evidence, not independent certification.
MiMo timed out and Claude hit quota 429; Agy completed the authorized fallback.
Read-only tripwire changes match concurrent parent edits. Structured review
streams contain no tool events; Agy's plain-log inspection has narrower coverage.
The parent kept the narrower retained-output schema rather than Agy's suggested
request-ID/status fields. Checks are Node tests and source/evidence validation;
the review's proposed lint/dependency-audit claims were not adopted.
