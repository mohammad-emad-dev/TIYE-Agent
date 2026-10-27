import type { TaskStore } from '../../core/dist';
import { createScriptedMissionScenario, loopBinding, profile, missionArgs, missionReceipt,
  type Binding, type MissionReceipt, type Mode } from '../../api-adapter/dist';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';
export interface Missioner extends ContextReader {submitMission(callId:string,canonicalCommand:string):MissionReceipt;completed(receipt:MissionReceipt):void}
function bind(store:TaskStore,binding:Binding):Missioner {
  const measured=<T>(operation:()=>T):T=>{const started=Date.now(),result=operation();
    if(Date.now()-started>=10000)throw new Error('core-mission-deadline');return result;};
  const state=()=>{
    const snapshot=store.snapshot(),session=snapshot.sessions?.[0]?.[1];
    if(!session||session.sessionId!==binding.sessionId||session.leaderId!==binding.memberId
      ||!session.members.some(row=>row.memberId===binding.memberId))throw new Error('mission-leader-binding');
    return {snapshot,session};
  };
  const active=()=>{if(state().session.status!=='active')throw new Error('mission-session-inactive');};
  active();const handle=store.member(binding.memberId),context=handle.context,complete=handle.completeMission,mission=handle.mission;
  const completed=(value:MissionReceipt)=>{
    const receipt=missionReceipt(value),current=state(),view=mission(),row=current.snapshot.commands.find(([id])=>id===receipt.commandId)?.[1];
    const expected=receipt.completion,actual=view.completion;
    if(receipt.sessionId!==binding.sessionId||receipt.decision!=='accepted'||!row||row.result!=='accepted'
      ||view.sessionId!==binding.sessionId||view.status!=='completed'||!actual||!expected||expected.completedBy!==binding.memberId
      ||actual.summary!==expected.summary||actual.completedBy!==expected.completedBy||actual.sequence!==expected.sequence)throw new Error('mission-completed-receipt-mismatch');
  };
  return Object.freeze({binding,active:()=>measured(active),read:()=>measured(()=>{active();return profile(context(),binding);}),
    completed:(receipt:MissionReceipt)=>measured(()=>{completed(receipt);}),
    submitMission:(callId:string,canonicalCommand:string)=>measured(()=>{
      if(Buffer.byteLength(canonicalCommand,'utf8')>16384)throw new Error('mission-command-bytes');
      const command=JSON.parse(canonicalCommand);
      if(!command||typeof command!=='object'||Object.keys(command).length!==5||command.type!=='team.mission.complete'
        ||command.version!==1||command.sessionId!==binding.sessionId||JSON.stringify(command)!==canonicalCommand)throw new Error('mission-command-binding');
      const args=missionArgs({summary:command.summary});
      missionReceipt({callId,commandId:command.commandId,sessionId:binding.sessionId,decision:'rejected',completion:null});active();
      const decision=complete(Buffer.from(canonicalCommand,'utf8')),view=mission(),current=state();
      const receipt=missionReceipt({callId,commandId:command.commandId,sessionId:binding.sessionId,decision,
        completion:decision==='accepted'?view.completion:null});
      if(current.snapshot.commands.find(([id])=>id===command.commandId)?.[1].result!==decision)throw new Error('mission-command-receipt');
      if(decision==='accepted'){
        if(receipt.completion!.summary!==args.summary)throw new Error('mission-summary-receipt');completed(receipt);
      }else if(view.sessionId!==binding.sessionId||view.status!=='active'||view.completion!==null)throw new Error('mission-rejected-projection');
      return receipt;
    })});
}
/** Trusted session/Leader composition; no own task assignment is needed. */
export function createCoreMissionScenario(store:TaskStore){
  const adapters=createScriptedMissionScenario(),loops:ConversationLoop[]=[];let disposed=false;
  return {
    create(value:unknown,mode:Mode='mission-done',pause:Pause='none'){
      const binding=loopBinding(value);
      if(disposed||loops.length||!['none','before-read','after-read','before-mission','after-mission','before-continuation','after-dispatch'].includes(pause))throw new Error('mission-scenario-bound');
      const reader=bind(store,binding),api=adapters.create(binding,mode),loop=new ConversationLoop(reader,api.adapter,pause,undefined,undefined,reader);
      loops.push(loop);return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
        releaseAdapter:api.fixture.release,late:api.fixture.late,waitAdapter:api.fixture.waitFor}};
    },
    async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}
  };
}
