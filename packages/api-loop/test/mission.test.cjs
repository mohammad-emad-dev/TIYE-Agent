'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore,approvalBinding}=require('../../core/dist');
const {privateRoot,command,bytes}=require('../../core/test/helpers.cjs');
const {session,plan}=require('../../core/test/mock-fixtures.cjs');
const {startTask,complete,report,enqueue,ask,observer}=require('../../core/test/question-fixtures.cjs');
const {createCoreMissionScenario}=require('../dist');
const {createScriptedScenario,createScriptedLoopScenario,createScriptedReportingScenario,createScriptedQuestionScenario,
  missionArgs,missionReceipt,missionInput,missionHistory}=require('../../api-adapter/dist');
const input=()=>({version:1,runId:randomUUID(),text:'Close only the proven synthetic mission'});
async function fixture(t,{state='done',mode='mission-done',pause='none'}={}){
  const root=privateRoot(t),store=TaskStore.createHandoffEngine(root),setup=session(),f={root,store,setup};let scenario;
  try{
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');let planned;
    const finish=planned=>{complete(t,f,planned);assert.equal(store.member(planned.memberId).report(bytes(report(f,planned))),'accepted');};
    if(state==='queued')planned=enqueue(f);
    else if(state!=='empty'){
      planned=startTask(f,{approved:true});
      if(state==='recovered'){
        assert.equal(store.owner().observeFailure(bytes({type:'team.task.failure',version:1,commandId:randomUUID(),sessionId:setup.sessionId,
          taskId:planned.taskId,memberId:planned.memberId,attemptId:planned.attemptId,reason:'crash',summary:'Owned synthetic failure'})),'accepted');
        const handoff={type:'team.task.handoff',version:1,commandId:randomUUID(),sessionId:setup.sessionId,predecessorTaskId:planned.taskId,
          successorTaskId:randomUUID(),targetMemberId:planned.memberId,title:'Explicit replacement'};
        assert.equal(store.member(setup.leaderId).handoff(bytes(handoff)),'accepted');
        planned={type:'team.task.start',version:1,sessionId:setup.sessionId,memberId:handoff.targetMemberId,
          ...plan({taskId:handoff.successorTaskId,expiresAt:Date.now()+180000})};
        assert.equal(store.scheduler().start(bytes(planned)),'accepted');store.approve(planned.effectId,approvalBinding(planned));finish(planned);
      }else if(state==='uncertain'){observer(t,planned);store.claim(planned.effectId);}
      else {
        complete(t,f,planned);
        if(state==='blocked')assert.equal(store.member(planned.memberId).ask(bytes(ask(f,planned))),'accepted');
        else if(state!=='unreported')assert.equal(store.member(planned.memberId).report(bytes(report(f,planned,state==='failed'?'failed':'done'))),'accepted');
        if(state==='multiple'){const second=startTask(f,{approved:true});finish(second);}
      }
    }
    scenario=createCoreMissionScenario(store);const binding={version:1,sessionId:setup.sessionId,memberId:setup.leaderId};
    const api=scenario.create(binding,mode,pause);await api.loop.start();
    return {...f,planned,binding,scenario,...api,before:store.snapshot(),
      async close(){await scenario.dispose();const view=api.fixture.inspect();assert.equal(view.timers,0);assert.equal(view.subscribers,0);
        assert.equal(view.pumping,false);assert.equal(view.scheduled,false);assert(api.fixture.adapter().requests.every(row=>row.closed&&!row.listening&&!row.waiters));store.close();}};
  }catch(error){if(scenario)await scenario.dispose();store.close();throw error;}
}
const mission=f=>f.store.member(f.setup.leaderId).mission();
function event(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('mission event deadline'));},10000);
  const remove=f.loop.onEvent(row=>{if(predicate(row)){clearTimeout(timer);remove();resolve(row);}});
});}
const phase=(f,name)=>event(f,row=>row.type==='phase'&&row.phase===name);
const stopCore=f=>f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));
async function replay(f){const snapshot=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
  try{assert.deepEqual(reopened.snapshot(),snapshot);}finally{reopened.close();}}

