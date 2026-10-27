'use strict';
const { randomUUID } = require('node:crypto');
const { exactFields, requireCore } = require('../core/dist/command');
const { decodeInbox } = require('../core/dist/engine-inbox');
const { approvalBinding, matchesWitness } = require('../core/dist/effects-model');
const { storageRoot, verifyRoot } = require('../core/dist/storage');
const { validMode } = require('./protocol.cjs');
const { inspect } = require('./target.cjs');
const { observeWitness } = require('./witness.cjs');
const { OwnedWorker } = require('./owned-worker.cjs');

class MockTeam {
  constructor(store,coreDirectory,jobs) {
    requireCore(process.version==='v26.7.0'&&process.platform==='win32'&&process.arch==='x64'&&process.versions.modules==='147','mock-runtime');
    this.store=store;this.coreRoot=storageRoot(coreDirectory);verifyRoot(this.coreRoot);
    this.jobs=new Map();this.workers=new Map();this.outcomes=new Map();this.events=[];this.waiters=[];this.commands=[];
    this.frozen=false;this.stopIntent=false;this.stopAccepted=false;this.fault=null;this.peakWorkers=0;
    this.validateStore();requireCore(Array.isArray(jobs)&&jobs.length>0&&jobs.length<=6,'mock-scenario-bound');
    for(const job of jobs)this.register(job);
  }
  validateStore() {
    const projection=this.store.snapshot(),session=projection.sessions?.[0]?.[1];
    this.store.owner().handoffs();
    requireCore(session&&session.members.length<=2&&session.maxConcurrent<=2&&(projection.assignments??[]).length<=6,'mock-scenario-bound');
    if(this.sessionId)requireCore(this.sessionId===session.sessionId,'mock-session-drift');
    this.sessionId=session.sessionId;this.maxConcurrent=session.maxConcurrent;return projection;
  }
  register(candidate) {
    exactFields(candidate,['plan','witnessRoot','mode']);requireCore(validMode(candidate.mode)&&this.jobs.size<6,'mock-job-mode-or-bound');
    const plan=decodeInbox(Buffer.from(JSON.stringify(candidate.plan)),'team.task.start'),projection=this.validateStore();
    requireCore(plan.sessionId===this.sessionId&&projection.sessions[0][1].members.some(row=>row.memberId===plan.memberId)
      &&!this.jobs.has(plan.taskId),'mock-job-binding');
    const root=storageRoot(candidate.witnessRoot);
    requireCore(root.device!==this.coreRoot.device||root.inode!==this.coreRoot.inode,'mock-core-path-refused');
    inspect(candidate.witnessRoot,plan.targetId);verifyRoot(root);
    for(const job of this.jobs.values())requireCore(job.plan.effectId!==plan.effectId&&job.plan.attemptId!==plan.attemptId
      &&job.plan.targetId!==plan.targetId&&(job.root.device!==root.device||job.root.inode!==root.inode),'mock-job-identity-reuse');
    this.jobs.set(plan.taskId,Object.freeze({plan:Object.freeze(plan),root,mode:candidate.mode}));
  }
  prepare(taskId) {
    requireCore(!this.frozen,'mock-controller-frozen');this.validateStore();const job=this.jobs.get(taskId);requireCore(job,'mock-unknown-job');
    const plan={...job.plan,commandId:randomUUID()};
    this.recordCommand('prepare',plan);
    try{return {result:this.store.scheduler().start(Buffer.from(JSON.stringify(plan))),plan};}
    catch(error){this.freeze(error,'prepare');throw error;}
  }
  recordCommand(stage,command) {
    requireCore(this.commands.length<64,'mock-command-bound');this.commands.push({stage,command});
  }
  emit(type,job,extra={}) {
    const event={type,taskId:job?.plan.taskId??null,...extra};requireCore(this.events.length<128,'mock-event-bound');
    this.events.push(event);
    for(const waiter of [...this.waiters])if(waiter.type===type&&(!waiter.taskId||waiter.taskId===event.taskId)){
      clearTimeout(waiter.timer);this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve({...event});
    }
  }
  waitFor(type,taskId) {
    const found=this.events.find(row=>row.type===type&&(!taskId||row.taskId===taskId));if(found)return Promise.resolve({...found});
    requireCore(this.waiters.length<16,'mock-reader-bound');
    return new Promise((resolve,reject)=>{const waiter={type,taskId,resolve};
      waiter.timer=setTimeout(()=>{this.waiters.splice(this.waiters.indexOf(waiter),1);reject(new Error('mock event deadline'));},10000);this.waiters.push(waiter);
    });
  }
  freeze(error,stage) {
    this.frozen=true;this.fault??=new Error(`mock ${stage} storage/controller failure: ${error.message}`);
    for(const worker of this.workers.values())if(!worker.isClosed)worker.cleanup().catch(fault=>{this.fault=fault;});
  }
  ready(worker) {
    if(this.frozen||worker.isClosed||worker.failure)return;
    try{
      this.validateStore();const invocation=this.store.claim(worker.job.plan.effectId);
      if(invocation===null){worker.expired=true;worker.cleanup().catch(error=>this.freeze(error,'expired-cleanup'));return;}
      worker.invoke(invocation);
    }catch(error){this.freeze(error,'claim');}
  }
  async finalize(worker) {
    const job=worker.job;
    try {
      const closed=await Promise.race([worker.closed,worker.unsafe]);
      requireCore(closed.verified,'mock-unverified-worker-exit');
      verifyRoot(job.root);
      const proof=await observeWitness(job.root.path,job.plan);
      verifyRoot(job.root);
      if(this.frozen){this.outcomes.set(job.plan.taskId,{taskId:job.plan.taskId,status:this.stopAccepted?'stopped':'error',proof});return;}
      if(worker.expired){this.outcomes.set(job.plan.taskId,{taskId:job.plan.taskId,status:'expired',proof});return;}
      const valid=!worker.failure&&closed.code===0&&worker.ready&&worker.sent&&worker.result&&matchesWitness(job.plan,proof);
      if(valid){
        this.store.settle(job.plan.effectId,Buffer.from(JSON.stringify(proof)));
        const report={type:'team.task.report',version:1,commandId:randomUUID(),sessionId:this.sessionId,
          taskId:job.plan.taskId,status:'done',summary:worker.result.summary};
        this.recordCommand('report',report);
        requireCore(this.store.member(job.plan.memberId).report(Buffer.from(JSON.stringify(report)))==='accepted','mock-report-rejected');
        this.outcomes.set(job.plan.taskId,{taskId:job.plan.taskId,status:'done',proof,report});this.emit('reported',job);
      }else{
        const failure={type:'team.task.failure',version:1,commandId:randomUUID(),sessionId:this.sessionId,
          taskId:job.plan.taskId,memberId:job.plan.memberId,attemptId:job.plan.attemptId,
          reason:worker.failure?.reason??'crash',summary:worker.failure?.summary??'Invalid worker exit transcript or independent witness'};
        this.recordCommand('failure',failure);
        requireCore(this.store.owner().observeFailure(Buffer.from(JSON.stringify(failure)))==='accepted','mock-failure-rejected');
        this.outcomes.set(job.plan.taskId,{taskId:job.plan.taskId,status:'failed',proof,failure});this.emit('observed_failure',job);
      }
    }catch(error){this.freeze(error,'finalize');}
  }
  run() {
    if(this.running)return this.running;
    requireCore(!this.frozen,'mock-controller-frozen');const projection=this.validateStore();
    this.running=(async()=>{
      const pending=[];
      try {
        if(projection.sessions[0][1].status==='active')for(const [,assignment]of projection.assignments){
          const effect=projection.effects.find(([id])=>id===assignment.effectId)?.[1],job=this.jobs.get(assignment.taskId);
          if(assignment.closed||!effect||effect.state!=='planned'||this.workers.has(assignment.taskId)
            ||new Map(projection.tasks).get(assignment.taskId)==='blocked')continue;
          if(!projection.approvals.some(([id,binding])=>id===assignment.effectId&&binding===approvalBinding(effect.plan)))continue;
          requireCore(job&&Object.entries(effect.plan).every(([key,value])=>key==='commandId'||job.plan[key]===value),'mock-plan-drift');
          requireCore([...this.workers.values()].filter(row=>!row.isClosed).length<this.maxConcurrent,'mock-live-cap');
          verifyRoot(job.root);const worker=new OwnedWorker(job,this);this.workers.set(assignment.taskId,worker);
          this.peakWorkers=Math.max(this.peakWorkers,[...this.workers.values()].filter(row=>!row.isClosed).length);
          pending.push(this.finalize(worker));
        }
      }catch(error){this.freeze(error,'run');}
      await Promise.all(pending);
      if(this.fault)throw this.fault;
      return this.summary();
    })().finally(()=>{this.running=null;});
    return this.running;
  }
  summary() {
    const snapshot=this.store.snapshot();
    return JSON.parse(JSON.stringify({activeWorkers:[...this.workers.values()].filter(row=>!row.isClosed).length,
      peakWorkers:this.peakWorkers,outcomes:[...this.outcomes.values()],events:this.events,commands:this.commands,
      tasks:snapshot.tasks,session:snapshot.sessions[0][1].status}));
  }
  stop() {
    if(this.stopping)return this.stopping;
    this.stopIntent=true;this.frozen=true;
    this.stopCommand={type:'team.session.stop',version:1,commandId:randomUUID(),sessionId:this.sessionId};
    this.recordCommand('stop',this.stopCommand);
    let result;
    try{result=this.store.owner().stop(Buffer.from(JSON.stringify(this.stopCommand)));this.stopAccepted=result==='accepted';this.emit('core_stop',null,{result});}
    catch(error){this.freeze(error,'stop');}
    this.stopping=(async()=>{
      const results=await Promise.allSettled([...this.workers.values()].map(worker=>worker.cleanup()));
      const rejected=results.find(row=>row.status==='rejected');if(rejected)this.fault=rejected.reason;
      if(this.fault)throw this.fault;
      return result;
    })();return this.stopping;
  }
  async close() {
    this.frozen=true;
    const results=await Promise.allSettled([...this.workers.values()].map(worker=>worker.cleanup()));
    if(this.running)await this.running.catch(()=>{});
    for(const waiter of this.waiters){clearTimeout(waiter.timer);waiter.resolve({type:'closed',taskId:null});}this.waiters=[];
    const rejected=results.find(row=>row.status==='rejected');if(rejected)throw rejected.reason;
  }
}
module.exports={ MockTeam };
