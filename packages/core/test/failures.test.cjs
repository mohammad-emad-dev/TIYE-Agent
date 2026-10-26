'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore, approvalBinding } = require('../dist');
const { commandHash } = require('../dist/command');
const { bytes, command, privateRoot } = require('./helpers.cjs');
const { session, witness } = require('./mock-fixtures.cjs');
const { startTask, enqueue, ask, answer, report, complete, observer, ownerCommand } = require('./question-fixtures.cjs');
const { launch } = require('./processes.cjs');

function fixture(t, setup = session()) {
  const root = privateRoot(t), store = TaskStore.createFailureEngine(root);
  store.owner().createSession(bytes(setup)); return { root, store, setup };
}
function failure(f, planned, changes = {}) {
  return { type: 'team.task.failure', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    taskId: planned.taskId, memberId: planned.memberId, attemptId: planned.attemptId,
    reason: 'crash', summary: 'Synthetic task failure observation', ...changes };
}
function observe(f, cmd) { return f.store.owner().observeFailure(bytes(cmd)); }
function assignment(f, planned) { return new Map(f.store.snapshot().assignments).get(planned.taskId); }
function notice(f, planned) { return new Map(f.store.snapshot().failures).get(planned.taskId); }
function resolution(f, planned, outcome = 'close_uncertain') {
  return { commandId: randomUUID(), ...f.store.attention(planned.effectId), outcome };
}
function dispatch(t, f, planned, copies = 0) {
  const observed = observer(t, planned), invocation = f.store.claim(planned.effectId);
  for (let index = 0; index < copies; index++) witness('write', observed.root, planned, invocation);
  return observed;
}

test('failure schema6 exact openers preserve prior roots and only owner exposes a failure writer', t => {
  for (const version of [3, 4, 5, 6]) {
    const root = privateRoot(t), setup = session(), store = TaskStore[['createEngine','createQuestionEngine','createMissionEngine','createFailureEngine'][version-3]](root);
    store.owner().createSession(bytes(setup));
    assert.equal(store.member(setup.leaderId).observeFailure, undefined);
    if (version < 6) {
      assert.throws(() => store.owner().observeFailure(bytes({})), /failure-root-required/);
      assert.throws(() => store.member(setup.leaderId).failures(), /failure-root-required/);
    }
    store.close();
    if (version < 6) assert.throws(() => TaskStore.openFailureEngine(root), /unsupported-mock-database/);
    else {
      for (const opener of ['open','openEngine','openQuestionEngine','openMissionEngine']) assert.throws(() => TaskStore[opener](root), /unsupported-mock-database/);
      const reopened = TaskStore.openFailureEngine(root); reopened.close();
    }
  }
});

test('failure command grammar identity lifetime and shared ledger protect admission', t => {
  const f = fixture(t), planned = startTask(f), cmd = failure(f, planned);
  try {
    const before = f.store.snapshot();
    for (const changes of [{ actor:'owner' }, { reason:'unknown' }, { summary:'' }, { summary:'\ud800' },
      { summary:'a'.repeat(257) }, { memberId:true }, { version:2 }, { desiredOutcome:'done' }])
      assert.throws(() => observe(f, { ...cmd, ...changes }));
    for (const wire of [Buffer.alloc(16385),Buffer.from([255]),Buffer.from(' '+JSON.stringify(cmd)),
      Buffer.from(JSON.stringify(cmd).replace('"version":1','"version":1,"version":1'))])
      assert.throws(() => f.store.owner().observeFailure(wire));
    assert.deepEqual(f.store.snapshot(), before);
    for (const changes of [{ memberId:randomUUID() }, { sessionId:randomUUID() }, { attemptId:randomUUID() }, { taskId:randomUUID() }])
      assert.equal(observe(f, failure(f, planned, changes)), 'rejected');
    const queued = enqueue(f); assert.equal(observe(f, failure(f, queued)), 'rejected');
    assert.equal(observe(f, cmd), 'accepted'); const after = f.store.snapshot();
    assert.equal(observe(f, cmd), 'accepted'); assert.deepEqual(f.store.snapshot(), after);
    assert.throws(() => observe(f, { ...cmd, reason:'hang' }), /mock-command-conflict/);
    assert.throws(() => f.store.execute(bytes(command({ commandId:cmd.commandId }))), /mock-command-conflict/);
    assert.equal(observe(f, failure(f, planned)), 'rejected'); assert.equal(f.store.owner().failures().length, 1);
  } finally { f.store.close(); }
});