for(const state of ['done','multiple','recovered'])for(const mode of ['mission-done','mission-context'])
test('Leader without own assignment completes actual proven mission: '+state+' '+mode,async t=>{
  const f=await fixture(t,{state,mode});try{
    assert(f.before.assignments.every(([,row])=>row.memberId!==f.setup.leaderId));
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.missionState,'accepted');
    assert.equal(result.missionAttempts,1);assert.equal(result.requests,mode==='mission-context'?3:2);assert.equal(result.toolReads,mode==='mission-context'?1:0);
    const view=mission(f);assert.equal(view.status,'completed');assert.deepEqual(view.completion,result.missionReceipt.completion);
    assert.equal(view.completion.summary,'Proven synthetic mission');assert.equal(view.completion.completedBy,f.setup.leaderId);
    const sent=f.fixture.adapter().requests.at(-1).input.messages.find(row=>row.kind==='mission.result').result;
    assert.deepEqual(sent,result.missionReceipt);assert(result.text.includes(JSON.stringify(sent)));assert(!JSON.stringify(sent).includes(f.root));
    assert.throws(()=>{result.missionReceipt.completion.summary='fake';});assert.throws(()=>f.loop.run(input()),/loop-admission/);
    assert(f.fixture.adapter().requests.every(row=>row.creates===1));await replay(f);
  }finally{await f.close();}
});

for(const state of ['empty','queued','blocked','failed','unreported','uncertain'])
test('core eligibility rejects ineligible mission with an actual durable receipt: '+state,async t=>{
  const f=await fixture(t,{state});try{
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.missionState,'rejected');
    assert.equal(result.missionReceipt.completion,null);assert.equal(result.missionAttempts,1);assert.equal(result.requests,2);
    assert.equal(mission(f).status,'active');assert.equal(f.store.snapshot().commands.find(([id])=>id===result.missionCommandId)[1].result,'rejected');
    for(const key of ['tasks','effects','assignments','questions','sessions'])assert.deepEqual(f.store.snapshot()[key],f.before[key]);
    assert(result.text.includes('rejected'));assert.throws(()=>f.loop.run(input()),/loop-admission/);await replay(f);
  }finally{await f.close();}
});

for(const mode of ['mission-text','mission-prose'])test('final text cannot complete a mission: '+mode,async t=>{
  const f=await fixture(t,{mode});try{
    const result=await f.loop.run(input());assert.equal(result.state,'response_complete');assert.equal(result.missionAttempts,0);
    assert.equal(result.missionState,'none');assert.equal(result.requests,1);assert.deepEqual(f.store.snapshot(),f.before);
    assert.throws(()=>f.loop.run(input()),/loop-admission/);
  }finally{await f.close();}
});

for(const mode of ['mission-mixed','mission-duplicate','mission-extra','mission-disconnect','mission-forged-args',
  'mission-forged-call','mission-forged-context','mission-malformed','mission-truncated'])
