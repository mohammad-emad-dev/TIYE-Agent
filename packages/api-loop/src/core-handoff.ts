import { createHash } from 'node:crypto';
import type { TaskStore, MockProjection, EngineSession } from '../../core/dist';
import { createScriptedHandoffScenario, loopBinding, profile, handoffRef, handoffCatalog, handoffArgs, handoffReceipt,
  type Binding, type HandoffCatalog, type HandoffArgs, type HandoffReceipt, type Mode } from '../../api-adapter/dist';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';
export interface Handoffer extends ContextReader {
  readonly catalog:HandoffCatalog;submitHandoff(callId:string,commandId:string,successorTaskId:string,args:HandoffArgs):HandoffReceipt;
}
function measured<T>(operation:()=>T):T {const started=Date.now(),answer=operation();if(Date.now()-started>=10000)throw new Error('handoff-core-deadline');return answer;}
function leader(snapshot:MockProjection,binding:Binding):EngineSession {
  const session=snapshot.sessions?.[0]?.[1];
  if(!session||session.sessionId!==binding.sessionId||session.status!=='active'||session.leaderId!==binding.memberId
    ||!session.members.some(row=>row.memberId===binding.memberId))throw new Error('handoff-leader-binding');return session;
}
function eligible(taskId:string,snapshot:MockProjection,sessionId:string):void {
  if(snapshot.tasks?.find(([id])=>id===taskId)?.[1]!=='failed')throw new Error('handoff-not-failed');
  const notice=(snapshot.failures??[]).find(([id])=>id===taskId)?.[1];
  if(!notice||notice.status!=='closed'||notice.sessionId!==sessionId)throw new Error('handoff-not-closed');
  if((snapshot.handoffs??[]).some(([id])=>id===taskId))throw new Error('handoff-already-handed');
  if((snapshot.questions??[]).some(([,row]:[unknown,{taskId:string;status:string;remainingEvents:number}])=>row.taskId===taskId&&(row.status==='open'||row.remainingEvents!==0)))throw new Error('handoff-open-question');
}
function bind(store:TaskStore,binding:Binding,candidate:unknown):Handoffer {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).length!==2
    ||!Object.hasOwn(candidate,'tasks')||!Object.hasOwn(candidate,'members'))throw new Error('handoff-catalog-fields');
  const supplied=candidate as {tasks:unknown;members:unknown},snapshot=store.snapshot(),session=leader(snapshot,binding);
  if(!Array.isArray(supplied.tasks)||supplied.tasks.length>6||!Array.isArray(supplied.members)||supplied.members.length!==session.members.length)throw new Error('handoff-catalog-bounds');
  const tasks=supplied.tasks.map(row=>{
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'taskRef')||!Object.hasOwn(row,'taskId')
      ||typeof (row as {taskId:unknown}).taskId!=='string')throw new Error('handoff-task-shape');
    const taskId=(row as {taskId:string}).taskId;
    eligible(taskId,snapshot,binding.sessionId);
    return Object.freeze({taskRef:handoffRef((row as {taskRef:unknown}).taskRef),taskId});
  });
  const members=supplied.members.map((row,i)=>{
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'memberRef')||!Object.hasOwn(row,'memberId')
      ||(row as {memberId:unknown}).memberId!==session.members[i].memberId)throw new Error('handoff-roster-map');
    return Object.freeze({memberRef:handoffRef((row as {memberRef:unknown}).memberRef),memberId:(row as {memberId:string}).memberId,role:(row as {memberId:string}).memberId===binding.memberId?'leader' as const:'member' as const});
  });
  if(new Set(tasks.map(row=>row.taskId)).size!==tasks.length)throw new Error('handoff-duplicate-task');
  const handle=store.member(binding.memberId),handoff=handle.handoff,context=handle.context;
  const catalog=handoffCatalog({context:profile(context(),binding),tasks:tasks.map(({taskRef})=>({taskRef})),members:members.map(({memberRef,role})=>({memberRef,role}))});
  const checked=()=>{const projection=store.snapshot(),current=leader(projection,binding);
    if(JSON.stringify(current.members)!==JSON.stringify(session.members))throw new Error('handoff-roster-drift');return projection;};
  return Object.freeze({binding,catalog,active:()=>measured(()=>{checked();}),read:()=>measured(()=>{checked();return profile(context(),binding);}),
    submitHandoff:(callId:string,commandId:string,successorTaskId:string,candidateArgs:HandoffArgs)=>measured(()=>{
      const args=handoffArgs(candidateArgs),task=tasks.find(row=>row.taskRef===args.taskRef),member=members.find(row=>row.memberRef===args.memberRef);
      if(!task||!member)throw new Error('handoff-selector');
      handoffReceipt({callId,commandId,sessionId:binding.sessionId,taskRef:args.taskRef,memberRef:args.memberRef,decision:'rejected',handoff:null});
      const command={type:'team.task.handoff',version:1,commandId,sessionId:binding.sessionId,predecessorTaskId:task.taskId,successorTaskId,targetMemberId:member.memberId,title:args.title};
      checked();const decision=handoff(Buffer.from(JSON.stringify(command),'utf8')),projection=checked();
      const record=projection.commands.find(([id])=>id===commandId)?.[1];
      const hash=createHash('sha256').update(JSON.stringify(['team.task.handoff',1,binding.memberId,commandId,binding.sessionId,task.taskId,successorTaskId,member.memberId,args.title]),'utf8').digest('hex');
      if(!record||record.result!==decision||record.hash!==hash)throw new Error('handoff-command-receipt');
      if(decision==='accepted'){
        const edge=projection.handoffs?.find(([id])=>id===task.taskId)?.[1];
        if(!edge||edge.sessionId!==binding.sessionId||edge.predecessorTaskId!==task.taskId||edge.successorTaskId!==successorTaskId
          ||edge.targetMemberId!==member.memberId||edge.title!==args.title||edge.createdBy!==binding.memberId
          ||!Number.isSafeInteger(edge.handoffSequence)||edge.handoffSequence<=0)throw new Error('handoff-edge-receipt');
        const assignment=projection.assignments?.find(([id])=>id===successorTaskId)?.[1];
        if(!assignment||assignment.sessionId!==binding.sessionId||assignment.taskId!==successorTaskId||assignment.memberId!==member.memberId
          ||assignment.effectId!==null||assignment.closed||assignment.result!==null
          ||projection.tasks.find(([id])=>id===successorTaskId)?.[1]!=='queued')throw new Error('handoff-assignment-receipt');
        return handoffReceipt({callId,commandId,sessionId:binding.sessionId,taskRef:args.taskRef,memberRef:args.memberRef,decision,
          handoff:{successorTaskId,targetMemberId:member.memberId,handoffSequence:edge.handoffSequence}});
      }
      return handoffReceipt({callId,commandId,sessionId:binding.sessionId,taskRef:args.taskRef,memberRef:args.memberRef,decision,handoff:null});
    })});
}
export function createCoreHandoffScenario(store:TaskStore){
  const adapters=createScriptedHandoffScenario(),loops:ConversationLoop[]=[];let disposed=false;
  return {create(value:unknown,catalog:unknown,mode:Mode='handoff-task',pause:Pause='none'){
    const binding=loopBinding(value);
    if(disposed||loops.length||!['none','before-read','after-read','before-handoff','after-handoff','before-continuation','after-dispatch'].includes(pause))throw new Error('handoff-scenario-bound');
    const handoffer=bind(store,binding,catalog),api=adapters.create(binding,mode),loop=new ConversationLoop(handoffer,api.adapter,pause,undefined,undefined,handoffer);
    loops.push(loop);return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
      releaseAdapter:api.fixture.release,late:api.fixture.late,waitAdapter:api.fixture.waitFor}};},
    async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}};
}
