'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { CoreStore, TaskStore, approvalBinding } = require('../dist');
const { commandHash } = require('../dist/command');
const { bytes, command, privateRoot } = require('./helpers.cjs');
const { session, witness } = require('./mock-fixtures.cjs');
const { startTask, enqueue, ask, report, observer, ownerCommand } = require('./question-fixtures.cjs');
const { fixture, observe, failed, request, handoff, queuedPlan, start, finish, mission } = require('./handoff-fixtures.cjs');
const { launch } = require('./processes.cjs');

test('handoff roots require schema7 and preserve separate schema1-6 openers and refusal', t => {
  const factories = ['create','create','createEngine','createQuestionEngine','createMissionEngine','createFailureEngine','createHandoffEngine'];
  for (let version = 1; version <= 7; version++) {
    const root = privateRoot(t), store = version === 1 ? CoreStore.create(root) : TaskStore[factories[version-1]](root);
    if (version >= 3) {
      const setup = session(); store.owner().createSession(bytes(setup));
      assert.equal(store.owner().handoff, undefined);
      if (version < 7) {
        assert.throws(() => store.owner().handoffs(), /handoff-root-required/);
        assert.throws(() => store.member(setup.leaderId).handoff(bytes({})), /handoff-root-required/);
      }
    }
    store.close();
    if (version < 7) assert.throws(() => TaskStore.openHandoffEngine(root), /unsupported-mock-database/);
    else {
      for (const opener of ['open','openEngine','openQuestionEngine','openMissionEngine','openFailureEngine'])
        assert.throws(() => TaskStore[opener](root), /unsupported-mock-database/);
      const opened = TaskStore.openHandoffEngine(root); opened.close();
    }
  }
});

test('one handoff atomically creates immutable successor title queued assignment and lineage without touching predecessor', t => {
  const f = fixture(t), predecessor = failed(t,f), cmd = request(f,predecessor);
  try {
    const before = f.store.snapshot(); assert.equal(handoff(f,cmd),'accepted'); const after = f.store.snapshot();
    assert.equal(after.commands.length,before.commands.length+1);
    for (const key of ['effects','failures','questions','approvals']) assert.deepEqual(after[key],before[key]);
    assert.deepEqual(after.assignments[0],before.assignments[0]); assert.deepEqual(after.tasks[0],before.tasks[0]);
    const row = after.assignments[1][1], edge = after.handoffs[0][1];
    assert.equal(row.taskId,cmd.successorTaskId); assert.equal(row.effectId,null); assert.equal(row.remainingEvents,8);
    assert.equal(row.enqueueSequence,edge.handoffSequence); assert.equal(row.result,null);
    assert.equal(f.store.registry()[1].title,cmd.title); assert.equal(f.store.registry()[1].state,'queued');
    assert.equal(edge.fromMemberId,predecessor.memberId); assert.equal(edge.createdBy,f.setup.leaderId);
    assert.equal(handoff(f,cmd),'accepted'); assert.deepEqual(f.store.snapshot(),after);
    f.store.close(); f.store = TaskStore.openHandoffEngine(f.root); assert.deepEqual(f.store.snapshot(),after);
    assert.equal(f.store.registry()[1].title,cmd.title); assert.equal(mission(f),'rejected');
  } finally { f.store.close(); }
});

