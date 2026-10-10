#!/usr/bin/env node
'use strict';
// Opt-in S1 9f fixture. This process is spawned by mock-cli inside its PTY,
// ignores stdio loss, and expires on its own after 60 seconds. Test runners
// must use recorded PID + creation identity for any earlier cleanup.
setTimeout(() => process.exit(0), 60_000);
