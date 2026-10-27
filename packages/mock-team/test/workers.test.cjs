'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./fixtures.cjs');
const { bytes,privateRoot } = require('../../core/test/helpers.cjs');
const { approvalBinding } = require('../../core/dist');
const { ask,answer } = require('../../core/test/question-fixtures.cjs');
const { request,handoff,queuedPlan,mission } = require('../../core/test/handoff-fixtures.cjs');
const { createWitness,observeWitness,environment } = require('../witness.cjs');
const { MockTeam } = require('../controller.cjs');
const { Lines,output } = require('../protocol.cjs');

test('two real workers complete only after exit and one independent witness each',async t=>{
  const f=await fixture(t,['normal','normal']);
  try {
    assert.equal(f.prepare(0),'accepted');assert.equal(f.prepare(1),'accepted');
    const result=await f.team.run();assert.equal(result.peakWorkers,2);assert.equal(result.activeWorkers,0);
    assert.equal(f.task(0),'done');assert.equal(f.task(1),'done');
    assert(result.outcomes.every(row=>row.status==='done'&&row.proof.rows.length===1));
    assert.equal(result.events.filter(row=>row.type==='invoke').length,2);
    for(const plan of f.plans)assert(result.events.findIndex(row=>row.type==='closed'&&row.taskId===plan.taskId)<result.events.findIndex(row=>row.type==='reported'&&row.taskId===plan.taskId));
    assert.equal(mission(f),'accepted');
  }finally{await f.close();}
});

test('approval and blocked questions pause without spawning or automatic answers',async t=>{
  const f=await fixture(t);
  try {
    f.prepare(0,false);assert.equal((await f.team.run()).events.length,0);
    f.store.approve(f.plans[0].effectId,approvalBinding(f.plans[0]));
    const question=ask(f,f.plans[0]);assert.equal(f.store.member(f.plans[0].memberId).ask(bytes(question)),'accepted');
    assert.equal((await f.team.run()).events.length,0);assert.equal(f.task(),'blocked');
    assert.equal(f.store.owner().answer(bytes(answer(question))),'accepted');
    await f.team.run();assert.equal(f.task(),'done');
  }finally{await f.close();}
});

test('FIFO blocks a later assignment then permits explicit preparation after predecessor',async t=>{
  const f=await fixture(t,['normal','normal','normal'],{maxConcurrent:1});
  try {
    assert.notEqual(f.prepare(2),'accepted');assert.equal(f.prepare(0),'accepted');
    await f.team.run();assert.equal(f.task(0),'done');
    assert.equal(f.prepare(2),'accepted');await f.team.run();assert.equal(f.task(2),'done');
    assert.equal(f.team.peakWorkers,1);
  }finally{await f.close();}
});

test('descriptor bounds and closed fields refuse arbitrary executables before launch',async t=>{
  const f=await fixture(t);
  try {
    assert.throws(()=>new MockTeam(f.store,f.root,Array(7).fill(f.jobs[0])));
    assert.throws(()=>new MockTeam(f.store,f.root,[{...f.jobs[0],executable:'cmd.exe'}]));
    assert.throws(()=>new MockTeam(f.store,f.root,[{...f.jobs[0],mode:'arbitrary'}]));
    assert.equal(f.team.events.length,0);
    assert.deepEqual(Object.keys(environment()).sort(),['PATH','SystemRoot','TEMP','TMP','WINDIR'].sort());
  }finally{await f.close();}
});

for(const [mode,rows] of [['exit-before',0],['exit-after',1],['bad-ready',0],['bad-result',1],['duplicate-result',1],
  ['truncated-result',1],['wrong-id',1],['extra-output',1],['no-write',0],['duplicate-write',2],['conflict-write',1],['write-abort',0]]) {
  test('real worker refuses false success: '+mode,async t=>{
    const f=await fixture(t,[mode]);
    try {
      f.prepare();const result=await f.team.run();assert.notEqual(f.task(),'done');
      assert.equal(result.activeWorkers,0);assert.equal(result.outcomes[0].proof.rows.length,rows);
      assert.equal(result.events.filter(row=>row.type==='invoke').length,mode==='bad-ready'?0:1);
      assert.equal(f.store.owner().failures().length,1);
      assert.equal((await f.team.run()).events.filter(row=>row.type==='invoke').length,mode==='bad-ready'?0:1);
    }finally{await f.close();}
  });
}

for(const mode of ['hang-before','hang-after'])test('natural operation deadline and verified teardown: '+mode,async t=>{
  const f=await fixture(t,[mode]);
  try {
    f.prepare();const result=await f.team.run();assert.equal(result.activeWorkers,0);
    assert.equal(result.outcomes[0].failure.reason,'hang');assert.equal(result.outcomes[0].proof.rows.length,mode==='hang-after'?1:0);
    assert(result.events.some(row=>row.type==='kill_owned'));assert.equal(f.effect().state,'needs_attention');
  }finally{await f.close();}
});

