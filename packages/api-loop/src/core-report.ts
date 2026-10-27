import type { TaskStore } from '../../core/dist';
import { createScriptedReportingScenario, loopBinding, profile, reportArgs, reportReceipt,
  type Binding, type Mode, type ReportReceipt } from '../../api-adapter/dist';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';
export interface Reporter extends ContextReader {readonly taskId:string;submit(callId:string,canonicalCommand:string):ReportReceipt}
function bind(store:TaskStore,binding:Binding,taskId:string):Reporter {
  const measured=<T>(operation:()=>T):T=>{const start=Date.now();const result=operation();
    if(Date.now()-start>=10000)throw new Error('core-report-deadline');return result;};
  const state=()=>{
    const snapshot=store.snapshot(),session=snapshot.sessions?.[0]?.[1];
    const assignment=snapshot.assignments?.find(([id])=>id===taskId)?.[1];
    if(!session||session.sessionId!==binding.sessionId||session.status!=='active'
      ||!session.members.some(row=>row.memberId===binding.memberId)||!assignment
      ||assignment.sessionId!==binding.sessionId||assignment.memberId!==binding.memberId)throw new Error('report-binding-inactive');
    return {snapshot,assignment};
  };
  if(state().assignment.closed)throw new Error('report-binding-closed');
  const handle=store.member(binding.memberId),context=handle.context,report=handle.report;
  return Object.freeze({binding,taskId,active:()=>measured(()=>{state();}),read:()=>measured(()=>{state();return profile(context(),binding);}),
    submit:(callId:string,canonicalCommand:string)=>measured(()=>{
      if(Buffer.byteLength(canonicalCommand,'utf8')>16384)throw new Error('report-command-bytes');
      const command=JSON.parse(canonicalCommand);
      if(!command||typeof command!=='object'||Object.keys(command).length!==7||command.type!=='team.task.report'
        ||command.version!==1||command.sessionId!==binding.sessionId||command.taskId!==taskId
        ||JSON.stringify(command)!==canonicalCommand)throw new Error('report-command-binding');
      const args=reportArgs({status:command.status,summary:command.summary}),commandId=command.commandId;state();
      // Validate all private receipt IDs before entering the writer.
      reportReceipt({callId,commandId,taskId,decision:'rejected'});
      const decision=report(Buffer.from(canonicalCommand,'utf8'));
      const snapshot=store.snapshot(),record=snapshot.commands.find(([id])=>id===commandId)?.[1];
      const assignment=snapshot.assignments?.find(([id])=>id===taskId)?.[1];
      if(!record||record.result!==decision||decision==='accepted'&&(!assignment?.closed
        ||assignment.result?.status!==args.status||assignment.result?.summary!==args.summary))throw new Error('report-receipt-mismatch');
      return reportReceipt({callId,commandId,taskId,decision});
    })});
}
/** Trusted composition only; callers cannot supply a tool handler or transport. */
export function createCoreReportingScenario(store:TaskStore){
  const adapters=createScriptedReportingScenario(),members=new Set<string>(),loops:ConversationLoop[]=[];
  let sessionId:string|undefined,disposed=false;
  return {
    create(value:unknown,mode:Mode='report-done',pause:Pause='none'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('report-binding');
      const row=value as Record<string,unknown>;
      if(Object.keys(row).length!==4||!['version','sessionId','memberId','taskId'].every(k=>Object.hasOwn(row,k)))throw new Error('report-binding-fields');
      const binding=loopBinding({version:row.version,sessionId:row.sessionId,memberId:row.memberId});
      if(typeof row.taskId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.taskId))throw new Error('report-task-id');
      if(disposed||loops.length>=2||members.has(binding.memberId)||sessionId&&sessionId!==binding.sessionId
        ||!['none','before-read','after-read','before-report','after-report','before-continuation','after-dispatch'].includes(pause))throw new Error('report-scenario-bound');
      const reader=bind(store,binding,row.taskId),api=adapters.create(binding,mode);
      const loop=new ConversationLoop(reader,api.adapter,pause,reader);
      members.add(binding.memberId);sessionId=binding.sessionId;loops.push(loop);
      return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
        releaseAdapter:api.fixture.release,late:api.fixture.late,waitAdapter:api.fixture.waitFor}};
    },
    async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}
  };
}
