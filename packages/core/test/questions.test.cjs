'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore, CoreStore, approvalBinding } = require('../dist');
const { commandHash } = require('../dist/command');
const { command, bytes, privateRoot } = require('./helpers.cjs');
const { session, plan, witness } = require('./mock-fixtures.cjs');
const { launch } = require('./processes.cjs');
const { fixture, enqueue, startTask, ask, escalate, answer, report, ownerCommand, observer, complete } = require('./question-fixtures.cjs');

function member(f, planned) { return f.store.member(planned.memberId); }
function leader(f) { return f.store.member(f.setup.leaderId); }
function questionRow(f, question) { return new Map(f.store.snapshot().questions).get(question.questionId); }

test('question roots require exact schema4 and old root operations do not fabricate question support', t => {
  for (const version of [1, 2, 3, 4]) {
    const root = privateRoot(t);
    const store = version === 1 ? CoreStore.create(root) : version === 2 ? TaskStore.create(root)
      : version === 3 ? TaskStore.createEngine(root) : TaskStore.createQuestionEngine(root);
    try {
      if (version === 3) {
        const setup = session(); store.owner().createSession(bytes(setup));
        assert.throws(() => store.owner().questions(), /question-root-required/);
        assert.throws(() => store.member(setup.leaderId).ask(bytes({})), /question-root-required/);
      }
    } finally { store.close(); }
    if (version !== 4) assert.throws(() => TaskStore.openQuestionEngine(root), /unsupported-mock-database/);
    else {
      assert.throws(() => TaskStore.open(root), /unsupported-mock-database/);
      assert.throws(() => TaskStore.openEngine(root), /unsupported-mock-database/);
      const opened = TaskStore.openQuestionEngine(root); opened.close();
    }
  }
});

test('answers restore unapproved approved or completed work without approving executing or reporting it', t => {
  for (const state of ['unapproved', 'approved', 'completed']) {
    const f = fixture(t), planned = startTask(f, { approved: state !== 'unapproved' });
    try {
      const observed = state === 'completed' ? complete(t, f, planned) : observer(t, planned);
      const beforeBudget = f.store.snapshot().assignments[0][1].remainingEvents, question = ask(f, planned);
      assert.equal(member(f, planned).ask(bytes(question)), 'accepted');
      assert.equal(f.store.registry()[0].state, 'blocked');
      assert.equal(f.store.snapshot().assignments[0][1].remainingEvents, beforeBudget);
      assert.equal(f.store.scheduler().inboxes()[1].activeTaskId, planned.taskId);
      assert.equal(member(f, planned).report(bytes(report(f, planned))), 'rejected');
      assert.throws(() => f.store.claim(planned.effectId), state === 'completed' ? /mock-already-claimed-or-stopped/ : /question-blocked/);
      if (state === 'unapproved') assert.throws(() => f.store.approve(planned.effectId, approvalBinding(planned)), /question-blocked/);
      else if (state === 'approved') f.store.approve(planned.effectId, approvalBinding(planned));
      if (state !== 'completed') assert.throws(() => f.store.cancel(planned.effectId), /question-blocked/);
      else f.store.settle(planned.effectId, bytes(observed.proof));
      assert.equal(f.store.registry()[0].state, 'blocked');
      assert.equal(leader(f).answer(bytes(answer(question))), 'accepted');
      assert.equal(f.store.registry()[0].state, state === 'unapproved' ? 'waiting_approval' : 'running');
      assert.equal(questionRow(f, question).remainingEvents, 0);
      assert.equal(f.store.snapshot().assignments[0][1].remainingEvents, beforeBudget);
      assert.equal(observed.observe().rows.length, state === 'completed' ? 1 : 0);
      if (state === 'completed') {
        assert.throws(() => f.store.claim(planned.effectId), /mock-already-claimed-or-stopped/);
        assert.equal(member(f, planned).report(bytes(report(f, planned))), 'accepted');
      } else {
        if (state === 'unapproved') {
          assert.throws(() => f.store.claim(planned.effectId), /invalid-mock-claim/);
          f.store.approve(planned.effectId, approvalBinding(planned));
        }
        witness('write', observed.root, planned, f.store.claim(planned.effectId));
        assert.equal(observed.observe().rows.length, 1);
      }
    } finally { f.store.close(); }
  }
});

