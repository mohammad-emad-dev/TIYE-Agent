'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore}=require('../../core/dist'),{privateRoot,command,bytes}=require('../../core/test/helpers.cjs');
const {session}=require('../../core/test/mock-fixtures.cjs');
const {startTask,complete,report,enqueue,ask,observer}=require('../../core/test/question-fixtures.cjs');
const {createCoreCoordinationScenario}=require('../dist');
const codec=require('../../api-adapter/dist');
const input=()=>({version:1,runId:randomUUID(),text:'Inspect or queue only trusted prepared work'});
async function fixture(t,{mode='coordination-delegate',pause='none',state='empty',count=1,capacity=false}={}){
  const root=privateRoot(t),setup=session();let store=TaskStore.createHandoffEngine(root),scenario;const f={root,store,setup};
  try{
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');let planned;
    if(state==='queued')planned=enqueue(f);
    else if(state!=='empty'){
      planned=startTask(f,{approved:true});
      if(state==='blocked')assert.equal(store.member(planned.memberId).ask(bytes(ask(f,planned))),'accepted');
      if(state==='running'||state==='uncertain'){observer(t,planned);store.claim(planned.effectId);if(state==='uncertain')store.settle(planned.effectId,bytes({scope:'unavailable'}));}
      if(state==='done'||state==='failed'){complete(t,f,planned);assert.equal(store.member(planned.memberId).report(bytes(report(f,planned,state))),'accepted');}
    }
    const tasks=[];for(let i=0;i<count;i++){const task=command();store.execute(bytes(task));assert.equal(store.snapshot().tasks.find(([id])=>id===task.taskId)[1],'created');tasks.push({taskRef:'task'+i,taskId:task.taskId});}
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
    const binding={version:1,sessionId:setup.sessionId,memberId:setup.leaderId};scenario=createCoreCoordinationScenario(store);
    const api=scenario.create(binding,catalog,mode,pause);await api.loop.start();
    return {...f,...api,scenario,binding,catalog,planned,before:store.snapshot(),async close(){
      await scenario.dispose();const view=api.fixture.inspect();assert.equal(view.timers,0);assert.equal(view.subscribers,0);assert.equal(view.pumping,false);assert.equal(view.scheduled,false);
      assert(api.fixture.adapter().requests.every(row=>row.closed&&!row.listening&&!row.waiters));store.close();}};
  }catch(error){if(scenario)await scenario.dispose();store.close();throw error;}
}
function event(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('coordination event deadline'));},10000);
  const remove=f.loop.onEvent(row=>{if(predicate(row)){clearTimeout(timer);remove();resolve(row);}});
});}
const phase=(f,name)=>event(f,row=>row.type==='phase'&&row.phase===name);
const stopCore=f=>f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));
async function replay(f){const before=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
  try{assert.deepEqual(reopened.snapshot(),before);}finally{reopened.close();}}

for(const mode of ['coordination-delegate','coordination-status','coordination-context'])
test('Leader queues prepared task once with actual continuation receipt: '+mode,async t=>{
  const f=await fixture(t,{mode,count:6});try{
    assert(f.before.assignments.every(([,row])=>row.memberId!==f.setup.leaderId));
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.delegationState,'accepted');
    assert.equal(result.delegationAttempts,1);assert.equal(result.requests,mode==='coordination-delegate'?2:3);assert(result.statusChecks<=8);
    const current=f.store.snapshot(),row=current.assignments.find(([id])=>id===f.catalog.tasks[0].taskId)[1];
    assert.equal(row.memberId,f.setup.members[1].memberId);assert.equal(row.effectId,null);assert.equal(row.closed,false);assert.equal(row.result,null);
    assert.deepEqual(current.effects,f.before.effects);assert.deepEqual(current.approvals,f.before.approvals);assert.equal(current.tasks.find(([id])=>id===row.taskId)[1],'queued');
    const sent=f.fixture.adapter().requests.at(-1).input.messages.find(row=>row.kind==='delegation.result').result;
    assert.deepEqual(sent,result.delegationReceipt);assert(result.text.includes(JSON.stringify(sent)));assert.equal(current.commands.find(([id])=>id===result.delegationCommandId)[1].result,'accepted');
    assert.throws(()=>{result.delegationReceipt.assignment.taskId='forged';});sent.assignment.taskId='inspection-copy';assert.equal(result.delegationReceipt.assignment.taskId,row.taskId);assert.throws(()=>f.loop.run(input()),/loop-admission/);
    const first=f.fixture.adapter().requests[0].input;assert.equal(first.catalog.tasks.length,6);assert(!JSON.stringify(first.catalog).includes(f.catalog.tasks[0].taskId));await replay(f);
  }finally{await f.close();}
});

