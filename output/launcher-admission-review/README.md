# Launcher admission review — 17 October 2026

**Decision: HOLD. Native admission is not granted.** This dated review indexes
nine existing mock evidence cohorts and identifies five remaining requirements.
It does not qualify the native U0 path, approve privacy boundaries, launch a
process or change the product construction gate.

## What is established

| Evidence | Measured scope | Limit that remains |
| --- | --- | --- |
| [Original U0 launcher](../s4-codex-u0-launcher/README.md) | 13 Windows synthetic tests and a pinned candidate contract | Native launcher lacks the subsequent integrated lifecycle components |
| [Corrected Windows watchdog](../s4-codex-u0-watchdog-v2/README.md) | Creation-time Job Object assignment and six controlled cases | Windows accounting does not establish Linux cleanup |
| [Windows U0 supervision](../s4-codex-u0-supervised/README.md) | Six tests covering eight synthetic Windows cases | No native WSL path or admission |
| [Linux owner](../s6-linux-owner/README.md) | Four controlled orphan/adoption cases | Its owner must remain alive |
| [Linux Stop](../s6-linux-stop/README.md) | Three active-tree TERM/KILL cases | Component ownership and escalation only |
| [Linux service](../s6-linux-service/README.md) | Four manager lifecycle and invocation-refusal cases | Ordinary fixed tree, not hostile containment |
| [Managed transport](../s6-service-transport/README.md) | Three Linux mock protocol/lifecycle cases | Protocol bytes stay inside Linux; corrected stdin closure is only in this newer source cohort |
| [Live protocol interruption](../s6-service-inflight/README.md) | Four Stop/crash cases with an independently live protocol child | No final protocol outcome inferred after worker death |
| [Windows/WSL owner failure](../s6-cross-owner/README.md) | Two Windows crash cases with independent Linux cleanup observations | Receipt-driven lease; no normal Stop, native stream forwarding or general lease guarantee |

These are separate, overlapping fixtures. Their test/case counts are provenance,
not an additive measure of product completion. The parent ran all nine existing
offline evidence checkers during this review; no new native experiment was run.
The failed first watchdog capture and development race diagnostics remain in
their original cohorts.

## Remaining requirements

| ID | Status | Required next evidence |
| --- | --- | --- |
| L1 | Partial | One frozen launcher combines Windows supervision, Linux lifecycle/lease, actual protocol forwarding and compatible startup/work/cleanup budgets |
| L2 | Partial; depends on L1 | Normal Stop and uncertain-failure observations through that identical launcher, with persistent one-attempt/refusal behavior |
| P1 | Open; depends on L1 | Exact-source ambient credential, filesystem, socket and network access review; distinguish enforced limits from unresolved reach |
| P2 | Open; depends on L1 | Effective capture permissions and field-level private/raw versus public/derived evidence review |
| A1 | Blocked by all four | Separate explicit source-bound U0 admission, with frozen binary/input/budgets and attempt limits |

The machine-readable [readiness ledger](readiness.json) contains acceptance
criteria and dependencies. [Capture privacy](CAPTURE-PRIVACY.md) lists the review
surfaces and publication contract. [Next implementation step](NEXT-STEP.md)
defines a bounded L1 mock integration deliverable.

## Why another component pass cannot admit U0

The original native U0 entry point still launches its old worker/transport; it
does not consume the later Job Object, Linux service and lease integration as
one tested path. Its Linux stdin-abort compatibility defect was corrected in a
new mock cohort, not retroactively in that native candidate. Historical source
hashes remain unchanged.

The newest service uses null service stdout/stderr, a protocol pipe internal to
Linux, an eight-second RuntimeMaxSec and fixed fixture lifetimes. The prepared
native protocol allows longer startup and a 90-second overall U0 cohort. Those
budgets are not interchangeable. Changing the binary alone cannot turn this
fixture into an admitted native launcher.

Fresh HOME/CODEX_HOME, an environment allowlist and a cgroup lifecycle boundary
do not prove ambient authentication is absent or establish filesystem/network
isolation. Git exclusion does not establish Windows ACL protection. Both reviews
must refer to the same L1 artifact; neither has been completed here.

The repository records an OpenAI inquiry receipt, not substantive route
eligibility. That historical administrative fact is not an admission input.
Authenticated work still requires its applicable provider route. Local transport-
only U0 does not require product-route eligibility, but does require its own
reviewed runtime and capture boundary. This task performs no new policy lookup.

## Verify this review

From the repository root:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/launcher-admission-review/check.py
```

The checker reads local files only. It validates the review schema, HOLD state,
references, recorded result counts and raw-byte source/artifact hashes, then
compares a sealed [index](index.json). It does not import or rerun the fixture
modules, independently re-evaluate every per-case observation, prove provenance
authenticity or grant execution permission. Each cohort retains its own stronger
behavior-specific checker. `--seal` writes a new index exclusively; it cannot
overwrite an existing seal and is not an admission operation.

[Six regression tests](tests.log) exercise state-promotion refusal, reference
redirection/path escape, changed source bytes, duplicate JSON decisions and
result files missing from their hash manifest.
They pass under both normal and optimized Python; validation uses explicit
exceptions rather than assertions. This is integrity/decision-parser evidence,
not runtime qualification. [Delegate provenance](review.json) distinguishes
initial source generation, supplied-context review and final parent verification.

The index is a local consistency seal. An operator who edits both the code and
index can replace it; it is not a signature or an authorization mechanism. The
review JSON has a different scope and omits the legacy launcher's required review
booleans. No native admission file or approval record is issued by this task.
