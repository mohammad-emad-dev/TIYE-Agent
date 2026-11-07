'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore}=require('../../core/dist'),{privateRoot,command,bytes}=require('../../core/test/helpers.cjs');
const {session}=require('../../core/test/mock-fixtures.cjs');
const {startTask,complete,report,enqueue,ask,observer}=require('../../core/test/question-fixtures.cjs');
const {createCoreHandoffScenario,createCoreCoordinationScenario}=require('../dist');
const codec=require('../../api-adapter/dist');
const input=()=>({version:1,runId:randomUUID(),text:'Hand off one eligible failed task with a bounded title'});
function observeFailure(f,planned){
  const failure={type:'team.task.failure',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
    taskId:planned.taskId,memberId:planned.memberId,attemptId:planned.attemptId,reason:'crash',summary:'Private synthetic failure detail'};
  assert.equal(f.store.owner().observeFailure(bytes(failure)),'accepted');return failure;
}
async function fixture(t,{mode='handoff-task',pause='none',count=1,capacity=false}={}){
  const root=privateRoot(t),setup=session();let store=TaskStore.createHandoffEngine(root),scenario;const f={root,store,setup};
  try{
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');
    const tasks=[];
    for(let i=0;i<count;i++){const planned=startTask(f);observeFailure(f,planned);tasks.push({taskRef:'task'+i,taskId:planned.taskId});}
    if(capacity){
      store.close();const database=new Database(require('node:path').join(root,'core.sqlite'));
      try{database.exec('BEGIN IMMEDIATE');const start=database.prepare('SELECT max(sequence) AS count FROM events').get().count+1;
        const append=database.prepare("INSERT INTO events VALUES (?,'task.create',?)"),decision=database.prepare('INSERT INTO commands VALUES (?,?)'),{commandHash}=require('../../core/dist/command');
        for(let sequence=start;sequence<=999;sequence++){const rejected=command({taskId:tasks[0].taskId});append.run(sequence,JSON.stringify(rejected));decision.run(rejected.commandId,JSON.stringify({hash:commandHash(rejected),result:'rejected'}));}
        database.exec('COMMIT');
      }finally{if(database.inTransaction)database.exec('ROLLBACK');database.close();}
      store=TaskStore.openHandoffEngine(root);f.store=store;
    }
    const catalog={tasks,members:setup.members.map((row,i)=>({memberRef:'member'+i,memberId:row.memberId}))};
    const binding={version:1,sessionId:setup.sessionId,memberId:setup.leaderId};scenario=createCoreHandoffScenario(store);
    const api=scenario.create(binding,catalog,mode,pause);await api.loop.start();
    return {...f,...api,scenario,binding,catalog,before:store.snapshot(),async close(){
      await scenario.dispose();const view=api.loop.inspect();assert.equal(view.timers,0);assert.equal(view.subscribers,0);assert.equal(view.pumping,false);assert.equal(view.scheduled,false);
      assert(api.fixture.adapter().requests.every(row=>row.closed&&!row.listening&&!row.waiters));store.close();}};
  }catch(error){if(scenario)await scenario.dispose();store.close();throw error;}
}
function event(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('handoff event deadline'));},10000);
  const remove=f.loop.onEvent(row=>{if(predicate(row)){clearTimeout(timer);remove();resolve(row);}});});}
const phase=(f,name)=>event(f,row=>row.type==='phase'&&row.phase===name);
const stopCore=f=>f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));
async function replay(f){const before=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
  try{assert.deepEqual(reopened.snapshot(),before);}finally{reopened.close();}}

