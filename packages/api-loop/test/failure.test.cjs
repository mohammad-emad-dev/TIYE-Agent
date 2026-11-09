'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore}=require('../../core/dist'),{privateRoot,command,bytes}=require('../../core/test/helpers.cjs');
const {session}=require('../../core/test/mock-fixtures.cjs');
const {observeFailure,startTask}=require('./failure-fixtures.cjs');
const {createCoreFailureScenario}=require('../dist');
const codec=require('../../api-adapter/dist');
const input=()=>({version:1,runId:randomUUID(),text:'Inspect only trusted failure notices'});
async function fixture(t,{mode='failure-view',pause='none',state='empty',count=0,capacity=false}={}){
  const root=privateRoot(t),setup=session();let store=TaskStore.createHandoffEngine(root),scenario;const f={root,store,setup};
  try{
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');let notices=[];
    if(state==='awaiting'){const planned=startTask(f,{approved:true});notices=[observeFailure(f,planned,{close:false})];}
    else if(state==='closed'){const planned=startTask(f,{approved:true});notices=[observeFailure(f,planned,{close:true})];}
    else if(state==='mixed'){
      // A member with an awaiting-reconciliation task cannot start another one;
      // seed the second closed notice on the other session member.
      const states=[{close:true,memberId:setup.members[1].memberId},{close:false,memberId:setup.members[1].memberId},{close:true,memberId:setup.members[0].memberId}];
      for(const item of states){const planned=startTask(f,{approved:true,memberId:item.memberId});notices.push(observeFailure(f,planned,{close:item.close}));}}
    if(count){notices=[];for(let i=0;i<count;i++){const planned=startTask(f,{approved:true});notices.push(observeFailure(f,planned,{close:i%2===0}));}}
    if(capacity){
      const existing=command();store.execute(bytes(existing));
      store.close();const database=new Database(require('node:path').join(root,'core.sqlite'));
      try{database.exec('BEGIN IMMEDIATE');const start=database.prepare('SELECT max(sequence) AS count FROM events').get().count+1;
        const append=database.prepare("INSERT INTO events VALUES (?,'task.create',?)"),decision=database.prepare('INSERT INTO commands VALUES (?,?)'),{commandHash}=require('../../core/dist/command');
        for(let sequence=start;sequence<=999;sequence++){const rejected=command({taskId:existing.taskId});append.run(sequence,JSON.stringify(rejected));decision.run(rejected.commandId,JSON.stringify({hash:commandHash(rejected),result:'rejected'}));}
        database.exec('COMMIT');
      }finally{if(database.inTransaction)database.exec('ROLLBACK');database.close();}
      store=TaskStore.openHandoffEngine(root);f.store=store;
    }
    const catalog={members:setup.members.map((row,i)=>({memberRef:'member'+i,memberId:row.memberId}))};
    const binding={version:1,sessionId:setup.sessionId,memberId:setup.leaderId};scenario=createCoreFailureScenario(store);
    const api=scenario.create(binding,catalog,mode,pause);await api.loop.start();
    return {...f,...api,scenario,binding,catalog,notices,before:store.snapshot(),async close(){
      await scenario.dispose();const view=api.fixture.inspect();assert.equal(view.timers,0);assert.equal(view.subscribers,0);assert.equal(view.pumping,false);assert.equal(view.scheduled,false);
      assert(api.fixture.adapter().requests.every(row=>row.closed&&!row.listening&&!row.waiters));store.close();}};
  }catch(error){if(scenario)await scenario.dispose();store.close();throw error;}
}
function event(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('failure event deadline'));},10000);
  const remove=f.loop.onEvent(row=>{if(predicate(row)){clearTimeout(timer);remove();resolve(row);}});});}
const phase=(f,name)=>event(f,row=>row.type==='phase'&&row.phase===name);
const stopCore=f=>f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));
async function replay(f){const before=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
  try{assert.deepEqual(reopened.snapshot(),before);}finally{reopened.close();}}
