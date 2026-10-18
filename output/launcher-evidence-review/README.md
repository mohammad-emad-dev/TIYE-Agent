# Launcher evidence reconciliation

18 October 2026. **Review only — HOLD.** This dated assessment preserves the
[historical admission review](../launcher-admission-review/README.md) and the
three subsequent unified cohorts. It grants no execution permission. No native
CLI, authentication, inference, process fixture or privacy probe was run for
this assessment. Delegated development review is recorded separately.

## Where the launcher stands

| Requirement | Status | Credited evidence | What remains |
| --- | --- | --- | --- |
| L1 — one reviewed launcher | Partial | Actual Windows/WSL/service forwarding, strict response refusal, ownership and mock-sized deadline profiles | Consolidate regressions on one final source set and integrate preparation guards for candidate path/digest/argv |
| L2 — interruption and one attempt | Partial | Pending Stop, initialized owner/transport loss, synthetic pending writes, independent cleanup witnesses and same-path restart refusal | Demonstrate the relevant cases together on that identical source set; retain unknown outcomes and fixed prepared-path refusal |
| P1 — ambient access | Open | Environment allowlists and fresh private runtime roots are documented | Review the final executable, identity, environments and accessible filesystem/credential/helper/keyring/socket/network surfaces without reading secrets |
| P2 — capture and publication | Open | Synthetic public captures and a native capture-review plan exist | Review effective ACLs/modes and private raw retention, inspection and safe derivative publication for the exact final paths |
| A1 — native admission | Blocked | All three unified captures record zero native runs and admission false | Separate source/binary/input-bound admission after L1/L2/P1/P2 are reviewed |

Full product reconnect/recovery is not a prerequisite for a bounded transport-only
U0 experiment. The prepared attempt path must stay fixed and unknown attempts
must not be automatically retried. The current local journal is not a production
database or a global guarantee against changing directories.

## Sixteen saved tests span three artifacts

| Cohort | Saved tests | Distinct contribution |
| --- | ---: | --- |
| [Unified forwarding](../s6-unified-mock/README.md) | 4 | Clean valid completion, foreign response refusal, invalid UTF-8 preservation/refusal, native flag refusal |
| [Unified lifecycle](../s6-unified-lifecycle/README.md) | 6 | Pending Stop, initialized loss, restart fence, partial-file refusal and callback-failure regression |
| [Synthetic pressure](../s6-unified-write-pressure/README.md) | 6 | Pending drain during Stop/owner/transport loss and persisted third-write uncertainty |

These are 16 historical test executions across separate captures, with repeated
cases. They are not 16 new tests run today, a completion percentage or a combined
pass for one final launcher. Today's [verification log](verification.log) records
the four **offline** checker commands; it does not rerun the integration fixtures.

The [source comparison](source-comparison.json) derives hashes from each frozen
manifest using repository-relative provenance. Whole-source identities use sorted
basename/digest inventories, removing directory names from the comparison. The
three resulting source-set digests differ. Eight helper files are byte-identical
across all three inventories; that does not make the complete artifacts or their
runtime configurations identical. Host, transport, peer, observers, profiles and
test/validation paths have changed. The latest pressure artifact has no recorded
clean-completion, foreign-ID or invalid-raw case on its own source set.

The pressure cohort exercises an 8 MiB synthetic write outside the 16 KiB input
encoder. Its pending drain and local queue samples qualify plumbing behavior,
not native frame pressure, delivery or throughput. Native-profile pressure is an
explicit coverage limit, not an automatic requirement to flood a transport-only
handshake. Scope must be assessed against the eventual prepared U0 contract.

All three captures retain an identical, unexecuted future candidate reference
from the earlier installation record. This review verifies that reference's
integrity and consistency with the saved installation. It does not rehash the
live Linux binary, run it, or integrate its execution guard into the mock path.
The older prepared native worker has path/digest checks but belongs to a different
source set and cannot supply admission to this launcher.

## What the checks establish

The [readiness ledger](readiness.json) is bound to all three manifests, cases,
results and profiles. The new checker also verifies the historical review's
index and referenced evidence. It hashes this review's source, report, ledger,
comparison, provenance and logs into an exclusive [index](index.json).

The index is local integrity bookkeeping, not a signature, ACL, privacy approval
or launch capability. A successful checker exit means the saved review still
matches its inputs. It cannot close requirements, grant native admission or
turn separate source sets into a same-artifact pass. Changing the report or a
referenced file after sealing fails verification; resealing in place is refused.
The index does not hash itself, avoiding a circular self-hash.

Three new [regression tests](tests.log) exercise accidental promotion of execution
or coverage flags, changes to requirement states/dependencies, source/case swaps,
extra admission fields, corrupted files and escaping references. They use actual
temporary files and ledger copies, with no mocked checker internals.

The underlying cohort validators remain authoritative for their own detailed
observations. This review checks their frozen inputs and recorded results; it
does not independently reimplement every process/protocol assertion. Unit
garbage collection remains unavailable terminal metadata, not Result=success.

## Next implementation

[NEXT-STEP.md](NEXT-STEP.md) specifies one bounded consolidation of the existing
mock regressions on one frozen source tree. It includes preparation guards for
future candidate identity while retaining native refusal. P1/P2 then review that
exact artifact and the capture locations. A1 is a separate later decision.

To verify this saved review from the project root without starting WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/launcher-evidence-review/check.py
```

The checker exposes no execution or admission option. Its `--seal` option creates
only a new exclusive local integrity index and never changes HOLD. Historical
measured source/evidence and the earlier ledger remain unchanged.

[Delegation and guard provenance](review.json) records model requests, actual
completion, parent dispositions and limits. No provider eligibility or current
legal-policy conclusion was sought or inferred in this technical review.
