# Proposal review and disposition

Parent review only; no delegate relay was invoked — no delegation mechanism
is available in this session. This review covers the draft amendment and
contract against actual source, not a runtime execution.

Parent checked the proposed scope against actual Architecture 4.2/4.7/11.2,
engine-failure.ts, effects-store.ts, effects-model.ts, the existing
coordination read bridge (core-coordination.ts) and the Phase 3G exit
decision. The core exposes a Leader-visible `failures()` projection
independently from failure observation (`owner.observeFailure`) and from
scheduler start. The new `get_failures` read derives one detached immutable
result from one fresh replay-checked projection; it cannot create free-form
work, observe new failures, or authorize a later handoff, and it performs no
durable write. The proposal explicitly calls this a restricted visibility
subset rather than claiming supervision, takeover or succession.

Parent pinned the read to the exact `visibleFailures` semantics of
engine-failure.ts, required the bridge to validate the bound active
session/Leader within the same fresh projection, and required overflow to
refuse the read rather than truncate it. An accepted read describes knowledge
at read time; a later Stop or accepted handoff may change durable state
afterward. Local cleanup cannot fabricate or erase a durable notice. No
completed-session exception from any prior profile transfers to this read.

Docs Guard checked symbols and links, proposal versus exit wording, finite
bounds and exclusions. No production code or runtime test was changed. Tree
identity against 96e0016 is re-verified at seal time (empty `git diff`,
clean status); the 552-test proof is inherited from the sealed Phase 3G exit
verification, not re-executed for this proposal. Proposal verification checks
the accepted source inventory and proposal hashes. This establishes document
consistency only.

Architecture 11.2 and the Phase 3G exit decision require a new owner decision
for this newly reachable tool surface. The proposal grants no construction
permission and no provider/native integration or release admission.
