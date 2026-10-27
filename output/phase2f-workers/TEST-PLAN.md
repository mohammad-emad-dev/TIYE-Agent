# Phase 2F owned worker implementation qualification

Scope: the exact contract at 4405293 and the delegated owner decision in
`output/phase2f-approval/`. Core sources and schema7 remain unchanged.

Parent actual-source review covers all core and mock-team files, test fixtures,
fixed spawn sites, Node executable, worker argv, public environment, independent
observer and PowerShell private-root helper. Only fixed reviewed worker and
observer paths launch; worker imports have no process reachability. Helpers may
create/verify and clean only generated private roots. No arbitrary executable,
credentials, external provider, terminal, UI, network or migration is admitted.

Runtime: Node26.7.0 native Windows x64 ABI147, existing pinned dependencies and
compiled core; no install. Both source inventories, compiled output and native
dependency hashes are captured before any new harness test executes. Rebuild
must reproduce those reviewed compiled bytes. Run unchanged core boundary and
mock worker import graph checks before the combined suite.

The finite matrix has 181 retained core tests and 42 new harness tests: normal
two-member completion; approval/blocking; FIFO/cap; descriptor/environment bounds;
12 malformed/crash/write/proof modes; two natural operation deadlines; six stop
barriers including forced kill; two-worker overlap/stop; pre-stop done; explicit
resolution/handoff; parser bounds; expiry; six lifetime assignments; uncertainty
and restart; unavailable observation; ten real SQLite abort/lost reply cases.
The capture parses actual TAP counts; this plan's count is checked before sealing.

Budget: at most 600 seconds for the combined finite suite, allowing the accepted
baseline's 420-second budget, 20 seconds of deliberate worker deadlines, and
160 seconds for bounded private-root/observer setup and process matrix overhead.
Each worker still has a ten-second operation deadline and five-second teardown;
each fixed observer has ten seconds plus five-second verified cleanup. No bound
is extended on failure. Raw stdout/stderr stream incrementally under `.git` in a
fresh capture directory; a timeout/failure is retained and cannot qualify a pass.

Assertions use actual children, SQLite transactions/connection-local abort
triggers, post-COMMIT thrown replies and independent post-exit witnesses. Barriers
and event ordering establish overlap and stop timing. No fake store, process or
timer is substituted. Every fixture awaits owned cleanup before store/root
cleanup. Core reopen follows verified shutdown. Intentional stop is separate from
worker failure; failed stop writes never claim an accepted stop. Fixture-only
explicit command redelivery, resolution and handoff are not automatic retries.

No OS sandbox, arbitrary child behavior, forced native launch failure,
whole-controller crash containment, throughput or product/release qualification
is claimed. A separate contract exit review remains required after this slice.
