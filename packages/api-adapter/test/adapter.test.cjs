'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createScriptedScenario}=require('../dist');
const identity=()=>({version:1,sessionId:randomUUID(),memberId:randomUUID()});
const message=(changes={})=>({version:1,kind:'message',requestId:randomUUID(),text:'Reviewed synthetic request',...changes});
function setup(t,mode='normal') {
  const scenario=createScriptedScenario(),binding=identity(),{adapter,fixture}=scenario.create(binding,mode);
  t.after(async()=>{await scenario.dispose();const view=fixture.inspect();assert.equal(view.timers,0);assert.equal(view.subscribers,0);
    assert(view.requests.every(row=>row.closed&&!row.listening&&row.waiters===0));});
  return {scenario,binding,adapter,fixture,start:()=>adapter.start({...binding,briefing:'Fixed offline fixture'})};
}
async function perform(f,input=message()) {await f.adapter.send(input);await f.fixture.settled(input.requestId);return f.fixture.inspect();}

test('synthetic detection/capabilities never claim a provider and lifecycle starts once',async t=>{
  const f=setup(t);assert.deepEqual(await f.adapter.detect(),{kind:'scripted-api',available:true,realProvider:false});
  const caps=f.adapter.capabilities();assert(Object.isFrozen(caps));assert.equal(caps.tools,false);assert.equal(caps.realProviders,false);
  assert.throws(()=>{caps.commands=true;});assert.notStrictEqual(caps,f.adapter.capabilities());
  await assert.rejects(f.adapter.send(message()),/not-ready/);await f.start();await assert.rejects(f.start(),/start-once/);
  await f.adapter.stop();await assert.rejects(f.start(),/start-once/);await assert.rejects(f.adapter.send(message()),/not-ready/);
  assert.equal(f.fixture.inspect().seen,0);
});

test('closed binding and launch grammar refuse options and identity changes without transport',async t=>{
  const f=setup(t);
  for(const context of [{...f.binding,briefing:'x',key:'not-a-real-key'},{...f.binding,briefing:'x',memberId:randomUUID()},
    {...f.binding,version:2,briefing:'x'},{...f.binding,briefing:'\0'},{...f.binding,briefing:'\ud800'}])await assert.rejects(f.adapter.start(context));
  assert.throws(()=>f.scenario.create({...identity(),url:'https://invalid.example'},'normal'),/unexpected-fields/);
  assert.throws(()=>f.scenario.create(identity(),'arbitrary'),/scenario-bound-or-mode/);
  assert.equal(f.fixture.inspect().state,'unstarted');assert.equal(f.fixture.inspect().requests.length,0);await f.start();
});

test('invalid inputs create no request and text scalar/UTF8 bounds are explicit',async t=>{
  const f=setup(t);await f.start();
  for(const input of [message({actor:'owner'}),message({version:2}),message({requestId:'wrong'}),message({kind:'tool'}),
    message({text:''}),message({text:'\0'}),message({text:'\ud800'}),message({text:'x'.repeat(257)}),
    message({kind:'task',taskId:'wrong'}),message({text:'😀'.repeat(257)})])await assert.rejects(f.adapter.send(input));
  assert.equal(f.fixture.inspect().seen,0);const view=await perform(f,message({text:'😀'.repeat(256)}));assert.equal(view.seen,1);
});

test('ordered normalized streaming completes only after verified closure and preserves task correlation',async t=>{
  const f=setup(t),events=[];f.adapter.onEvent(event=>events.push(event));await f.start();
  const input={version:1,kind:'task',requestId:randomUUID(),taskId:randomUUID(),text:'Text only'};
  const view=await perform(f,input);
  assert.deepEqual(events.map(e=>e.type),['request.admitted','text.delta','text.delta','response.completed']);
  assert(events.every(e=>e.sessionId===f.binding.sessionId&&e.memberId===f.binding.memberId&&e.requestId===input.requestId&&e.taskId===input.taskId));
  assert.equal(view.requests[0].creates,1);assert.equal(view.requests[0].closed,true);assert.equal(view.state,'ready');assert.equal(view.active,null);
  assert(!events.some(e=>e.type==='task.done'||e.type==='approval'));
});

test('end candidate remains running until explicit transport closure',async t=>{
  const f=setup(t,'end-hold');await f.start();const input=message();await f.adapter.send(input);await f.fixture.waitFor('end_candidate',input.requestId);
  assert.equal(f.fixture.inspect().state,'running');assert(!f.fixture.inspect().events.some(e=>e.type==='response.completed'));
  f.fixture.release(input.requestId);await f.fixture.settled(input.requestId);assert.equal(f.fixture.inspect().events.at(-1).type,'response.completed');
});

