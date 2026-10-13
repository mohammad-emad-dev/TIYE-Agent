'use strict';
function reviewedVersion(label) {
  const match = typeof label === 'string' && /^(?:opencode )?v?(\d+\.\d+\.\d+)$/.exec(label);
  if (!match || !['2.0.22', '2.0.28'].includes(match[1])) throw new Error('CLI version requires review');
  return match[1];
}
module.exports = { reviewedVersion };
