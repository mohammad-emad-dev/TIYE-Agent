'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createScriptedScenario}=require('../dist');
const request=()=>({version:1,kind:'message',requestId:randomUUID(),text:'Fixed exit regression'});
async function fixture(t,mode='normal') {
  const scenario=createScriptedScenario(),binding={version:1,sessionId:randomUUID(),memberId:randomUUID()};
  const f=scenario.create(binding,mode);await f.adapter.start({...binding,briefing:'Exit review'});
  t.after(async()=>{await scenario.dispose();const view=f.fixture.inspect();assert.equal(view.timers,0);assert.equal(view.subscribers,0);
    assert(view.requests.every(row=>row.closed&&!row.listening&&row.waiters===0));});
  return f;
}

test('async subscriber rejection is isolated from lifecycle and healthy observers',async t=>{
  const f=await fixture(t);let observed=0;
  f.adapter.onEvent(async()=>{throw new Error('reviewed async subscriber failure');});
  f.adapter.onEvent(()=>observed++);
  const input=request();await f.adapter.send(input);await f.fixture.settled(input.requestId);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(observed,4);assert.equal(f.fixture.inspect().subscriberErrors,4);
  assert.equal(f.fixture.inspect().state,'ready');assert.equal(f.fixture.inspect().events.at(-1).type,'response.completed');
});

test('reentrant subscriber preserves notification order across request generations',async t=>{
  const f=await fixture(t),first=request(),next=request(),observed=[];let began;
  f.adapter.onEvent(event=>{if(event.type==='response.completed'&&event.requestId===first.requestId)began=f.adapter.send(next);});
  f.adapter.onEvent(event=>observed.push(event.requestId+':'+event.type));
  await f.adapter.send(first);await f.fixture.settled(first.requestId);await began;await f.fixture.settled(next.requestId);
  const retained=f.fixture.inspect().events.map(event=>event.requestId+':'+event.type);
  assert.deepEqual(observed,retained);assert.equal(f.fixture.inspect().events.filter(event=>event.type==='response.completed').length,2);
});

test('unsubscribe cancels nested queued admission before it is delivered',async t=>{
  const f=await fixture(t),first=request(),next=request(),observed=[];let began,remove;
  f.adapter.onEvent(event=>{
    if(event.type==='response.completed'&&event.requestId===first.requestId){began=f.adapter.send(next);remove();}
  });
  remove=f.adapter.onEvent(event=>observed.push(event.requestId));
  await f.adapter.send(first);await f.fixture.settled(first.requestId);await began;await f.fixture.settled(next.requestId);
  assert(!observed.includes(next.requestId));assert.equal(f.fixture.inspect().seen,2);
});

test('resubscribing the same callback cannot inherit an earlier queued event',async t=>{
  const f=await fixture(t),first=request(),next=request(),observed=[];let began,remove;
  const listener=event=>{if(event.requestId===next.requestId)observed.push(event.type);};
  f.adapter.onEvent(event=>{
    if(event.type==='response.completed'&&event.requestId===first.requestId){began=f.adapter.send(next);remove();remove=f.adapter.onEvent(listener);}
  });
  remove=f.adapter.onEvent(listener);
  await f.adapter.send(first);await f.fixture.settled(first.requestId);await began;await f.fixture.settled(next.requestId);
  assert.deepEqual(observed,['text.delta','text.delta','response.completed']);
});

test('application Promise completion is not a protocol drain or stop gate',async t=>{
  const f=await fixture(t),first=request(),next=request();let reject;
  const pending=new Promise((_,fail)=>{reject=fail;});
  f.adapter.onEvent(event=>{if(event.type==='request.admitted'&&event.requestId===first.requestId)return pending;});
  await f.adapter.send(first);await f.fixture.settled(first.requestId);
  await f.adapter.send(next);await f.fixture.settled(next.requestId);await f.adapter.stop();
  const before=f.fixture.inspect().events;reject(new Error('late application rejection'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.fixture.inspect().events,before);assert.equal(f.fixture.inspect().state,'stopped');
  assert.equal(f.fixture.inspect().subscriberErrors,1);
});

test('reentrant stop delivers one terminal notification before clearing subscribers',async t=>{
  const f=await fixture(t),observed=[];let stopping;
  f.adapter.onEvent(event=>{if(event.type==='request.admitted')stopping=f.adapter.stop();});
  f.adapter.onEvent(event=>observed.push(event.type));
  await f.adapter.send(request());await stopping;
  assert.deepEqual(observed,['request.admitted','request.interrupted','adapter.stopped']);
  assert.equal(f.fixture.inspect().subscribers,0);assert.equal(f.fixture.inspect().requests[0].creates,0);
});

test('throwing scripted abort retains ownership and still resolves bounded stop',async t=>{
  const f=await fixture(t,'abort-throw'),input=request();await f.adapter.send(input);
  const stop=f.adapter.stop();assert.strictEqual(stop,f.adapter.stop());const result=await stop;
  assert.equal(result.state,'needs_attention');assert.equal(result.localClosed,false);assert(f.fixture.inspect().active);
  assert.equal(f.fixture.inspect().requests[0].aborts,1);assert.equal(f.fixture.inspect().events.at(-2).reason,'abort_failure');
});