function durable(f){const snapshot=f.store.snapshot();return {commands:snapshot.commands.length,assignments:snapshot.assignments.length,
  failures:snapshot.failures.length,handoffs:(snapshot.handoffs??[]).length};}

test('Leader reads the mixed failure set without leaks or writes',async t=>{
  const f=await fixture(t,{mode:'failure-view',state:'mixed'});try{
    const before=durable(f),result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.toolReads,1);
    assert.equal(result.requests,2);assert(result.statusChecks<=8);
    const reading=result.history.find(row=>row.kind==='failures.result').result;assert.equal(reading.version,1);assert.equal(reading.sessionId,f.setup.sessionId);assert.equal(reading.status,'active');
    assert.equal(reading.failures.length,3);assert.deepEqual(reading.failures.map(row=>row.status),['closed','awaiting_reconciliation','closed']);
    for(const row of reading.failures){
      const notice=f.notices.find(notice=>notice.taskId===row.taskId);
      assert(notice);assert.equal(row.memberRef,'member'+f.setup.members.findIndex(member=>member.memberId===notice.memberId));
      assert.equal(row.role,notice.memberId===f.setup.leaderId?'leader':'member');
      assert.equal(row.reason,notice.reason);assert.equal(row.summary,notice.summary);assert.equal(row.observedSequence,notice.observedSequence);
      assert.equal(row.status,notice.closed?'closed':'awaiting_reconciliation');
      assert.equal(row.closedSequence,notice.closed?notice.closedSequence:null);assert(!('memberId'in row)&&!('attemptId'in row));
    }
    assert(reading.failures[0].observedSequence<reading.failures[1].observedSequence&&reading.failures[1].observedSequence<reading.failures[2].observedSequence);
    const historyText=JSON.stringify(result.history);for(const notice of f.notices)assert(!historyText.includes(notice.memberId));
    assert(result.text.includes(JSON.stringify(reading)));
    assert.deepEqual(durable(f),before);assert.deepEqual(f.store.snapshot().failures,f.before.failures);await replay(f);
  }finally{await f.close();}
});

test('Leader context continuation completes without a failure read',async t=>{
  const f=await fixture(t,{mode:'failure-context',state:'mixed'});try{
    const before=durable(f),result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.toolReads,1);
    assert.equal(result.requests,2);assert(result.statusChecks<=8);
    const context=result.history.find(row=>row.kind==='tool.result').result;
    assert.equal(context.sessionId,f.setup.sessionId);assert.equal(context.memberId,f.binding.memberId);assert.equal(context.role,'leader');
    assert(!result.history.some(row=>row.kind==='failures.result'));assert(result.text.includes('Context received'));
    assert.deepEqual(durable(f),before);assert.deepEqual(f.store.snapshot().failures,f.before.failures);await replay(f);
  }finally{await f.close();}
});

test('empty session reads no failures without writes',async t=>{
  const f=await fixture(t);try{
    const before=durable(f),result=await f.loop.run(input());assert.equal(result.state,'response_complete');
    assert.deepEqual(result.history.find(row=>row.kind==='failures.result').result.failures,[]);
    assert.deepEqual(durable(f),before);await replay(f);
  }finally{await f.close();}
});

for(const state of ['awaiting','closed'])
test('failure set keeps reconciliation state: '+state,async t=>{
  const f=await fixture(t,{state});try{
    const result=await f.loop.run(input()),reading=result.history.find(row=>row.kind==='failures.result').result;
    assert.equal(reading.failures.length,1);assert.equal(reading.failures[0].status,state==='closed'?'closed':'awaiting_reconciliation');
    if(state==='closed')assert(reading.failures[0].closedSequence>0);else assert.equal(reading.failures[0].closedSequence,null);
  }finally{await f.close();}
});