for(const mode of ['handoff-task','handoff-context'])
test('Leader hands off one eligible failed task with actual continuation receipt: '+mode,async t=>{
  const f=await fixture(t,{mode,count:6});try{
    const predecessor=f.catalog.tasks[0].taskId;
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.handoffState,'accepted');
    assert.equal(result.handoffAttempts,1);assert.equal(result.requests,mode==='handoff-task'?2:3);assert(result.statusChecks<=8);
    const current=f.store.snapshot(),edge=current.handoffs.find(([id])=>id===predecessor)[1];
    assert.equal(edge.sessionId,f.setup.sessionId);assert.equal(edge.predecessorTaskId,predecessor);
    assert.equal(edge.successorTaskId,result.handoffReceipt.handoff.successorTaskId);assert.equal(edge.targetMemberId,f.setup.members[1].memberId);
    assert.equal(edge.title,'Explicit successor work');assert.equal(edge.createdBy,f.setup.leaderId);assert(edge.handoffSequence>0);
    const assignment=current.assignments.find(([id])=>id===edge.successorTaskId)[1];
    assert.equal(assignment.sessionId,f.setup.sessionId);assert.equal(assignment.memberId,f.setup.members[1].memberId);
    assert.equal(assignment.effectId,null);assert.equal(assignment.closed,false);assert.equal(assignment.result,null);
    assert.equal(current.tasks.find(([id])=>id===edge.successorTaskId)[1],'queued');
    assert.equal(current.tasks.find(([id])=>id===predecessor)[1],'failed');
    assert.deepEqual(current.effects,f.before.effects);assert.deepEqual(current.approvals,f.before.approvals);
    const sent=f.fixture.adapter().requests.at(-1).input.messages.find(row=>row.kind==='handoff.result').result;
    assert.deepEqual(sent,result.handoffReceipt);assert(result.text.includes(JSON.stringify(sent)));assert.equal(current.commands.find(([id])=>id===result.handoffCommandId)[1].result,'accepted');
    assert.equal(result.successorTaskId,edge.successorTaskId);
    assert.throws(()=>{result.handoffReceipt.handoff.successorTaskId='forged';});sent.handoff.successorTaskId='inspection-copy';assert.equal(result.handoffReceipt.handoff.successorTaskId,edge.successorTaskId);assert.throws(()=>f.loop.run(input()),/loop-admission/);
    const first=f.fixture.adapter().requests[0].input;assert.equal(first.catalog.tasks.length,6);assert(!JSON.stringify(first.catalog).includes(predecessor));await replay(f);
  }finally{await f.close();}
});

test('non-Leader and foreign session refuse handoff binding before any adapter',async t=>{
  const f=await fixture(t);try{
    const other=createCoreHandoffScenario(f.store);
    try{
      for(const changes of [{memberId:f.setup.members[1].memberId},{sessionId:randomUUID()},{version:2}])assert.throws(()=>other.create({...f.binding,...changes},f.catalog));
      assert.deepEqual(f.store.snapshot(),f.before);
    }finally{await other.dispose();}
  }finally{await f.close();}
});

test('trusted catalog rejects injection, duplicates, overflow and roster drift',async t=>{
  const f=await fixture(t);try{
    const other=createCoreHandoffScenario(f.store);
    try{
      for(const catalog of [{...f.catalog,tasks:[...f.catalog.tasks,...f.catalog.tasks]},
        {...f.catalog,tasks:[{taskRef:'../bad',taskId:f.catalog.tasks[0].taskId}]},
        {...f.catalog,tasks:[{taskRef:'unknown',taskId:randomUUID()}]},
        {...f.catalog,tasks:Array.from({length:7},(_,i)=>({taskRef:'task'+i,taskId:randomUUID()}))},
        {...f.catalog,members:[...f.catalog.members].reverse()},
        {...f.catalog,members:[...f.catalog.members,{memberRef:'extra',memberId:randomUUID()}]}])assert.throws(()=>other.create(f.binding,catalog));
      assert.deepEqual(f.store.snapshot(),f.before);
    }finally{await other.dispose();}
  }finally{await f.close();}
});