for(const state of ['empty','queued','running','blocked','uncertain','done','failed'])
test('status preserves actual task state and occupied slots without writes: '+state,async t=>{
  const f=await fixture(t,{mode:'coordination-status-only',state});try{
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.delegationAttempts,0);assert.deepEqual(f.store.snapshot(),f.before);
    const status=result.history.find(row=>row.kind==='status.result').result;assert.equal(status.tasks.length,state==='empty'?0:1);
    if(f.planned){const task=status.tasks[0],actual=f.before.assignments[0][1];assert.equal(task.state,f.before.tasks.find(([id])=>id===task.taskId)[1]);assert.deepEqual(task.result,actual.result);
      const member=status.members[1];assert.equal(member.activeTaskId,!actual.closed&&actual.effectId!==null?task.taskId:null);assert.deepEqual(member.queuedTaskIds,state==='queued'?[task.taskId]:[]);
      if(state==='running')assert.equal(task.state,'running');if(state==='uncertain')assert.equal(task.state,'needs_attention');}
    assert(!JSON.stringify(status).includes('instructions'));assert(!JSON.stringify(status).includes('payload'));assert(!JSON.stringify(status).includes(f.root));
  }finally{await f.close();}
});

test('busy member receives queued work after prior FIFO tasks without new occupancy',async t=>{
  const f=await fixture(t,{state:'blocked'});try{
    const earlier=enqueue(f),before=f.store.snapshot(),result=await f.loop.run(input());assert.equal(result.delegationState,'accepted');
    const inbox=f.store.scheduler().inboxes().find(row=>row.memberId===f.setup.members[1].memberId);
    assert.equal(inbox.activeTaskId,f.planned.taskId);assert.deepEqual(inbox.queuedTaskIds,[earlier.taskId,f.catalog.tasks[0].taskId]);
    assert.deepEqual(f.store.snapshot().effects,before.effects);await replay(f);
  }finally{await f.close();}
});

test('status is one checked snapshot and retains FIFO ordering',async t=>{
  const f=await fixture(t,{mode:'coordination-status-only',pause:'before-read',state:'queued'}),original=f.store.snapshot;try{
    const second=enqueue(f),reached=phase(f,'before-read'),pending=f.loop.run(input());await reached;let reads=0,changed=false;
    const submit=f.store.member(f.setup.leaderId).enqueue;
    f.store.snapshot=function(){const captured=original.call(this);if(++reads===2&&!changed){changed=true;submit(bytes({type:'team.task.enqueue',version:1,
      commandId:randomUUID(),sessionId:f.setup.sessionId,taskId:f.catalog.tasks[0].taskId,memberId:f.setup.members[1].memberId}));}return captured;};
    f.fixture.release();const result=await pending;f.store.snapshot=original;assert(changed);assert.equal(f.store.snapshot().assignments.length,3);
    const status=result.history.find(row=>row.kind==='status.result').result;
    assert.deepEqual(status.members[1].queuedTaskIds,[f.planned.taskId,second.taskId]);assert.deepEqual(status.tasks.map(row=>row.taskId),[f.planned.taskId,second.taskId]);
  }finally{f.store.snapshot=original;await f.close();}
});

test('core event capacity refuses enqueue without manufacturing a rejected receipt',async t=>{
  const f=await fixture(t,{pause:'before-delegation',capacity:true});try{
    const reached=phase(f,'before-delegation'),pending=f.loop.run(input());await reached;
    f.fixture.release();const result=await pending;assert.equal(result.state,'needs_attention');assert.equal(result.delegationState,'uncertain');assert.equal(result.delegationReceipt,undefined);
    assert.equal(f.store.snapshot().assignments.length,0);assert.equal(f.store.snapshot().commands.length,999);assert.equal(stopCore(f),'accepted');await replay(f);
  }finally{await f.close();}
});

test('rejected foreign core stop still permits local fencing without undoing enqueue',async t=>{
  const f=await fixture(t,{pause:'after-delegation'});try{
    const reached=phase(f,'after-delegation'),pending=f.loop.run(input());await reached;
    try{assert.equal(f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:randomUUID()})),'rejected');}
    finally{await f.loop.stop();}
    const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.delegationState,'accepted');assert.equal(f.store.snapshot().assignments[0][1].closed,false);
  }finally{await f.close();}
});

