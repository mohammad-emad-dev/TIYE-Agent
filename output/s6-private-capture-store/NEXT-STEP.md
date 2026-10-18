# Next: connect private storage to a new mock capture cohort

Use the protected storage API in a new source-bound Windows/WSL mock capture.
Preserve the consolidated launcher and all measured historical artifacts.

- Allocate and verify the private root/run before launching the host, observer
  or any protocol/heartbeat client. Fail closed if storage cannot be qualified.
- Route raw streams, host configuration, journal and diagnostics into the private
  store by default. The current four-file/64 KiB prototype needs a deliberate
  bounded capture contract before it can hold that larger artifact set.
- Keep raw and publication records separate. Export only selected synthetic
  evidence after field/content review. Existing JSON-embedded raw bytes and
  absolute path fields must not silently bypass the selection boundary.
- Record uncertainty from launch/write intent until independent lifecycle and
  protocol witnesses finish. A child return code alone cannot unlock deletion
  for the cross-boundary launcher. Keep retention and failed cleanup observable.
- Bind both launcher and storage source inventories to the new evidence.
  Requalify one representative success, explicit Stop and uncertain-owner-loss
  path on the resulting implementation before extending the full matrix.

No native provider execution or authentication is required. P1 remains OPEN;
P2's alternate-token denial, Linux storage and retention/recovery portions remain
OPEN. Report their limits instead of borrowing the owner's positive I/O result.
