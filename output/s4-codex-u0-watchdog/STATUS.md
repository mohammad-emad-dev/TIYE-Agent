# Failed saved capture

The final saved run in this directory ran six tests and failed the deadline case.
The original README was prepared after successful development tests, before
this saved failure. It is retained unchanged because its hash is in the capture.

The failure was a shutdown race: job accounting reached zero before the root
process handle became signaled; an additional TerminateProcess call returned
access denied. That failed the test instead of being treated as success.

Sources, inputs, logs and observations for this capture remain frozen. Its
original `run.py` checker rejects the unsuccessful result by design. Use the
[corrected version's checker and report](../s4-codex-u0-watchdog-v2/README.md)
to verify both the failed baseline and the corrected capture.
