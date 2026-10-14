'use strict';
const { assessDeclaration } = require('./declaration');
const limit = 4096;
const chunks = [];
let bytes = 0, finished = false;
function emit(outcome, exitCode) {
  if (finished) return;
  finished = true;
  process.stdout.write(JSON.stringify(outcome) + '\n');
  process.exitCode = exitCode;
}
function invalid(category) {
  emit({ state: 'not-run', category, liveEligible: false, fullS4Qualified: false, productionEligible: false }, 1);
}
process.stdin.on('data', chunk => {
  bytes += chunk.length;
  if (bytes > limit) { chunks.length = 0; invalid('oversized-input'); process.stdin.destroy(); }
  else chunks.push(chunk);
});
process.stdin.on('error', () => invalid('input-error'));
process.stdin.on('end', () => {
  if (finished) return;
  let declaration;
  try { declaration = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    invalid('invalid-json'); return;
  }
  const outcome = assessDeclaration(declaration);
  emit(outcome, outcome.state === 'not-run' ? 1 : 0);
});
