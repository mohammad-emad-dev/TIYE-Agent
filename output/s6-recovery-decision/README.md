# S6 recovery decision prototype

Implemented an offline recovery decision model, user-facing messages and an
explicit-export integration contract. It separates custody, terminal, receipt
and fixed-fixture copy claims from live authority and historical provenance.
It issues no export, release, deletion, retry or native execution commands.

The [decision contract](DECISION-CONTRACT.md) defines six recovery situations,
future per-export evidence requirements and the main/core/presentation boundary.
The [examples](examples.json) contain six synthetic decision scenarios and six
historical snapshots imported from the sealed inspector-interruption cohort.

The saved adapter first runs that cohort's existing source/artifact/schema
checker, then verifies the imported observation bytes against its manifest. Every
import remains historical with no live authority. Hash validity detects drift;
it does not authenticate a current process or provide signed provenance.

Five tests passed in normal and optimized host Python. They cover six distinct
next-step messages, 360 independent terminal/receipt/copy combinations,
contradictory authority claims, schema/permission injection and import of the
six sealed historical snapshots. No combination grants execution or cleanup.
The `current-bound` cases are synthetic model inputs, not a live runtime capture.

```powershell
rtk proxy python -B feasibility/s6-wsl/recovery-decision/check.py
rtk proxy python -O -B feasibility/s6-wsl/recovery-decision/check.py
```

The default verifies the saved examples, source/artifact/reference hashes and
prerequisite evidence. Add `--develop` to rerun the five offline tests and write
deterministic examples. No keeper, service, CLI candidate or provider request is
started by these checks. Prior sealed cohorts remain unchanged.

GPT-6 Luna and DeepSeek V4.1 Flash Free at max returned supplied-design reviews.
GLM-5.3-Flash Free at max timed out without findings. DeepSeek's relay result was
completed with a final report, while its background adapter reported a timeout;
both statuses are retained in the review record. The parent implemented and
reviewed the code; no external final-code audit is claimed.

This is not an application screen, exporter, authentication layer, persistence
implementation or admission change. The view model cannot verify live enum
claims; only the future trusted owner may supply them after runtime checks.
The exact historical missing-terminal incident remains unattributed.

Next: implement a bounded export-request manifest and single-use grant validator,
with no copy or release side effects, before qualifying the export executor.
Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH observation remain
separate pending work.