test('failed final active check retains receipt without accepting text',async t=>{
  const f=await fixture(t,{mode:'coordination-late'});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),first=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',first);const next=event(f,row=>row.type==='request.admitted');f.fixture.releaseAdapter(first);
    const second=(await next).requestId;await f.fixture.waitAdapter('end_candidate',second);f.store.close();f.fixture.releaseAdapter(second);
    const result=await pending;assert.equal(result.state,'failed');assert.equal(result.delegationState,'accepted');assert.equal(result.text,'');assert.equal(result.requests,2);
  }finally{await f.close();}
});

test('trusted catalog is detached from later coordinator mutation',async t=>{
  const f=await fixture(t);try{const taskId=f.catalog.tasks[0].taskId,memberId=f.catalog.members[1].memberId;
    f.catalog.tasks[0].taskId=randomUUID();f.catalog.members[1].memberId=randomUUID();const result=await f.loop.run(input());
    assert.equal(result.state,'response_complete');assert.equal(result.delegationReceipt.assignment.taskId,taskId);assert.equal(result.delegationReceipt.assignment.memberId,memberId);
  }finally{await f.close();}
});

test('stale status cannot claim an already queued task as this command acceptance',async t=>{
  const f=await fixture(t,{mode:'coordination-status',pause:'after-read'});try{
    const reached=phase(f,'after-read'),pending=f.loop.run(input());await reached;
    const prior={type:'team.task.enqueue',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,taskId:f.catalog.tasks[0].taskId,memberId:f.setup.members[0].memberId};
    assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes(prior)),'accepted');const before=f.store.snapshot();f.fixture.release();
    const result=await pending;assert.equal(result.state,'response_complete');assert.equal(result.delegationState,'rejected');assert.equal(result.delegationReceipt.assignment,null);
    assert.equal(f.store.snapshot().commands.find(([id])=>id===result.delegationCommandId)[1].result,'rejected');assert.deepEqual(f.store.snapshot().assignments,before.assignments);await replay(f);
  }finally{await f.close();}
});

for(const mode of ['coordination-mixed','coordination-duplicate','coordination-extra','coordination-disconnect','coordination-forged-args',
  'coordination-forged-call','coordination-forged-context','coordination-malformed','coordination-truncated'])
test('invalid transcript cannot enqueue: '+mode,async t=>{
  const f=await fixture(t,{mode});try{const result=await f.loop.run(input());assert.notEqual(result.state,'response_complete');assert.equal(result.delegationAttempts,0);assert.deepEqual(f.store.snapshot(),f.before);}finally{await f.close();}
});
for(const mode of ['coordination-after-tool','coordination-after-status'])
test('delegation is last even after known rejection: '+mode,async t=>{
  const f=await fixture(t,{mode,pause:'before-delegation'});try{
    const reached=phase(f,'before-delegation'),pending=f.loop.run(input());await reached;
    assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes({type:'team.task.enqueue',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,taskId:f.catalog.tasks[0].taskId,memberId:f.setup.members[1].memberId})),'accepted');
    f.fixture.release();const result=await pending;assert.equal(result.state,'failed');assert.equal(result.delegationState,'rejected');assert.equal(result.delegationAttempts,1);assert.equal(result.toolReads,0);assert.equal(f.store.snapshot().assignments.length,1);
  }finally{await f.close();}
});
for(const mode of ['coordination-after-tool','coordination-after-status','coordination-two-reads','coordination-text'])
test('accepted delegation, read and prose boundaries: '+mode,async t=>{
  const f=await fixture(t,{mode});try{const result=await f.loop.run(input());
    assert.equal(result.state,mode==='coordination-text'?'response_complete':'failed');assert.equal(result.delegationAttempts,mode.includes('after-')?1:0);
    assert.equal(f.store.snapshot().assignments.length,mode.includes('after-')?1:0);
  }finally{await f.close();}
});

