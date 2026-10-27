'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore,approvalBinding}=require('../../core/dist');
const {privateRoot,command,bytes}=require('../../core/test/helpers.cjs');
const {session,plan,witness}=require('../../core/test/mock-fixtures.cjs');
const {createCoreQuestionScenario}=require('../dist');
const {createScriptedLoopScenario,createScriptedReportingScenario,questionArgs,questionInput,questionHistory}=require('../../api-adapter/dist');
const runInput=()=>({version:1,runId:randomUUID(),text:'Ask before continuing the bound task'});
async function fixture(t,{leader=false,proven=true,prior=false,mode=leader?'question-leader':'question-member',pause='none'}={}){
  const root=privateRoot(t),store=TaskStore.createHandoffEngine(root),setup=session();let scenario;
  try{
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');
    const task=command();store.execute(bytes(task));const memberId=leader?setup.leaderId:setup.members[1].memberId;
    assert.equal(store.member(setup.leaderId).enqueue(bytes({type:'team.task.enqueue',version:1,commandId:randomUUID(),
      sessionId:setup.sessionId,taskId:task.taskId,memberId})),'accepted');
    const started={type:'team.task.start',version:1,sessionId:setup.sessionId,memberId,...plan({taskId:task.taskId,expiresAt:Date.now()+180000})};
    assert.equal(store.scheduler().start(bytes(started)),'accepted');store.approve(started.effectId,approvalBinding(started));
    if(proven){const witnessRoot=privateRoot(t);witness('create',witnessRoot,started);
      const invocation=store.claim(started.effectId);witness('write',witnessRoot,started,invocation);
      store.settle(started.effectId,bytes(witness('observe',witnessRoot,started,{effectId:started.effectId,attemptId:started.attemptId})));}
    if(prior)assert.equal(store.member(memberId).ask(bytes({type:'team.question.ask',version:1,commandId:randomUUID(),
      sessionId:setup.sessionId,questionId:randomUUID(),taskId:task.taskId,text:'Prior question',options:[]})),'accepted');
    scenario=createCoreQuestionScenario(store);const binding={version:1,sessionId:setup.sessionId,memberId,taskId:task.taskId};
    const api=scenario.create(binding,mode,pause);await api.loop.start();
    return {root,store,setup,task,started,binding,scenario,...api,before:store.snapshot(),
      async close(){await scenario.dispose();const state=api.fixture.inspect();assert.equal(state.timers,0);assert.equal(state.subscribers,0);
        assert.equal(state.pumping,false);assert.equal(state.scheduled,false);assert(state.runs.every(row=>!row.waiting&&!row.resumeBusy));
        assert(api.fixture.adapter().requests.every(row=>row.closed&&!row.listening&&!row.waiters));store.close();}};
  }catch(error){if(scenario)await scenario.dispose();store.close();throw error;}
}
function event(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('question event deadline'));},10000);
  const remove=f.loop.onEvent(row=>{if(predicate(row)){clearTimeout(timer);remove();resolve(row);}});
});}
const phase=(f,name)=>event(f,row=>row.type==='phase'&&row.phase===name);
function begin(f){const waiting=event(f,row=>row.type==='waiting_for_answer'),input=runInput(),result=f.loop.run(input);return {waiting,input,result};}
const resume=(f,changes={})=>({version:1,resumeId:randomUUID(),runId:f.fixture.inspect().runs[0].id,
  questionId:f.fixture.inspect().runs[0].questionId,...changes});
const current=f=>f.store.snapshot().questions.find(([id])=>id===f.fixture.inspect().runs[0].questionId)?.[1];
const assignment=f=>f.store.snapshot().assignments.find(([id])=>id===f.task.taskId)[1];
function answer(f,value={kind:'text',text:'Use the safe path'}){
  const q=current(f),command={type:'team.question.answer',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,questionId:q.questionId,answer:value};
  const handle=q.recipient==='owner'?f.store.owner():f.store.member(f.setup.leaderId);assert.equal(handle.answer(bytes(command)),'accepted');return command;
}
const stopCore=f=>f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));
async function replay(f){const snapshot=f.store.snapshot();await f.scenario.dispose();f.store.close();const reopened=TaskStore.openHandoffEngine(f.root);
  try{assert.deepEqual(reopened.snapshot(),snapshot);}finally{reopened.close();}}

