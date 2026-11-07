import { check, fields, text, uuid } from './validation';
import { history, profile, type LoopMessage } from './loop-contract';
export interface HandoffArgs {taskRef:string;memberRef:string;title:string}
export interface HandoffEdge {successorTaskId:string;targetMemberId:string;handoffSequence:number}
export interface HandoffReceipt {callId:string;commandId:string;sessionId:string;taskRef:string;memberRef:string;decision:'accepted'|'rejected';handoff:HandoffEdge|null}
export interface HandoffCatalog {context:import('./loop-contract').Profile;tasks:readonly {taskRef:string}[];members:readonly {memberRef:string;role:'leader'|'member'}[]}
export type HandoffMessage=LoopMessage|{kind:'assistant.handoff';callId:string;arguments:HandoffArgs}
  |{kind:'handoff.result';callId:string;result:HandoffReceipt};
export interface HandoffInput {version:1;kind:'handoff-loop';requestId:string;runId:string;turn:number;catalog:HandoffCatalog;messages:readonly HandoffMessage[]}
export function handoffRef(candidate:unknown):string {
  check(typeof candidate==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(candidate),'handoff-ref');return candidate;
}
export function handoffArgs(candidate:unknown):HandoffArgs {
  fields(candidate,['taskRef','memberRef','title']);
  check(text(candidate.title),'handoff-title');
  return Object.freeze({taskRef:handoffRef(candidate.taskRef),memberRef:handoffRef(candidate.memberRef),title:candidate.title as string});
}
export function handoffEdge(candidate:unknown):HandoffEdge {
  fields(candidate,['successorTaskId','targetMemberId','handoffSequence']);const row=candidate as Record<string,unknown>;
  check(uuid(row.successorTaskId)&&uuid(row.targetMemberId)&&Number.isSafeInteger(row.handoffSequence)&&(row.handoffSequence as number)>0,'handoff-edge');
  return Object.freeze({successorTaskId:row.successorTaskId as string,targetMemberId:row.targetMemberId as string,handoffSequence:row.handoffSequence as number});
}
export function handoffReceipt(candidate:unknown):HandoffReceipt {
  fields(candidate,['callId','commandId','sessionId','taskRef','memberRef','decision','handoff']);
  check(uuid(candidate.callId)&&uuid(candidate.commandId)&&uuid(candidate.sessionId)&&['accepted','rejected'].includes(candidate.decision as string),'handoff-receipt');
  const taskRef=handoffRef(candidate.taskRef),memberRef=handoffRef(candidate.memberRef);
  let handoff:HandoffEdge|null=null;
  if(candidate.decision==='accepted'){
    check(candidate.handoff!==null&&typeof candidate.handoff==='object','handoff-edge-required');
    handoff=handoffEdge(candidate.handoff);
  }else check(candidate.handoff===null,'rejected-handoff-edge');
  return Object.freeze({callId:candidate.callId,commandId:candidate.commandId,sessionId:candidate.sessionId,taskRef,memberRef,decision:candidate.decision as HandoffReceipt['decision'],handoff});
}
export function handoffCatalog(candidate:unknown):HandoffCatalog {
  fields(candidate,['context','tasks','members']);const context=profile(candidate.context);check(context.role==='leader','catalog-leader');
  check(Array.isArray(candidate.tasks)&&candidate.tasks.length<=6&&Array.isArray(candidate.members)&&candidate.members.length>=1&&candidate.members.length<=5,'catalog-bounds');
  const tasks=(candidate.tasks as unknown[]).map(row=>{fields(row,['taskRef']);return Object.freeze({taskRef:handoffRef((row as Record<string,unknown>).taskRef)});});
  const members=(candidate.members as unknown[]).map(row=>{fields(row,['memberRef','role']);check(row.role==='leader'||row.role==='member','catalog-role');
    return Object.freeze({memberRef:handoffRef((row as Record<string,unknown>).memberRef),role:row.role as 'leader'|'member'});});
  check(new Set(tasks.map(row=>row.taskRef)).size===tasks.length&&new Set(members.map(row=>row.memberRef)).size===members.length
    &&members.filter(row=>row.role==='leader').length===1,'catalog-unique');
  return Object.freeze({context,tasks:Object.freeze(tasks),members:Object.freeze(members)});
}
export function handoffHistory(candidate:unknown):readonly HandoffMessage[] {
  check(Array.isArray(candidate)&&candidate.length>=1&&candidate.length<=8,'handoff-history-count');
  const first=history([candidate[0]])[0],rows:HandoffMessage[]=[first],seen=new Set<string>();let handed=false,read=false;
  for(let i=1;i<candidate.length;i+=2){
    const call=candidate[i];check(call&&typeof call==='object','handoff-call');
    if(call.kind==='assistant.text'){check(i===candidate.length-1,'handoff-final');rows.push(history([first,call])[1]);break;}
    check(!handed&&uuid(call.callId)&&!seen.has(call.callId)&&seen.size<2,'handoff-order');seen.add(call.callId);
    if(call.kind==='assistant.handoff'){
      fields(call,['kind','callId','arguments']);const args=handoffArgs(call.arguments),pair=candidate[i+1];fields(pair,['kind','callId','result']);
      check(pair.kind==='handoff.result'&&pair.callId===call.callId,'handoff-pair');const receipt=handoffReceipt(pair.result);
      check(receipt.callId===call.callId&&receipt.taskRef===args.taskRef&&receipt.memberRef===args.memberRef,'handoff-pair-binding');
      rows.push(Object.freeze({kind:'assistant.handoff',callId:call.callId,arguments:args}),Object.freeze({kind:'handoff.result',callId:call.callId,result:receipt}));handed=true;
    }else{
      check(!read&&call.kind==='assistant.call','handoff-read-once');read=true;
      const pair=history([first,call,candidate[i+1]]);rows.push(pair[1],pair[2]);
    }
  }
  check(Buffer.byteLength(JSON.stringify(rows),'utf8')<=32768,'handoff-history-bytes');return Object.freeze(rows);
}
export function handoffInput(candidate:unknown):HandoffInput {
  fields(candidate,['version','kind','requestId','runId','turn','catalog','messages']);
  check(candidate.version===1&&candidate.kind==='handoff-loop'&&uuid(candidate.requestId)&&uuid(candidate.runId)
    &&Number.isInteger(candidate.turn)&&(candidate.turn as number)>=1&&(candidate.turn as number)<=3,'handoff-input');
  const catalog=handoffCatalog(candidate.catalog),messages=handoffHistory(candidate.messages);
  check(messages.length===1+2*((candidate.turn as number)-1)&&!messages.some(row=>row.kind==='assistant.text'),'handoff-turn');
  check(Buffer.byteLength(JSON.stringify({catalog,messages}),'utf8')<=32768,'handoff-catalog-history-bytes');
  for(const row of messages){
    if(row.kind==='tool.result')profile(row.result,catalog.context);
    if(row.kind==='handoff.result')check(row.result.sessionId===catalog.context.sessionId,'receipt-session');
    if(row.kind==='assistant.handoff')check(catalog.tasks.some(task=>task.taskRef===row.arguments.taskRef)&&catalog.members.some(member=>member.memberRef===row.arguments.memberRef),'handoff-catalog');
  }
  return Object.freeze({version:1,kind:'handoff-loop',requestId:candidate.requestId,runId:candidate.runId,turn:candidate.turn as number,catalog,messages});
}