test('failure transition table closes known outcomes but retains uncertain assignments and budgets', t => {
  for (const state of ['planned','approved','completed','cancelled','abandoned','dispatching','recovered','attention']) {
    const f = fixture(t), planned = startTask(f, { approved:state!=='planned' });
    try {
      if (state==='completed') complete(t,f,planned);
      else if (state==='cancelled') f.store.cancel(planned.effectId);
      else if (['abandoned','dispatching','recovered','attention'].includes(state)) {
        f.store.claim(planned.effectId);
        if (state==='recovered') f.store.owner().recover(bytes(ownerCommand(f,'team.session.recover')));
        if (['attention','abandoned'].includes(state)) {
          f.store.cancel(planned.effectId);
          if (state==='abandoned') f.store.resolve(resolution(f,planned));
        }
      }
      const oldAttention = state==='attention' ? f.store.attention(planned.effectId) : null;
      const budget = assignment(f,planned).remainingEvents;
      assert.equal(observe(f,failure(f,planned)), 'accepted');
      const pending = ['dispatching','recovered','attention'].includes(state), row = assignment(f,planned);
      assert.equal(row.closed,!pending); assert.equal(row.result,null);
      assert.equal(row.remainingEvents,pending ? budget-1 : 0);
      assert.equal(f.store.registry()[0].state,pending ? 'needs_attention' : 'failed');
      assert.equal(notice(f,planned).status,pending ? 'awaiting_reconciliation' : 'closed');
      if (pending) {
        assert.equal(f.store.scheduler().inboxes()[1].activeTaskId,planned.taskId);
        assert.equal(f.store.member(planned.memberId).report(bytes(report(f,planned,'failed'))),'rejected');
        if (oldAttention) assert.deepEqual(f.store.attention(planned.effectId),oldAttention);
        else assert.equal(f.store.attention(planned.effectId).attentionSequence,notice(f,planned).observedSequence);
      }
    } finally { f.store.close(); }
  }
});

test('failure cancels only its open question and unrelated blocked work can explicitly finish', t => {
  const f=fixture(t), first=startTask(f), other=startTask(f,{memberId:f.setup.leaderId,approved:true});
  try {
    const questions=[ask(f,first),ask(f,other)];
    f.store.member(first.memberId).ask(bytes(questions[0])); f.store.member(other.memberId).ask(bytes(questions[1]));
    const otherBefore=f.store.owner().questions()[0]; observe(f,failure(f,first));
    const rows=new Map(f.store.snapshot().questions), cancelled=rows.get(questions[0].questionId);
    assert.equal(cancelled.status,'cancelled'); assert.equal(cancelled.remainingEvents,0);
    assert.equal(cancelled.closedSequence,notice(f,first).observedSequence); assert.equal(cancelled.answer,null);
    assert.deepEqual(f.store.owner().questions()[0],otherBefore);
    assert.equal(f.store.owner().answer(bytes(answer(questions[1]))),'accepted');
    const written=complete(t,f,other); f.store.member(other.memberId).report(bytes(report(f,other)));
    assert.equal(written.observe().rows.length,1); assert.equal(f.store.registry()[0].state,'failed');
    assert.equal(f.store.member(first.memberId).ask(bytes(ask(f,first))),'rejected');
  } finally { f.store.close(); }
});

test('failure views are detached owner leader and own-member histories with no promotion', t => {
  const setup=session(); setup.members.push({memberId:randomUUID(),name:'Other',instructions:'Synthetic only'}); setup.maxConcurrent=3;
  const f=fixture(t,setup);
  try {
    for (const row of setup.members) { const planned=startTask(f,{memberId:row.memberId}); observe(f,failure(f,planned)); }
    const all=f.store.owner().failures(); assert.equal(all.length,3);
    assert.deepEqual(Object.keys(all[0]),['sessionId','taskId','memberId','attemptId','reason','summary','observedSequence','status','closedSequence']);
    assert.equal(f.store.member(setup.leaderId).failures().length,3);
    assert.equal(f.store.member(setup.members[1].memberId).failures().length,1);
    all[0].summary='Changed'; assert.notEqual(f.store.owner().failures()[0].summary,'Changed');
    assert.equal(f.store.owner().session().leaderId,setup.leaderId);
    assert.equal(f.store.member(setup.leaderId).context().role,'leader');
  } finally { f.store.close(); }
});