test('escalation needs no leader task and transfers answer authority once with exact retries', t => {
  const f = fixture(t), planned = startTask(f), question = ask(f, planned), request = escalate(question);
  try {
    member(f, planned).ask(bytes(question));
    assert.equal(member(f, planned).escalate(bytes(request)), 'rejected');
    assert.throws(() => leader(f).escalate(bytes(request)), /mock-command-conflict/);
    const accepted = escalate(question); assert.equal(leader(f).escalate(bytes(accepted)), 'accepted');
    assert.equal(f.store.scheduler().inboxes()[0].activeTaskId, null);
    assert.equal(questionRow(f, question).remainingEvents, 1);
    assert.equal(leader(f).answer(bytes(answer(question))), 'rejected');
    assert.equal(member(f, planned).answer(bytes(answer(question))), 'rejected');
    assert.equal(f.store.owner().answer(bytes(answer(question, { kind: 'option', index: 3 }))), 'rejected');
    const reply = answer(question, { kind: 'option', index: 0 }); assert.equal(f.store.owner().answer(bytes(reply)), 'accepted');
    const before = f.store.snapshot(); assert.equal(leader(f).escalate(bytes(accepted)), 'accepted');
    assert.equal(f.store.owner().answer(bytes(reply)), 'accepted'); assert.deepEqual(f.store.snapshot(), before);
    assert.equal(questionRow(f, question).answer.index, 0); assert.equal(questionRow(f, question).answeredBy, 'owner');
    assert.equal(f.store.owner().answer(bytes(answer(question))), 'rejected');
    assert.equal(leader(f).escalate(bytes(escalate(question))), 'rejected');
  } finally { f.store.close(); }
});

test('leader questions route directly to owner and question histories are detached and role filtered', t => {
  const setup = session(); setup.members.push({ memberId: randomUUID(), name: 'Other', instructions: 'Synthetic only' }); setup.maxConcurrent = 3;
  const f = fixture(t, setup);
  try {
    const planned = setup.members.map(row => startTask(f, { memberId: row.memberId }));
    const questions = planned.map(row => ask(f, row)); questions.forEach((question, index) => member(f, planned[index]).ask(bytes(question)));
    assert.equal(f.store.owner().questions().length, 1); assert.equal(f.store.owner().questions()[0].authorId, setup.leaderId);
    assert.equal(leader(f).questions().length, 3);
    assert.equal(member(f, planned[1]).questions().length, 1); assert.equal(member(f, planned[2]).questions().length, 1);
    const visible = member(f, planned[1]).questions()[0]; assert.equal(visible.remainingEvents, undefined);
    visible.options[0] = 'Mutated copy'; assert.equal(member(f, planned[1]).questions()[0].options[0], 'Option A');
    assert.equal(leader(f).answer(bytes(answer(questions[0]))), 'rejected');
    assert.equal(leader(f).escalate(bytes(escalate(questions[0]))), 'rejected');
    assert.equal(f.store.owner().answer(bytes(answer(questions[0]))), 'accepted');
    leader(f).escalate(bytes(escalate(questions[1]))); assert.equal(f.store.owner().questions().length, 2);
    assert.equal(member(f, planned[2]).questions()[0].questionId, questions[2].questionId);
  } finally { f.store.close(); }
});