for(const leader of [false,true])for(const value of [{kind:'text',text:'Actual answer مرحبا'},{kind:'option',index:1}])
test('actual bound '+(leader?'owner':'Leader')+' answer enters actual continuation: '+value.kind,async t=>{
  const f=await fixture(t,{leader});try{
    const pending=begin(f);await pending.waiting;assert.equal(current(f).recipient,leader?'owner':'leader');
    const before=f.store.snapshot();await new Promise(resolve=>setImmediate(resolve));const state=f.fixture.inspect();
    assert.equal(state.runs[0].waiting,true);assert.equal(state.runs[0].continuationReserved,true);assert.equal(state.timers,0);
    assert.equal(state.pumping,false);assert.equal(state.scheduled,false);assert.equal(f.fixture.adapter().timers,0);
    assert.equal(f.fixture.adapter().requests.length,1);assert.equal(assignment(f).closed,false);assert.equal(assignment(f).remainingEvents,before.assignments[0][1].remainingEvents);
    assert.equal(f.store.snapshot().tasks.find(([id])=>id===f.task.taskId)[1],'blocked');
    answer(f,value);assert.equal((await f.loop.resume(resume(f))).status,'continued');const result=await pending.result;
    assert.equal(result.state,'response_complete');assert.equal(result.questionState,'answered');assert.equal(result.questionAttempts,1);
    assert.equal(result.answerReads,1);assert.equal(result.requests,2);assert.equal(result.reportAttempts,0);
    const sent=f.fixture.adapter().requests[1].input.messages.find(row=>row.kind==='question.result').result;
    assert.deepEqual(sent.answer,value);assert.equal(sent.answeredBy,leader?'owner':f.setup.leaderId);assert.deepEqual(sent,result.answerResult);
    assert(result.text.includes(JSON.stringify(value)));assert.equal(assignment(f).closed,false);assert(!JSON.stringify(sent).includes(f.root));
    assert.throws(()=>{result.answerResult.answer.kind='fake';});await replay(f);
  }finally{await f.close();}
});

test('actual escalation changes the authorized answerer without disclosing another question',async t=>{
  const f=await fixture(t);try{
    const pending=begin(f);await pending.waiting;
    assert.equal(f.store.member(f.setup.leaderId).escalate(bytes({type:'team.question.escalate',version:1,commandId:randomUUID(),
      sessionId:f.setup.sessionId,questionId:current(f).questionId})),'accepted');
    answer(f);await f.loop.resume(resume(f));const result=await pending.result;
    assert.equal(result.answerResult.recipient,'owner');assert.equal(result.answerResult.answeredBy,'owner');
    assert.equal(result.questionReceipt.recipient,'leader');assert.equal(result.state,'response_complete');
  }finally{await f.close();}
});

test('four explicit reads are bounded and no automatic polling or self-answer occurs',async t=>{
  const f=await fixture(t,{proven:false});try{
    const pending=begin(f);await pending.waiting;const before=f.store.snapshot(),first=resume(f);assert.throws(()=>f.loop.run(runInput()),/loop-admission/);
    const job=f.loop.resume(first);assert.throws(()=>f.loop.resume(resume(f)),/resume-admission/);
    assert.equal((await job).status,'still_waiting');assert.throws(()=>f.loop.resume(first),/resume-admission/);
    for(let i=0;i<3;i++)assert.equal((await f.loop.resume(resume(f))).status,'still_waiting');
    assert.throws(()=>f.loop.resume(resume(f)),/resume-admission/);assert.equal(f.fixture.inspect().runs[0].answerReads,4);
    assert.equal(f.fixture.adapter().requests.length,1);assert.deepEqual(f.store.snapshot(),before);
    await f.loop.stop();assert.equal((await pending.result).state,'stopped');assert.equal(current(f).status,'open');
    assert.equal(assignment(f).closed,false);
  }finally{await f.close();}
});

