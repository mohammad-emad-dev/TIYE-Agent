'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const { requireCore } = require('../core/dist/command');
const { verifyRoot } = require('../core/dist/storage');
const { Lines, output, encode } = require('./protocol.cjs');
const { environment } = require('./witness.cjs');

class OwnedWorker {
  constructor(job,controller) {
    this.job=job;this.controller=controller;this.isClosed=false;this.exitSeen=false;this.sent=false;
    this.ready=false;this.result=null;this.barrier=false;this.stopSent=false;this.failure=null;this.stderrBytes=0;
    this.closed=new Promise(resolve=>{this.resolveClosed=resolve;});
    this.unsafe=new Promise((_,reject)=>{this.rejectUnsafe=reject;}); this.unsafe.catch(()=>{});
    verifyRoot(job.root);
    this.child=spawn(process.execPath,[path.join(__dirname,'worker.cjs'),job.root.path,job.plan.targetId,job.mode],
      {cwd:job.root.path,env:environment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.startedAt=Date.now();
    const lines=new Lines(record=>this.frame(output(record)));
    this.child.stdout.on('data',block=>{try{lines.feed(block);}catch{this.fail('crash','invalid-worker-output');}});
    this.child.stderr.on('data',block=>{this.stderrBytes+=block.length;if(this.stderrBytes>8192)this.fail('crash','worker-stderr-bound');});
    this.child.stdin.on('error',()=>{if(!this.stopSent)this.fail('crash','worker-input-error');});
    this.child.on('error',()=>{this.spawnError=true;this.fail('crash','worker-launch-error');});
    this.child.on('exit',()=>{this.exitSeen=true;controller.emit('exit',job);});
    this.child.on('close',(code,signal)=>{
      this.isClosed=true;clearTimeout(this.deadline);clearTimeout(this.forceTimer);clearTimeout(this.teardownTimer);clearImmediate(this.readyImmediate);
      try{lines.end();}catch{this.failure??={reason:'crash',summary:'Truncated worker transcript'};}
      if(Date.now()-this.startedAt>10000&&!this.failure&&!this.stopSent)this.failure={reason:'hang',summary:'Worker exceeded operation bound'};
      const verified=this.exitSeen||!!this.spawnError&&!this.child.pid;
      controller.emit('closed',job,{verified,code,signal});
      this.resolveClosed({verified,code,signal});
    });
    this.deadline=setTimeout(()=>this.fail('hang','Worker operation deadline'),10000);
    controller.emit('spawn',job);
  }
  frame(record) {
    if(record.type==='mock.worker.ready') {
      requireCore(!this.ready&&!this.sent&&!this.result,'mock-ready-order');this.ready=true;
      this.controller.emit('ready',this.job);
      this.readyImmediate=setImmediate(()=>this.controller.ready(this));
    }else if(record.type==='mock.worker.result'){
      requireCore(this.ready&&this.sent&&!this.result&&record.effectId===this.job.plan.effectId
        &&record.attemptId===this.job.plan.attemptId,'mock-result-binding');
      this.result=record;this.controller.emit('result',this.job);
    }else if(record.type==='mock.worker.barrier'){
      const expected=['hang-before','barrier-before'].includes(this.job.mode)?'before_write'
        :['hang-after','barrier-after'].includes(this.job.mode)?'after_write':null;
      requireCore(this.sent&&!this.result&&!this.barrier&&record.phase===expected,'mock-barrier-order');
      this.barrier=true;this.controller.emit('barrier',this.job,{phase:record.phase});
    }else{
      requireCore(this.stopSent&&!this.stoppedFrame,'mock-unexpected-stop');this.stoppedFrame=true;
    }
  }
  invoke(invocation) {
    requireCore(!this.sent&&this.ready&&!this.isClosed&&!this.failure,'mock-invocation-order');this.sent=true;
    this.controller.emit('invoke',this.job);
    try{this.child.stdin.write(encode({type:'mock.worker.invoke',version:1,...invocation}),error=>{if(error)this.fail('crash','worker-write-error');});}
    catch{this.fail('crash','worker-write-error');}
  }
  fail(reason,summary) {
    if(this.failure)return;
    this.failure={reason,summary};this.controller.emit('worker_fault',this.job,{reason});
    this.cleanup().catch(error=>this.rejectUnsafe(error));
  }
  cleanup() {
    if(this.isClosed)return this.closed;
    if(this.cleanupPromise)return this.cleanupPromise;
    this.stopSent=true;clearImmediate(this.readyImmediate);
    try{if(this.child.stdin.writable)this.child.stdin.end(encode({type:'mock.worker.stop',version:1}));}catch{}
    this.forceTimer=setTimeout(()=>{if(!this.isClosed){this.controller.emit('kill_owned',this.job);this.child.kill();}},200);
    this.cleanupPromise=Promise.race([this.closed,new Promise((_,reject)=>{
      this.teardownTimer=setTimeout(()=>{const error=new Error('unverified owned-worker teardown');this.rejectUnsafe(error);reject(error);},5000);
    })]);
    return this.cleanupPromise;
  }
}
module.exports={ OwnedWorker };
