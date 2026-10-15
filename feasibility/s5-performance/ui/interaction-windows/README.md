# Windows PTY compatibility comparison — still unqualified

This separate cohort tests xterm's documented `windowsPty` configuration
against the [active-output resize failure](../interaction/README.md).
**The option alone did not qualify resize/scroll behavior.**

The corrected same-fixture observation again failed at 100→60 columns,
despite all snapshots carrying `backend: conpty` and the detected Windows
build. Each terminal's reconstructed buffer lacked one expected record ID
and contained altered text. Missing IDs were 84, 85, 85, 84 and 85 for members
0–4. Expected/observed record counts were 101/100, 101/100, 101/100, 100/99
and 102/101. These counts describe separate runs with different timing; the
change from two missing IDs in the baseline is not a controlled proof of
improvement or an established cause.

The installed xterm 5.5 API describes Windows PTY workarounds for viewport
row growth and reflow. This fork passes the actual OS build through main's
additional arguments into the sandboxed preload, supplies the public
`windowsPty` option to every terminal and explicitly requests ConPTY in
node-pty. Snapshots record the effective terminal option. No private xterm
or Node TTY refresh API is called. The exact fixture, expected text,
geometry plan, receipt rules and two-second child TTY convergence bound are
unchanged from the corrected baseline. Fixture byte equality is verified.

[failure-evidence.json](failure-evidence.json) and
[`output/s5-interaction-windows`](../../../../output/s5-interaction-windows)
preserve this failed comparison. Source/build snapshots and artifact hashes
are in [failed-attempt/manifest.json](failed-attempt/manifest.json).
Snapshots were captured after failure; prelaunch hashes were not persisted
by the inherited failure path. The in-memory original chunk journal was
not available after main exited, and no full receipt-chain qualification or
normal cleanup is claimed.

## Excluded source-copy attempt

Before the corrected observation, a copying helper decoded the UTF-8 fixture
with the Windows locale, producing mojibake. Both that source and its native
failure are preserved in [invalid-copy-attempt](invalid-copy-attempt/manifest.json)
and [`output/s5-interaction-diagnostics/invalid-copy`](../../../../output/s5-interaction-diagnostics/invalid-copy).
It is explicitly excluded from same-fixture comparisons. The original fixture
and HTML were restored with exact binary copies before the corrected run;
the two observations are not merged and no failed artifact is overwritten.

## Checks and remaining blocker

From this directory:

```powershell
rtk proxy npm run test
rtk proxy npm run check
rtk proxy npm run check:runtime
```

The single regression test and artifact checker verify that this **failure
stays unqualified**, including source equality, effective Windows PTY options,
canonical producer records and artifact hashes. The checker verifies both
sets of source/build snapshots and the excluded attempt's artifacts. `probe`
refuses existing output/evidence; further native tests need a new preserved
mapping. Both failed runtimes remain local.

This uses the same DeepSeek-supplied joining helper and Muse/Space Bunny
design reviews as the baseline; the parent implemented and tested the
compatibility fork. No additional provider call or account/configuration
change was made. Codex's prior model rejection and the recorded Agy consumer
route restriction remain as documented in the baseline.

Next: isolate geometry coordination from terminal parsing/redraw with a
separately recorded paused-output control and replay investigation. Do not
promote this option-only experiment into a product recovery or resize pass.
Root cause, active-output resize/scroll, physical wheel/paint, product core,
full S5 and production remain unqualified.
