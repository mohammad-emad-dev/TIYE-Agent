# Construction entry review — 23 October 2026

**Current decision: full Phase 1 HOLD. Recommended next action: approve only the
bounded internal Phase 1A amendment, then start product core implementation.**

This review changes the immediate work recommendation from another automatic
native/export fixture to a concrete construction decision. No product core is
implemented here. The [proposed amendment](AMENDMENT.md) is complete and awaits
the project owner's explicit approval because Architecture 11.2 and the existing
Phase 0 entry conditions require a separate decision for any construction-scope
exception. A model review or a passing evidence checker cannot supply that approval.

The product still ships complete. This proposal defines an internal milestone,
not a reduced public release. The [first-core contract](CORE-SLICE.md) specifies
transactional command/event storage and replay first, followed by a separately
reviewed mock effect lifecycle. After approval, the next task is **1A product code**,
not another broad feasibility measurement series.

## Evidence and remaining dependencies

Reviewed through baseline commit `d675ed6`. The six S-gates remain partial against
their full requirements. The rows below are a dated interpretation of the cited
records, not fresh runtime qualification or an exhaustive retest of every cohort.
Historical records and source hashes remain unchanged.

| Gate | Established within saved scope | Open dependency and next required decision | Needed for internal 1A? |
| --- | --- | --- | --- |
| S1 terminal/lifecycle | Mock terminal, lifecycle and ownership prototypes; narrow native OpenCode startup/Unicode observations | Engineering lead qualifies chosen CLI terminal parity, real interaction/display and relevant abnormal ownership before native terminal integration | No terminal exists in 1A; sequencing exception needs approval |
| S2 control | Bounded OpenCode 2.0.28 control, permissions, input suspension and saved-grant observations; saved offline assertions | Engineering lead defines supported version/capability matrix and native error/resume behavior before connecting real adapters; product approval integration follows core construction | 1A accepts only local commands; native control is absent |
| S3 worktrees | Twelve cohorts with all seven requirement rows still partial | Engineering lead qualifies representative setup, attribution, authenticated pushes and interrupted merge/rollback before real project/Git integration; owner reviews meaningful external actions | 1A touches only owned test databases |
| S4 provider route | Authorized inquiry form receipt; no TIYE-specific substantive reply available in the reviewed repository | Owner supplies any received guidance; engineering lead evaluates the exact supported route before any provider integration. Assume no qualified route until then | No provider requests or credentials in 1A |
| S5 performance | Hour/feed/search/resource/renderer prototypes and final two-capture latency comparison; older failures preserved | Engineering lead defines explicit memory/settling/platform acceptance and remediation before terminal/UI adoption. The closed latency series does not restart automatically | Core storage/replay has its own tests; no terminal/backend selection follows |
| S6 WSL | Distribution/path/mock PTY/interop and many separately sealed ownership/privacy/custody components; latest owner handler passes 15 live tests in normal/O modes | Engineering lead integrates and qualifies one source-bound supervised keeper/candidate composition, plus remaining CLI/path cases, before WSL/native integration | Initial core target is Windows Node; WSL compatibility is not claimed |

S6 step 2's historical “candidate absent” finding is superseded within its narrow
scope by the pinned Codex installation/version/help evidence. Provider behavior,
access eligibility and full native discovery remain unqualified. The S4 inquiry
is submitted, superseding earlier unsent wording. No inbox was inspected or
official-provider eligibility refreshed by this task; historical research is not
presented as a current permission decision.

Current native gates remain L1/L2 PARTIAL, P1/P2 OPEN and A1 BLOCKED. C0 effective
configuration and final-PATH observation remain pending. Successful export-grant,
preparation and owner components are separate source sets, not one passing final
keeper or an authorized export executor. No human consent, copy or release is
enabled. None of these native admission gates is changed by the proposal.

The engineering lead owns each evidence task and schedules it before its actual
dependent integration. The project owner approves architecture/scope decisions
and external account applicability. No calendar completion date is invented;
these are explicit dependency triggers. A newly discovered dependency of the
isolated core must be demonstrated and recorded rather than inferred from an
unrelated open gate.

## Verification and reviews

[Verification](verification.json) records the exact saved-evidence/typecheck/test
commands rerun by this review and their observed exits. They do not rerun the
historical terminal, provider, performance or WSL experiments. Source/reference
hashes detect drift without signed provenance. A verifier checks this proposal's
closed HOLD/pending scope and the recorded hashes:

```powershell
rtk proxy python -B output/phase1-entry-review/verify.py
rtk proxy python -O -B output/phase1-entry-review/verify.py
```

GPT-6 Luna max, Flint 40B Free and DeepSeek V4.1 Flash Free max all completed
supplied-context reviews. They had the summarized evidence and proposal, not an
independent workspace audit. Their accepted findings and scoped dispositions are
recorded in [review metadata](review.json). The parent verified the actual source
documents, preserved distinctions between cohorts and reviewed this final contract.

The earlier 25% estimate is an engineering estimate of the whole product, not a
measured readiness score. No completion percentage is generated here. Product
core, event store, team engine, finished interface and packaged product remain
unimplemented.

**Immediate owner decision:** approve the explicit internal Phase 1A exception,
or retain the existing full construction gate. If approved, record the decision,
apply the amendment and begin 1A against the contract. The proposal does not
self-activate merely because it was verified, committed or pushed.