test('fourth explicit read may deliver one answer within the ten-check budget',async t=>{
  const f=await fixture(t,{mode:'question-context'});try{
    const pending=begin(f);await pending.waiting;for(let i=0;i<3;i++)assert.equal((await f.loop.resume(resume(f))).status,'still_waiting');
    answer(f);await f.loop.resume(resume(f));const result=await pending.result;
    assert.equal(result.state,'response_complete');assert.equal(result.answerReads,4);assert.equal(result.statusChecks,10);
    assert.equal(result.requests,3);
  }finally{await f.close();}
});

for(const mode of ['question-context','question-report'])for(const proven of [false,true])
test('shared tool/request budgets and proof gates after answer: '+mode+' '+proven,async t=>{
  const f=await fixture(t,{mode,proven});try{
    const pending=begin(f);await pending.waiting;answer(f);await f.loop.resume(resume(f));const result=await pending.result;
    assert.equal(result.state,'response_complete');assert.equal(result.requests,3);assert.equal(result.questionAttempts,1);
    if(mode==='question-context'){assert.equal(result.toolReads,1);assert.equal(result.reportAttempts,0);assert.equal(assignment(f).closed,false);}
    else {assert.equal(result.reportAttempts,1);assert.equal(result.reportState,proven?'accepted':'rejected');
      assert.equal(assignment(f).closed,proven);assert(result.text.includes('Report decision: '+(proven?'accepted':'rejected')));}
  }finally{await f.close();}
});

test('rejected ask never waits or reads the existing question and still uses a real receipt',async t=>{
  const f=await fixture(t,{prior:true});try{
    const result=await f.loop.run(runInput());assert.equal(result.state,'response_complete');assert.equal(result.questionState,'rejected');
    assert.equal(result.questionAttempts,1);assert.equal(result.answerReads,0);assert.equal(result.requests,2);
    assert.equal(result.answerResult.status,'rejected');assert.equal(result.answerResult.answer,null);
    assert.equal(f.store.snapshot().questions.length,1);assert.equal(assignment(f).closed,false);
    assert.equal(f.store.snapshot().commands.find(([id])=>id===result.questionCommandId)[1].result,'rejected');await replay(f);
  }finally{await f.close();}
});

for(const mode of ['question-wrong-role','question-forged-args','question-mixed','question-duplicate','question-extra',
  'question-disconnect','question-forged-call','question-forged-context','question-malformed'])