test('open-question cancellation and uncertain plus handed fidelity',async t=>{
  const f=await fixture(t);try{
    const questioned=startTask(f,{approved:true}),asked={type:'team.question.ask',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      taskId:questioned.taskId,questionId:randomUUID(),text:'Which approach should continue?',options:['Option A','Option B']};
    assert.equal(f.store.member(questioned.memberId).ask(bytes(asked)),'accepted');
    const cancelled=observeFailure(f,questioned,{close:true});
    assert.equal(f.store.snapshot().questions[0][1].status,'cancelled');
    const uncertainPlanned=startTask(f,{approved:true,memberId:f.setup.members[0].memberId}),uncertain=observeFailure(f,uncertainPlanned,{close:false});
    const handedPlanned=startTask(f,{approved:true}),handed=observeFailure(f,handedPlanned,{close:true});
    assert.equal(f.store.member(f.setup.leaderId).handoff(bytes({type:'team.task.handoff',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      predecessorTaskId:handed.taskId,successorTaskId:randomUUID(),targetMemberId:f.setup.members[1].memberId,title:'Explicit successor work'})),'accepted');
    const before=durable(f);
    const result=await f.loop.run(input()),reading=result.history.find(row=>row.kind==='failures.result').result;
    assert.equal(reading.failures.length,3);
    const cancelledRow=reading.failures.find(row=>row.taskId===cancelled.taskId),uncertainRow=reading.failures.find(row=>row.taskId===uncertain.taskId),handedRow=reading.failures.find(row=>row.taskId===handed.taskId);
    assert(cancelledRow&&uncertainRow&&handedRow);
    assert.equal(cancelledRow.summary,cancelled.summary);assert.equal(uncertainRow.status,'awaiting_reconciliation');assert.equal(handedRow.status,'closed');
    assert.deepEqual(durable(f),before);
  }finally{await f.close();}
});

test('non-Leader and foreign session refuse viewer binding before any adapter',async t=>{
  const f=await fixture(t,{state:'mixed'});try{
    const other=createCoreFailureScenario(f.store);
    try{
      for(const changes of [{memberId:f.setup.members[1].memberId},{sessionId:randomUUID()},{version:2}])assert.throws(()=>other.create({...f.binding,...changes},f.catalog));
      assert.deepEqual(f.store.snapshot(),f.before);
    }finally{await other.dispose();}
  }finally{await f.close();}
});

test('trusted roster rejects injection, duplication, overflow and drift',async t=>{
  const f=await fixture(t,{state:'mixed'});try{
    const other=createCoreFailureScenario(f.store);
    try{
      for(const catalog of [{...f.catalog,members:[...f.catalog.members,...f.catalog.members]},
        {...f.catalog,members:[{memberRef:'../bad',memberId:f.setup.members[0].memberId}]},
        {...f.catalog,members:[{memberRef:'unknown',memberId:randomUUID()}]},
        {...f.catalog,members:Array.from({length:6},(_,i)=>({memberRef:'member'+i,memberId:randomUUID()}))},
        {...f.catalog,members:[...f.catalog.members].reverse()},
        {...f.catalog,actor:'owner'}])assert.throws(()=>other.create(f.binding,catalog));
      assert.deepEqual(f.store.snapshot(),f.before);
    }finally{await other.dispose();}
  }finally{await f.close();}
});

test('old profiles refuse the failure loop and failure catalog',async t=>{
  const f=await fixture(t,{state:'mixed'});try{
    const old=[codec.createScriptedScenario(),codec.createScriptedLoopScenario(),codec.createScriptedReportingScenario(),codec.createScriptedQuestionScenario(),codec.createScriptedMissionScenario(),codec.createScriptedCoordinationScenario(),codec.createScriptedHandoffScenario()];
    try{
      const modes=['normal','loop-context','report-done','question-leader','mission-done','coordination-delegate','handoff-task'];
      for(let i=0;i<old.length;i++){assert.throws(()=>old[i].create(f.binding,'failure-view'));
        const api=old[i].create(f.binding,modes[i]);await api.adapter.start({...f.binding,briefing:'legacy profile'});
        await assert.rejects(api.adapter.send({version:1,kind:'failure-loop',requestId:randomUUID(),runId:randomUUID(),turn:1,catalog:{members:[]},messages:[{kind:'user',text:'x'}]}));assert.equal(api.fixture.inspect().seen,0);}
      assert.deepEqual(f.store.snapshot(),f.before);
    }finally{await Promise.all(old.map(row=>row.dispose()));}
  }finally{await f.close();}
});