test('handoff grammar role payload identity and shared namespace prevent changed or malformed admission', t => {
  const f=fixture(t), predecessor=failed(t,f), cmd=request(f,predecessor);
  try {
    const before=f.store.snapshot();
    for(const changes of [{actor:f.setup.leaderId},{title:''},{title:'\ud800'},{title:'a'.repeat(257)},
      {effectId:randomUUID()},{version:2},{targetMemberId:true},{approved:true}]) assert.throws(()=>handoff(f,{...cmd,...changes}));
    for(const wire of [Buffer.alloc(16385),Buffer.from([255]),Buffer.from(' '+JSON.stringify(cmd)),
      Buffer.from(JSON.stringify(cmd).replace('"version":1','"version":1,"version":1'))])
      assert.throws(()=>f.store.member(f.setup.leaderId).handoff(wire));
    assert.deepEqual(f.store.snapshot(),before);
    assert.equal(f.store.member(predecessor.memberId).handoff(bytes(cmd)),'rejected');
    assert.throws(()=>handoff(f,cmd),/mock-command-conflict/);
    for(const changes of [{sessionId:randomUUID()},{targetMemberId:randomUUID()},{successorTaskId:predecessor.taskId},
      {predecessorTaskId:randomUUID()}]) assert.equal(handoff(f,request(f,predecessor,changes)),'rejected');
    const created=command(); f.store.execute(bytes(created));
    assert.equal(handoff(f,request(f,predecessor,{successorTaskId:created.taskId})),'rejected');
    const accepted=request(f,predecessor); assert.equal(handoff(f,accepted),'accepted');
    assert.throws(()=>handoff(f,{...accepted,title:'Changed'}),/mock-command-conflict/);
    assert.throws(()=>f.store.execute(bytes(command({commandId:accepted.commandId}))),/mock-command-conflict/);
    assert.equal(handoff(f,request(f,predecessor)),'rejected');
  }finally{f.store.close();}
});

test('queued live uncertain done cancelled or unobserved failed predecessors cannot hand off', t => {
  for(const state of ['queued','planned','dispatching','attention','done','cancelled','reported-failed']){
    const f=fixture(t);
    try {
      const planned=state==='queued'?enqueue(f):startTask(f,{approved:true});
      if(['dispatching','attention'].includes(state)) {
        f.store.claim(planned.effectId);
        if(state==='attention') observe(f,planned);
      }
      if(state==='done') finish(t,f,planned);
      if(state==='cancelled') f.store.owner().stop(bytes(ownerCommand(f)));
      if(state==='reported-failed') {f.store.cancel(planned.effectId);f.store.member(planned.memberId).report(bytes(report(f,planned,'failed')));}
      assert.equal(handoff(f,request(f,planned)),'rejected',state); assert.equal(f.store.owner().handoffs().length,0);
    }finally{f.store.close();}
  }
});

test('handoff appends at busy target FIFO tail and new work still requires explicit planning and approval', t => {
  const f=fixture(t),predecessor=failed(t,f),target=f.setup.leaderId;
  try {
    const busy=startTask(f,{memberId:target,approved:true}),earlier=enqueue(f,target),cmd=request(f,predecessor,{targetMemberId:target});
    assert.equal(handoff(f,cmd),'accepted');
    assert.deepEqual(f.store.member(target).inbox().queuedTaskIds,[earlier.taskId,cmd.successorTaskId]);
    assert.equal(f.store.scheduler().start(bytes(queuedPlan(f,cmd))),'rejected'); finish(t,f,busy);
    assert.equal(f.store.scheduler().start(bytes(queuedPlan(f,cmd))),'rejected');
    assert.equal(f.store.scheduler().start(bytes(earlier)),'accepted'); f.store.cancel(earlier.effectId);
    f.store.member(target).report(bytes(report(f,earlier,'failed')));
    const successor=start(f,cmd); assert.throws(()=>f.store.claim(successor.effectId),/invalid-mock-claim/);
    f.store.approve(successor.effectId,approvalBinding(successor)); const written=finish(t,f,successor);
    assert.equal(written.observe().rows.length,1); assert.throws(()=>f.store.claim(predecessor.effectId));
  }finally{f.store.close();}
});