test('old profiles refuse the handoff loop and handoff catalog',async t=>{
  const f=await fixture(t);try{
    const old=[codec.createScriptedScenario(),codec.createScriptedLoopScenario(),codec.createScriptedReportingScenario(),codec.createScriptedQuestionScenario(),codec.createScriptedMissionScenario(),codec.createScriptedCoordinationScenario()];
    try{
      const modes=['normal','loop-context','report-done','question-leader','mission-done','coordination-delegate'];
      for(let i=0;i<old.length;i++){assert.throws(()=>old[i].create(f.binding,'handoff-task'));
        const api=old[i].create(f.binding,modes[i]);await api.adapter.start({...f.binding,briefing:'legacy profile'});
        await assert.rejects(api.adapter.send({version:1,kind:'handoff-loop',requestId:randomUUID(),runId:randomUUID(),turn:1,catalog:{},messages:[{kind:'user',text:'x'}]}));assert.equal(api.fixture.inspect().seen,0);}
      assert.deepEqual(f.store.snapshot(),f.before);
    }finally{await Promise.all(old.map(row=>row.dispose()));}
  }finally{await f.close();}
});

test('already-handed predecessor is an exact rejection, not this command success',async t=>{
  const f=await fixture(t,{mode:'handoff-task',pause:'before-handoff'});try{
    const reached=phase(f,'before-handoff'),pending=f.loop.run(input());await reached;
    const prior={type:'team.task.handoff',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      predecessorTaskId:f.catalog.tasks[0].taskId,successorTaskId:randomUUID(),targetMemberId:f.setup.members[0].memberId,title:'Trusted prior successor'};
    assert.equal(f.store.member(f.setup.leaderId).handoff(bytes(prior)),'accepted');const before=f.store.snapshot();f.fixture.release();
    const result=await pending;assert.equal(result.state,'response_complete');assert.equal(result.handoffState,'rejected');assert.equal(result.handoffReceipt.handoff,null);
    assert.equal(f.store.snapshot().commands.find(([id])=>id===result.handoffCommandId)[1].result,'rejected');
    const lineage=f.store.snapshot().handoffs.find(([id])=>id===f.catalog.tasks[0].taskId)[1];
    assert.equal(lineage.successorTaskId,prior.successorTaskId);assert.notEqual(result.handoffCommandId,prior.commandId);
    assert.deepEqual(f.store.snapshot().handoffs,before.handoffs);await replay(f);
  }finally{await f.close();}
});

test('two handoffs of the same failed task keep first lineage and reject the second',async t=>{
  const f=await fixture(t,{mode:'handoff-task'});try{
    const first=await f.loop.run(input());assert.equal(first.handoffState,'accepted');
    const predecessor=f.catalog.tasks[0].taskId,edge=f.store.snapshot().handoffs.find(([id])=>id===predecessor)[1];
    const second={type:'team.task.handoff',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      predecessorTaskId:predecessor,successorTaskId:randomUUID(),targetMemberId:f.setup.members[1].memberId,title:'Second attempt'};
    assert.equal(f.store.member(f.setup.leaderId).handoff(bytes(second)),'rejected');
    assert.equal(f.store.snapshot().handoffs.find(([id])=>id===predecessor)[1].successorTaskId,edge.successorTaskId);
  }finally{await f.close();}
});

test('successor identity and title grammar bound every handoff call',async t=>{
  const f=await fixture(t);try{
    for(const args of [{taskRef:'task0',memberRef:'member1',title:''},{taskRef:'task0',memberRef:'member1',title:'x'.repeat(257)},
      {taskRef:'task0',memberRef:'member1',title:'\ud800'},{taskRef:'../x',memberRef:'member1',title:'Explicit successor work'},
      {taskRef:'task0',memberRef:'member1'}])assert.throws(()=>codec.handoffArgs(args));
    for(const receipt of [{callId:randomUUID(),commandId:randomUUID(),sessionId:f.setup.sessionId,taskRef:'task0',memberRef:'member1',decision:'accepted',handoff:null},
      {callId:randomUUID(),commandId:randomUUID(),sessionId:f.setup.sessionId,taskRef:'task0',memberRef:'member1',decision:'rejected',handoff:{successorTaskId:randomUUID(),targetMemberId:randomUUID(),handoffSequence:1}},
      {callId:randomUUID(),commandId:randomUUID(),sessionId:f.setup.sessionId,taskRef:'task0',memberRef:'member1',decision:'accepted',handoff:{successorTaskId:randomUUID(),targetMemberId:randomUUID(),handoffSequence:0}}])assert.throws(()=>codec.handoffReceipt(receipt));
    assert(codec.handoffArgs({taskRef:'task0',memberRef:'member1',title:'Explicit successor work'}));
  }finally{await f.close();}
});