test('only one matching witness closes a pending failure and both confirmed or abandoned outcomes close failed', t => {
  for (const proofKind of ['zero','one','duplicate','conflict','unavailable']) {
    const f=fixture(t), planned=startTask(f,{approved:true});
    try {
      const observed=dispatch(t,f,planned,proofKind==='zero'||proofKind==='unavailable'?0:proofKind==='duplicate'?2:1);
      observe(f,failure(f,planned)); const budget=assignment(f,planned).remainingEvents;
      let proof=observed.observe(); if (proofKind==='conflict') proof.rows[0].payloadHash='0'.repeat(64);
      if (proofKind==='unavailable') proof={scope:'unavailable'};
      const wrong={...resolution(f,planned,'confirm_completed'),attentionSequence:1};
      assert.equal(f.store.resolve(wrong,bytes(proof)),'rejected');
      const cmd=resolution(f,planned,'confirm_completed');
      assert.equal(f.store.resolve(cmd,bytes(proof)),proofKind==='one'?'accepted':'rejected');
      if (proofKind!=='one') {
        assert.equal(assignment(f,planned).remainingEvents,budget); assert.equal(assignment(f,planned).closed,false);
        assert.equal(f.store.resolve(resolution(f,planned)),'accepted');
      }
      assert.equal(assignment(f,planned).closed,true); assert.equal(assignment(f,planned).result,null);
      assert.equal(f.store.registry()[0].state,'failed'); assert.equal(notice(f,planned).status,'closed');
      assert.equal(assignment(f,planned).remainingEvents,0);
      assert.throws(()=>f.store.claim(planned.effectId));
    } finally { f.store.close(); }
  }
});

test('pending failure retains FIFO global occupancy and only explicit resolution enables the next queued task', t => {
  const setup=session({maxConcurrent:1}),f=fixture(t,setup),planned=startTask(f,{approved:true}),next=enqueue(f);
  try {
    f.store.claim(planned.effectId); observe(f,failure(f,planned));
    assert.equal(f.store.scheduler().start(bytes(next)),'rejected');
    assert.equal(f.store.member(planned.memberId).report(bytes(report(f,planned))),'rejected');
    f.store.resolve(resolution(f,planned));
    assert.equal(f.store.scheduler().inboxes()[1].queuedTaskIds[0],next.taskId);
    assert.equal(f.store.scheduler().inboxes()[1].activeTaskId,null);
    assert.equal(f.store.scheduler().start(bytes({...next,commandId:randomUUID()})),'accepted');
    const mission={type:'team.mission.complete',version:1,commandId:randomUUID(),sessionId:setup.sessionId,summary:'Cannot hide failed work'};
    assert.equal(f.store.member(setup.leaderId).completeMission(bytes(mission)),'rejected');
  } finally { f.store.close(); }
});

test('failure exemption acknowledges only its assignment while other reopened interrupted work stays fenced', t => {
  const f=fixture(t),first=startTask(f,{approved:true}),other=startTask(f,{memberId:f.setup.leaderId,approved:true});
  try {
    f.store.claim(first.effectId); f.store.claim(other.effectId);
    const cmd=failure(f,first); f.store.close(); f.store=TaskStore.openFailureEngine(f.root);
    assert.throws(()=>f.store.execute(bytes(command())),/engine-recovery-required/);
    assert.equal(observe(f,cmd),'accepted'); assert.equal(observe(f,cmd),'accepted');
    assert.throws(()=>f.store.resolve(resolution(f,first)),/engine-recovery-required/);
    assert.throws(()=>f.store.execute(bytes(command())),/engine-recovery-required/);
    const before=notice(f,first); f.store.owner().recover(bytes(ownerCommand(f,'team.session.recover')));
    assert.deepEqual(notice(f,first),before); assert.equal(observe(f,failure(f,other)),'accepted');
    f.store.resolve(resolution(f,first)); assert.equal(f.store.registry()[0].state,'failed');
  } finally { f.store.close(); }
});

