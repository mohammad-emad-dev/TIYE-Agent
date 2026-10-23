# S6 bounded export requests and one-shot synthetic grants

Implemented a strict request manifest and process-local grant validator. A
recognized grant is claimed atomically before attempted-use validation, so
malformed input, drift and expiry cannot preserve it for replay. Wrong secrets
cannot burn another grant. The validated result still contains no commands and
does not permit export execution or cleanup.

The [request contract](REQUEST-CONTRACT.md) specifies selection bounds, canonical
review hashing, session/source/destination binding and the one-shot lifecycle.
[Examples](examples.json) use only synthetic names and identity values and contain
no grant identifiers or secrets.

Eleven tests passed in normal and optimized host Python. Coverage includes:

- Exact reviewed consumption and duplicate-use refusal
- Canonical hashing and changed selections
- Wrong-secret refusal without denial of the valid grant
- Burn after malformed input, request mutation, binding drift and expiry
- Monotonic-clock regression and invalid clock observations
- Eight simultaneous consumers yielding exactly one validated plan
- No restored grants after serialization/restart, and registry lifetime limits
- Escaping/ambiguous paths, aliases, unsupported entries, schemas and byte limits

These are offline behavior tests. Clock injection is limited to the clock system
boundary; cryptographic randomness, locking and concurrent consumers are real.
No selected files are opened, hashed, created, copied or deleted, and no provider
or native CLI request occurs. Files written by the checks are the project evidence
artifacts and local test reports.

```powershell
rtk proxy python -B feasibility/s6-wsl/export-grant/check.py
rtk proxy python -O -B feasibility/s6-wsl/export-grant/check.py
```

The default verifies deterministic examples and source/artifact/reference hashes.
Add `--develop` to run the eleven tests and regenerate examples. Existing sealed
cohorts and their evidence remain unchanged. Hashes detect drift without signed
provenance; the stated bounds are not filesystem or process-memory quotas.

GPT-6 Luna, GLM-5.3-Flash Free and DeepSeek V4.1 Flash Free, all at max, completed
supplied-design reviews. Atomic recognition/claim, secret verification and
immutable request binding were incorporated. Binding validation remains after
claim deliberately: requiring a matching caller binding first would keep a
recognized drifted grant reusable. Same-request reissuance is blocked by its
nonce for the registry lifetime. The parent implemented and reviewed the code;
these model reviews do not constitute final-code audits.

Human consent, live descriptor authentication, filesystem permissions, writer
stop verification, actual copy/readback and persistent approval handling remain
unimplemented. A valid-looking manifest or `Binding` object is not proof of live
authority. The scope is explicitly synthetic and every result disables export.

Next: build the trusted-owner preparation adapter that produces a request from a
bounded, descriptor-verified inventory and destination, before any copy executor
is connected. Native execution/admission remain disabled. L1/L2 remain PARTIAL,
P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH
observation remain separate pending work.