test('lineage view allows owner leader source and target only without private failure or question payloads', t => {
  const setup=session(); setup.members.push({memberId:randomUUID(),name:'Target',instructions:'Synthetic'},
    {memberId:randomUUID(),name:'Unrelated',instructions:'Synthetic'}); setup.maxConcurrent=4;
  const f=fixture(t,setup),predecessor=startTask(f);
  try {
    f.store.member(predecessor.memberId).ask(bytes(ask(f,predecessor,{text:'Private question content'}))); observe(f,predecessor);
    const cmd=request(f,predecessor,{targetMemberId:setup.members[2].memberId}); handoff(f,cmd);
    const all=f.store.owner().handoffs(); assert.equal(all.length,1);
    assert.deepEqual(Object.keys(all[0]),['sessionId','predecessorTaskId','successorTaskId','fromMemberId','targetMemberId','title','createdBy','handoffSequence']);
    assert.equal(f.store.member(setup.leaderId).handoffs().length,1); assert.equal(f.store.member(predecessor.memberId).handoffs().length,1);
    assert.equal(f.store.member(cmd.targetMemberId).handoffs().length,1); assert.equal(f.store.member(setup.members[3].memberId).handoffs().length,0);
    assert.equal(f.store.member(cmd.targetMemberId).questions().length,0); assert.equal(f.store.member(cmd.targetMemberId).failures().length,0);
    all[0].title='Mutated'; assert.equal(f.store.owner().handoffs()[0].title,cmd.title);
  }finally{f.store.close();}
});

test('multi-step recovered chain plus ordinary successful work can complete without rewriting failed history', t => {
  const f=fixture(t),first=failed(t,f);
  try {
    const firstLink=request(f,first); handoff(f,firstLink); const second=start(f,firstLink); observe(f,second);
    assert.equal(mission(f),'rejected'); const secondLink=request(f,second,{targetMemberId:f.setup.leaderId}); handoff(f,secondLink);
    assert.equal(mission(f),'rejected'); const terminal=start(f,secondLink,true),written=finish(t,f,terminal);
    const ordinary=startTask(f,{approved:true}); const other=finish(t,f,ordinary),before=f.store.snapshot();
    assert.equal(mission(f),'accepted'); const after=f.store.snapshot();
    for(const key of ['tasks','effects','assignments','questions','failures','handoffs']) assert.deepEqual(after[key],before[key]);
    assert.deepEqual(after.tasks.map(([,state])=>state),['failed','failed','done','done']);
    assert.equal(written.observe().rows.length,1); assert.equal(other.observe().rows.length,1);
    assert.equal(handoff(f,request(f,terminal)),'rejected'); f.store.close();f.store=TaskStore.openHandoffEngine(f.root);
    assert.equal(f.store.owner().mission().status,'completed'); assert.deepEqual(f.store.snapshot().handoffs,before.handoffs);
  }finally{f.store.close();}
});

test('uncovered failed cancelled blocked uncertain incomplete or unassigned work prevents recovered mission success', t => {
  for(const state of ['uncovered','cancelled','blocked','uncertain','awaiting-report','unassigned']){
    const f=fixture(t),predecessor=failed(t,f),cmd=request(f,predecessor); handoff(f,cmd);
    try {
      const successor=start(f,cmd,true);
      if(state==='blocked') f.store.member(successor.memberId).ask(bytes(ask(f,successor)));
      else if(state==='uncertain') {f.store.claim(successor.effectId);observe(f,successor);}
      else if(state==='cancelled') f.store.owner().stop(bytes(ownerCommand(f)));
      else if(state==='awaiting-report') {const written=observer(t,successor);witness('write',written.root,successor,f.store.claim(successor.effectId));f.store.settle(successor.effectId,bytes(written.observe()));}
      else {finish(t,f,successor);if(state==='uncovered')failed(t,f);else f.store.execute(bytes(command()));}
      assert.equal(mission(f),'rejected',state); assert.notEqual(f.store.owner().mission().status,'completed');
    }finally{f.store.close();}
  }
});

test('schema6 retains strict all-done completion even with unrelated successful work after failure', t => {
  const root=privateRoot(t),setup=session(),f={root,setup,store:TaskStore.createFailureEngine(root)};
  try{f.store.owner().createSession(bytes(setup));failed(t,f);finish(t,f,startTask(f,{approved:true}));assert.equal(mission(f),'rejected');}
  finally{f.store.close();}
});