for(const mode of ['failure-mixed','failure-duplicate','failure-extra','failure-disconnect','failure-forged-args',
  'failure-forged-call','failure-forged-context','failure-malformed','failure-truncated'])
test('invalid transcript cannot read: '+mode,async t=>{
  const f=await fixture(t,{mode,state:'mixed'});try{const result=await f.loop.run(input());assert.notEqual(result.state,'response_complete');assert.equal(result.toolReads,0);assert.deepEqual(f.store.snapshot(),f.before);}finally{await f.close();}
});

test('tool after the admitted read fences uncertainty without a second core reread',async t=>{
  const f=await fixture(t,{mode:'failure-after-tool',state:'mixed'});try{
    const result=await f.loop.run(input());assert.equal(result.state,'needs_attention');assert.equal(result.toolReads,2);
    assert.deepEqual(f.store.snapshot().failures,f.before.failures);
  }finally{await f.close();}
});

test('second read of either kind is refused at the bridge without rereading the core',async t=>{
  const f=await fixture(t,{mode:'failure-two-reads'});try{
    const result=await f.loop.run(input());
    assert.equal(result.state,'needs_attention');assert.equal(result.toolReads,2);
    assert.deepEqual(f.store.snapshot().failures,f.before.failures);
  }finally{await f.close();}
});

for(const mode of ['failure-text','failure-view'])
test('accepted read and text-only prose boundaries: '+mode,async t=>{
  const f=await fixture(t,{mode,state:'mixed'});try{const result=await f.loop.run(input());
    assert.equal(result.state,'response_complete');assert.equal(result.toolReads,mode==='failure-text'?0:1);
    assert.deepEqual(f.store.snapshot().failures,f.before.failures);
  }finally{await f.close();}
});

test('aborted snapshot read fences uncertainty without retry',async t=>{
  const f=await fixture(t,{pause:'before-read'}),original=f.store.snapshot;try{
    const reached=phase(f,'before-read'),pending=f.loop.run(input());await reached;let calls=0;
    f.store.snapshot=function(){if(++calls===2)throw new Error('fixture-failure-abort');return original.call(this);};
    f.fixture.release();const result=await pending;f.store.snapshot=original;assert.equal(calls,2);
    assert.equal(result.state,'needs_attention');assert.equal(result.toolReads,1);assert.equal(result.requests,1);
    assert.deepEqual(f.store.snapshot(),f.before);
  }finally{f.store.snapshot=original;await f.close();}
});

test('measured read overrun fences uncertainty despite verified cleanup',async t=>{
  const f=await fixture(t,{pause:'before-read'}),original=f.store.snapshot;try{
    const reached=phase(f,'before-read'),pending=f.loop.run(input());await reached;let calls=0;
    f.store.snapshot=function(){const value=original.call(this);if(++calls===2)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10025);return value;};
    f.fixture.release();const result=await pending;f.store.snapshot=original;assert(calls>=2);
    assert.equal(result.state,'needs_attention');assert.equal(result.toolReads,1);assert.equal(result.requests,1);
  }finally{f.store.snapshot=original;await f.close();}
});

