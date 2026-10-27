'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore,approvalBinding}=require('../../core/dist');
const {privateRoot,command,bytes}=require('../../core/test/helpers.cjs');
const {session,plan,witness}=require('../../core/test/mock-fixtures.cjs');
const {createCoreReportingScenario}=require('../dist');
const {createScriptedLoopScenario,reportArgs,reportHistory,reportInput}=require('../../api-adapter/dist');
const input=()=>({version:1,runId:randomUUID(),text:'Report the assigned synthetic task'});
async function fixture(t,{mode='report-done',pause='none',proven=true,blocked=false}={}){
  const root=privateRoot(t),store=TaskStore.createHandoffEngine(root),setup=session();let scenario;
  try{
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');
    const task=command();store.execute(bytes(task));const memberId=setup.members[1].memberId;
    const enqueue={type:'team.task.enqueue',version:1,commandId:randomUUID(),sessionId:setup.sessionId,taskId:task.taskId,memberId};
    assert.equal(store.member(setup.leaderId).enqueue(bytes(enqueue)),'accepted');
    const started={type:'team.task.start',version:1,sessionId:setup.sessionId,memberId,...plan({taskId:task.taskId,expiresAt:Date.now()+180000})};
    assert.equal(store.scheduler().start(bytes(started)),'accepted');store.approve(started.effectId,approvalBinding(started));
    if(proven){const witnessRoot=privateRoot(t);witness('create',witnessRoot,started);
      const invocation=store.claim(started.effectId);witness('write',witnessRoot,started,invocation);
      const proof=witness('observe',witnessRoot,started,{effectId:started.effectId,attemptId:started.attemptId});
      store.settle(started.effectId,bytes(proof));}
    if(blocked)assert.equal(store.member(memberId).ask(bytes({type:'team.question.ask',version:1,commandId:randomUUID(),
      sessionId:setup.sessionId,questionId:randomUUID(),taskId:task.taskId,text:'Need explicit answer',options:[]})),'accepted');
    scenario=createCoreReportingScenario(store);const binding={version:1,sessionId:setup.sessionId,memberId,taskId:task.taskId};
    const api=scenario.create(binding,mode,pause);await api.loop.start();
    return {root,store,setup,task,started,binding,scenario,...api,before:store.snapshot(),
      async close(){await scenario.dispose();const state=api.fixture.inspect();
        assert.equal(state.timers,0);assert.equal(state.subscribers,0);assert.equal(state.pumping,false);assert.equal(state.scheduled,false);
        assert(api.fixture.adapter().requests.every(row=>row.closed&&!row.listening&&!row.waiters));store.close();}};
  }catch(error){if(scenario)await scenario.dispose();store.close();throw error;}
}
const assignment=f=>f.store.snapshot().assignments.find(([id])=>id===f.task.taskId)[1];
const taskState=f=>f.store.snapshot().tasks.find(([id])=>id===f.task.taskId)[1];
const stopCore=f=>f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));
function event(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('report event deadline'));},10000);
  const remove=f.loop.onEvent(row=>{if(predicate(row)){clearTimeout(timer);remove();resolve(row);}});
});}
const phase=(f,name)=>event(f,row=>row.type==='phase'&&row.phase===name);

for(const mode of ['report-done','report-failed','report-context'])
test('actual receipt enters actual continuation and durable core replay: '+mode,async t=>{
  const f=await fixture(t,{mode});try{
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.reportState,'accepted');
    assert.equal(result.reportAttempts,1);assert.equal(result.toolReads,mode==='report-context'?1:0);
    assert.equal(result.requests,mode==='report-context'?3:2);assert.equal(taskState(f),mode==='report-failed'?'failed':'done');
    assert.deepEqual(assignment(f).result,{status:mode==='report-failed'?'failed':'done',summary:'Scripted bound result'});
    const sent=f.fixture.adapter().requests.at(-1).input.messages,receipt=sent.find(row=>row.kind==='report.result').result;
    assert.deepEqual(receipt,result.reportReceipt);assert.equal(receipt.taskId,f.task.taskId);assert.equal(receipt.commandId,result.reportCommandId);
    assert(result.text.includes('accepted'));assert.throws(()=>{result.reportReceipt.decision='rejected';});
    assert(!JSON.stringify(sent).includes(f.root));assert(f.fixture.adapter().requests.every(row=>row.creates===1));
    const snapshot=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
    try{assert.deepEqual(reopened.snapshot(),snapshot);}finally{reopened.close();}
  }finally{await f.close();}
});