test('question wire and command identity refuse injected roles malformed unions or changed retries', t => {
  const f = fixture(t), planned = startTask(f), question = ask(f, planned);
  try {
    const before = f.store.snapshot();
    for (const changes of [{ actor: 'owner' }, { recipient: 'owner' }, { options: ['A', 'A'] }, { options: [''] },
      { options: ['A', 'B', 'C', 'D'] }, { text: '' }, { text: '\ud800' }, { text: 'x'.repeat(257) }, { taskId: true }, { version: 2 }])
      assert.throws(() => member(f, planned).ask(bytes({ ...question, ...changes })));
    for (const wire of [Buffer.alloc(16385), Buffer.from('{'), Buffer.from([0xff]), Buffer.from('\ufeffnull'),
      Buffer.from(' ' + JSON.stringify(question)), Buffer.from(JSON.stringify(question).replace('"version":1', '"version":1,"version":1'))])
      assert.throws(() => member(f, planned).ask(wire));
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(member(f, planned).ask(bytes(question)), 'accepted');
    assert.throws(() => member(f, planned).ask(bytes({ ...question, text: 'Changed' })), /mock-command-conflict/);
    assert.throws(() => f.store.execute(bytes(command({ commandId: question.commandId }))), /mock-command-conflict/);
    assert.throws(() => f.store.owner().answer(bytes(question)), /wrong-question-entry-point/);
    for (const invalid of [{ kind: 'option', index: true }, { kind: 'option', index: 0.5 }, { kind: 'option', index: 0, text: 'Both' },
      { kind: 'text', text: '' }, { kind: 'text', text: '\ud800' }, { kind: 'unknown', text: 'No' }])
      assert.throws(() => leader(f).answer(bytes(answer(question, invalid))));
    const invalidIndex = answer(question, { kind: 'option', index: -1 }); assert.equal(leader(f).answer(bytes(invalidIndex)), 'rejected');
    assert.equal(leader(f).answer(bytes(answer(question, { kind: 'text', text: 'Human answer مرحباً' }))), 'accepted');
    assert.equal(leader(f).answer(bytes(invalidIndex)), 'rejected');
  } finally { f.store.close(); }
});

test('blocked FIFO occupancy cannot be bypassed and another eligible member can complete', t => {
  const f = fixture(t), planned = startTask(f, { approved: true });
  try {
    const next = enqueue(f), question = ask(f, planned); member(f, planned).ask(bytes(question));
    assert.equal(f.store.scheduler().start(bytes(next)), 'rejected');
    assert.equal(f.store.planForTask(plan({ taskId: planned.taskId })), 'rejected');
    const other = startTask(f, { memberId: f.setup.leaderId, approved: true }), observed = complete(t, f, other);
    assert.equal(member(f, other).report(bytes(report(f, other))), 'accepted');
    assert.equal(f.store.registry()[0].state, 'blocked'); assert.equal(observed.observe().rows.length, 1);
    leader(f).answer(bytes(answer(question))); f.store.cancel(planned.effectId);
    member(f, planned).report(bytes(report(f, planned, 'failed')));
    assert.equal(f.store.scheduler().start(bytes({ ...next, commandId: randomUUID() })), 'accepted');
  } finally { f.store.close(); }
});

test('one question per assignment and twenty lifetime questions count answered history', t => {
  const f = fixture(t);
  try {
    for (let index = 0; index < 20; index++) {
      const planned = startTask(f), question = ask(f, planned, { options: [] });
      assert.equal(member(f, planned).ask(bytes(question)), 'accepted');
      assert.equal(leader(f).answer(bytes(answer(question, { kind: 'option', index: 0 }))), 'rejected');
      assert.equal(leader(f).answer(bytes(answer(question))), 'accepted');
      assert.equal(member(f, planned).ask(bytes(ask(f, planned))), 'rejected');
      f.store.cancel(planned.effectId); member(f, planned).report(bytes(report(f, planned, 'failed')));
    }
    const last = startTask(f), excess = ask(f, last); assert.equal(member(f, last).ask(bytes(excess)), 'rejected');
    assert.equal(f.store.snapshot().questions.length, 20);
    const before = f.store.snapshot(); f.store.close(); f.store = TaskStore.openQuestionEngine(f.root);
    assert.deepEqual(f.store.snapshot(), before); assert.equal(member(f, last).ask(bytes(excess)), 'rejected');
  } finally { f.store.close(); }
});