test('stop before or after failure preserves uncertainty attention identity and final failed state', t => {
  for (const order of ['stop-first','failure-first']) {
    const f=fixture(t),planned=startTask(f,{approved:true});
    try {
      f.store.claim(planned.effectId);
      if (order==='stop-first') f.store.owner().stop(bytes(ownerCommand(f)));
      observe(f,failure(f,planned)); const attention=f.store.attention(planned.effectId);
      if (order==='failure-first') f.store.owner().stop(bytes(ownerCommand(f)));
      assert.deepEqual(f.store.attention(planned.effectId),attention); assert.equal(assignment(f,planned).closed,false);
      f.store.resolve(resolution(f,planned)); assert.equal(f.store.registry()[0].state,'failed');
      const expected=f.store.snapshot(); f.store.close(); f.store=TaskStore.openFailureEngine(f.root);
      assert.deepEqual(f.store.snapshot(),expected);
    } finally { f.store.close(); }
  }
});

test('failure after completed mission or an unclaimed stopped task rejects without notice', t => {
  for (const completed of [false,true]) {
    const f=fixture(t),planned=startTask(f,{approved:true});
    try {
      if (completed) {
        complete(t,f,planned); f.store.member(planned.memberId).report(bytes(report(f,planned)));
        f.store.member(f.setup.leaderId).completeMission(bytes({type:'team.mission.complete',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,summary:'Done'}));
      } else f.store.owner().stop(bytes(ownerCommand(f)));
      assert.equal(observe(f,failure(f,planned)),'rejected'); assert.equal(f.store.owner().failures().length,0);
    } finally { f.store.close(); }
  }
});

test('actual SQLite abort during failure or resolution projection writes rolls back notice closure and questions', t => {
  for (const operation of ['observe','resolve']) {
    const f=fixture(t),planned=startTask(f,{approved:true}),original=Database.prototype.exec;
    try {
      if(operation==='resolve'){f.store.claim(planned.effectId);observe(f,failure(f,planned));}
      else f.store.member(planned.memberId).ask(bytes(ask(f,planned)));
      const cmd=operation==='observe'?failure(f,planned):resolution(f,planned);
      const execute=()=>operation==='observe'?observe(f,cmd):f.store.resolve(cmd),before=f.store.snapshot();
      Database.prototype.exec=function(sql){const result=original.call(this,sql);if(sql==='BEGIN IMMEDIATE')original.call(this,
        "CREATE TEMP TRIGGER fail_observation BEFORE INSERT ON failures BEGIN SELECT RAISE(ABORT,'fixture-failure-abort'); END");return result;};
      try{assert.throws(execute,/fixture-failure-abort/);}finally{Database.prototype.exec=original;}
      assert.deepEqual(f.store.snapshot(),before); assert.equal(execute(),'accepted');
    } finally { Database.prototype.exec=original;f.store.close(); }
  }
});

test('worst-case held assignment units fund observation and resolution under full rejection pressure', t => {
  const f=fixture(t),planned=startTask(f,{approved:true});
  f.store.claim(planned.effectId); f.store.owner().recover(bytes(ownerCommand(f,'team.session.recover')));
  f.store.settle(planned.effectId,bytes({scope:'unavailable'})); assert.equal(assignment(f,planned).remainingEvents,3);
  f.store.close(); const database=new Database(path.join(f.root,'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE'); const first=database.prepare('SELECT max(sequence) AS n FROM events').get().n+1;
    for(let sequence=first;sequence<=996;sequence++){
      const rejected=command({taskId:planned.taskId});database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)').run(sequence,JSON.stringify(rejected));
      database.prepare('INSERT INTO commands VALUES (?,?)').run(rejected.commandId,JSON.stringify({hash:commandHash(rejected),result:'rejected'}));
    } database.exec('COMMIT');
  } finally {if(database.inTransaction)database.exec('ROLLBACK');database.close();}
  f.store=TaskStore.openFailureEngine(f.root);
  try {
    assert.throws(()=>f.store.execute(bytes(command())),/mock-reserved-history-limit/);
    assert.throws(()=>observe(f,failure(f,planned,{attemptId:randomUUID()})),/mock-reserved-history-limit/);
    const cmd=failure(f,planned);assert.equal(observe(f,cmd),'accepted');assert.equal(assignment(f,planned).remainingEvents,2);
    assert.equal(observe(f,cmd),'accepted');assert.equal(f.store.resolve(resolution(f,planned)),'accepted');
    assert.equal(assignment(f,planned).remainingEvents,0);f.store.owner().stop(bytes(ownerCommand(f)));
    const expected=f.store.snapshot();f.store.close();f.store=TaskStore.openFailureEngine(f.root);assert.deepEqual(f.store.snapshot(),expected);
  }finally{f.store.close();}
});

