# Proposal review and disposition

The Codex and OpenCode delegate relays were invoked read-only with the complete
draft contract and actual engine-handoff.ts/engine-failure.ts/effects-store.ts
excerpts embedded. The Codex relay (Luna max) failed to start a session and
exited with code 1 without a report; the OpenCode relay (Flint 40B Free) failed
with a missing relay artifact and exited with code 2. Neither returned a report
or verdict. review.json records the outcomes and raw relay outcome hashes. The
reported untracked proposal directory was the parent's existing work.

Parent checked the proposed scope against actual Architecture4.2/4.3/11.2,
engine-handoff.ts, engine-failure.ts, effects-store.ts, record.ts and the Phase
3F exit decision. The core exposes a Leader-authorized `team.task.handoff`
independently from scheduler.start. Handoff accepts only an existing failed
predecessor with a closed failure notice, no prior handoff edge and a fresh
successor task identity; it cannot create free-form work, and the title carries
the same bounded grammar as every core text field. The proposal explicitly calls
this a restricted explicit-recovery subset rather than claiming automatic
takeover or succession. The catalog derives from one fresh replay-checked
projection of eligible failures; the actual decision stays with the core.

Parent pinned the reserve-order to the exact command grammar and hash format of
engine-handoff.ts/record.ts, required the command record and handoff lineage to
be validated together from one fresh checked projection after the return, and
required the accepted receipt to expose only the immutable successor assignment
identity and sequence. An accepted receipt describes historical admission; a
later accepted Stop may close the queued successor. Local cleanup cannot erase
an uncertain acknowledgement. No completed-session exception from the mission
profile transfers to handoff.

Docs Guard checked actual symbols and links, proposal versus exit wording,
finite bounds and exclusions. No production code or runtime test was changed.
The baseline's evidence verifier is rerun, but the 507-test engine suite is not
repeated for this proposal. Proposal verification checks accepted source
inventory and proposal hashes. This establishes document consistency only.

Architecture11.2 and the Phase 3F exit decision require a new owner decision for
this newly reachable handoff write. The proposal grants no construction
permission and no provider/native integration or release admission.