for(const mode of ['handoff-mixed','handoff-duplicate','handoff-extra','handoff-disconnect','handoff-forged-args',
  'handoff-forged-call','handoff-forged-context','handoff-malformed','handoff-truncated'])
test('invalid transcript cannot hand off: '+mode,async t=>{
  const f=await fixture(t,{mode});try{const result=await f.loop.run(input());assert.notEqual(result.state,'response_complete');assert.equal(result.handoffAttempts,0);assert.deepEqual(f.store.snapshot(),f.before);}finally{await f.close();}
});

test('handoff is last even after known rejection: handoff-after-tool',async t=>{
  const f=await fixture(t,{mode:'handoff-after-tool',pause:'before-handoff'});try{
    const reached=phase(f,'before-handoff'),pending=f.loop.run(input());await reached;
    const prior={type:'team.task.handoff',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      predecessorTaskId:f.catalog.tasks[0].taskId,successorTaskId:randomUUID(),targetMemberId:f.setup.members[1].memberId,title:'Trusted prior successor'};
    assert.equal(f.store.member(f.setup.leaderId).handoff(bytes(prior)),'accepted');
    f.fixture.release();const result=await pending;assert.equal(result.state,'failed');assert.equal(result.handoffState,'rejected');assert.equal(result.handoffAttempts,1);assert.equal(result.toolReads,0);
  }finally{await f.close();}
});

for(const mode of ['handoff-after-tool','handoff-two-reads','handoff-text'])
test('accepted handoff, read and prose boundaries: '+mode,async t=>{
  const f=await fixture(t,{mode});try{const result=await f.loop.run(input());
    assert.equal(result.state,mode==='handoff-text'?'response_complete':'failed');assert.equal(result.handoffAttempts,mode.includes('after-')?1:0);
  }finally{await f.close();}
});

for(const rejected of [false,true])for(const fault of ['abort','lost'])
test('actual handoff '+fault+' acknowledgement remains uncertain: '+rejected,async t=>{
  const f=await fixture(t,{pause:'before-handoff'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-handoff'),pending=f.loop.run(input());await reached;
    if(rejected){const prior={type:'team.task.handoff',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      predecessorTaskId:f.catalog.tasks[0].taskId,successorTaskId:randomUUID(),targetMemberId:f.setup.members[1].memberId,title:'Trusted prior successor'};
      assert.equal(f.store.member(f.setup.leaderId).handoff(bytes(prior)),'accepted');}
    let fired=false;Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER handoff_abort BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'fixture-handoff-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-handoff-lost');}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;assert(fired);assert.equal(result.state,'needs_attention');assert.equal(result.handoffState,'uncertain');
    assert.equal(result.handoffAttempts,1);assert.equal(result.requests,1);assert.equal(result.handoffReceipt,undefined);assert.equal(result.localClosed,true);
    const command=f.store.snapshot().commands.find(([id])=>id===result.handoffCommandId)?.[1];assert.equal(command?.result,fault==='abort'?undefined:rejected?'rejected':'accepted');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

for(const pause of ['before-handoff','after-handoff','before-continuation'])
test('core stop cancels handoff intent while preserving historical receipt: '+pause,async t=>{
  const f=await fixture(t,{pause});try{const reached=phase(f,pause),pending=f.loop.run(input());await reached;
    assert.equal(stopCore(f),'accepted');await f.loop.stop();const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.requests,1);
    assert.equal(result.handoffState,pause==='before-handoff'?'none':'accepted');if(result.handoffReceipt)assert.equal(f.store.snapshot().assignments.find(([id])=>id===result.handoffReceipt.handoff.successorTaskId)[1].closed,true);await replay(f);
  }finally{await f.close();}
});

for(const fault of ['abort','lost'])test('failed core stop still fences local loop: '+fault,async t=>{
  const f=await fixture(t,{pause:'after-handoff'}),original=Database.prototype.exec;try{
    const reached=phase(f,'after-handoff'),pending=f.loop.run(input());await reached;let fired=false,caught;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER handoff_stop_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-handoff-stop'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-handoff-stop');}return result;};
    try{stopCore(f);}catch(error){caught=error;}finally{Database.prototype.exec=original;await f.loop.stop();}
    assert(fired);assert.match(caught?.message??'',/fixture-handoff-stop/);const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.handoffState,'accepted');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