for(const rejected of [false,true])for(const fault of ['abort','lost'])
test('actual enqueue '+fault+' acknowledgement remains uncertain: '+rejected,async t=>{
  const f=await fixture(t,{pause:'before-delegation'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-delegation'),pending=f.loop.run(input());await reached;
    if(rejected)assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes({type:'team.task.enqueue',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,taskId:f.catalog.tasks[0].taskId,memberId:f.setup.members[1].memberId})),'accepted');
    let fired=false;Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER coordination_abort BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'fixture-enqueue-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-enqueue-lost');}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;assert(fired);assert.equal(result.state,'needs_attention');assert.equal(result.delegationState,'uncertain');
    assert.equal(result.delegationAttempts,1);assert.equal(result.requests,1);assert.equal(result.delegationReceipt,undefined);assert.equal(result.localClosed,true);
    const command=f.store.snapshot().commands.find(([id])=>id===result.delegationCommandId)?.[1];assert.equal(command?.result,fault==='abort'?undefined:rejected?'rejected':'accepted');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});
for(const pause of ['before-delegation','after-delegation','before-continuation'])
test('core stop cancels inbox intent while preserving historical receipt: '+pause,async t=>{
  const f=await fixture(t,{pause});try{const reached=phase(f,pause),pending=f.loop.run(input());await reached;
    assert.equal(stopCore(f),'accepted');await f.loop.stop();const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.requests,1);
    assert.equal(result.delegationState,pause==='before-delegation'?'none':'accepted');if(result.delegationReceipt)assert.equal(f.store.snapshot().assignments[0][1].closed,true);await replay(f);
  }finally{await f.close();}
});
for(const fault of ['abort','lost'])test('failed core stop still fences local loop: '+fault,async t=>{
  const f=await fixture(t,{pause:'after-delegation'}),original=Database.prototype.exec;try{
    const reached=phase(f,'after-delegation'),pending=f.loop.run(input());await reached;let fired=false,caught;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER coordination_stop_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-enqueue-stop'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-enqueue-stop');}return result;};
    try{stopCore(f);}catch(error){caught=error;}finally{Database.prototype.exec=original;await f.loop.stop();}
    assert(fired);assert.match(caught?.message??'',/fixture-enqueue-stop/);const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.delegationState,'accepted');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});
