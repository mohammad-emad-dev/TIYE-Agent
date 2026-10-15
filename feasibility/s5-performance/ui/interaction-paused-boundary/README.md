# Paused resize boundary control

This additive copy inserts an exact content checkpoint after xterm resize and
before dispatching native PTY resize. It has its own prelaunch manifest and
native failure capture. The producer fixture bytes match the earlier cohorts.

The checkpoint passes for all five terminals. After the native resize and
subsequent output, five records per terminal differ while counts stay unchanged.
See the [paired control report](../interaction-paused/README.md) for commands,
evidence, limitations and the next investigation. This is a failing diagnostic,
with no resize qualification or completed cleanup claim.