for(const pause of ['before-read','after-read','before-continuation'])
test('core stop fencing: '+pause,async t=>{
  const f=await fixture(t,{pause,state:'mixed'});try{const reached=phase(f,pause),pending=f.loop.run(input());await reached;
    assert.equal(stopCore(f),'accepted');await f.loop.stop();const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.requests,1);
    assert.equal(result.toolReads,pause==='before-read'?0:1);await replay(f);
  }finally{await f.close();}
});
for(const fault of ['abort','lost'])test('failed core stop still fences the local loop: '+fault,async t=>{
  const f=await fixture(t,{pause:'after-read',state:'mixed'}),original=Database.prototype.exec;try{
    const reached=phase(f,'after-read'),pending=f.loop.run(input());await reached;let fired=false,caught;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER failure_stop_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-failure-stop'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-failure-stop');}return result;};
    try{stopCore(f);}catch(error){caught=error;}finally{Database.prototype.exec=original;await f.loop.stop();}
    assert(fired);assert.match(caught?.message??'',/fixture-failure-stop/);const result=await pending;assert.equal(result.state,'stopped');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

test('stop from the final notification preserves the read outcome',async t=>{
  const f=await fixture(t,{state:'mixed'});try{
    let stopping,decision,count=0;
    f.loop.onEvent(row=>{if(row.type==='run.finished'){count++;decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;
    assert.equal(count,1);assert.equal(decision,'accepted');
    assert.equal(result.state,'response_complete');assert.equal(result.toolReads,1);
    const reading=result.history.find(row=>row.kind==='failures.result').result;assert.equal(reading.failures.length,3);
    await replay(f);
  }finally{await f.close();}
});

test('closed store before continuation preserves known read with reopened durable state',async t=>{
  const f=await fixture(t,{pause:'before-continuation',state:'mixed'});try{
    const reached=phase(f,'before-continuation'),pending=f.loop.run(input());await reached;f.store.close();f.fixture.release();const result=await pending;
    assert.equal(result.state,'failed');assert.equal(result.toolReads,1);assert.equal(result.requests,1);await f.scenario.dispose();
    const reopened=TaskStore.openHandoffEngine(f.root);try{assert.deepEqual(reopened.snapshot().failures,f.before.failures);}finally{reopened.close();}
  }finally{await f.close();}
});

test('status and failure codecs reject overflow, foreign rows and forged selector fields',async t=>{
  const f=await fixture(t,{mode:'failure-view',state:'mixed'});try{
    const result=await f.loop.run(input()),reading=result.history.find(row=>row.kind==='failures.result').result;
    for(const args of [{taskRef:'task0'},{memberId:f.setup.members[1].memberId},{unknown:true}])assert.throws(()=>codec.failureArgs(args));
    assert.throws(()=>codec.failureStatus({...reading,foreign:true}));assert.throws(()=>codec.failureStatus({...reading,failures:[...reading.failures,...reading.failures]}));
    const rows=Array.from({length:100},(_,i)=>({taskId:randomUUID(),memberRef:'member1',reason:'crash',summary:'x'.repeat(256),observedSequence:i+1,status:'closed',closedSequence:i+1,role:'member'}));
    assert.throws(()=>codec.failureStatus({...reading,failures:rows}),/failure-status-bytes/);
    assert.throws(()=>codec.failureStatus({...reading,failures:Array.from({length:101},()=>rows[0])}));
  }finally{await f.close();}
});

test('read succeeds without consuming capacity on the 999-command ledger',async t=>{
  const f=await fixture(t,{capacity:true});try{
    const before=durable(f),result=await f.loop.run(input());
    assert.equal(result.state,'response_complete');assert.equal(result.toolReads,1);
    assert.equal(result.history.find(row=>row.kind==='failures.result').result.failures.length,0);
    assert.deepEqual(durable(f),before);await replay(f);
  }finally{await f.close();}
});

for(const mode of ['failure-final-malformed','failure-continuation-ambiguous','failure-large-text'])
test('failed continuation preserves accepted read: '+mode,async t=>{
  const f=await fixture(t,{mode,state:'mixed'});try{
    const result=await f.loop.run(input());
    assert.equal(result.state,mode==='failure-continuation-ambiguous'?'needs_attention':'failed');
    assert.equal(result.toolReads,1);assert.equal(result.requests,2);
    assert.deepEqual(f.store.snapshot().failures,f.before.failures);
  }finally{await f.close();}
});