test('question admission rejects unknown sessions tasks reused IDs dispatched and abandoned work', t => {
  const f = fixture(t), planned = startTask(f, { approved: true });
  try {
    assert.equal(leader(f).ask(bytes(ask(f, planned))), 'rejected');
    assert.equal(member(f, planned).ask(bytes(ask(f, planned, { sessionId: randomUUID() }))), 'rejected');
    assert.equal(member(f, planned).ask(bytes(ask(f, planned, { taskId: randomUUID() }))), 'rejected');
    const question = ask(f, planned); member(f, planned).ask(bytes(question)); leader(f).answer(bytes(answer(question)));
    const other = startTask(f, { memberId: f.setup.leaderId, approved: true });
    assert.equal(member(f, other).ask(bytes(ask(f, other, { questionId: question.questionId }))), 'rejected');
    f.store.claim(other.effectId); assert.equal(member(f, other).ask(bytes(ask(f, other))), 'rejected');
    f.store.settle(other.effectId, bytes({ scope: 'unavailable' }));
    f.store.resolve({ commandId: randomUUID(), ...f.store.attention(other.effectId), outcome: 'close_uncertain' });
    assert.equal(member(f, other).ask(bytes(ask(f, other))), 'rejected');
  } finally { f.store.close(); }
});

test('stop closes questions in both routes without marking completed or uncertain assignments done', t => {
  const setup = session(); setup.members.push({ memberId: randomUUID(), name: 'Third', instructions: 'Synthetic only' }); setup.maxConcurrent = 3;
  const f = fixture(t, setup);
  try {
    const planned = startTask(f, { memberId: setup.leaderId }), completed = startTask(f, { approved: true });
    const written = complete(t, f, completed), dispatched = startTask(f, { memberId: setup.members[2].memberId, approved: true });
    f.store.claim(dispatched.effectId); const queued = enqueue(f);
    const questions = [ask(f, planned), ask(f, completed)];
    member(f, planned).ask(bytes(questions[0])); member(f, completed).ask(bytes(questions[1]));
    const stop = ownerCommand(f); assert.equal(f.store.owner().stop(bytes(stop)), 'accepted');
    const rows = f.store.snapshot().questions.map(([, row]) => row);
    assert(rows.every(row => row.status === 'cancelled' && row.remainingEvents === 0 && row.answer === null));
    assert.equal(rows[0].closedSequence, rows[1].closedSequence);
    const tasks = new Map(f.store.snapshot().tasks);
    assert.equal(tasks.get(planned.taskId), 'cancelled'); assert.equal(tasks.get(completed.taskId), 'running');
    assert.equal(tasks.get(dispatched.taskId), 'needs_attention'); assert.equal(tasks.get(queued.taskId), 'cancelled');
    assert.equal(member(f, completed).report(bytes(report(f, completed))), 'rejected');
    assert.equal(member(f, completed).report(bytes(report(f, completed, 'failed'))), 'accepted');
    assert.equal(f.store.owner().answer(bytes(answer(questions[0]))), 'rejected');
    assert.equal(member(f, planned).ask(bytes(questions[0])), 'accepted');
    assert.equal(written.observe().rows.length, 1);
    assert(!f.store.registry().some(row => row.state === 'blocked' || row.state === 'done'));
  } finally { f.store.close(); }
});

test('reopen recovery fences owner answers but preserves blocked question and never resends', t => {
  const f = fixture(t), planned = startTask(f, { approved: true }), question = ask(f, planned);
  try {
    member(f, planned).ask(bytes(question)); leader(f).escalate(bytes(escalate(question)));
    const other = startTask(f, { memberId: f.setup.leaderId, approved: true }), written = observer(t, other);
    witness('write', written.root, other, f.store.claim(other.effectId));
    const before = questionRow(f, question); f.store.close(); f.store = TaskStore.openQuestionEngine(f.root);
    assert.throws(() => f.store.owner().answer(bytes(answer(question))), /engine-recovery-required/);
    assert.equal(member(f, planned).ask(bytes(question)), 'accepted');
    f.store.owner().recover(bytes(ownerCommand(f, 'team.session.recover')));
    assert.deepEqual(questionRow(f, question), before); assert.equal(f.store.registry()[0].state, 'blocked');
    assert.equal(f.store.owner().answer(bytes(answer(question))), 'accepted');
    assert.equal(f.store.registry()[0].state, 'running');
    f.store.settle(other.effectId, bytes(written.observe())); assert.equal(written.observe().rows.length, 1);
  } finally { f.store.close(); }
});