test('ten handoffs count closed chains and cannot branch cycle or reset after reopen', t => {
  const f=fixture(t); let predecessor=failed(t,f),first;
  try {
    for(let index=0;index<10;index++){
      const cmd=request(f,predecessor); assert.equal(handoff(f,cmd),'accepted'); first??=cmd;
      assert.equal(handoff(f,request(f,predecessor)),'rejected'); predecessor=start(f,cmd);observe(f,predecessor);
    }
    assert.equal(handoff(f,request(f,predecessor)),'rejected'); assert.equal(f.store.owner().handoffs().length,10);
    const expected=f.store.snapshot();f.store.close();f.store=TaskStore.openHandoffEngine(f.root);
    assert.equal(handoff(f,first),'accepted');assert.deepEqual(f.store.snapshot(),expected);
    assert.equal(handoff(f,request(f,predecessor,{successorTaskId:first.predecessorTaskId})),'rejected');
    assert.equal(f.store.snapshot().assignments.length,11);
  }finally{f.store.close();}
});

test('handoff successor consumes the ordinary hundredth lifetime assignment and cannot create assignment101', t => {
  const f=fixture(t); let predecessor;
  try {
    for(let index=0;index<99;index++) predecessor=failed(t,f);
    const cmd=request(f,predecessor);assert.equal(handoff(f,cmd),'accepted');const successor=start(f,cmd);observe(f,successor);
    assert.equal(f.store.snapshot().assignments.length,100);
    assert.equal(handoff(f,request(f,successor)),'rejected');assert.equal(f.store.snapshot().assignments.length,100);
  }finally{f.store.close();}
});

test('reconciled completed or abandoned predecessors hand off without rearming old effect or attempt identities', t => {
  for(const outcome of ['confirm_completed','close_uncertain']){
    const f=fixture(t),predecessor=startTask(f,{approved:true});
    try{
      const written=observer(t,predecessor),invocation=f.store.claim(predecessor.effectId);
      if(outcome==='confirm_completed')witness('write',written.root,predecessor,invocation);
      observe(f,predecessor);const resolution={commandId:randomUUID(),...f.store.attention(predecessor.effectId),outcome};
      f.store.resolve(resolution,outcome==='confirm_completed'?bytes(written.observe()):undefined);
      const cmd=request(f,predecessor);assert.equal(handoff(f,cmd),'accepted');
      assert.equal(f.store.scheduler().start(bytes(queuedPlan(f,cmd,{effectId:predecessor.effectId}))),'rejected');
      assert.equal(f.store.scheduler().start(bytes(queuedPlan(f,cmd,{attemptId:predecessor.attemptId}))),'rejected');
      assert.throws(()=>f.store.claim(predecessor.effectId)); assert.equal(written.observe().rows.length,outcome==='confirm_completed'?1:0);
      finish(t,f,start(f,cmd,true));assert.equal(mission(f),'accepted');
      assert.equal(written.observe().rows.length,outcome==='confirm_completed'?1:0);
    }finally{f.store.close();}
  }
});

test('stop cancels queued successor but preserves lineage and blocks new handoff', t => {
  const f=fixture(t),predecessor=failed(t,f),cmd=request(f,predecessor);handoff(f,cmd);
  try{const edge=f.store.owner().handoffs();f.store.owner().stop(bytes(ownerCommand(f)));assert.deepEqual(f.store.owner().handoffs(),edge);
    assert.equal(f.store.registry()[1].state,'cancelled');assert.equal(handoff(f,cmd),'accepted');
    assert.equal(handoff(f,request(f,predecessor)),'rejected');assert.equal(mission(f),'rejected');
  }finally{f.store.close();}
});