test('post-commit real ten-second overrun fences unknown handoff despite verified cleanup',async t=>{
  const f=await fixture(t,{pause:'before-handoff'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-handoff'),pending=f.loop.run(input());await reached;let delayed=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);if(sql==='COMMIT'&&!delayed){delayed=true;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10025);}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;assert(delayed);assert.equal(result.state,'needs_attention');assert.equal(result.handoffState,'uncertain');assert.equal(result.localClosed,true);
    assert.equal(result.requests,1);assert.equal(f.store.snapshot().assignments.length,2);await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

for(const mode of ['handoff-final-malformed','handoff-continuation-ambiguous','handoff-large-text'])
test('failed continuation preserves accepted handoff receipt: '+mode,async t=>{
  const f=await fixture(t,{mode});try{const result=await f.loop.run(input());assert.equal(result.state,mode==='handoff-continuation-ambiguous'?'needs_attention':'failed');
    assert.equal(result.handoffState,'accepted');assert.equal(result.requests,2);assert.equal(f.store.snapshot().assignments.length,2);await replay(f);
  }finally{await f.close();}
});

test('closed store before continuation preserves known receipt and actual reopened successor',async t=>{
  const f=await fixture(t,{pause:'after-handoff'});try{
    const reached=phase(f,'after-handoff'),pending=f.loop.run(input());await reached;f.store.close();f.fixture.release();const result=await pending;
    assert.equal(result.state,'failed');assert.equal(result.handoffState,'accepted');assert.equal(result.requests,1);await f.scenario.dispose();
    const reopened=TaskStore.openHandoffEngine(f.root);try{assert.equal(reopened.snapshot().assignments.find(([id])=>id===result.handoffReceipt.handoff.successorTaskId)[1].taskId,result.handoffReceipt.handoff.successorTaskId);}finally{reopened.close();}
  }finally{await f.close();}
});

test('independent closure gates handoff and late callback cannot change final reply',async t=>{
  const f=await fixture(t,{mode:'handoff-late'});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),first=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',first);assert.deepEqual(f.store.snapshot(),f.before);const next=event(f,row=>row.type==='request.admitted');f.fixture.releaseAdapter(first);
    const second=(await next).requestId;await f.fixture.waitAdapter('end_candidate',second);const before=f.fixture.inspect();f.fixture.late(first);assert.deepEqual(f.fixture.inspect(),before);
    f.fixture.releaseAdapter(second);assert.equal((await pending).handoffState,'accepted');
  }finally{await f.close();}
});

test('observer stop before writer prevents any attempt reservation',async t=>{
  const f=await fixture(t);try{let stopping;f.loop.onEvent(row=>{if(row.type==='phase'&&row.phase==='before-handoff'){stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;assert.equal(result.state,'stopped');assert.equal(result.handoffAttempts,0);assert.equal(f.store.snapshot().handoffs.length,0);
  }finally{await f.close();}
});

test('stop of already-created continuation aborts it once and keeps acceptance',async t=>{
  const f=await fixture(t);try{let count=0,stopping;f.loop.onEvent(row=>{if(row.type==='request.admitted'&&++count===2)queueMicrotask(()=>{stopCore(f);stopping=f.loop.stop();});});
    const result=await f.loop.run(input());await stopping;assert.equal(result.state,'stopped');assert.equal(result.handoffState,'accepted');assert.equal(result.requests,2);
    assert.equal(f.fixture.adapter().requests[1].creates,1);assert.equal(f.fixture.adapter().requests[1].aborts,1);
  }finally{await f.close();}
});

test('capacity refusal fences handoff attempt without manufacturing a receipt',async t=>{
  const f=await fixture(t,{pause:'before-handoff',capacity:true});try{
    const reached=phase(f,'before-handoff'),pending=f.loop.run(input());await reached;
    f.fixture.release();const result=await pending;assert.equal(result.state,'needs_attention');assert.equal(result.handoffState,'uncertain');assert.equal(result.handoffReceipt,undefined);
    assert.equal(stopCore(f),'accepted');await replay(f);
  }finally{await f.close();}
});

test('rejected foreign core stop still permits local fencing without undoing handoff',async t=>{
  const f=await fixture(t,{pause:'after-handoff'});try{
    const reached=phase(f,'after-handoff'),pending=f.loop.run(input());await reached;
    try{assert.equal(f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:randomUUID()})),'rejected');}
    finally{await f.loop.stop();}
    const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.handoffState,'accepted');
  }finally{await f.close();}
});

test('failed final active check retains receipt without accepting text',async t=>{
  const f=await fixture(t,{mode:'handoff-late'});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),first=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',first);const next=event(f,row=>row.type==='request.admitted');f.fixture.releaseAdapter(first);
    const second=(await next).requestId;await f.fixture.waitAdapter('end_candidate',second);f.store.close();f.fixture.releaseAdapter(second);
    const result=await pending;assert.equal(result.state,'failed');assert.equal(result.handoffState,'accepted');assert.equal(result.text,'');assert.equal(result.requests,2);
  }finally{await f.close();}
});

