# Phase 2F exit review and regression qualification

The owner authorized the contract frozen at4405293 and continued its exit review.
Accepted implementation f4d95a0 has223 passing tests. Preserve all its evidence
and the unchanged core. No new integration or construction scope is authorized.

Parent reviewed the entire core/mock-team inventory, fixed executable/script/
argv/environment, protocol, fixtures, compiled core and pinned native dependencies.
The new exit test reuses OwnedWorker's fixed launcher. Its explicit fixture claims
an approved effect and takes over that single owned pipe before the scheduled
controller callback. Malformed/duplicate wire bytes are deliberate reviewed test
input; this is not automatic controller resend or an arbitrary program launcher.
Only generated private roots and current owned handles are involved. Independent
observation follows verified close; every fixture finally closes its controller.

Source review found that stop plus invoke in one data chunk could append after
stop acceptance: exit pauses future input events but does not stop Lines from
processing the rest of the current chunk. First capture a source-bound expected
failure using ONLY the normal-mode stop-plus-invoke regression. Before changing
production source, pin its actual inventory/compiled/runtime/native hashes. Retain
raw streams locally and public hashes/counts. This red capture has a60-second
suite budget and cannot qualify success.

Then add worker guards rejecting frames after exit and invocation after any
accepted stop, including a fixture mode that ignores stop to exercise forced
teardown. The final finite matrix is223 accepted tests plus five exit tests:
stop+invoke in normal and ignored-stop modes, duplicate invoke, extra actor fields
and refusing the core database path as a witness. Full suite budget remains600
seconds:420 accepted core budget,20 deliberate operation deadlines and160 for
fixed worker/private-root/observer matrix overhead. The extra five cases reuse
the fixed process composition and fit that allowance. Worker operation10 seconds,
teardown5 seconds and observer10+5 seconds are unchanged.

Before execution, seal every core/mock-team file plus relevant architecture,
approval and exit documents. Rebuild must reproduce reviewed compiled bytes;
run unchanged core and worker boundary checks, then the228-test combined suite.
No installs, providers, shell, arbitrary worker/observer, credential propagation,
UI, terminal, network, migration/reset or whole-host crash qualification.

Exit decision follows the final passing capture and explicit contract mapping.
Record delegate verdicts separately from timeouts. Preserve historical evidence
by checking each historical source at its qualifying commit. Source changes
require a fresh preflight; failed runs stay local and are never labelled passes.
