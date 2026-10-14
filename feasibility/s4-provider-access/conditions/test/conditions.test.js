const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateReview } = require('../check');
function reviewedDocuments() {
  const root = path.resolve(__dirname, '..');
  return [JSON.parse(fs.readFileSync(path.join(root, 'review.json'))), JSON.parse(fs.readFileSync(path.join(root, '..', 'routes.json')))];
}
const regressions = [
  ['public terms cannot prove account acceptance', review => { review.routes[0].contractAcceptanceEstablished = true; }],
  ['documentation cannot qualify native auth', review => { review.routes[1].nativeAuthQualified = true; }],
  ['test plan cannot grant live request authorization', review => { review.nativePlan[1].state = 'authorized'; }],
  ['live plan cannot omit account route prerequisites', review => { review.nativePlan[1].prerequisites = ['public-synthetic-input']; }],
  ['citation cannot refer to an unrecorded source', review => { review.routes[0].sourceIds.push('unread-page'); }],
  ['aggregator cannot inherit another route identity', review => { review.routes[3].id = 'openai-codex-cli'; }]
];
for (const [scenario, mutate] of regressions) test(scenario, () => {
  const [review, baseline] = reviewedDocuments();
  mutate(review);
  assert.throws(() => validateReview(review, baseline));
});