test('invalid mission transcript cannot invoke completion: '+mode,async t=>{
  const f=await fixture(t,{mode,state:'empty'});try{
    const result=await f.loop.run(input());assert.notEqual(result.state,'response_complete');assert.equal(result.missionAttempts,0);
    assert.equal(result.requests,1);assert.equal(result.missionReceipt,undefined);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

for(const state of ['done','empty'])for(const mode of ['mission-after-tool','mission-after-context'])
test('no tool dispatch after accepted or rejected mission decision: '+state+' '+mode,async t=>{
  const f=await fixture(t,{state,mode});try{
    const result=await f.loop.run(input());assert.equal(result.state,'failed');assert.equal(result.missionAttempts,1);assert.equal(result.toolReads,0);
    assert.equal(result.missionState,state==='done'?'accepted':'rejected');assert.equal(result.requests,2);
    assert.equal(f.store.snapshot().commands.length,f.before.commands.length+1);assert.equal(mission(f).status,state==='done'?'completed':'active');
  }finally{await f.close();}
});

test('mission profile refuses a second context read before another core operation',async t=>{
  const f=await fixture(t,{mode:'mission-two-context',state:'empty'});try{
    const result=await f.loop.run(input());assert.equal(result.state,'failed');assert.equal(result.toolReads,1);assert.equal(result.requests,2);
    assert.equal(result.missionAttempts,0);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

for(const state of ['done','empty'])for(const fault of ['abort','lost'])
test('actual completion '+fault+' retains uncertainty without resend: '+state,async t=>{
  const f=await fixture(t,{state,pause:'before-mission'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-mission'),pending=f.loop.run(input());await reached;let fired=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER mission_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-loop-mission-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-loop-mission-lost');}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;
    assert(fired);assert.equal(result.state,'needs_attention');assert.equal(result.missionState,'uncertain');assert.equal(result.localClosed,true);
    assert.equal(result.missionAttempts,1);assert.equal(result.requests,1);assert.equal(result.missionReceipt,undefined);
    const row=f.store.snapshot().commands.find(([id])=>id===result.missionCommandId)?.[1];
    if(fault==='abort')assert.equal(row,undefined);else assert.equal(row.result,state==='done'?'accepted':'rejected');
    assert.equal(mission(f).status,fault==='lost'&&state==='done'?'completed':'active');assert.throws(()=>f.loop.run(input()),/loop-admission/);await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

for(const pause of ['before-mission','after-mission','before-continuation'])
test('coordinated stop keeps actual mission decision at barrier: '+pause,async t=>{
  const f=await fixture(t,{pause});try{
    const reached=phase(f,pause),pending=f.loop.run(input());await reached;
    assert.equal(stopCore(f),pause==='before-mission'?'accepted':'rejected');await f.loop.stop();const result=await pending;
    assert.equal(result.state,'stopped');assert.equal(result.requests,1);assert.equal(result.missionAttempts,pause==='before-mission'?0:1);
    assert.equal(result.missionState,pause==='before-mission'?'none':'accepted');assert.equal(mission(f).status,pause==='before-mission'?'stopped':'completed');
  }finally{await f.close();}
});

for(const pause of ['before-mission','after-mission'])for(const fault of ['abort','lost'])
test('actual core stop '+fault+' still fences at '+pause,async t=>{
  const f=await fixture(t,{pause}),original=Database.prototype.exec;try{
    const reached=phase(f,pause),pending=f.loop.run(input());await reached;let fired=false,error;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER mission_stop_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-mission-stop-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-mission-stop-lost');}return result;};
    try{stopCore(f);}catch(value){error=value;}finally{Database.prototype.exec=original;await f.loop.stop();}
    const result=await pending;assert(fired);assert.match(error?.message??'',/fixture-mission-stop/);assert.equal(result.state,'stopped');
    assert.equal(result.requests,1);assert.equal(result.missionAttempts,pause==='before-mission'?0:1);
    assert.equal(mission(f).status,pause==='after-mission'?'completed':fault==='lost'?'stopped':'active');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

test('failed fresh post-completion read preserves the known receipt and sends nothing else',async t=>{
  const f=await fixture(t,{pause:'after-mission'});try{
    const reached=phase(f,'after-mission'),pending=f.loop.run(input());await reached;f.store.close();f.fixture.release();
    const result=await pending;assert.equal(result.state,'failed');assert.equal(result.missionState,'accepted');assert.equal(result.missionAttempts,1);
    assert.equal(result.requests,1);assert.equal(result.missionReceipt.decision,'accepted');await f.scenario.dispose();
    const reopened=TaskStore.openHandoffEngine(f.root);try{assert.deepEqual(reopened.member(f.setup.leaderId).mission().completion,result.missionReceipt.completion);}finally{reopened.close();}
  }finally{await f.close();}
});

for(const mode of ['mission-final-malformed','mission-continuation-ambiguous','mission-large-text'])
test('accepted mission stays durable after continuation failure: '+mode,async t=>{
  const f=await fixture(t,{mode});try{
    const result=await f.loop.run(input());assert.equal(result.state,mode==='mission-continuation-ambiguous'?'needs_attention':'failed');
    assert.equal(result.missionState,'accepted');assert.equal(result.missionAttempts,1);assert.equal(result.requests,2);
    assert.equal(mission(f).status,'completed');assert.deepEqual(mission(f).completion,result.missionReceipt.completion);await replay(f);
  }finally{await f.close();}
});

test('real post-commit completion overrun produces uncertainty despite verified cleanup',async t=>{
  const f=await fixture(t,{pause:'before-mission'}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-mission'),pending=f.loop.run(input());await reached;let delayed=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);if(sql==='COMMIT'&&!delayed){delayed=true;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10025);}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;assert(delayed);
    assert.equal(result.state,'needs_attention');assert.equal(result.missionState,'uncertain');assert.equal(result.localClosed,true);
    assert.equal(result.requests,1);assert.equal(result.missionReceipt,undefined);assert.equal(mission(f).status,'completed');await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

test('independent close precedes completion; late callbacks cannot change the held final reply',async t=>{
  const f=await fixture(t,{mode:'mission-late'});try{
    const firstEvent=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),first=(await firstEvent).requestId;
    await f.fixture.waitAdapter('end_candidate',first);assert.equal(f.fixture.inspect().runs[0].missionAttempts,0);assert.deepEqual(f.store.snapshot(),f.before);
    const nextEvent=event(f,row=>row.type==='request.admitted');f.fixture.releaseAdapter(first);const second=(await nextEvent).requestId;
    await f.fixture.waitAdapter('end_candidate',second);assert.equal(mission(f).status,'completed');const before=f.fixture.inspect(),snapshot=f.store.snapshot();
    f.fixture.late(first);assert.deepEqual(f.fixture.inspect(),before);assert.deepEqual(f.store.snapshot(),snapshot);
    f.fixture.releaseAdapter(second);assert.equal((await pending).state,'response_complete');
  }finally{await f.close();}
});

test('synchronous mission-phase observer stop prevents writer reservation',async t=>{
  const f=await fixture(t);try{
    let stopping,decision;f.loop.onEvent(row=>{if(row.type==='phase'&&row.phase==='before-mission'){decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;assert.equal(decision,'accepted');assert.equal(result.state,'stopped');
    assert.equal(result.missionAttempts,0);assert.equal(result.missionCommandId,undefined);assert.equal(mission(f).status,'stopped');
  }finally{await f.close();}
});

test('already-created final continuation is aborted once without undoing accepted mission',async t=>{
  const f=await fixture(t);try{
    let count=0,stopping,decision;f.loop.onEvent(row=>{if(row.type==='request.admitted'&&++count===2)
      queueMicrotask(()=>{decision=stopCore(f);stopping=f.loop.stop();});});
    const result=await f.loop.run(input());await stopping;assert.equal(decision,'rejected');assert.equal(result.state,'stopped');
    assert.equal(result.missionState,'accepted');assert.equal(result.requests,2);const second=f.fixture.adapter().requests[1];
    assert.equal(second.creates,1);assert.equal(second.aborts,1);assert.equal(mission(f).status,'completed');
  }finally{await f.close();}
});

test('non-Leader/foreign binding and all old factories refuse mission authority',async t=>{
  const f=await fixture(t,{state:'empty'}),other=createCoreMissionScenario(f.store),old=[createScriptedScenario(),createScriptedLoopScenario(),createScriptedReportingScenario(),createScriptedQuestionScenario()];
  try{
    for(const changes of [{memberId:f.setup.members[1].memberId},{sessionId:randomUUID()},{actor:'owner'},{taskId:randomUUID()},{version:2}])
      assert.throws(()=>other.create({...f.binding,...changes}));
    const request={version:1,kind:'mission-loop',requestId:randomUUID(),runId:randomUUID(),turn:1,messages:[{kind:'user',text:'x'}]};
    const modes=['normal','loop-context','report-done','question-leader'];
    for(let i=0;i<old.length;i++){const api=old[i].create(f.binding,modes[i]);await api.adapter.start({...f.binding,briefing:'old profile'});
      await assert.rejects(api.adapter.send(request));assert.equal(api.fixture.inspect().seen,0);}
    assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await other.dispose();await Promise.all(old.map(row=>row.dispose()));await f.close();}
});

test('closed mission schemas enforce summary, receipt and history bounds',async t=>{
  const f=await fixture(t,{state:'empty'});try{
    for(const summary of ['', '\0','\ud800','x'.repeat(257)])assert.throws(()=>missionArgs({summary}));
    assert.throws(()=>missionArgs({summary:'x',actor:'owner'}));assert.throws(()=>missionReceipt({callId:randomUUID(),commandId:randomUUID(),sessionId:f.setup.sessionId,decision:'accepted',completion:null}));
    assert.throws(()=>missionInput({version:1,kind:'mission-loop',requestId:randomUUID(),runId:randomUUID(),turn:2,messages:[{kind:'user',text:'x'}]}));
    assert.throws(()=>missionHistory([{kind:'user',text:'x'},{kind:'mission.result',callId:randomUUID(),result:{}}]));
    assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

test('accepted completion closes real core and mission-loop admission',async t=>{
  const f=await fixture(t);try{
    const result=await f.loop.run(input());assert.equal(result.missionState,'accepted');const before=f.store.snapshot();
    f.store.execute(bytes(command()));assert.equal(f.store.registry().length,before.tasks.length);
    assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes({type:'team.task.enqueue',version:1,commandId:randomUUID(),
      sessionId:f.setup.sessionId,taskId:randomUUID(),memberId:f.setup.members[1].memberId})),'rejected');
    const other=createCoreMissionScenario(f.store);try{assert.throws(()=>other.create(f.binding),/inactive/);}finally{await other.dispose();}
    for(const key of ['tasks','effects','assignments','questions','sessions'])assert.deepEqual(f.store.snapshot()[key],before[key]);
    assert.throws(()=>f.loop.run(input()),/loop-admission/);
  }finally{await f.close();}
});

test('closed core before final acceptance retains mission receipt without accepting reply',async t=>{
  const f=await fixture(t,{mode:'mission-late'});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=f.loop.run(input()),first=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',first);const next=event(f,row=>row.type==='request.admitted');f.fixture.releaseAdapter(first);
    const second=(await next).requestId;await f.fixture.waitAdapter('end_candidate',second);assert.equal(mission(f).status,'completed');
    f.store.close();f.fixture.releaseAdapter(second);const result=await pending;
    assert.equal(result.state,'failed');assert.equal(result.missionState,'accepted');assert.equal(result.missionAttempts,1);
    assert.equal(result.requests,2);assert.equal(result.text,'');assert.equal(result.missionReceipt.decision,'accepted');
    assert.equal(f.fixture.adapter().requests.length,2);assert(f.fixture.adapter().requests.every(row=>row.creates===1&&row.closed));
    await f.scenario.dispose();const reopened=TaskStore.openHandoffEngine(f.root);
    try{assert.deepEqual(reopened.member(f.setup.leaderId).mission().completion,result.missionReceipt.completion);
      assert.equal(reopened.snapshot().commands.find(([id])=>id===result.missionCommandId)[1].result,'accepted');}finally{reopened.close();}
  }finally{await f.close();}
});

test('stop from final completion notification preserves accepted conversation and mission',async t=>{
  const f=await fixture(t);try{
    let stopping,decision,notificationState,count=0;
    f.loop.onEvent(row=>{if(row.type==='run.finished'){count++;notificationState=row.state;decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(input());await stopping;
    assert.equal(count,1);assert.equal(notificationState,'response_complete');assert.equal(decision,'rejected');
    assert.equal(result.state,'response_complete');assert.equal(result.missionState,'accepted');assert.equal(result.requests,2);
    assert.equal(result.missionAttempts,1);assert(result.text.includes(JSON.stringify(result.missionReceipt)));
    assert.deepEqual(mission(f).completion,result.missionReceipt.completion);assert.equal(mission(f).status,'completed');
    assert.equal(f.fixture.inspect().runs[0].outcome.state,'response_complete');await replay(f);
  }finally{await f.close();}
});
