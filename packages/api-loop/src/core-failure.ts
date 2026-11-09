import type { TaskStore, MockProjection, EngineSession } from '../../core/dist';
import { createScriptedFailureScenario, loopBinding, profile, failureRef, failureCatalog, failureStatus,
  type Binding, type FailureCatalog, type FailureStatus, type Mode } from '../../api-adapter/dist';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';
export interface FailureViewer extends ContextReader {
  readonly catalog:FailureCatalog;failures():FailureStatus;
}
function measured<T>(operation:()=>T):T {const started=Date.now(),answer=operation();if(Date.now()-started>=10000)throw new Error('failure-core-deadline');return answer;}
function leader(snapshot:MockProjection,binding:Binding):EngineSession {
  const session=snapshot.sessions?.[0]?.[1];
  if(!session||session.sessionId!==binding.sessionId||session.status!=='active'||session.leaderId!==binding.memberId
    ||!session.members.some(row=>row.memberId===binding.memberId))throw new Error('failure-leader-binding');return session;
}
function bind(store:TaskStore,binding:Binding,candidate:unknown):FailureViewer {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).length!==1
    ||!Object.hasOwn(candidate,'members'))throw new Error('failure-catalog-fields');
  const supplied=candidate as {members:unknown},snapshot=store.snapshot(),session=leader(snapshot,binding);
  if(!Array.isArray(supplied.members)||supplied.members.length!==session.members.length)throw new Error('failure-catalog-bounds');
  const members=supplied.members.map((row,i)=>{
    if(!row||typeof row!=='object'||Object.keys(row).length!==2||!Object.hasOwn(row,'memberRef')||!Object.hasOwn(row,'memberId')
      ||(row as {memberId:unknown}).memberId!==session.members[i].memberId)throw new Error('failure-roster-map');
    return Object.freeze({memberRef:failureRef((row as {memberRef:unknown}).memberRef),memberId:(row as {memberId:string}).memberId,role:(row as {memberId:string}).memberId===binding.memberId?'leader' as const:'member' as const});
  });
  if(new Set(members.map(row=>row.memberRef)).size!==members.length)throw new Error('failure-duplicate-member');
  const handle=store.member(binding.memberId),failures=handle.failures,context=handle.context;
  const catalog=failureCatalog({context:profile(context(),binding),members:members.map(({memberRef,role})=>({memberRef,role}))});
  let consumed=false;
  const checked=()=>{const projection=store.snapshot(),current=leader(projection,binding);
    if(JSON.stringify(current.members)!==JSON.stringify(session.members))throw new Error('failure-roster-drift');return projection;};
  return Object.freeze({binding,catalog,active:()=>measured(()=>{checked();}),read:()=>measured(()=>{checked();return profile(context(),binding);}),
    failures:()=>measured(()=>{
      if(consumed)throw new Error('failure-second-read');consumed=true;
      checked();
      const notices=failures().sort((a,b)=>a.observedSequence-b.observedSequence);
      if(notices.some(row=>row.sessionId!==binding.sessionId))throw new Error('failure-foreign-notice');
      if(notices.length>100)throw new Error('failure-count-bound');
      return failureStatus({version:1,sessionId:binding.sessionId,status:'active',
        failures:notices.map(notice=>({taskId:notice.taskId,
          memberRef:members.find(member=>member.memberId===notice.memberId)!.memberRef,
          reason:notice.reason,summary:notice.summary,observedSequence:notice.observedSequence,
          status:notice.status,closedSequence:notice.closedSequence,
          role:members.find(member=>member.memberId===notice.memberId)!.role}))});
    })});
}
export function createCoreFailureScenario(store:TaskStore){
  const adapters=createScriptedFailureScenario(),loops:ConversationLoop[]=[];let disposed=false;
  return {create(value:unknown,catalog:unknown,mode:Mode='failure-view',pause:Pause='none'){
    const binding=loopBinding(value);
    if(disposed||loops.length||!['none','before-read','after-read','before-continuation','after-dispatch'].includes(pause))throw new Error('failure-scenario-bound');
    const viewer=bind(store,binding,catalog),api=adapters.create(binding,mode),loop=new ConversationLoop(viewer,api.adapter,pause,undefined,undefined,viewer);
    loops.push(loop);return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
      releaseAdapter:api.fixture.release,late:api.fixture.late,waitAdapter:api.fixture.waitFor}};
  },async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}};
}
