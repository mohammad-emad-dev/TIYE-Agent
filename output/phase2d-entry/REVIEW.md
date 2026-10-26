# Proposal review

26 October 2026. Parent reviewed the proposed transition table against current
engine-inbox, engine-lifecycle, engine-stop, resolution and question budgets.
No implementation or new tests have executed. This is a pending construction scope.

## Budget check

An illustrative worst-case admitted assignment follows this sequence. Counts
describe held assignment units, not runtime results or measured test evidence.

| Accepted step | Remaining assignment units |
| --- | --- |
| Enqueue | 8 |
| Start | 7 |
| Approve | 6 |
| Claim | 5 |
| One recovery acknowledgement | 4 |
| Uncertain settlement | 3 |
| One failure observation, preserving existing attention sequence | 2 |
| One accepted resolution, then release unused unit on failed closure | 0 |

Question traffic has separate held units; failure cancels only the affected task's
question and releases those units without spending assignment reserve. Stop uses
the global terminal slot. A failure before settlement moves dispatching to attention,
so no later settlement/recovery phase can consume another assignment unit.
Immediate failure closure releases unused units. Exact retries spend none;
rejections use only unreserved space. Implementation must independently prove
these paths against actual replay and capacity fixtures before execution.

The observation is not a fabricated member result: assignment.result remains null,
and a failure record explains why the closed task is failed. Pending uncertainty
still blocks report/claim/settle bypasses. Existing explicit resolution closes it
failed atomically regardless of whether the effect proves completed or abandoned.
No successful mission can include that task. Task-scoped failure neither revokes
the member nor implements Leader succession. Existing FIFO may progress only via
the trusted scheduler after closure; no automatic reassignment is promised.

## Requested model reviews

GPT-6 Luna max, Flint40B Free and DeepSeek V4.1 Flash Free max each timed out at
60 seconds without a verdict. None counts as a pass, agreement or implementation
review. Each received the supplied proposal contract; that contract stayed unchanged.
Reports list the already-created untracked output/phase2d-entry directory, not
attributed delegate edits. Summaries/digests remain in review.json; raw relay
artifacts remain local. Parent review owns the proposed design and its limits.

The next action is the owner's decision on the frozen amendment/contract. Approval
does not close provider/native integration or release gates and does not authorize
new process detectors, transports, takeover or other excluded behavior.
