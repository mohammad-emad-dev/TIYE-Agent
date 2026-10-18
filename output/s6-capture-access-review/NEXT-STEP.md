# Next: protected private capture storage

Implement storage for new synthetic development captures, with an explicit owner
boundary. Do not retrofit or rehash any sealed launcher cohort. Native execution
and provider requests remain disabled during this step.

## Required behavior

- Create a dedicated new private capture parent with a protected Windows DACL
  for the current user, SYSTEM and Administrators; no broad inherited grants.
  Verify the resulting descriptor before starting a child or writing payload.
  Define this as protection from other ordinary accounts, not administrators,
  the same user, backups or malware running as that user.
- Create fresh per-run paths exclusively. Reject existing paths, reparse points,
  ownership mismatch and permission-query/application failures. Describe the
  remaining path-race limits; do not claim hostile-filesystem protection without
  suitable handle-based operations and independent tests.
- Keep live/raw capture private by default. Export a separately selected synthetic
  deliverable only after explicit field and content review; never copy the whole
  private tree automatically. Git ignore/exclusion is an additional hygiene rule.
- Add an explicit retention record: owner, purpose, created time and deletion
  trigger. Report failed cleanup separately; never equate process death with
  directory deletion. Preserve evidence needed for uncertain operations.
- Keep Linux mode/ACL work and same-UID credential/socket/network reach explicitly
  separate. P1 stays OPEN even if the Windows storage boundary is demonstrated.

## Acceptance evidence

Use synthetic canaries only. Save before/after descriptor metadata and positive
owner read/write behavior, and demonstrate fail-closed creation on an injected
ACL failure, unexpected existing path and reparse target. Never weaken an existing
real directory's ACL for a test. Negative-access qualification must identify the
actual alternate security token used; inspecting an ACE list alone is insufficient.
If an alternate-account test is unavailable, report that limitation and leave the
effective-access portion of P2 OPEN.

Default verification must stay offline. No provider launch, authentication change,
credential enumeration, broad filesystem scan or mutation of historical captures
is required. A later admission decision must bind this implementation and its
measured evidence, rather than borrowing the old mock source fingerprint.