for(const blocked of [false,true])test('unproven or blocked report is durable rejection, not task success: '+blocked,async t=>{
  const f=await fixture(t,{proven:false,blocked});try{
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.reportState,'rejected');
    assert.equal(result.reportAttempts,1);assert.equal(result.requests,2);assert(result.text.includes('rejected'));
    assert.equal(assignment(f).closed,false);assert.equal(assignment(f).result,null);
    assert.equal(f.store.snapshot().commands.find(([id])=>id===result.reportCommandId)[1].result,'rejected');
    const snapshot=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
    try{assert.deepEqual(reopened.snapshot(),snapshot);}finally{reopened.close();}
  }finally{await f.close();}
});

for(const mode of ['report-forged-args','report-forged-call','report-forged-context','report-mixed','report-duplicate',
  'report-extra','report-disconnect','report-truncated','report-malformed','report-no-end'])
test('invalid reporting transcript never invokes writer: '+mode,async t=>{
  const f=await fixture(t,{mode,proven:false});try{
    const result=await f.loop.run(input());assert.notEqual(result.state,'response_complete');assert.equal(result.reportAttempts,0);
    assert.equal(result.reportState,'none');assert.equal(result.requests,1);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

for(const mode of ['report-repeat','report-then-context'])test('no report or read can dispatch after report: '+mode,async t=>{
  const f=await fixture(t,{mode,proven:false});try{
    const result=await f.loop.run(input());assert.equal(result.state,'failed');assert.equal(result.reportAttempts,1);
    assert.equal(result.toolReads,0);assert.equal(result.reportState,'rejected');assert.equal(result.requests,2);
    assert.equal(f.store.snapshot().commands.length,f.before.commands.length+1);
  }finally{await f.close();}
});

for(const pause of ['before-report','after-report','before-continuation'])test('durable stop fences report/continuation at exact barrier: '+pause,async t=>{
  const f=await fixture(t,{pause});try{
    const reached=phase(f,pause),pending=f.loop.run(input());await reached;
    assert.equal(stopCore(f),'accepted');await f.loop.stop();const result=await pending;
    assert.equal(result.state,'stopped');assert.equal(result.requests,1);assert.equal(result.reportAttempts,pause==='before-report'?0:1);
    assert.equal(result.reportState,pause==='before-report'?'none':'accepted');
    assert.equal(assignment(f).result?.status,pause==='before-report'?undefined:'done');
  }finally{await f.close();}
});

test('stop after continuation admission counts dispatch and never erases accepted report',async t=>{
  const f=await fixture(t);try{
    let count=0,stopping,decision;f.loop.onEvent(row=>{if(row.type==='request.admitted'&&++count===2){decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;assert.equal(decision,'accepted');assert.equal(result.state,'stopped');
    assert.equal(result.reportState,'accepted');assert.equal(result.requests,2);assert.equal(taskState(f),'done');
    const second=f.fixture.adapter().requests[1];assert.equal(second.creates,0);assert.equal(second.aborts,1);
  }finally{await f.close();}
});

test('synchronous report-phase observer stop wins before writer reservation',async t=>{
  const f=await fixture(t);try{
    let stopping,decision;f.loop.onEvent(row=>{if(row.type==='phase'&&row.phase==='before-report'){decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;assert.equal(decision,'accepted');assert.equal(result.reportAttempts,0);
    assert.equal(result.state,'stopped');assert.equal(assignment(f).result,null);
  }finally{await f.close();}
});

for(const mode of ['report-continuation-ambiguous','report-final-malformed'])test('accepted report survives continuation failure: '+mode,async t=>{
  const f=await fixture(t,{mode});try{
    const result=await f.loop.run(input());assert.equal(result.state,mode==='report-continuation-ambiguous'?'needs_attention':'failed');
    assert.equal(result.reportState,'accepted');assert.equal(result.reportAttempts,1);assert.equal(result.requests,2);
    assert.equal(taskState(f),'done');assert.equal(f.store.snapshot().commands.length,f.before.commands.length+1);
  }finally{await f.close();}
});

for(const proven of [false,true])for(const fault of ['abort','lost'])
test('real report SQLite '+fault+' preserves uncertain acknowledgement, proven='+proven,async t=>{
  const f=await fixture(t,{proven,pause:'before-report'}),original=Database.prototype.exec;
  try{
    const reached=phase(f,'before-report'),pending=f.loop.run(input());await reached;let fired=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;
        original.call(this,"CREATE TEMP TRIGGER report_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-report-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-report-lost-reply');}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;
    assert(fired);assert.equal(result.state,'needs_attention');assert.equal(result.reportState,'uncertain');
    assert.equal(result.localClosed,true);assert.equal(result.reportAttempts,1);assert.equal(result.requests,1);
    assert.equal(result.reportReceipt,undefined);assert(!result.history.some(row=>row.kind==='report.result'));
    assert.throws(()=>f.loop.run(input()),/loop-admission/);
    const record=f.store.snapshot().commands.find(([id])=>id===result.reportCommandId)?.[1];
    if(fault==='abort')assert.equal(record,undefined);else assert.equal(record.result,proven?'accepted':'rejected');
    assert.equal(taskState(f),fault==='lost'&&proven?'done':'running');
    const snapshot=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
    try{assert.deepEqual(reopened.snapshot(),snapshot);}finally{reopened.close();}
  }finally{Database.prototype.exec=original;await f.close();}
});

test('tool end candidate has no write before independently verified close',async t=>{
  const f=await fixture(t,{mode:'report-end-hold'});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);assert.equal(f.fixture.inspect().runs[0].reportAttempts,0);
    assert.deepEqual(f.store.snapshot(),f.before);f.fixture.releaseAdapter(id);
    assert.equal((await pending).reportState,'accepted');
  }finally{await f.close();}
});

test('old captured reporting callbacks cannot mutate a later conversation',async t=>{
  const f=await fixture(t,{mode:'report-late',proven:false});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);f.fixture.releaseAdapter(id);assert.equal((await pending).reportState,'rejected');
    const nextAdmitted=event(f,row=>row.type==='request.admitted'),next=f.loop.run(input()),newId=(await nextAdmitted).requestId;
    await f.fixture.waitAdapter('end_candidate',newId);const before=f.fixture.inspect(),snapshot=f.store.snapshot();
    f.fixture.late(id);assert.deepEqual(f.fixture.inspect(),before);assert.deepEqual(f.store.snapshot(),snapshot);
    f.fixture.releaseAdapter(newId);assert.equal((await next).reportState,'rejected');assert.throws(()=>f.loop.run(input()),/loop-admission/);
    assert.equal(f.fixture.adapter().requests.length,4);
  }finally{await f.close();}
});

test('report binding rejects forged, foreign, duplicate and closed assignments',async t=>{
  const f=await fixture(t);try{
    for(const value of [{...f.binding,actor:'owner'},{...f.binding,taskId:randomUUID()},
      {...f.binding,memberId:f.setup.leaderId},{...f.binding,sessionId:randomUUID()},f.binding])assert.throws(()=>f.scenario.create(value));
    assert.equal((await f.loop.run(input())).reportState,'accepted');
    const other=createCoreReportingScenario(f.store);try{assert.throws(()=>other.create(f.binding),/closed/);}finally{await other.dispose();}
  }finally{await f.close();}
});

test('read-only factory refuses reporting input; closed schemas refuse forged receipts and summaries',async t=>{
  const f=await fixture(t,{proven:false}),scenario=createScriptedLoopScenario();try{
    const binding={version:1,sessionId:f.binding.sessionId,memberId:f.binding.memberId},api=scenario.create(binding,'loop-context');
    await api.adapter.start({...binding,briefing:'read only'});
    const request={version:1,kind:'report-loop',requestId:randomUUID(),runId:randomUUID(),turn:1,messages:[{kind:'user',text:'x'}]};
    await assert.rejects(api.adapter.send(request));assert.equal(api.fixture.inspect().seen,0);
    for(const summary of ['', '\0','\ud800','x'.repeat(257)])assert.throws(()=>reportArgs({status:'done',summary}));
    assert.throws(()=>reportArgs({status:'done',summary:'x',taskId:f.task.taskId}));
    assert.throws(()=>reportHistory([{kind:'user',text:'x'},{kind:'report.result',callId:randomUUID(),result:{}}]));
    assert.throws(()=>reportInput({...request,turn:2}));assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await scenario.dispose();await f.close();}
});

test('two bound members cannot complete or modify each other assigned task',async t=>{
  const f=await fixture(t);try{
    const task=command();f.store.execute(bytes(task));const memberId=f.setup.leaderId;
    assert.equal(f.store.member(memberId).enqueue(bytes({type:'team.task.enqueue',version:1,commandId:randomUUID(),
      sessionId:f.setup.sessionId,taskId:task.taskId,memberId})),'accepted');
    const started={type:'team.task.start',version:1,sessionId:f.setup.sessionId,memberId,...plan({taskId:task.taskId,expiresAt:Date.now()+180000})};
    assert.equal(f.store.scheduler().start(bytes(started)),'accepted');f.store.approve(started.effectId,approvalBinding(started));
    const before=f.store.snapshot(),other=f.scenario.create({...f.binding,memberId,taskId:task.taskId});await other.loop.start();
    const [a,b]=await Promise.all([f.loop.run(input()),other.loop.run(input())]);
    assert.equal(a.reportState,'accepted');assert.equal(b.reportState,'rejected');
    assert.equal(a.reportReceipt.taskId,f.task.taskId);assert.equal(b.reportReceipt.taskId,task.taskId);
    const after=f.store.snapshot();
    for(const key of ['assignments','effects','tasks'])assert.deepEqual(after[key].find(([id])=>id===(key==='effects'?started.effectId:task.taskId)),
      before[key].find(([id])=>id===(key==='effects'?started.effectId:task.taskId)));
    assert.equal(taskState(f),'done');await other.loop.dispose();
  }finally{await f.close();}
});

test('already-created continuation is aborted once after accepted report',async t=>{
  const f=await fixture(t);try{
    let count=0,stopping,decision;f.loop.onEvent(row=>{if(row.type==='request.admitted'&&++count===2)
      queueMicrotask(()=>{decision=stopCore(f);stopping=f.loop.stop();});});
    const result=await f.loop.run(input());await stopping;assert.equal(decision,'accepted');
    assert.equal(result.reportState,'accepted');assert.equal(result.state,'stopped');assert.equal(result.requests,2);
    const second=f.fixture.adapter().requests[1];assert.equal(second.creates,1);assert.equal(second.aborts,1);assert.equal(taskState(f),'done');
  }finally{await f.close();}
});

test('real elapsed post-commit stall is report uncertainty despite verified adapter cleanup',async t=>{
  const f=await fixture(t,{pause:'before-report'}),original=Database.prototype.exec;
  try{
    const reached=phase(f,'before-report'),pending=f.loop.run(input());await reached;let delayed=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(sql==='COMMIT'&&!delayed){delayed=true;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10025);}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;
    assert(delayed);assert.equal(result.state,'needs_attention');assert.equal(result.reportState,'uncertain');
    assert.equal(result.localClosed,true);assert.equal(result.requests,1);assert.equal(result.reportAttempts,1);
    assert.equal(result.reportReceipt,undefined);assert.equal(taskState(f),'done');
    assert.equal(f.store.snapshot().commands.find(([id])=>id===result.reportCommandId)[1].result,'accepted');
  }finally{Database.prototype.exec=original;await f.close();}
});
