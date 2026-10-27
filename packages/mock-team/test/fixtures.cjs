'use strict';
const assert = require('node:assert/strict');
const { TaskStore, approvalBinding } = require('../../core/dist');
const { privateRoot, bytes } = require('../../core/test/helpers.cjs');
const { session } = require('../../core/test/mock-fixtures.cjs');
const { enqueue } = require('../../core/test/question-fixtures.cjs');
const { MockTeam } = require('../controller.cjs');
const { createWitness } = require('../witness.cjs');

async function fixture(t,modes=['normal'],options={},expiresAt) {
  const root=privateRoot(t),store=TaskStore.createHandoffEngine(root),setup=session(options);
  assert.equal(store.owner().createSession(bytes(setup)),'accepted');
  const f={root,store,setup,plans:[],jobs:[]};
  try {
    for(const [i,mode] of modes.entries()) {
      const plan=enqueue(f,setup.members[i%setup.members.length].memberId),witnessRoot=privateRoot(t);
      if(expiresAt!==undefined)plan.expiresAt=expiresAt;
      await createWitness(witnessRoot,plan);f.plans.push(plan);f.jobs.push({plan,witnessRoot,mode});
    }
    f.team=new MockTeam(store,root,f.jobs);
  } catch(error) {store.close();throw error;}
  f.prepare=(index=0,approve=true)=>{
    const result=f.team.prepare(f.plans[index].taskId);
    if(approve&&result.result==='accepted')store.approve(f.plans[index].effectId,approvalBinding(f.plans[index]));
    return result.result;
  };
  f.task=(index=0)=>new Map(store.snapshot().tasks).get(f.plans[index].taskId);
  f.effect=(index=0)=>new Map(store.snapshot().effects).get(f.plans[index].effectId);
  f.close=async()=>{try{await f.team.close();}finally{f.store.close();}};
  return f;
}
module.exports={fixture};
