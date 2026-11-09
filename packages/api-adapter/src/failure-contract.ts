import { check, fields, text, uuid } from './validation';
import { history, profile, type LoopMessage, type Profile } from './loop-contract';
export interface FailureRow {taskId:string;memberRef:string;reason:'crash'|'hang'|'rate_limit'|'auth'|'network';summary:string;observedSequence:number;status:'awaiting_reconciliation'|'closed';closedSequence:number|null;role:'leader'|'member'}
export interface FailureStatus {version:1;sessionId:string;status:'active';failures:readonly FailureRow[]}
export interface FailureCatalog {context:Profile;members:readonly {memberRef:string;role:'leader'|'member'}[]}
export type FailureMessage=LoopMessage|{kind:'assistant.failures';callId:string}|{kind:'failures.result';callId:string;result:FailureStatus};
export interface FailureInput {version:1;kind:'failure-loop';requestId:string;runId:string;turn:number;catalog:FailureCatalog;messages:readonly FailureMessage[]}
export function failureArgs(candidate:unknown):Record<string,never> {
  fields(candidate,[]);return Object.freeze({});
}
export type FailureArgs = ReturnType<typeof failureArgs>;
export function failureRef(candidate:unknown):string {
  check(typeof candidate==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(candidate),'failure-ref');return candidate;
}
const REASONS=['crash','hang','rate_limit','auth','network'] as const;
export function failureRow(candidate:unknown):FailureRow {
  fields(candidate,['taskId','memberRef','reason','summary','observedSequence','status','closedSequence','role']);
  check(uuid(candidate.taskId)&&REASONS.includes(candidate.reason as string)&&text(candidate.summary),'failure-row');
  check(Number.isSafeInteger(candidate.observedSequence)&&(candidate.observedSequence as number)>0,'failure-sequence');
  check(['awaiting_reconciliation','closed'].includes(candidate.status as string)&&['leader','member'].includes(candidate.role as string),'failure-row-status');
  if(candidate.status==='closed')check(Number.isSafeInteger(candidate.closedSequence)&&(candidate.closedSequence as number)>0,'failure-closed-sequence');
  else check(candidate.closedSequence===null,'failure-open-sequence');
  return Object.freeze({taskId:candidate.taskId as string,memberRef:failureRef(candidate.memberRef),reason:candidate.reason as FailureRow['reason'],
    summary:candidate.summary as string,observedSequence:candidate.observedSequence as number,status:candidate.status as FailureRow['status'],
    closedSequence:candidate.closedSequence as number|null,role:candidate.role as 'leader'|'member'});
}
export function failureStatus(candidate:unknown):FailureStatus {
  fields(candidate,['version','sessionId','status','failures']);
  check(candidate.version===1&&uuid(candidate.sessionId)&&candidate.status==='active'&&Array.isArray(candidate.failures)&&candidate.failures.length<=100,'failure-status');
  const failures=(candidate.failures as unknown[]).map(failureRow);
  check(new Set(failures.map(row=>row.taskId)).size===failures.length&&failures.every((row,i)=>i===0||row.observedSequence>failures[i-1].observedSequence),'failure-status-order');
  const result=Object.freeze({version:1 as const,sessionId:candidate.sessionId as string,status:'active' as const,failures:Object.freeze(failures)});
  check(Buffer.byteLength(JSON.stringify(result),'utf8')<=24576,'failure-status-bytes');return result;
}
export function failureCatalog(candidate:unknown):FailureCatalog {
  fields(candidate,['context','members']);const context=profile(candidate.context);check(context.role==='leader','catalog-leader');
  check(Array.isArray(candidate.members)&&candidate.members.length>=1&&candidate.members.length<=5,'catalog-bounds');
  const members=(candidate.members as unknown[]).map(row=>{fields(row,['memberRef','role']);check(row.role==='leader'||row.role==='member','catalog-role');
    return Object.freeze({memberRef:failureRef((row as Record<string,unknown>).memberRef),role:row.role as 'leader'|'member'});});
  check(new Set(members.map(row=>row.memberRef)).size===members.length&&members.filter(row=>row.role==='leader').length===1,'catalog-unique');
  return Object.freeze({context,members:Object.freeze(members)});
}
export function failureHistory(candidate:unknown):readonly FailureMessage[] {
  check(Array.isArray(candidate)&&candidate.length>=1&&candidate.length<=8,'failure-history-count');
  const first=history([candidate[0]])[0],rows:FailureMessage[]=[first];const calls=new Set<string>();let read=false;
  for(let i=1;i<candidate.length;i+=2){
    const call=candidate[i];check(call&&typeof call==='object','failure-call');
    if(call.kind==='assistant.text'){check(i===candidate.length-1,'failure-final');rows.push(history([first,call])[1]);break;}
    check(!read&&uuid(call.callId)&&!calls.has(call.callId)&&calls.size<1,'failure-order');calls.add(call.callId);read=true;
    if(call.kind==='assistant.failures'){
      fields(call,['kind','callId']);const pair=candidate[i+1];fields(pair,['kind','callId','result']);check(pair.kind==='failures.result'&&pair.callId===call.callId,'failure-pair');
      rows.push(Object.freeze({kind:'assistant.failures',callId:call.callId}),Object.freeze({kind:'failures.result',callId:call.callId,result:failureStatus(pair.result)}));
    }else{
      check(call.kind==='assistant.call','failure-read-kind');
      const pair=history([first,call,candidate[i+1]]);rows.push(pair[1],pair[2]);
    }
  }
  check(Buffer.byteLength(JSON.stringify(rows),'utf8')<=32768,'failure-history-bytes');return Object.freeze(rows);
}
export function failureInput(candidate:unknown):FailureInput {
  fields(candidate,['version','kind','requestId','runId','turn','catalog','messages']);
  check(candidate.version===1&&candidate.kind==='failure-loop'&&uuid(candidate.requestId)&&uuid(candidate.runId)
    &&Number.isInteger(candidate.turn)&&(candidate.turn as number)>=1&&(candidate.turn as number)<=3,'failure-input');
  const catalog=failureCatalog(candidate.catalog),messages=failureHistory(candidate.messages);
  check(messages.length===1+2*((candidate.turn as number)-1)&&!messages.some(row=>row.kind==='assistant.text'),'failure-turn');
  check(Buffer.byteLength(JSON.stringify({catalog,messages}),'utf8')<=32768,'failure-catalog-history-bytes');
  for(const row of messages){
    if(row.kind==='tool.result')profile(row.result,catalog.context);
    if(row.kind==='failures.result')check(row.result.sessionId===catalog.context.sessionId&&row.result.failures.every(notice=>catalog.members.some(member=>member.memberRef===notice.memberRef&&member.role===notice.role)),'failure-roster');
  }
  return Object.freeze({version:1,kind:'failure-loop',requestId:candidate.requestId as string,runId:candidate.runId as string,turn:candidate.turn as number,catalog,messages});
}