test('interrupted-open fence blocks new handoff but exact earlier handoff survives until explicit recovery', t => {
  const f=fixture(t),predecessor=failed(t,f),cmd=request(f,predecessor);handoff(f,cmd);
  try{
    const successor=start(f,cmd);observe(f,successor);const other=startTask(f,{memberId:f.setup.leaderId,approved:true});f.store.claim(other.effectId);
    f.store.close();f.store=TaskStore.openHandoffEngine(f.root);
    assert.equal(handoff(f,cmd),'accepted');assert.throws(()=>handoff(f,request(f,successor)),/engine-recovery-required/);
    f.store.owner().recover(bytes(ownerCommand(f,'team.session.recover')));assert.equal(handoff(f,request(f,successor)),'accepted');
  }finally{f.store.close();}
});

test('real SQLite handoff projection abort rolls back task title assignment edge event and ledger', t => {
  const f=fixture(t),predecessor=failed(t,f),cmd=request(f,predecessor),original=Database.prototype.exec;
  try{
    const before=f.store.snapshot(),registry=f.store.registry();
    Database.prototype.exec=function(sql){const result=original.call(this,sql);if(sql==='BEGIN IMMEDIATE')original.call(this,
      "CREATE TEMP TRIGGER fail_handoff BEFORE INSERT ON handoffs BEGIN SELECT RAISE(ABORT,'fixture-handoff-abort'); END");return result;};
    try{assert.throws(()=>handoff(f,cmd),/fixture-handoff-abort/);}finally{Database.prototype.exec=original;}
    assert.deepEqual(f.store.snapshot(),before);assert.deepEqual(f.store.registry(),registry);assert.equal(handoff(f,cmd),'accepted');
  }finally{Database.prototype.exec=original;f.store.close();}
});

function padRejected(f,taskId,through){
  f.store.close();const database=new Database(path.join(f.root,'core.sqlite'));
  try{database.exec('BEGIN IMMEDIATE');const first=database.prepare('SELECT max(sequence) AS n FROM events').get().n+1;
    for(let sequence=first;sequence<=through;sequence++){
      const rejected=command({taskId});database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)').run(sequence,JSON.stringify(rejected));
      database.prepare('INSERT INTO commands VALUES (?,?)').run(rejected.commandId,JSON.stringify({hash:commandHash(rejected),result:'rejected'}));
    }database.exec('COMMIT');
  }finally{if(database.inTransaction)database.exec('ROLLBACK');database.close();}
  f.store=TaskStore.openHandoffEngine(f.root);
}

test('eight free units cannot admit handoff nine can fund successor lifecycle and mission completion at event1000', t => {
  for(const available of [8,9]){
    const f=fixture(t),predecessor=failed(t,f),cmd=request(f,predecessor);padRejected(f,predecessor.taskId,999-available);
    try{
      if(available===8){const before=f.store.snapshot();assert.throws(()=>handoff(f,cmd),/mock-reserved-history-limit/);
        assert.deepEqual(f.store.snapshot(),before);assert.equal(f.store.registry().length,1);continue;}
      assert.equal(handoff(f,cmd),'accepted');assert.throws(()=>f.store.execute(bytes(command())),/mock-reserved-history-limit/);
      assert.equal(handoff(f,cmd),'accepted');finish(t,f,start(f,cmd,true));padRejected(f,predecessor.taskId,999);
      assert.equal(mission(f),'accepted');assert.equal(f.store.owner().mission().completion.sequence,1000);
      const expected=f.store.snapshot();f.store.close();f.store=TaskStore.openHandoffEngine(f.root);assert.deepEqual(f.store.snapshot(),expected);
      assert.equal(handoff(f,cmd),'accepted');assert.deepEqual(f.store.snapshot(),expected);
    }finally{f.store.close();}
  }
});

