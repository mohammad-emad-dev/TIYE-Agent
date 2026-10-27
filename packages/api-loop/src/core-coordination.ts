import { createHash } from 'node:crypto';
import type { TaskStore, MockProjection, EngineSession } from '../../core/dist';
import { createScriptedCoordinationScenario, loopBinding, profile, coordinationRef, coordinationCatalog, delegationArgs, delegationReceipt, teamStatus,
  type Binding, type CoordinationCatalog, type DelegationArgs, type DelegationReceipt, type Mode, type TeamStatus } from '../../api-adapter/dist';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';
export interface Coordinator extends ContextReader {
  readonly catalog:CoordinationCatalog;status():TeamStatus;submitDelegation(callId:string,commandId:string,args:DelegationArgs):DelegationReceipt;
}
function measured<T>(operation:()=>T):T {const started=Date.now(),answer=operation();if(Date.now()-started>=10000)throw new Error('coordination-core-deadline');return answer;}
function leader(snapshot:MockProjection,binding:Binding):EngineSession {
  const session=snapshot.sessions?.[0]?.[1];
  if(!session||session.sessionId!==binding.sessionId||session.status!=='active'||session.leaderId!==binding.memberId
    ||!session.members.some(row=>row.memberId===binding.memberId))throw new Error('coordination-leader-binding');return session;
}
function bind(store:TaskStore,binding:Binding,candidate:unknown):Coordinator {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).length!==2
    ||!Object.hasOwn(candidate,'tasks')||!Object.hasOwn(candidate,'members'))throw new Error('coordination-catalog-fields');
  const supplied=candidate as {tasks:unknown;members:unknown},snapshot=store.snapshot(),session=leader(snapshot,binding);
  if(!Array.isArray(supplied.tasks)||supplied.tasks.length>6||!Array.isArray(supplied.members)||supplied.members.length!==session.members.length)throw new Error('coordination-catalog-bounds');
  const tasks=supplied.tasks.map(row=>{
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'taskRef')||!Object.hasOwn(row,'taskId')
      ||!snapshot.tasks.some(([id,state])=>id===row.taskId&&state==='created')||snapshot.assignments?.some(([id])=>id===row.taskId))throw new Error('coordination-prepared-task');
    return Object.freeze({taskRef:coordinationRef(row.taskRef),taskId:row.taskId as string});
  });
  const members=supplied.members.map((row,i)=>{
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'memberRef')||!Object.hasOwn(row,'memberId')
      ||row.memberId!==session.members[i].memberId)throw new Error('coordination-roster-map');
    return Object.freeze({memberRef:coordinationRef(row.memberRef),memberId:row.memberId as string,role:row.memberId===binding.memberId?'leader' as const:'member' as const});
  });
  if(new Set(tasks.map(row=>row.taskId)).size!==tasks.length)throw new Error('coordination-duplicate-task');
  const handle=store.member(binding.memberId),enqueue=handle.enqueue,context=handle.context;
  const catalog=coordinationCatalog({context:profile(context(),binding),tasks:tasks.map(({taskRef})=>({taskRef})),members:members.map(({memberRef,role})=>({memberRef,role}))});
  const checked=()=>{const projection=store.snapshot(),current=leader(projection,binding);
    if(JSON.stringify(current.members)!==JSON.stringify(session.members))throw new Error('coordination-roster-drift');return projection;};
  return Object.freeze({binding,catalog,active:()=>measured(()=>{checked();}),read:()=>measured(()=>{checked();return profile(context(),binding);}),
    status:()=>measured(()=>{
      const projection=checked(),assignments=(projection.assignments??[]).map(([,row])=>row).filter(row=>row.sessionId===binding.sessionId).sort((a,b)=>a.enqueueSequence-b.enqueueSequence);
      return teamStatus({version:1,sessionId:binding.sessionId,status:'active',maxConcurrent:session.maxConcurrent,
        members:members.map(member=>({memberRef:member.memberRef,role:member.role,
          activeTaskId:assignments.find(row=>row.memberId===member.memberId&&!row.closed&&row.effectId!==null)?.taskId??null,
          queuedTaskIds:assignments.filter(row=>row.memberId===member.memberId&&!row.closed&&row.effectId===null).map(row=>row.taskId)})),
        tasks:assignments.map(row=>({taskId:row.taskId,memberRef:members.find(member=>member.memberId===row.memberId)!.memberRef,
          state:projection.tasks.find(([id])=>id===row.taskId)![1],closed:row.closed,enqueueSequence:row.enqueueSequence,result:row.result}))});
    }),
    submitDelegation:(callId:string,commandId:string,candidateArgs:DelegationArgs)=>measured(()=>{
      const args=delegationArgs(candidateArgs),task=tasks.find(row=>row.taskRef===args.taskRef),member=members.find(row=>row.memberRef===args.memberRef);
      if(!task||!member)throw new Error('coordination-selector');
      delegationReceipt({callId,commandId,sessionId:binding.sessionId,...args,decision:'rejected',assignment:null});
      const command={type:'team.task.enqueue',version:1,commandId,sessionId:binding.sessionId,taskId:task.taskId,memberId:member.memberId};
      checked();const decision=enqueue(Buffer.from(JSON.stringify(command),'utf8')),projection=checked();
      const record=projection.commands.find(([id])=>id===commandId)?.[1];
      const hash=createHash('sha256').update(JSON.stringify(['team.task.enqueue',1,binding.memberId,commandId,binding.sessionId,task.taskId,member.memberId]),'utf8').digest('hex');
      if(!record||record.result!==decision||record.hash!==hash)throw new Error('coordination-command-receipt');
      const assignment=projection.assignments?.find(([id])=>id===task.taskId)?.[1];
      if(decision==='accepted'&&(!assignment||assignment.sessionId!==binding.sessionId||assignment.memberId!==member.memberId
        ||assignment.effectId!==null||assignment.closed||assignment.result!==null||projection.tasks.find(([id])=>id===task.taskId)?.[1]!=='queued'))throw new Error('coordination-assignment-receipt');
      return delegationReceipt({callId,commandId,sessionId:binding.sessionId,...args,decision,
        assignment:decision==='accepted'?{taskId:task.taskId,memberId:member.memberId,enqueueSequence:assignment!.enqueueSequence}:null});
    })});
}
export function createCoreCoordinationScenario(store:TaskStore){
  const adapters=createScriptedCoordinationScenario(),loops:ConversationLoop[]=[];let disposed=false;
  return {create(value:unknown,catalog:unknown,mode:Mode='coordination-delegate',pause:Pause='none'){
    const binding=loopBinding(value);
    if(disposed||loops.length||!['none','before-read','after-read','before-delegation','after-delegation','before-continuation','after-dispatch'].includes(pause))throw new Error('coordination-scenario-bound');
    const coordinator=bind(store,binding,catalog),api=adapters.create(binding,mode),loop=new ConversationLoop(coordinator,api.adapter,pause,undefined,undefined,coordinator);
    loops.push(loop);return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
      releaseAdapter:api.fixture.release,late:api.fixture.late,waitAdapter:api.fixture.waitFor}};
  },async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}};
}
