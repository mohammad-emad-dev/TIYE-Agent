# Phase 3F exit review

The approved fixed offline Leader-coordination contract passes its bounded exit
review. Production bytes remain identical to implementation 0b6e3c3. Two new
actual-core tests retain all 505 prior cases and close the two remaining
boundaries of the contract. A stop issued from the run.finished notification of
a completed coordination run is accepted by the still-active core, because this
profile has no completed-session exception, and cancels the accepted queued
assignment; the conversation stays response_complete and the receipt stays
accepted as the historical acceptance, not a claim that the task is still
queued. A lost acknowledgement that leaves delegation uncertain consumes the
attempt and refuses any later run, while the durable accepted command decision
is not acknowledged to the terminated run.

Parent reviewed the fixed coordination catalog/status codec, the Leader-bound
enqueue bridge, reserved continuation capacity, catalog detachment, receipt
immutability, stop ordering and disposal. Existing cases cover status
projections with occupied slots, FIFO and byte bounds, busy-target admission,
event capacity, stale-status rejection, invalid transcripts, SQLite abort/lost
replies, measured overrun, stop barriers, observer reentrancy, closed stores
and replay.

Architecture4.2 gains only the bounded get_team_status/delegate_task addition
over the previously accepted context/report/question/mission subsets.
Architecture 5.1/5.3 still have fixed offline lifecycle and bounded in-memory
scripted loops. Providers, complete team tools, authenticated transport,
durable conversation recovery, file/command tools, UI, packaging and release
are unfinished. Native operations have elapsed overrun detection after return,
not preemption. No rejecting/generic adapter is admitted; the outstanding
stop-rejection requirement remains open for such integration.

This ends the Phase3F construction exception and grants no new scope.
decision.json records bounded acceptance; verification.json/evidence.json seal
actual results. Raw streams remain local under .git. From the repository root
run:

`rtk proxy python -X utf8 -B output/phase3f-exit/verify.py`
