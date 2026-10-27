'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('../../core/node_modules/better-sqlite3/lib/win32-x64.js');
const { TaskStore } = require('../../core/dist');
const { bytes } = require('../../core/test/helpers.cjs');
const { fixture } = require('./fixtures.cjs');
const { observeWitness } = require('../witness.cjs');

// Real SQLite transactions and connection-local triggers. No substitute store or worker.
function inject(stage,kind) {
  const original=Database.prototype.exec;let fired=false;
  Database.prototype.exec=function(sql) {
    const result=original.call(this,sql);
    if(sql==='BEGIN IMMEDIATE'&&kind==='abort')original.call(this,
      `CREATE TEMP TRIGGER abort_stage BEFORE INSERT ON sessions WHEN (SELECT type FROM events ORDER BY sequence DESC LIMIT 1)='${stage}' BEGIN SELECT RAISE(ABORT,'fixture-stage-abort'); END`);
    if(sql==='COMMIT'&&kind==='abort')original.call(this,'DROP TRIGGER IF EXISTS temp.abort_stage');
    if(sql==='COMMIT'&&kind==='lost'&&!fired&&this.prepare('SELECT type FROM events ORDER BY sequence DESC LIMIT 1').get()?.type===stage){fired=true;throw new Error('fixture-lost-commit-reply');}
    return result;
  };
  return ()=>{Database.prototype.exec=original;};
}

for(const kind of ['abort','lost'])for(const stage of ['claim','settle','team.task.report','team.task.failure','team.session.stop']) {
  test('real '+kind+' storage fault at '+stage+' freezes without resend or invented outcome',async t=>{
    const f=await fixture(t,[stage==='team.task.failure'?'exit-after':stage==='team.session.stop'?'barrier-after':'normal']);
    let restore=()=>{};
    try {
      f.prepare();
      if(stage==='team.session.stop') {
        const running=f.team.run();const rejected=assert.rejects(running,/storage\/controller failure/);
        await f.team.waitFor('barrier');restore=inject(stage,kind);
        await assert.rejects(f.team.stop(),/storage\/controller failure/);await rejected;
      }else {
        restore=inject(stage,kind);await assert.rejects(f.team.run(),/storage\/controller failure/);
      }
      restore();restore=()=>{};
      const summary=f.team.summary();assert.equal(summary.activeWorkers,0);
      assert.equal(summary.events.filter(row=>row.type==='invoke').length,stage==='claim'?0:1);
      const proof=await observeWitness(f.jobs[0].witnessRoot,f.plans[0]);assert.equal(proof.rows.length,stage==='claim'?0:1);
      assert.throws(()=>f.team.run(),/frozen/);
      if(stage==='claim')assert.equal(f.effect().state,kind==='lost'?'dispatching':'planned');
      if(stage==='settle')assert.equal(f.effect().state,kind==='lost'?'completed':'dispatching');
      if(stage==='team.task.report') {
        assert.equal(f.task(),kind==='lost'?'done':'running');
        const command=summary.commands.find(row=>row.stage==='report').command;
        assert.equal(f.store.member(f.plans[0].memberId).report(bytes(command)),'accepted');assert.equal(f.task(),'done');
      }
      if(stage==='team.task.failure') {
        assert.equal(f.store.owner().failures().length,kind==='lost'?1:0);
        const command=summary.commands.find(row=>row.stage==='failure').command;
        assert.equal(f.store.owner().observeFailure(bytes(command)),'accepted');assert.equal(f.store.owner().failures().length,1);
      }else assert.equal(f.store.owner().failures().length,0);
      if(stage==='team.session.stop') {
        assert.equal(summary.session,kind==='lost'?'stopped':'active');assert.equal(f.team.stopAccepted,false);
        assert.equal(f.store.owner().stop(bytes(f.team.stopCommand)),'accepted');
      }
      assert.equal((await observeWitness(f.jobs[0].witnessRoot,f.plans[0])).rows.length,proof.rows.length);
      const snapshot=f.store.snapshot();await f.team.close();f.store.close();f.store=TaskStore.openHandoffEngine(f.root);
      assert.deepEqual(f.store.snapshot(),snapshot);
    }finally{restore();await f.close();}
  });
}