test('invalid question turn refuses before a core write: '+mode,async t=>{
  const f=await fixture(t,{mode,proven:false});try{
    const result=await f.loop.run(runInput());assert.notEqual(result.state,'response_complete');assert.equal(result.questionAttempts,0);
    assert.equal(result.answerReads,0);assert.equal(result.requests,1);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

test('Leader cannot use the ordinary member ask_leader tool',async t=>{
  const f=await fixture(t,{leader:true,mode:'question-member',proven:false});try{
    const result=await f.loop.run(runInput());assert.equal(result.questionAttempts,0);assert.equal(result.state,'failed');assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

test('forged resume inputs cannot disclose answers, consume reads or dispatch',async t=>{
  const f=await fixture(t,{proven:false});try{
    const pending=begin(f);await pending.waiting;
    for(const changes of [{version:2},{resumeId:'bad'},{runId:randomUUID()},{questionId:randomUUID()},{answer:'fake'},{actor:'owner'}])
      assert.throws(()=>f.loop.resume(resume(f,changes)));
    assert.equal(f.fixture.inspect().runs[0].answerReads,0);assert.equal(f.fixture.adapter().requests.length,1);
    await f.loop.stop();assert.equal((await pending.result).state,'stopped');assert.throws(()=>f.loop.resume(resume(f)),/resume-admission/);
  }finally{await f.close();}
});

for(const prior of [false,true])for(const fault of ['abort','lost'])
test('real ask SQLite '+fault+' retains uncertainty without repeat, prior='+prior,async t=>{
  const f=await fixture(t,{pause:'before-ask',prior,proven:false}),original=Database.prototype.exec;
  try{
    const reached=phase(f,'before-ask'),input=runInput(),pending=f.loop.run(input);await reached;let fired=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER ask_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-ask-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-ask-lost-reply');}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;
    assert(fired);assert.equal(result.state,'needs_attention');assert.equal(result.questionState,'uncertain');assert.equal(result.localClosed,true);
    assert.equal(result.questionAttempts,1);assert.equal(result.answerReads,0);assert.equal(result.requests,1);assert.equal(result.questionReceipt,undefined);
    const record=f.store.snapshot().commands.find(([id])=>id===result.questionCommandId)?.[1];
    if(fault==='abort')assert.equal(record,undefined);else assert.equal(record.result,prior?'rejected':'accepted');
    assert.throws(()=>f.loop.run(runInput()),/loop-admission/);assert.throws(()=>f.loop.resume(resume(f)),/resume-admission/);await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

for(const pause of ['before-ask','after-ask'])test('coordinated stop at question barrier: '+pause,async t=>{
  const f=await fixture(t,{pause,proven:false});try{
    const reached=phase(f,pause),pending=f.loop.run(runInput());await reached;assert.equal(stopCore(f),'accepted');await f.loop.stop();
    const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.questionAttempts,pause==='before-ask'?0:1);
    assert.equal(result.requests,1);assert.equal(result.answerReads,0);
    if(pause==='after-ask'){assert.equal(result.questionState,'accepted');assert.equal(current(f).status,'cancelled');}
  }finally{await f.close();}
});

for(const pause of ['before-answer','after-answer'])test('stop around explicit answer delivery: '+pause,async t=>{
  const f=await fixture(t,{pause});try{
    const pending=begin(f);await pending.waiting;answer(f);const reached=phase(f,pause),resuming=f.loop.resume(resume(f));await reached;
    assert.equal(stopCore(f),'accepted');await f.loop.stop();assert.equal((await resuming).status,'stopped');
    const result=await pending.result;assert.equal(result.state,'stopped');assert.equal(result.requests,1);
    assert.equal(result.answerReads,pause==='before-answer'?0:1);assert.equal(result.questionState,pause==='before-answer'?'accepted':'answered');
    assert.equal(current(f).status,'answered');
  }finally{await f.close();}
});

for(const fault of ['closed','cancelled','invalid-answer'])test('actual answer read refusal cannot fabricate delivery: '+fault,async t=>{
  const f=await fixture(t);try{
    const pending=begin(f);await pending.waiting;
    if(fault==='closed')f.store.close();
    if(fault==='cancelled')assert.equal(f.store.owner().observeFailure(bytes({type:'team.task.failure',version:1,commandId:randomUUID(),
      sessionId:f.setup.sessionId,taskId:f.task.taskId,memberId:f.binding.memberId,attemptId:f.started.attemptId,reason:'crash',summary:'Owned cancellation fixture'})),'accepted');
    if(fault==='invalid-answer')answer(f,{kind:'text',text:'\0'});
    assert.equal((await f.loop.resume(resume(f))).status,'failed');const result=await pending.result;
    assert.equal(result.state,'failed');assert.equal(result.questionState,'accepted');assert.equal(result.answerResult,undefined);
    assert.equal(result.requests,1);assert.equal(result.answerReads,fault==='closed'?0:1);
  }finally{await f.close();}
});

for(const mode of ['question-continuation-ambiguous','question-final-malformed','question-repeat'])
test('actual answer survives conversation failure without re-ask: '+mode,async t=>{
  const f=await fixture(t,{mode});try{
    const pending=begin(f);await pending.waiting;answer(f);await f.loop.resume(resume(f));const result=await pending.result;
    assert.notEqual(result.state,'response_complete');assert.equal(result.questionState,'answered');assert.equal(result.questionAttempts,1);
    assert.equal(result.answerReads,1);assert.equal(result.requests,2);assert.equal(current(f).status,'answered');assert.equal(assignment(f).closed,false);
  }finally{await f.close();}
});

test('end candidate cannot write until independent close; late callbacks cannot advance a later run',async t=>{
  const f=await fixture(t,{mode:'question-late',proven:false});try{
    const admitted=event(f,row=>row.type==='request.admitted'),pending=begin(f),id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);assert.equal(f.fixture.inspect().runs[0].questionAttempts,0);assert.deepEqual(f.store.snapshot(),f.before);
    f.fixture.releaseAdapter(id);await pending.waiting;answer(f);await f.loop.resume(resume(f));assert.equal((await pending.result).state,'response_complete');
    const nextAdmitted=event(f,row=>row.type==='request.admitted'),next=f.loop.run(runInput()),nextId=(await nextAdmitted).requestId;
    await f.fixture.waitAdapter('end_candidate',nextId);const before=f.fixture.inspect(),snapshot=f.store.snapshot();
    f.fixture.late(id);assert.deepEqual(f.fixture.inspect(),before);assert.deepEqual(f.store.snapshot(),snapshot);f.fixture.releaseAdapter(nextId);
    assert.equal((await next).questionState,'rejected');assert.equal(f.fixture.adapter().requests.length,4);assert.throws(()=>f.loop.run(runInput()),/loop-admission/);
  }finally{await f.close();}
});

test('waiting observer may explicitly resume but cannot read reentrantly or duplicate delivery',async t=>{
  const f=await fixture(t);try{
    let job,readsDuringCallback;
    f.loop.onEvent(row=>{if(row.type==='waiting_for_answer'){answer(f);job=f.loop.resume(resume(f));readsDuringCallback=f.fixture.inspect().runs[0].answerReads;}});
    const result=await f.loop.run(runInput());await job;assert.equal(readsDuringCallback,0);assert.equal(result.state,'response_complete');
    assert.equal(result.answerReads,1);assert.equal(result.requests,2);assert.equal(result.questionAttempts,1);
  }finally{await f.close();}
});

test('dispose settles a waiting run while leaving actual durable question and slot unchanged',async t=>{
  const f=await fixture(t,{proven:false});try{
    const pending=begin(f);await pending.waiting;const before=f.store.snapshot();await f.scenario.dispose();
    const result=await pending.result;assert.equal(result.state,'stopped');assert.equal(result.questionState,'accepted');
    assert.deepEqual(f.store.snapshot(),before);assert.equal(current(f).status,'open');assert.equal(assignment(f).closed,false);await replay(f);
  }finally{await f.close();}
});

test('original factories and closed question schemas refuse added authority',async t=>{
  const f=await fixture(t,{proven:false}),scenarios=[createScriptedLoopScenario(),createScriptedReportingScenario()];try{
    const binding={version:1,sessionId:f.binding.sessionId,memberId:f.binding.memberId};
    const input={version:1,kind:'question-loop',requestId:randomUUID(),runId:randomUUID(),turn:1,messages:[{kind:'user',text:'x'}]};
    for(let i=0;i<2;i++){const api=scenarios[i].create(binding,i?'report-done':'loop-context');await api.adapter.start({...binding,briefing:'legacy'});
      await assert.rejects(api.adapter.send(input));assert.equal(api.fixture.inspect().seen,0);}
    for(const options of [['x','x'],['1','2','3','4'],[''],['\0'],[false]])assert.throws(()=>questionArgs({text:'x',options}));
    assert.throws(()=>questionArgs({text:'x',options:[],actor:'owner'}));assert.throws(()=>questionInput({...input,turn:2}));
    assert.throws(()=>questionHistory([{kind:'user',text:'x'},{kind:'question.result',callId:randomUUID(),result:{}}]));
    assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await Promise.all(scenarios.map(row=>row.dispose()));await f.close();}
});

test('zero-option question accepts an actual free-text answer',async t=>{
  const f=await fixture(t,{mode:'question-free',proven:false});try{
    const pending=begin(f);await pending.waiting;assert.deepEqual(current(f).options,[]);answer(f);
    await f.loop.resume(resume(f));assert.equal((await pending.result).answerResult.answer.kind,'text');
  }finally{await f.close();}
});

test('two actual members receive only their own question and answer',async t=>{
  const f=await fixture(t,{proven:false});try{
    const task=command();f.store.execute(bytes(task));const memberId=f.setup.leaderId;
    assert.equal(f.store.member(memberId).enqueue(bytes({type:'team.task.enqueue',version:1,commandId:randomUUID(),
      sessionId:f.setup.sessionId,taskId:task.taskId,memberId})),'accepted');
    const started={type:'team.task.start',version:1,sessionId:f.setup.sessionId,memberId,...plan({taskId:task.taskId,expiresAt:Date.now()+180000})};
    assert.equal(f.store.scheduler().start(bytes(started)),'accepted');f.store.approve(started.effectId,approvalBinding(started));
    const second=f.scenario.create({...f.binding,memberId,taskId:task.taskId},'question-leader');await second.loop.start();
    const a=begin(f),b=begin(second);await Promise.all([a.waiting,b.waiting]);
    const aId=current(f).questionId,bId=second.fixture.inspect().runs[0].questionId;
    answer(f,{kind:'text',text:'Only member answer'});
    assert.equal(f.store.owner().answer(bytes({type:'team.question.answer',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId,
      questionId:bId,answer:{kind:'text',text:'Only owner answer'}})),'accepted');
    await Promise.all([f.loop.resume(resume(f)),second.loop.resume(resume(second))]);const [ar,br]=await Promise.all([a.result,b.result]);
    assert.equal(ar.state,'response_complete');assert.equal(br.state,'response_complete');
    assert(!JSON.stringify(ar.history).includes(bId));assert(!JSON.stringify(br.history).includes(aId));
    assert(!ar.text.includes('Only owner answer'));assert(!br.text.includes('Only member answer'));
    assert.equal(f.store.snapshot().questions.length,2);assert(f.store.snapshot().assignments.every(([,row])=>!row.closed));
  }finally{await f.close();}
});

for(const fault of ['abort','lost'])test('core stop '+fault+' while waiting still fences without inventing cancellation',async t=>{
  const f=await fixture(t,{proven:false}),original=Database.prototype.exec;try{
    const pending=begin(f);await pending.waiting;let fired=false,error;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(!fired&&fault==='abort'&&sql==='BEGIN IMMEDIATE'){fired=true;original.call(this,"CREATE TEMP TRIGGER question_stop_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-question-stop-abort'); END");}
      if(!fired&&fault==='lost'&&sql==='COMMIT'){fired=true;throw new Error('fixture-question-stop-lost');}return result;};
    try{stopCore(f);}catch(value){error=value;}finally{Database.prototype.exec=original;await f.loop.stop();}
    const result=await pending.result;assert(fired);assert.match(error?.message??'',/fixture-question-stop/);
    assert.equal(result.state,'stopped');assert.equal(result.questionState,'accepted');assert.equal(result.answerReads,0);assert.equal(result.requests,1);
    assert.equal(current(f).status,fault==='lost'?'cancelled':'open');assert.equal(f.store.snapshot().sessions[0][1].status,fault==='lost'?'stopped':'active');
    assert.throws(()=>f.loop.resume(resume(f)),/resume-admission/);await replay(f);
  }finally{Database.prototype.exec=original;await f.close();}
});

test('already-created answer continuation is aborted once when coordinated stop wins',async t=>{
  const f=await fixture(t);try{
    let count=0,stopping,decision;f.loop.onEvent(row=>{if(row.type==='request.admitted'&&++count===2)
      queueMicrotask(()=>{decision=stopCore(f);stopping=f.loop.stop();});});
    const pending=begin(f);await pending.waiting;answer(f);await f.loop.resume(resume(f));await stopping;const result=await pending.result;
    assert.equal(decision,'accepted');assert.equal(result.state,'stopped');assert.equal(result.questionState,'answered');assert.equal(result.requests,2);
    const second=f.fixture.adapter().requests[1];assert.equal(second.creates,1);assert.equal(second.aborts,1);assert.equal(current(f).status,'answered');
  }finally{await f.close();}
});

test('synchronous before-ask observer stop consumes no question command',async t=>{
  const f=await fixture(t,{proven:false});try{
    let stopping,decision;f.loop.onEvent(row=>{if(row.type==='phase'&&row.phase==='before-ask'){decision=stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(runInput());await stopping;assert.equal(decision,'accepted');assert.equal(result.state,'stopped');
    assert.equal(result.questionAttempts,0);assert.equal(result.questionId,undefined);assert.equal(f.store.snapshot().questions.length,0);
  }finally{await f.close();}
});

test('actual post-commit ask overrun is uncertain even with verified transport closure',async t=>{
  const f=await fixture(t,{pause:'before-ask',proven:false}),original=Database.prototype.exec;try{
    const reached=phase(f,'before-ask'),pending=f.loop.run(runInput());await reached;let delayed=false;
    Database.prototype.exec=function(sql){const result=original.call(this,sql);
      if(sql==='COMMIT'&&!delayed){delayed=true;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10025);}return result;};
    f.fixture.release();const result=await pending;Database.prototype.exec=original;
    assert(delayed);assert.equal(result.state,'needs_attention');assert.equal(result.questionState,'uncertain');assert.equal(result.localClosed,true);
    assert.equal(result.requests,1);assert.equal(result.answerReads,0);assert.equal(result.questionAttempts,1);assert.equal(result.questionReceipt,undefined);
    assert.equal(current(f).status,'open');assert.equal(f.store.snapshot().commands.find(([id])=>id===result.questionCommandId)[1].result,'accepted');
  }finally{Database.prototype.exec=original;await f.close();}
});

test('two context/question runs consume six requests without a third conversation',async t=>{
  const f=await fixture(t,{mode:'question-context',proven:false});try{
    const pending=begin(f);await pending.waiting;answer(f);await f.loop.resume(resume(f));assert.equal((await pending.result).requests,3);
    const second=await f.loop.run(runInput());assert.equal(second.questionState,'rejected');assert.equal(second.requests,3);
    assert.equal(second.questionAttempts,1);assert.equal(second.toolReads,1);assert.equal(f.fixture.adapter().requests.length,6);
    assert.throws(()=>f.loop.run(runInput()),/loop-admission/);assert.equal(f.store.snapshot().questions.length,1);
  }finally{await f.close();}
});

test('concurrent and duplicate answered resumes cannot deliver twice',async t=>{
  const f=await fixture(t);try{
    const pending=begin(f);await pending.waiting;answer(f);const input=resume(f),first=f.loop.resume(input);
    assert.throws(()=>f.loop.resume(resume(f)),/resume-admission/);await first;
    assert.throws(()=>f.loop.resume(input),/resume-admission/);const result=await pending.result;
    assert.equal(result.answerReads,1);assert.equal(result.requests,2);assert.equal(result.history.filter(row=>row.kind==='question.result').length,1);
  }finally{await f.close();}
});

test('stop immediately after resume admission prevents reading an already-recorded answer',async t=>{
  const f=await fixture(t);try{
    const pending=begin(f);await pending.waiting;answer(f);
    const resuming=f.loop.resume(resume(f));assert.equal(stopCore(f),'accepted');await f.loop.stop();
    assert.equal((await resuming).status,'stopped');const result=await pending.result;
    assert.equal(result.state,'stopped');assert.equal(result.answerReads,0);assert.equal(result.requests,1);
    assert.equal(result.questionState,'accepted');assert.equal(result.answerResult,undefined);assert.equal(current(f).status,'answered');
    await replay(f);
  }finally{await f.close();}
});

test('disposal drains a paused owned resume without reading or changing the durable question',async t=>{
  const f=await fixture(t,{pause:'before-answer',proven:false});try{
    const pending=begin(f);await pending.waiting;const before=f.store.snapshot();
    const reached=phase(f,'before-answer'),resuming=f.loop.resume(resume(f));await reached;
    assert.equal(f.fixture.inspect().runs[0].resumeBusy,true);await f.scenario.dispose();
    assert.equal((await resuming).status,'stopped');const result=await pending.result;
    assert.equal(result.state,'stopped');assert.equal(result.answerReads,0);assert.equal(result.requests,1);
    const state=f.fixture.inspect();assert.equal(state.pumping,false);assert.equal(state.scheduled,false);assert.equal(state.timers,0);
    assert.equal(state.runs[0].resumeBusy,false);assert.equal(state.runs[0].waiting,false);assert.deepEqual(f.store.snapshot(),before);
    assert.equal(current(f).status,'open');assert.equal(assignment(f).closed,false);await replay(f);
  }finally{await f.close();}
});
