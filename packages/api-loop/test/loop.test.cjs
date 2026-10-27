'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const {TaskStore}=require('../../core/dist');
const {privateRoot,bytes}=require('../../core/test/helpers.cjs');
const {session}=require('../../core/test/mock-fixtures.cjs');
const {createCoreLoopScenario}=require('../dist');
const {createScriptedScenario,createScriptedLoopScenario}=require('../../api-adapter/dist');
const run=()=>({version:1,runId:randomUUID(),text:'Read only the bound profile'});
async function fixture(t,mode='loop-context',pause='none',change={}) {
  const root=privateRoot(t),store=TaskStore.createHandoffEngine(root),setup=session(change);
  try {
    assert.equal(store.owner().createSession(bytes(setup)),'accepted');
    const scenario=createCoreLoopScenario(store),binding={version:1,sessionId:setup.sessionId,memberId:setup.members[1].memberId};
    const {loop,fixture}=scenario.create(binding,mode,pause);await loop.start();
    return {root,store,setup,scenario,binding,loop,fixture,before:store.snapshot(),
      async close(){await scenario.dispose();assert.equal(fixture.inspect().timers,0);assert.equal(fixture.inspect().subscribers,0);
        assert.equal(fixture.inspect().pumping,false);assert.equal(fixture.inspect().scheduled,false);
        assert(fixture.adapter().requests.every(row=>row.closed&&!row.listening&&row.waiters===0));store.close();}};
  }catch(error){store.close();throw error;}
}
function waitEvent(f,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{remove();reject(new Error('fixture event deadline'));},10000);
  const remove=f.loop.onEvent(event=>{if(predicate(event)){clearTimeout(timer);remove();resolve(event);}});
});}
function phase(f,name){return waitEvent(f,event=>event.type==='phase'&&event.phase===name);}
function stopCore(f){return f.store.owner().stop(bytes({type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:f.setup.sessionId}));}

test('real core context becomes a validated result in the actual continuation request',async t=>{
  const f=await fixture(t);try {
    const result=await f.loop.run(run());assert.equal(result.state,'response_complete');assert.equal(result.requests,2);assert.equal(result.toolReads,1);
    assert(result.text.includes(f.setup.members[1].name));const requests=f.fixture.adapter().requests;
    assert.equal(requests.length,2);assert(requests.every(row=>row.creates===1));
    const history=requests[1].input.messages;assert.equal(history.length,3);assert.equal(history[1].callId,history[2].callId);
    assert.deepEqual(history[2].result,f.store.member(f.binding.memberId).context());
    assert(!JSON.stringify(history).includes(f.root));assert.deepEqual(f.store.snapshot(),f.before);
    assert.throws(()=>{result.history[2].result.memberId=randomUUID();});
  }finally{await f.close();}
});

