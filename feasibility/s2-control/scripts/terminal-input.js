'use strict';
function terminalInputEvidence(input, expected) {
  // xterm reports focus transitions around programmatic focus. Preserve all
  // other bytes so stray input, duplicate paste, and missing Enter still fail.
  const focusReports = input.match(/\x1b\[[IO]/g) || [];
  const taskInput = input.replace(/\x1b\[[IO]/g, '');
  return {
    matched: taskInput === expected,
    inputBytes: Buffer.byteLength(input), expectedBytes: Buffer.byteLength(expected),
    focusReports: focusReports.length,
    pasteMatched: taskInput.startsWith(expected.slice(0, -1)), enterObserved: taskInput.endsWith('\r'),
  };
}
module.exports = { terminalInputEvidence };