for(const [mode,event,rows] of [['normal','ready',0],['barrier-before','barrier',0],['barrier-after','barrier',1],
  ['result-hold','result',1],['hang-before','barrier',0],['hang-after','barrier',1]]) {
  test('stop fences delivery and verifies owned exit: '+mode+' at '+event,async t=>{
    const f=await fixture(t,[mode]);
    try {
      f.prepare();const running=f.team.run();await f.team.waitFor(event);
      assert.equal(await f.team.stop(),'accepted');const result=await running;
      assert.equal(result.activeWorkers,0);assert.equal(f.task(),event==='ready'?'cancelled':'needs_attention');
      assert.equal(result.outcomes[0].proof.rows.length,rows);
      const stopIndex=result.events.findIndex(row=>row.type==='core_stop');
      assert(stopIndex>=0&&stopIndex<result.events.findIndex(row=>row.type==='closed'));
      assert(!result.events.slice(stopIndex+1).some(row=>['spawn','invoke','reported','observed_failure'].includes(row.type)));
      assert.equal(f.store.owner().failures().length,0);
      if(mode.startsWith('hang'))assert(result.events.some(row=>row.type==='kill_owned'));
      if(event==='ready')assert(!result.events.some(row=>row.type==='invoke'));
    }finally{await f.close();}
  });
}

test('two concurrent barrier workers stop with both uncertain slots preserved',async t=>{
  const f=await fixture(t,['barrier-after','barrier-after']);
  try {
    f.prepare(0);f.prepare(1);const running=f.team.run();
    await Promise.all(f.plans.map(plan=>f.team.waitFor('barrier',plan.taskId)));
    await f.team.stop();const result=await running;
    assert.equal(result.peakWorkers,2);assert.equal(result.activeWorkers,0);
    assert(result.outcomes.every(row=>row.proof.rows.length===1));
    assert(f.plans.every((_,i)=>f.effect(i).state==='needs_attention'));
  }finally{await f.close();}
});

test('done before stop remains done',async t=>{
  const f=await fixture(t);
  try{f.prepare();await f.team.run();await f.team.stop();assert.equal(f.task(),'done');assert.equal(f.effect().state,'completed');}
  finally{await f.close();}
});

test('failed invocation requires explicit resolution and fresh Leader handoff',async t=>{
  const f=await fixture(t,['exit-after']);
  try {
    f.prepare();const result=await f.team.run();assert.equal(f.effect().state,'needs_attention');
    const resolution={commandId:randomUUID(),...f.store.attention(f.plans[0].effectId),outcome:'confirm_completed'};
    f.store.resolve(resolution,bytes(result.outcomes[0].proof));assert.equal(f.task(),'failed');
    const command=request(f,f.plans[0]);assert.equal(handoff(f,command),'accepted');
    const plan=queuedPlan(f,command),witnessRoot=privateRoot(t);await createWitness(witnessRoot,plan);
    f.team.register({plan,witnessRoot,mode:'normal'});assert.equal(f.team.prepare(plan.taskId).result,'accepted');
    f.store.approve(plan.effectId,approvalBinding(plan));await f.team.run();
    assert.equal(new Map(f.store.snapshot().tasks).get(plan.taskId),'done');assert.equal(mission(f),'accepted');
    assert.equal((await observeWitness(f.jobs[0].witnessRoot,f.plans[0])).rows.length,1);
  }finally{await f.close();}
});

test('line parser rejects invalid UTF8 trailing bytes and oversized frames',()=>{
  for(const buffer of [Buffer.from([255,10]),Buffer.from(' {}\n'),Buffer.alloc(16385,65)])assert.throws(()=>new Lines(output).feed(buffer));
  const lines=new Lines(output);lines.feed(Buffer.from('{'));assert.throws(()=>lines.end());
});

test('expired claim returns null and never delivers an invocation',async t=>{
  const f=await fixture(t,['normal'],{},0);
  try {
    f.prepare();const result=await f.team.run();assert.equal(result.activeWorkers,0);
    assert.equal(result.outcomes[0].status,'expired');assert.equal(result.outcomes[0].proof.rows.length,0);
    assert(!result.events.some(row=>row.type==='invoke'));assert.equal(f.effect().state,'cancelled');
  }finally{await f.close();}
});

test('six lifetime assignments execute only through three explicit bounded rounds',async t=>{
  const f=await fixture(t,Array(6).fill('normal'));
  try {
    for(let i=0;i<6;i+=2){assert.equal(f.prepare(i),'accepted');assert.equal(f.prepare(i+1),'accepted');await f.team.run();}
    assert(f.plans.every((_,i)=>f.task(i)==='done'));assert.equal(f.team.peakWorkers,2);
    assert.equal(f.team.events.filter(row=>row.type==='invoke').length,6);
  }finally{await f.close();}
});

test('uncertainty holds FIFO while another member progresses and a new controller does not resend',async t=>{
  const f=await fixture(t,['exit-after','normal','normal']);
  try {
    f.prepare(0);f.prepare(1);await f.team.run();assert.equal(f.effect(0).state,'needs_attention');assert.equal(f.task(1),'done');
    assert.equal(f.prepare(2),'rejected');await f.team.close();
    f.team=new MockTeam(f.store,f.root,f.jobs);const result=await f.team.run();assert.equal(result.events.length,0);
    assert.equal((await observeWitness(f.jobs[0].witnessRoot,f.plans[0])).rows.length,1);
  }finally{await f.close();}
});

test('unavailable independent observer refuses success after verified worker exit',async t=>{
  const Database=require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
  const path=require('node:path');const f=await fixture(t);
  try {
    f.prepare();const running=f.team.run();await f.team.waitFor('closed');
    const database=new Database(path.join(f.jobs[0].witnessRoot,'core.sqlite'),{fileMustExist:true});
    try{database.prepare('UPDATE metadata SET target_id=?').run(randomUUID());}finally{database.close();}
    const result=await running;assert.equal(result.outcomes[0].proof.scope,'unavailable');
    assert.notEqual(f.task(),'done');assert.equal(f.effect().state,'needs_attention');
  }finally{await f.close();}
});
