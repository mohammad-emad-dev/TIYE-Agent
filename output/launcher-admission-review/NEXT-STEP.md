# Next implementation: one source-bound mock launcher

Deliver L1 as one new immutable source/evidence cohort. Native execution remains
disabled throughout that implementation. Use the existing components as evidence
and implementation inputs; preserve their measured sources and failure records.

## Required behavior

1. Own the Windows launcher under the corrected Job Object supervisor and place
   the Linux worker/descendants under the measured service-manager lifecycle.
2. Forward actual protocol bytes across the Windows/WSL boundary. Keep the
   ownership heartbeat/control channel separate from app-server protocol input;
   never send lease packets to the protocol peer.
3. Use one reviewed source set for framing, Linux pipe closure, direct-child
   reaping, service identity and independent tree observations. Include every
   helper in the manifest and keep process outcome separate from protocol outcome.
4. Freeze compatible host-startup, Linux initialization, work, lease and cleanup
   bounds from the prepared U0 contract. Reconcile the short mock service/runtime
   limits with that contract explicitly; do not copy the eight-second profile
   into a longer native protocol. A changed bound requires its own evidence.
5. Keep the real binary path and digest as a future reviewed input. During this
   cohort admit only the fixed mock peer; the default and explicit native request
   paths must refuse execution. No auth, model, task or provider request is part
   of the cohort.

## Exit evidence

Demonstrate a valid initialize/initialized exchange through the whole path,
byte/framing failure refusal, and independent Windows/Linux exit observations.
Record locally drained versus peer-observed writes separately. Bind the final
input/source set and outcomes to one exclusive output directory. Unknown spawn,
write or cleanup state cannot count as successful completion.

L2 then verifies normal Stop and deliberate owner/transport loss on that same
launcher, with late output/refused retry and a persistent one-attempt lock. Existing
component tests remain useful, but do not substitute for the unified-path cases.
Transport-only U0 does not require a complete product recovery or reconnect engine.

P1 and P2 review that exact artifact using the [capture/privacy plan](CAPTURE-PRIVACY.md).
Only after L1/L2/P1/P2 evidence is reviewed may a separate A1 admission be issued
for a bounded unauthenticated native attempt. The ledger here stays HOLD and
cannot be edited into a launch approval. Authenticated experiments remain separate.