test('answering an expired plan restores only eligibility and cannot return an invocation', t => {
  const f = fixture(t), planned = startTask(f, { approved: true, expiresAt: 0 }), question = ask(f, planned);
  try {
    member(f, planned).ask(bytes(question)); assert.throws(() => f.store.claim(planned.effectId), /question-blocked/);
    leader(f).answer(bytes(answer(question))); assert.equal(f.store.claim(planned.effectId), null);
    assert.equal(f.store.registry()[0].state, 'needs_attention');
    assert.equal(member(f, planned).report(bytes(report(f, planned, 'failed'))), 'accepted');
  } finally { f.store.close(); }
});

test('actual SQLite abort rolls back question ask escalation answer and composite stop', t => {
  for (const operation of ['ask', 'escalate', 'answer', 'stop']) {
    const f = fixture(t), planned = startTask(f), question = ask(f, planned), original = Database.prototype.exec;
    try {
      if (operation !== 'ask') member(f, planned).ask(bytes(question));
      const execute = operation === 'ask' ? () => member(f, planned).ask(bytes(question))
        : operation === 'escalate' ? () => leader(f).escalate(bytes(escalate(question)))
          : operation === 'answer' ? () => leader(f).answer(bytes(answer(question))) : () => f.store.owner().stop(bytes(ownerCommand(f)));
      const before = f.store.snapshot();
      Database.prototype.exec = function (sql) {
        const returned = original.call(this, sql);
        if (sql === 'BEGIN IMMEDIATE') original.call(this,
          "CREATE TEMP TRIGGER fail_question BEFORE INSERT ON questions BEGIN SELECT RAISE(ABORT,'fixture-question-abort'); END");
        return returned;
      };
      try { assert.throws(execute, /fixture-question-abort/); } finally { Database.prototype.exec = original; }
      assert.deepEqual(f.store.snapshot(), before); assert.equal(execute(), 'accepted');
    } finally { f.store.close(); }
  }
});

test('held question budget survives pressure and permits escalation answer and reserved stop', t => {
  for (const operation of ['admission', 'answer', 'stop']) {
    const f = fixture(t), planned = startTask(f, { approved: true }), question = ask(f, planned);
    if (operation !== 'admission') member(f, planned).ask(bytes(question)); f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      database.exec('BEGIN IMMEDIATE'); const first = database.prepare('SELECT max(sequence) AS n FROM events').get().n + 1;
      const event = database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)'), ledger = database.prepare('INSERT INTO commands VALUES (?,?)');
      for (let sequence = first; sequence <= 991; sequence++) {
        const rejected = command({ taskId: planned.taskId }); event.run(sequence, JSON.stringify(rejected));
        ledger.run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
      }
      database.exec('COMMIT');
    } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
    f.store = TaskStore.openQuestionEngine(f.root);
    try {
      if (operation === 'admission') {
        const before = f.store.snapshot();
        assert.throws(() => member(f, planned).ask(bytes(question)), /mock-reserved-history-limit/);
        assert.deepEqual(f.store.snapshot(), before);
        assert.equal(f.store.snapshot().questions.length, 0);
        assert.equal(f.store.owner().stop(bytes(ownerCommand(f))), 'accepted');
        continue;
      }
      assert.throws(() => f.store.execute(bytes(command())), /mock-reserved-history-limit/);
      assert.throws(() => leader(f).answer(bytes(answer(question, { kind: 'option', index: 9 }))), /mock-reserved-history-limit/);
      if (operation === 'answer') {
        assert.equal(leader(f).escalate(bytes(escalate(question))), 'accepted');
        assert.equal(f.store.owner().answer(bytes(answer(question))), 'accepted');
        assert.equal(questionRow(f, question).remainingEvents, 0);
      }
      assert.equal(f.store.owner().stop(bytes(ownerCommand(f))), 'accepted');
      assert.equal(questionRow(f, question).remainingEvents, 0); assert.equal(f.store.snapshot().assignments[0][1].remainingEvents, 0);
    } finally { f.store.close(); }
  }
});

