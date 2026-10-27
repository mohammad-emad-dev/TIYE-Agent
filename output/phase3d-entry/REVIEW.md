# Proposal review and disposition

The requested Codex and OpenCode delegate skills ran read-only with the proposed
contract and existing core question eligibility/visibility rules embedded. No
implementation, commands, native tests or commits were authorized for delegates.

Luna/max identified the need to reserve room for the post-answer continuation.
Parent adopted an explicit rule: before any ask write, reserve an unused request
slot for the answer/rejection continuation and refuse locally if unavailable.
This reservation is capacity, not a dispatched request. The final contract is
parent-reviewed; Luna's comment applies to the earlier draft, not a blanket
approval of later revisions. Flint timed out at 30 seconds and DeepSeek/max at
60 seconds without reports. No verdict is attributed to either. review.json
records exact statuses, reports and local raw-result hashes.

Parent also added unique resume IDs so a duplicate can be refused while a later
distinct explicit read remains possible after still_waiting. Question-profile
controller checks are capped at ten, accounting for three admissions, two tool
attempts, four answer reads and final acceptance; old profiles retain eight.
The stable waiting state owns bounded in-memory data with no I/O or request
timer. Stop/dispose must settle the run before store/root cleanup.

Parent compared actor/recipient/answer rules with engine-question.ts. Core ask
and answer eligibility remain authoritative; no model-selectable actor/recipient
or automatic answer is added. Accepted asks retain task occupancy, read results
are confined to the author's one question, and thrown writes remain uncertain
without re-ask or fabricated receipt. Actual answer delivery remains distinct
from task completion and requires a separate admitted implementation.

The accepted Phase3C offline verifier was rerun, with production/source inventory
and historical seals unchanged. Engine tests were not rerun for this proposal.
Proposal artifact hashes, baseline inventory and local links are checked by
verify.py. These checks qualify proposal consistency only, not runtime behavior,
new construction permission or provider/release readiness.