test('stop from final handoff notification preserves accepted conversation and closes queued successor',async t=>{
  const f=await fixture(t);try{
    let stopping,decision,notificationState,count=0;
    f.loop.onEvent(row=>{if(row.type==='run.finished'){count++;notificationState=row.state;decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;
    assert.equal(count,1);assert.equal(notificationState,'response_complete');assert.equal(decision,'accepted');
    assert.equal(result.state,'response_complete');assert.equal(result.handoffState,'accepted');assert.equal(result.requests,2);
    assert(result.text.includes(JSON.stringify(result.handoffReceipt)));
    const assignment=f.store.snapshot().assignments.find(([id])=>id===result.handoffReceipt.handoff.successorTaskId)[1];
    assert.equal(assignment.taskId,result.handoffReceipt.handoff.successorTaskId);
    assert.equal(assignment.closed,true);assert.equal(assignment.effectId,null);
    await replay(f);
  }finally{await f.close();}
});

test('lost acknowledgement fences later runs without retry or receipt',async t=>{
  const f=await fixture(t,{pause:'before-handoff'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-handoff'),pending=f.loop.run(input());await reached;
    let fired=false;Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&sql==='COMMIT'){fired=true;throw new Error('fixture-exit-lost');}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;assert(fired);
    assert.equal(result.state,'needs_attention');assert.equal(result.handoffState,'uncertain');assert.equal(result.handoffReceipt,undefined);
    assert.equal(result.requests,1);assert.equal(result.handoffAttempts,1);
    assert.throws(()=>f.loop.run({...input(),runId:randomUUID()}),/loop-admission/);
    assert.equal(f.fixture.adapter().requests.length,1);
    const command=f.store.snapshot().commands.find(([id])=>id===result.handoffCommandId)?.[1];
    assert.equal(command?.result,'accepted');assert.equal(result.handoffReceipt,undefined);
    await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});