test('tampered question routes answers budgets and blocked task projections refuse reopen', t => {
  for (const kind of ['route', 'answer', 'budget', 'task', 'actor']) {
    const f = fixture(t), planned = startTask(f), question = ask(f, planned); member(f, planned).ask(bytes(question));
    if (kind === 'answer') leader(f).answer(bytes(answer(question))); f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      if (kind === 'task') database.prepare('UPDATE tasks SET value=?').run(JSON.stringify('running'));
      else if (kind === 'actor') {
        const row = database.prepare('SELECT sequence,body FROM events WHERE type=\'team.question.ask\'').get(), body = JSON.parse(row.body);
        body.actor = f.setup.leaderId; database.prepare('UPDATE events SET body=? WHERE sequence=?').run(JSON.stringify(body), row.sequence);
      } else {
        const row = JSON.parse(database.prepare('SELECT value FROM questions').get().value);
        if (kind === 'route') row.recipient = 'owner'; else if (kind === 'budget') row.remainingEvents = 0; else row.answer.text = 'Changed';
        database.prepare('UPDATE questions SET value=?').run(JSON.stringify(row));
      }
    } finally { database.close(); }
    assert.throws(() => TaskStore.openQuestionEngine(f.root), /mock-projection-drift|invalid-question-decision/);
  }
});

test('raw event injection cannot bypass a blocked assignment despite skipping the public API', t => {
  for (const mutation of ['approve', 'claim', 'stop']) {
    const f = fixture(t), planned = startTask(f, { approved: mutation !== 'approve' }), question = ask(f, planned);
    member(f, planned).ask(bytes(question)); f.store.close(); const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      const sequence = database.prepare('SELECT max(sequence) AS n FROM events').get().n + 1;
      const body = mutation === 'approve' ? { effectId: planned.effectId, binding: approvalBinding(planned) }
        : mutation === 'claim' ? { effectId: planned.effectId, observedAt: Date.now() }
          : { effectId: planned.effectId, reason: 'cancel', observedAt: Date.now() };
      database.prepare('INSERT INTO events VALUES (?,?,?)').run(sequence, mutation, JSON.stringify(body));
    } finally { database.close(); }
    assert.throws(() => TaskStore.openQuestionEngine(f.root), /question-blocked/);
  }
});

for (const operation of ['questionAsk', 'questionEscalate', 'questionAnswer', 'sessionStop']) for (const barrier of ['before', 'after']) {
  test(`question ${operation} crash ${barrier} COMMIT recovers one decision with no action`, async t => {
    const f = fixture(t), planned = startTask(f, { approved: true }), question = ask(f, planned), observed = observer(t, planned);
    if (operation !== 'questionAsk') member(f, planned).ask(bytes(question));
    if (operation === 'questionAnswer') leader(f).escalate(bytes(escalate(question)));
    const request = operation === 'questionAsk' ? question : operation === 'questionEscalate' ? escalate(question)
      : operation === 'questionAnswer' ? answer(question) : ownerCommand(f);
    const before = f.store.snapshot(); f.store.close(); const host = launch('openQuestionEngine', f.root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true }); host.send(JSON.stringify({ op: operation, command: request }));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    const recovery = launch('openQuestionEngine', f.root, null, 'mock-host.cjs');
    try {
      assert.deepEqual(await recovery.read(), { ready: true }); recovery.send(JSON.stringify({ op: 'snapshot' }));
      const initial = (await recovery.read()).result;
      if (barrier === 'before') assert.deepEqual(initial, before);
      else assert(initial.commands.some(([id]) => id === request.commandId));
      recovery.send(JSON.stringify({ op: operation, command: request })); assert.equal((await recovery.read()).result, 'accepted');
      recovery.send(JSON.stringify({ op: 'snapshot' })); const after = (await recovery.read()).result;
      assert.equal(after.commands.length, before.commands.length + 1);
      assert.equal(after.questions.length, 1);
      assert.equal(after.questions[0][1].status, operation === 'questionAnswer' ? 'answered' : operation === 'sessionStop' ? 'cancelled' : 'open');
      assert.equal(observed.observe().rows.length, 0);
    } finally { await recovery.stop(); }
  });
}