test('text-only run never dispatches a core tool or completes a task',async t=>{
  const f=await fixture(t,'loop-text');try {const result=await f.loop.run(run());assert.equal(result.state,'response_complete');
    assert.equal(result.toolReads,0);assert.equal(result.requests,1);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

for(const mode of ['loop-forged-tool','loop-forged-args','loop-mixed','loop-duplicate-call','loop-tool-extra','loop-tool-disconnect','loop-tool-error',
  'loop-forged-call-id','loop-mixed-after','loop-tool-truncated','loop-tool-malformed','loop-forged-context'])
test('invalid tool turn does not disclose or dispatch core context: '+mode,async t=>{
  const f=await fixture(t,mode);try {const result=await f.loop.run(run());assert.notEqual(result.state,'response_complete');
    assert.equal(result.toolReads,0);assert.equal(result.requests,1);assert(!result.history.some(row=>row.kind==='tool.result'));
    assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

for(const [mode,reads,requests]of[['loop-repeat-call',1,2],['loop-third-tool',2,3],['loop-byte-limit',2,3],['loop-large-text',1,2]])
test('call, turn and byte/history quotas fail closed without another read: '+mode,async t=>{
  const f=await fixture(t,mode);try{const result=await f.loop.run(run());assert.equal(result.state,'failed');
    assert.equal(result.toolReads,reads);assert.equal(result.requests,requests);assert.deepEqual(f.store.snapshot(),f.before);
    assert(f.fixture.inspect().runs[0].bytes<=65536);
  }finally{await f.close();}
});

test('tool candidate and end cannot cause a read without independent closure',async t=>{
  const f=await fixture(t,'loop-tool-end-hold');try{
    const admitted=waitEvent(f,event=>event.type==='request.admitted'),pending=f.loop.run(run());const id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);
    assert.equal(f.fixture.inspect().runs[0].toolReads,0);f.fixture.releaseAdapter(id);
    const result=await pending;assert.equal(result.state,'response_complete');assert.equal(result.toolReads,1);
  }finally{await f.close();}
});

for(const pause of ['before-read','after-read','before-continuation','after-dispatch'])
test('coordinated stop preserves exact before/after operation accounting: '+pause,async t=>{
  const f=await fixture(t,'loop-context',pause);try{
    const reached=phase(f,pause),pending=f.loop.run(run());await reached;assert.equal(stopCore(f),'accepted');await f.loop.stop();
    const result=await pending;assert.equal(result.state,'stopped');assert.equal(result.toolReads,['after-read','before-continuation'].includes(pause)?1:0);
    assert.equal(result.requests,1);assert.equal(f.fixture.adapter().requests[0].creates,1);
    if(result.toolReads)assert(result.history.some(row=>row.kind==='tool.result'));
  }finally{await f.close();}
});

test('stop from request admission fences before scripted request creation',async t=>{
  const f=await fixture(t);try{
    let stopping;f.loop.onEvent(event=>{if(event.type==='request.admitted'){stopCore(f);stopping=f.loop.stop();}});
    const result=await f.loop.run(run());await stopping;assert.equal(result.state,'stopped');assert.equal(result.toolReads,0);
    assert.equal(result.requests,1);assert.equal(f.fixture.adapter().requests[0].creates,0);
  }finally{await f.close();}
});

test('stop failure and lost reply still fence the loop and preserve actual core state',async t=>{
  for(const kind of ['abort','lost']){
    const f=await fixture(t,'loop-context','after-read'),original=Database.prototype.exec;
    try{
      const reached=phase(f,'after-read'),pending=f.loop.run(run());await reached;let fired=false;
      Database.prototype.exec=function(sql){const value=original.call(this,sql);
        if(kind==='abort'&&sql==='BEGIN IMMEDIATE')original.call(this,"CREATE TEMP TRIGGER stop_abort BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-stop-abort'); END");
        if(kind==='lost'&&sql==='COMMIT'&&!fired){fired=true;throw new Error('fixture-stop-lost-reply');}return value;};
      try{assert.throws(()=>stopCore(f),/fixture-stop/);}finally{Database.prototype.exec=original;await f.loop.stop();}
      const result=await pending;assert.equal(result.requests,1);assert.equal(result.toolReads,1);
      assert.equal(f.store.snapshot().sessions[0][1].status,kind==='lost'?'stopped':'active');
    }finally{Database.prototype.exec=original;await f.close();}
  }
});

for(const fault of ['closed','stopped','invalid-profile'])test('real core reader refusal never fabricates a result: '+fault,async t=>{
  const changes=fault==='invalid-profile'?{members:[{memberId:randomUUID(),name:'Leader',instructions:'x'},
    {memberId:randomUUID(),name:'Coder',instructions:'\0'}]}:{};
  if(changes.members)changes.leaderId=changes.members[0].memberId;
  const f=await fixture(t,'loop-context','before-read',changes);try{
    const reached=phase(f,'before-read'),pending=f.loop.run(run());await reached;
    if(fault==='closed')f.store.close();if(fault==='stopped')stopCore(f);f.fixture.release();
    const result=await pending;assert.equal(result.state,'failed');assert.equal(result.toolReads,fault==='invalid-profile'?1:0);assert.equal(result.requests,1);
    assert(!result.history.some(row=>row.kind==='tool.result'));
  }finally{await f.close();}
});

test('ambiguous continuation retains successful read without retry or another request',async t=>{
  const f=await fixture(t,'loop-continuation-ambiguous');try{
    const result=await f.loop.run(run());assert.equal(result.state,'needs_attention');assert.equal(result.toolReads,1);assert.equal(result.requests,2);
    assert.equal(f.fixture.adapter().requests[1].creates,1);assert.equal(f.fixture.adapter().requests[1].aborts,1);
    assert(result.history.some(row=>row.kind==='tool.result'));assert.throws(()=>f.loop.run(run()),/loop-admission/);
  }finally{await f.close();}
});

test('throwing abort at an unclosed tool candidate cannot perform its read',async t=>{
  const f=await fixture(t,'loop-tool-abort-throw');try{
    const admitted=waitEvent(f,event=>event.type==='request.admitted'),pending=f.loop.run(run());const id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);await f.loop.stop();
    const result=await pending;assert.equal(result.state,'needs_attention');assert.equal(result.toolReads,0);assert.equal(result.requests,1);
    assert.equal(f.fixture.adapter().requests[0].aborts,1);
  }finally{await f.close();}
});

test('duplicate run IDs, lifetime cap and reentrant next conversation remain bounded',async t=>{
  const f=await fixture(t,'loop-text');try{
    const first=run(),second=run();let next;
    f.loop.onEvent(event=>{if(event.type==='run.finished'&&event.runId===first.runId)next=f.loop.run(second);});
    const result=await f.loop.run(first);assert.equal(result.state,'response_complete');assert.equal((await next).state,'response_complete');
    assert.throws(()=>f.loop.run(first),/loop-admission/);assert.throws(()=>f.loop.run(run()),/loop-admission/);
    await f.loop.stop();assert.equal(f.fixture.inspect().runs[0].outcome.state,'response_complete');
  }finally{await f.close();}
});

test('two complete three-turn conversations consume exactly six lifetime requests',async t=>{
  const f=await fixture(t,'loop-two-tools');try{
    for(let i=0;i<2;i++){const result=await f.loop.run(run());assert.equal(result.state,'response_complete');assert.equal(result.requests,3);assert.equal(result.toolReads,2);}
    assert.equal(f.fixture.adapter().requests.length,6);assert(f.fixture.adapter().requests.every(row=>row.creates===1));
    assert.throws(()=>f.loop.run(run()),/loop-admission/);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

test('two real core members stay isolated; duplicate or foreign binding refuses',async t=>{
  const f=await fixture(t);try{
    assert.throws(()=>f.scenario.create(f.binding),/scenario-bound/);
    assert.throws(()=>f.scenario.create({...f.binding,memberId:randomUUID()}),/inactive/);
    assert.throws(()=>f.scenario.create({...f.binding,sessionId:randomUUID(),memberId:f.setup.leaderId}),/scenario-bound/);
    const second=f.scenario.create({...f.binding,memberId:f.setup.leaderId});await second.loop.start();
    const [a,b]=await Promise.all([f.loop.run(run()),second.loop.run(run())]);assert.equal(a.state,'response_complete');assert.equal(b.state,'response_complete');
    assert.equal(a.history[2].result.memberId,f.binding.memberId);assert.equal(b.history[2].result.memberId,f.setup.leaderId);
    await second.loop.dispose();assert.equal(second.fixture.inspect().timers,0);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

test('bad run input and subscriber faults do not create extra requests or expose core handles',async t=>{
  const f=await fixture(t,'loop-text');try{
    for(const input of [{...run(),actor:'owner'},{...run(),text:'\0'},{...run(),runId:'bad'}])assert.throws(()=>f.loop.run(input));
    let seen=0;const remove=f.loop.onEvent(async()=>{throw new Error('loop subscriber error');});f.loop.onEvent(()=>seen++);
    const result=await f.loop.run(run());await new Promise(resolve=>setImmediate(resolve));remove();remove();
    assert.equal(result.requests,1);assert(seen>0);assert(f.fixture.inspect().notificationErrors>0);
    assert(!JSON.stringify(f.fixture.inspect()).includes(f.root));assert.equal(f.fixture.inspect().runs.length,1);
  }finally{await f.close();}
});

test('old captured callbacks cannot advance a later conversation',async t=>{
  const f=await fixture(t,'loop-late');try{
    let admitted=waitEvent(f,event=>event.type==='request.admitted');let pending=f.loop.run(run());let id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);f.fixture.releaseAdapter(id);assert.equal((await pending).state,'response_complete');
    const old=id;admitted=waitEvent(f,event=>event.type==='request.admitted');pending=f.loop.run(run());id=(await admitted).requestId;
    await f.fixture.waitAdapter('end_candidate',id);const before=f.fixture.inspect();f.fixture.late(old);assert.deepEqual(f.fixture.inspect(),before);
    f.fixture.releaseAdapter(id);const result=await pending;assert.equal(result.state,'response_complete');assert.equal(result.toolReads,1);
    assert.equal(f.fixture.adapter().requests.length,4);assert.deepEqual(f.store.snapshot(),f.before);
  }finally{await f.close();}
});

test('legacy profile refuses loop requests and structured histories refuse forged results',async()=>{
  const binding={version:1,sessionId:randomUUID(),memberId:randomUUID()},normal=createScriptedScenario(),loop=createScriptedLoopScenario();
  try{
    const a=normal.create(binding,'normal'),b=loop.create(binding,'loop-context');await a.adapter.start({...binding,briefing:'x'});await b.adapter.start({...binding,briefing:'x'});
    const input={version:1,kind:'loop',requestId:randomUUID(),runId:randomUUID(),turn:1,messages:[{kind:'user',text:'x'}]};
    await assert.rejects(a.adapter.send(input));assert.throws(()=>normal.create(binding,'loop-context'));
    await assert.rejects(b.adapter.send({...input,turn:2}));assert.equal(a.fixture.inspect().seen,0);assert.equal(b.fixture.inspect().seen,0);
  }finally{await normal.dispose();await loop.dispose();}
});

test('durable stop during final text prevents conversation completion acceptance',async t=>{
  const f=await fixture(t);try{
    let stopped=false,stopResult;
    f.loop.onEvent(event=>{if(event.type==='text.delta'&&!stopped){
      stopped=true;stopResult=stopCore(f);
    }});
    const result=await f.loop.run(run());assert(stopped);assert.equal(stopResult,'accepted');
    assert.equal(result.state,'failed');assert.equal(result.text,'');
    assert.equal(result.requests,2);assert.equal(result.toolReads,1);
    assert(!result.history.some(row=>row.kind==='assistant.text'));
    assert.equal(f.store.snapshot().sessions[0][1].status,'stopped');
  }finally{await f.close();}
});

test('stop from accepted completion notification preserves the final result',async t=>{
  const f=await fixture(t);try{
    let stopping,notifications=0,notificationState,stopResult;
    f.loop.onEvent(event=>{if(event.type==='run.finished'){
      notifications++;notificationState=event.state;
      stopResult=stopCore(f);stopping=f.loop.stop();
    }});
    const result=await f.loop.run(run());await stopping;
    assert.equal(notifications,1);assert.equal(notificationState,'response_complete');
    assert.equal(stopResult,'accepted');assert.equal(result.state,'response_complete');
    assert.equal(result.requests,2);assert.equal(result.toolReads,1);
    assert(result.text.includes(f.setup.members[1].name));
    assert.equal(f.fixture.inspect().runs[0].outcome.state,'response_complete');
    assert.equal(f.store.snapshot().sessions[0][1].status,'stopped');
  }finally{await f.close();}
});