test('changed lineage title sequence cycle actor decision ledger and task projection refuse reopen', t => {
  for(const kind of ['title','sequence','cycle','actor','decision','hash','task']){
    const f=fixture(t),predecessor=failed(t,f),cmd=request(f,predecessor);handoff(f,cmd);f.store.close();
    const database=new Database(path.join(f.root,'core.sqlite'));
    try{
      if(['title','sequence','cycle'].includes(kind)){const row=JSON.parse(database.prepare('SELECT value FROM handoffs').get().value);
        if(kind==='title')row.title='Changed';else if(kind==='sequence')row.handoffSequence=1;else row.successorTaskId=predecessor.taskId;
        database.prepare('UPDATE handoffs SET value=?').run(JSON.stringify(row));
      }else if(['actor','decision'].includes(kind)){const row=database.prepare('SELECT sequence,body FROM events WHERE type=\'team.task.handoff\'').get(),body=JSON.parse(row.body);
        if(kind==='actor')body.actor=predecessor.memberId;else body.result='rejected';database.prepare('UPDATE events SET body=? WHERE sequence=?').run(JSON.stringify(body),row.sequence);
      }else if(kind==='hash'){const row=JSON.parse(database.prepare('SELECT value FROM commands WHERE id=?').get(cmd.commandId).value);row.hash='0'.repeat(64);database.prepare('UPDATE commands SET value=? WHERE id=?').run(JSON.stringify(row),cmd.commandId);}
      else database.prepare('UPDATE tasks SET value=? WHERE id=?').run(JSON.stringify('created'),cmd.successorTaskId);
    }finally{database.close();}
    assert.throws(()=>TaskStore.openHandoffEngine(f.root),/mock-projection-drift|invalid-handoff-decision/);
  }
});

test('injected accepted handoff cannot bypass pending failure eligibility during replay', t => {
  const f=fixture(t),predecessor=startTask(f,{approved:true});f.store.claim(predecessor.effectId);observe(f,predecessor);
  const cmd=request(f,predecessor);f.store.close();const database=new Database(path.join(f.root,'core.sqlite'));
  try{const sequence=database.prepare('SELECT max(sequence) AS n FROM events').get().n+1;
    database.prepare('INSERT INTO events VALUES (?,?,?)').run(sequence,'team.task.handoff',JSON.stringify({command:cmd,actor:f.setup.leaderId,result:'accepted'}));
  }finally{database.close();}
  assert.throws(()=>TaskStore.openHandoffEngine(f.root),/invalid-handoff-decision/);
});

for(const operation of ['handoff','missionComplete'])for(const barrier of ['before','after'])test(`recovery ${operation} crash ${barrier} COMMIT retains one decision without resend`,async t=>{
  const f=fixture(t),predecessor=failed(t,f),link=request(f,predecessor);let written;
  if(operation==='missionComplete'){handoff(f,link);written=finish(t,f,start(f,link,true));}
  const cmd=operation==='handoff'?link:{type:'team.mission.complete',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,summary:'Recovered successfully'};
  const before=f.store.snapshot();f.store.close();const envelope={op:operation,command:cmd};
  const host=launch('openHandoffEngine',f.root,barrier,'mock-host.cjs');
  try{assert.deepEqual(await host.read(),{ready:true});host.send(JSON.stringify(envelope));assert.deepEqual(await host.read(),{barrier});}finally{await host.stop();}
  const recovery=launch('openHandoffEngine',f.root,null,'mock-host.cjs');
  try{assert.deepEqual(await recovery.read(),{ready:true});recovery.send(JSON.stringify({op:'snapshot'}));const initial=(await recovery.read()).result;
    if(barrier==='before')assert.deepEqual(initial,before);else assert(initial.commands.some(([id])=>id===cmd.commandId));
    recovery.send(JSON.stringify(envelope));assert.equal((await recovery.read()).result,'accepted');recovery.send(JSON.stringify({op:'snapshot'}));const after=(await recovery.read()).result;
    assert.equal(after.commands.length,before.commands.length+1);assert.equal(after.handoffs.length,1);
    assert.equal(after.tasks[0][1],'failed');if(written)assert.equal(written.observe().rows.length,1);
    if(operation==='missionComplete')assert.equal(after.sessions[0][1].status,'completed');else assert.equal(after.tasks[1][1],'queued');
  }finally{await recovery.stop();}
});