test('post-commit real ten-second overrun fences unknown delegation despite verified cleanup',async t=>{
  const f=await fixture(t,{pause:'before-delegation'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-delegation'),pending=f.loop.run(input());await reached;let delayed=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);if(sql==='COMMIT'&&!delayed){delayed=true;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10025);}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;assert(delayed);assert.equal(result.state,'needs_attention');assert.equal(result.delegationState,'uncertain');assert.equal(result.localClosed,true);
    assert.equal(result.requests,1);assert.equal(f.store.snapshot().assignments.length,1);await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});
for(const mode of ['coordination-final-malformed','coordination-continuation-ambiguous','coordination-large-text'])
test('failed continuation preserves accepted inbox receipt: '+mode,async t=>{
  const f=await fixture(t,{mode});try{const result=await f.loop.run(input());assert.equal(result.state,mode==='coordination-continuation-ambiguous'?'needs_attention':'failed');
    assert.equal(result.delegationState,'accepted');assert.equal(result.requests,2);assert.equal(f.store.snapshot().assignments.length,1);await replay(f);
  }finally{await f.close();}
});
test('closed store before continuation preserves known receipt and actual reopened inbox',async t=>{
  const f=await fixture(t,{pause:'after-delegation'});try{
    const reached=phase(f,'after-delegation'),pending=f.loop.run(input());await reached;f.store.close();f.fixture.release();const result=await pending;
    assert.equal(result.state,'failed');assert.equal(result.delegationState,'accepted');assert.equal(result.requests,1);await f.scenario.dispose();
    const reopened=TaskStore.openHandoffEngine(f.root);try{assert.equal(reopened.snapshot().assignments[0][1].taskId,result.delegationReceipt.assignment.taskId);}finally{reopened.close();}
  }finally{await f.close();}
});
test('independent closure gates enqueue and late callback cannot change final reply',async t=>{
  const f=await fixture(t,{mode:'coordination-late'});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),first=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',first);assert.deepEqual(f.store.snapshot(),f.before);const next=event(f,row=>row.type==='request.admitted');f.fixture.releaseAdapter(first);
    const second=(await next).requestId;await f.fixture.waitAdapter('end_candidate',second);const before=f.fixture.inspect();f.fixture.late(first);assert.deepEqual(f.fixture.inspect(),before);
    f.fixture.releaseAdapter(second);assert.equal((await pending).delegationState,'accepted');
  }finally{await f.close();}
});
test('observer stop before writer prevents any attempt reservation',async t=>{
  const f=await fixture(t);try{let stopping;f.loop.onEvent(row=>{if(row.type==='phase'&&row.phase==='before-delegation'){stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;assert.equal(result.state,'stopped');assert.equal(result.delegationAttempts,0);assert.equal(f.store.snapshot().assignments.length,0);
  }finally{await f.close();}
});
test('stop of already-created continuation aborts it once and keeps acceptance',async t=>{
  const f=await fixture(t);try{let count=0,stopping;f.loop.onEvent(row=>{if(row.type==='request.admitted'&&++count===2)queueMicrotask(()=>{stopCore(f);stopping=f.loop.stop();});});
    const result=await f.loop.run(input());await stopping;assert.equal(result.state,'stopped');assert.equal(result.delegationState,'accepted');assert.equal(result.requests,2);
    assert.equal(f.fixture.adapter().requests[1].creates,1);assert.equal(f.fixture.adapter().requests[1].aborts,1);
  }finally{await f.close();}
});
test('binding, prepared catalog and old factories refuse ungranted coordination',async t=>{
  const f=await fixture(t),other=createCoreCoordinationScenario(f.store),old=[codec.createScriptedScenario(),codec.createScriptedLoopScenario(),codec.createScriptedReportingScenario(),codec.createScriptedQuestionScenario(),codec.createScriptedMissionScenario()];
  try{
    for(const changes of [{memberId:f.setup.members[1].memberId},{sessionId:randomUUID()},{actor:'owner'},{version:2}])assert.throws(()=>other.create({...f.binding,...changes},f.catalog));
    for(const catalog of [{...f.catalog,actor:'owner'},{...f.catalog,tasks:[...f.catalog.tasks,...f.catalog.tasks]},
      {...f.catalog,tasks:[{taskRef:'../bad',taskId:f.catalog.tasks[0].taskId}]},{...f.catalog,tasks:[{taskRef:'unknown',taskId:randomUUID()}]},
      {...f.catalog,tasks:Array.from({length:7},(_,i)=>({taskRef:'task'+i,taskId:randomUUID()}))},{...f.catalog,members:[...f.catalog.members].reverse()}])assert.throws(()=>other.create(f.binding,catalog));
    const modes=['normal','loop-context','report-done','question-leader','mission-done'];
    for(let i=0;i<old.length;i++){assert.throws(()=>old[i].create(f.binding,'coordination-delegate'));const api=old[i].create(f.binding,modes[i]);await api.adapter.start({...f.binding,briefing:'legacy profile'});
      await assert.rejects(api.adapter.send({version:1,kind:'coordination-loop',requestId:randomUUID(),runId:randomUUID(),turn:1,catalog:{},messages:[{kind:'user',text:'x'}]}));assert.equal(api.fixture.inspect().seen,0);}
    assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await other.dispose();await Promise.all(old.map(row=>row.dispose()));await f.close();}
});

test('status and history codecs reject overflow, foreign rows and forged selector fields',async t=>{
  const f=await fixture(t,{mode:'coordination-status-only',state:'queued'});try{
    const result=await f.loop.run(input()),status=result.history.find(row=>row.kind==='status.result').result;
    for(const args of [{taskRef:'task0',memberRef:'member1',actor:'owner'},{taskRef:'\ud800',memberRef:'member1'},{taskRef:randomUUID(),memberRef:'member1'}])assert.throws(()=>codec.delegationArgs(args));
    assert.throws(()=>codec.teamStatus({...status,foreign:true}));assert.throws(()=>codec.teamStatus({...status,tasks:[...status.tasks,...status.tasks]}));
    const rows=Array.from({length:100},(_,i)=>({taskId:randomUUID(),memberRef:'member1',state:'done',closed:true,enqueueSequence:i+1,result:{status:'done',summary:'x'.repeat(256)}}));
    assert.throws(()=>codec.teamStatus({...status,members:status.members.map(row=>({...row,queuedTaskIds:[],activeTaskId:null})),tasks:rows}),/status-bytes/);
    assert.throws(()=>codec.teamStatus({...status,tasks:Array.from({length:101},()=>status.tasks[0])}));
    const queued=Array.from({length:100},(_,i)=>({taskId:randomUUID(),memberRef:'member1',state:'queued',closed:false,enqueueSequence:i+1,result:null}));
    const hundred=codec.teamStatus({...status,tasks:queued,members:status.members.map(row=>({...row,queuedTaskIds:row.memberRef==='member1'?queued.map(task=>task.taskId):[],activeTaskId:null}))});
    assert(hundred);
  }finally{await f.close();}
});