test('busy and duplicate requests never create again and six lifetime requests are bounded',async t=>{
  const f=setup(t,'manual');await f.start();let first;
  for(let i=0;i<6;i++) {
    const input=message();first??=input;await f.adapter.send(input);
    await assert.rejects(f.adapter.send(message()),/not-ready/);assert.equal(f.fixture.inspect().seen,i+1);
    f.fixture.release(input.requestId);await f.fixture.settled(input.requestId);
    await assert.rejects(f.adapter.send(input),/duplicate-request/);
  }
  await assert.rejects(f.adapter.send(message()),/lifetime-bound/);await assert.rejects(f.adapter.send(first),/duplicate-request/);
  assert.equal(f.fixture.inspect().requests.reduce((n,row)=>n+row.creates,0),6);
});

for(const mode of ['transport-error','disconnect','malformed','bad-utf8','duplicate-field','truncated','wrong-generation',
  'wrong-session','bad-version','extra-field','duplicate-end','extra-after-end','no-end','done-prose','oversized','byte-limit','event-limit','tool-call']) {
  test('fixed transport fault cannot complete a response or execute a tool: '+mode,async t=>{
    const f=setup(t,mode);await f.start();const view=await perform(f);
    assert.equal(view.requests[0].creates,1);assert(!view.events.some(event=>event.type==='response.completed'));
    assert.equal(view.events.at(-1).type,mode==='disconnect'?'request.uncertain':'request.failed');
    assert.equal(view.requests[0].listening,false);assert.equal(view.timers,0);assert(view.events.length<=64);
    if(mode==='tool-call')assert.equal(view.events.at(-1).reason,'unsupported_tool');
    if(mode==='disconnect'){assert(view.active);await assert.rejects(f.adapter.send(message()),/not-ready/);}
  });
}

test('creation failure consumes its ID exactly once and retains an explicit failure',async t=>{
  const f=setup(t,'creation-throw');await f.start();const input=message();await assert.rejects(f.adapter.send(input),/creation_failure/);
  await f.fixture.settled(input.requestId);await assert.rejects(f.adapter.send(input),/duplicate-request/);
  assert.equal(f.fixture.inspect().requests[0].creates,1);assert.equal(f.fixture.inspect().events.at(-1).reason,'creation_failure');
});

test('ambiguous creation never retries and unknown closure keeps admission fenced',async t=>{
  const f=setup(t,'ambiguous-creation');await f.start();const input=message();await assert.rejects(f.adapter.send(input),/ambiguous_creation/);
  const result=await f.fixture.settled(input.requestId);assert.equal(result.state,'needs_attention');assert.equal(result.localClosed,false);
  assert.equal(f.fixture.inspect().requests[0].creates,1);assert.equal(f.fixture.inspect().requests[0].aborts,1);
  await assert.rejects(f.adapter.send(message()),/not-ready/);
});

test('interrupt closes only the current scripted request and shares its cleanup decision',async t=>{
  const f=setup(t,'manual');await f.start();const input=message();await f.adapter.send(input);
  const one=f.adapter.interrupt(),two=f.adapter.interrupt();assert.strictEqual(one,two);const result=await one;
  assert.equal(result.state,'ready');assert.equal(result.localClosed,true);assert.equal(result.remoteVerified,false);
  assert.equal(f.fixture.inspect().requests[0].aborts,1);assert.equal(f.fixture.inspect().events.at(-1).type,'request.interrupted');
});

test('ignored abort waits for a deterministic explicit closure before returning ready',async t=>{
  const f=setup(t,'ignore-abort');await f.start();const input=message();await f.adapter.send(input);
  const decision=f.adapter.interrupt();await f.fixture.waitFor('aborted',input.requestId);assert.equal(f.fixture.inspect().state,'cancelling');
  await assert.rejects(f.adapter.send(message()),/not-ready/);f.fixture.release(input.requestId);
  assert.equal((await decision).state,'ready');assert.equal(f.fixture.inspect().requests[0].aborts,1);
});

test('five-second unverified cleanup retains active ownership and stop is terminal',async t=>{
  const f=setup(t,'never-close');await f.start();const input=message();await f.adapter.send(input);
  const started=Date.now(),decision=f.adapter.interrupt();const result=await decision;assert(Date.now()-started>=4900);
  assert.equal(result.state,'needs_attention');assert.equal(result.localClosed,false);assert(f.fixture.inspect().active);
  const stop=f.adapter.stop();assert.strictEqual(stop,f.adapter.stop());assert.equal((await stop).state,'needs_attention');
  assert.equal(f.fixture.inspect().requests[0].aborts,1);await assert.rejects(f.adapter.send(message()),/not-ready/);
});

test('actual ten-second operation deadline cannot become response completion',async t=>{
  const f=setup(t,'hang');await f.start();const input=message(),started=Date.now();await f.adapter.send(input);
  const result=await f.fixture.settled(input.requestId);assert(Date.now()-started>=9900);assert.equal(result.localClosed,true);
  assert.equal(f.fixture.inspect().events.at(-1).reason,'deadline');assert.equal(f.fixture.inspect().events.at(-1).type,'request.failed');
});

