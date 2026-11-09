'use strict';
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { bytes } = require('../../core/test/helpers.cjs');
const { startTask } = require('../../core/test/question-fixtures.cjs');

function failTask(f, planned, { reason = 'crash', summary = 'Private synthetic failure detail' } = {}) {
  const failure = { type:'team.task.failure', version:1, commandId:randomUUID(), sessionId:f.setup.sessionId,
    taskId:planned.taskId, memberId:planned.memberId, attemptId:planned.attemptId, reason, summary };
  assert.equal(f.store.owner().observeFailure(bytes(failure)), 'accepted');
  return failure;
}
function noticeOf(f, taskId) {
  return f.store.snapshot().failures.find(([id]) => id === taskId)[1];
}
// Closed: the approved-but-unclaimed effect is planned, so the core closes the
// notice durably during observation. Awaiting: claim first so the effect is
// dispatching and the core leaves the notice awaiting reconciliation.
function observeFailure(f, planned, { close = false } = {}) {
  if (!close) { f.store.claim(planned.effectId); }
  const failure = failTask(f, planned);
  const notice = noticeOf(f, planned.taskId);
  assert.equal(notice.status, close ? 'closed' : 'awaiting_reconciliation');
  if (close) assert(notice.closedSequence > 0); else assert.equal(notice.closedSequence, null);
  return { ...notice, taskId: planned.taskId, closed: close, failure };
}
module.exports = { observeFailure, failTask, noticeOf, startTask };