test('tampered failure identity cause status sequences ledger task and event actor refuse open', t => {
  for(const kind of ['memberId','reason','status','observedSequence','closedSequence','hash','task','actor','decision']){
    const f=fixture(t),planned=startTask(f);const cmd=failure(f,planned);observe(f,cmd);f.store.close();
    const database=new Database(path.join(f.root,'core.sqlite'));
    try{
      if(kind==='hash'){const row=JSON.parse(database.prepare('SELECT value FROM commands WHERE id=?').get(cmd.commandId).value);row.hash='0'.repeat(64);database.prepare('UPDATE commands SET value=? WHERE id=?').run(JSON.stringify(row),cmd.commandId);}
      else if(kind==='task')database.prepare('UPDATE tasks SET value=?').run(JSON.stringify('done'));
      else if(['actor','decision'].includes(kind)){const row=database.prepare('SELECT sequence,body FROM events WHERE type=\'team.task.failure\'').get(),body=JSON.parse(row.body);if(kind==='actor')body.actor=planned.memberId;else body.result='rejected';database.prepare('UPDATE events SET body=? WHERE sequence=?').run(JSON.stringify(body),row.sequence);}
      else{const row=JSON.parse(database.prepare('SELECT value FROM failures').get().value);row[kind]=kind==='memberId'?randomUUID():kind==='reason'?'hang':kind==='status'?'awaiting_reconciliation':1;database.prepare('UPDATE failures SET value=?').run(JSON.stringify(row));}
    }finally{database.close();}
    assert.throws(()=>TaskStore.openFailureEngine(f.root),/mock-projection-drift|invalid-failure-authority-or-command|invalid-failure-decision/);
  }
});

test('raw injected settlement or report cannot bypass pending failure replay guards', t => {
  for(const kind of ['settle','report']){
    const f=fixture(t),planned=startTask(f,{approved:true});f.store.claim(planned.effectId);observe(f,failure(f,planned));f.store.close();
    const database=new Database(path.join(f.root,'core.sqlite'));
    try{
      const sequence=database.prepare('SELECT max(sequence) AS n FROM events').get().n+1;
      const body=kind==='settle'?{effectId:planned.effectId,proof:{scope:'unavailable'}}:{command:report(f,planned,'failed'),actor:planned.memberId,result:'accepted'};
      database.prepare('INSERT INTO events VALUES (?,?,?)').run(sequence,kind==='settle'?'settle':'team.task.report',JSON.stringify(body));
    }finally{database.close();}
    assert.throws(()=>TaskStore.openFailureEngine(f.root),/task-failure-observed|invalid-lifecycle-decision/);
  }
});

for(const operation of ['observe','resolve'])for(const barrier of ['before','after'])test(`failure ${operation} crash ${barrier} COMMIT preserves one decision with no resend`,async t=>{
  const f=fixture(t),planned=startTask(f,{approved:true}),observed=observer(t,planned);
  if(operation==='resolve'){const invocation=f.store.claim(planned.effectId);witness('write',observed.root,planned,invocation);observe(f,failure(f,planned));}
  else f.store.member(planned.memberId).ask(bytes(ask(f,planned)));
  const cmd=operation==='observe'?failure(f,planned):resolution(f,planned),before=f.store.snapshot();f.store.close();
  const envelope=operation==='observe'?{op:'observeFailure',command:cmd}:{op:'resolve',request:cmd};
  const host=launch('openFailureEngine',f.root,barrier,'mock-host.cjs');
  try{assert.deepEqual(await host.read(),{ready:true});host.send(JSON.stringify(envelope));assert.deepEqual(await host.read(),{barrier});}finally{await host.stop();}
  const recovery=launch('openFailureEngine',f.root,null,'mock-host.cjs');
  try{
    assert.deepEqual(await recovery.read(),{ready:true});recovery.send(JSON.stringify({op:'snapshot'}));const initial=(await recovery.read()).result;
    if(barrier==='before')assert.deepEqual(initial,before);else assert.equal(initial.failures[0][1].status,'closed');
    recovery.send(JSON.stringify(envelope));assert.equal((await recovery.read()).result,'accepted');
    recovery.send(JSON.stringify({op:'snapshot'}));const after=(await recovery.read()).result;
    assert.equal(after.commands.length,before.commands.length+1);assert.equal(after.failures.length,1);assert.equal(after.failures[0][1].status,'closed');
    assert.equal(after.tasks[0][1],'failed');assert.equal(observed.observe().rows.length,operation==='resolve'?1:0);
  }finally{await recovery.stop();}
});