test('stop wins at end candidate while completed-before-stop remains completed',async t=>{
  const f=setup(t,'end-hold');await f.start();const input=message();await f.adapter.send(input);await f.fixture.waitFor('end_candidate',input.requestId);
  await f.adapter.stop();f.fixture.release(input.requestId);assert.equal(f.fixture.inspect().state,'stopped');
  assert(!f.fixture.inspect().events.some(e=>e.type==='response.completed'));assert.equal(f.fixture.inspect().subscribers,0);
});

test('a response committed before stop keeps its completion event',async t=>{
  const f=setup(t);await f.start();await perform(f);await f.adapter.stop();
  assert.equal(f.fixture.inspect().events.filter(e=>e.type==='response.completed').length,1);assert.equal(f.fixture.inspect().state,'stopped');
});

test('reentrant stop from admission never begins the transport',async t=>{
  const f=setup(t);await f.start();let stopping;f.adapter.onEvent(event=>{if(event.type==='request.admitted')stopping=f.adapter.stop();});
  const input=message();await f.adapter.send(input);await stopping;
  assert.equal(f.fixture.inspect().requests[0].creates,0);assert.equal(f.fixture.inspect().state,'stopped');
  assert(!f.fixture.inspect().events.some(e=>e.type==='response.completed'));
});

test('late callbacks after cancellation cannot mutate a newer generation',async t=>{
  const f=setup(t,'late');await f.start();const old=message();await f.adapter.send(old);await f.adapter.interrupt();
  const next=message();await f.adapter.send(next);const before=f.fixture.inspect();f.fixture.late(old.requestId);
  assert.deepEqual(f.fixture.inspect(),before);f.fixture.release(next.requestId);await f.fixture.settled(next.requestId);
  assert.equal(f.fixture.inspect().events.filter(e=>e.type==='response.completed').length,1);
  assert(!f.fixture.inspect().events.some(e=>e.text==='STALE'));
});

test('subscriber exceptions, detached inspection and live-only subscription cannot corrupt lifecycle',async t=>{
  const f=setup(t,'manual');await f.start();let count=0;
  const remove=f.adapter.onEvent(()=>{throw new Error('subscriber fault');});f.adapter.onEvent(()=>count++);
  const input=message();await f.adapter.send(input);let late=0;const unsub=f.adapter.onEvent(()=>late++);assert.equal(late,0);
  remove();remove();unsub();unsub();const copy=f.fixture.inspect();copy.events[0].memberId='changed';
  f.fixture.release(input.requestId);await f.fixture.settled(input.requestId);
  assert.equal(count,4);assert.equal(late,0);assert.equal(f.fixture.inspect().subscriberErrors,1);
  assert(f.fixture.inspect().events.every(e=>e.memberId===f.binding.memberId));
});

test('subscriber and waiter bounds refuse growth and every fixture waiter is cleaned',async t=>{
  const f=setup(t,'manual');await f.start();for(let i=0;i<16;i++)f.adapter.onEvent(()=>{});
  assert.throws(()=>f.adapter.onEvent(()=>{}),/subscriber-bound/);const input=message();await f.adapter.send(input);
  const waiters=Array.from({length:16},()=>f.fixture.waitFor('end_candidate',input.requestId));
  assert.throws(()=>f.fixture.waitFor('end_candidate',input.requestId),/waiter-bound/);
  f.fixture.release(input.requestId);await Promise.all(waiters);await f.fixture.settled(input.requestId);await f.adapter.stop();
  assert.throws(()=>f.adapter.onEvent(()=>{}),/subscriber-refused/);
});

test('retained stream history stays at64 detached events',async t=>{
  const f=setup(t,'retained-ring');await f.start();const view=await perform(f);assert.equal(view.events.length,64);
  assert.equal(view.events.at(-1).type,'response.completed');assert.equal(view.timers,0);
});

test('two adapters keep immutable ownership separate and a third is refused',async t=>{
  const f=setup(t,'manual');await f.start();const binding=identity(),second=f.scenario.create(binding,'manual');
  await second.adapter.start({...binding,briefing:'Second'});assert.throws(()=>f.scenario.create(identity(),'normal'),/scenario-bound-or-mode/);
  const a=message(),b=message();await Promise.all([f.adapter.send(a),second.adapter.send(b)]);
  f.fixture.release(a.requestId);second.fixture.release(b.requestId);await Promise.all([f.fixture.settled(a.requestId),second.fixture.settled(b.requestId)]);
  assert(f.fixture.inspect().events.every(e=>e.memberId===f.binding.memberId));assert(second.fixture.inspect().events.every(e=>e.memberId===binding.memberId));
  await second.adapter.stop();assert.equal(second.fixture.inspect().timers,0);assert(second.fixture.inspect().requests.every(row=>!row.listening));
});
