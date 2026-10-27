import { check, fields, text, uuid } from './validation';
import { history, profile, type LoopMessage, type Profile } from './loop-contract';
export interface DelegationArgs {taskRef:string;memberRef:string}
export interface DelegationReceipt extends DelegationArgs {
  callId:string;commandId:string;sessionId:string;decision:'accepted'|'rejected';
  assignment:{taskId:string;memberId:string;enqueueSequence:number}|null;
}
export interface CoordinationCatalog {context:Profile;tasks:readonly {taskRef:string}[];members:readonly {memberRef:string;role:'leader'|'member'}[]}
export interface TeamStatus {
  version:1;sessionId:string;status:'active';maxConcurrent:number;
  members:readonly {memberRef:string;role:'leader'|'member';activeTaskId:string|null;queuedTaskIds:readonly string[]}[];
  tasks:readonly {taskId:string;memberRef:string;state:string;closed:boolean;enqueueSequence:number;result:{status:'done'|'failed';summary:string}|null}[];
}
export type CoordinationMessage=LoopMessage|{kind:'assistant.status';callId:string}|{kind:'status.result';callId:string;result:TeamStatus}
  |{kind:'assistant.delegate';callId:string;arguments:DelegationArgs}|{kind:'delegation.result';callId:string;result:DelegationReceipt};
export interface CoordinationInput {version:1;kind:'coordination-loop';requestId:string;runId:string;turn:number;catalog:CoordinationCatalog;messages:readonly CoordinationMessage[]}
export function coordinationRef(candidate:unknown):string {
  check(typeof candidate==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(candidate),'coordination-ref');return candidate;
}
export function delegationArgs(candidate:unknown):DelegationArgs {
  fields(candidate,['taskRef','memberRef']);return Object.freeze({taskRef:coordinationRef(candidate.taskRef),memberRef:coordinationRef(candidate.memberRef)});
}
export function coordinationCatalog(candidate:unknown):CoordinationCatalog {
  fields(candidate,['context','tasks','members']);const context=profile(candidate.context);check(context.role==='leader','catalog-leader');
  check(Array.isArray(candidate.tasks)&&candidate.tasks.length<=6&&Array.isArray(candidate.members)&&candidate.members.length>=1&&candidate.members.length<=5,'catalog-bounds');
  const tasks=candidate.tasks.map(row=>{fields(row,['taskRef']);return Object.freeze({taskRef:coordinationRef(row.taskRef)});});
  const members=candidate.members.map(row=>{fields(row,['memberRef','role']);check(row.role==='leader'||row.role==='member','catalog-role');
    return Object.freeze({memberRef:coordinationRef(row.memberRef),role:row.role as 'leader'|'member'});});
  check(new Set(tasks.map(row=>row.taskRef)).size===tasks.length&&new Set(members.map(row=>row.memberRef)).size===members.length
    &&members.filter(row=>row.role==='leader').length===1,'catalog-unique');
  return Object.freeze({context,tasks:Object.freeze(tasks),members:Object.freeze(members)});
}
export function delegationReceipt(candidate:unknown):DelegationReceipt {
  fields(candidate,['callId','commandId','sessionId','taskRef','memberRef','decision','assignment']);
  check(uuid(candidate.callId)&&uuid(candidate.commandId)&&uuid(candidate.sessionId)&&['accepted','rejected'].includes(candidate.decision as string),'delegation-receipt');
  const args=delegationArgs({taskRef:candidate.taskRef,memberRef:candidate.memberRef});let assignment:DelegationReceipt['assignment']=null;
  if(candidate.decision==='accepted'){
    fields(candidate.assignment,['taskId','memberId','enqueueSequence']);const row=candidate.assignment;
    check(uuid(row.taskId)&&uuid(row.memberId)&&Number.isSafeInteger(row.enqueueSequence)&&(row.enqueueSequence as number)>0,'delegation-assignment');
    assignment=Object.freeze({taskId:row.taskId,memberId:row.memberId,enqueueSequence:row.enqueueSequence as number});
  }else check(candidate.assignment===null,'rejected-delegation-assignment');
  return Object.freeze({callId:candidate.callId,commandId:candidate.commandId,sessionId:candidate.sessionId,...args,decision:candidate.decision as DelegationReceipt['decision'],assignment});
}
const STATES=['created','queued','waiting_approval','running','reconciling','blocked','done','failed','planned','dispatching','completed','needs_attention','cancelled','abandoned'];
export function teamStatus(candidate:unknown):TeamStatus {
  fields(candidate,['version','sessionId','status','maxConcurrent','members','tasks']);
  check(candidate.version===1&&uuid(candidate.sessionId)&&candidate.status==='active'&&Array.isArray(candidate.members)
    &&candidate.members.length>=1&&candidate.members.length<=5&&Array.isArray(candidate.tasks)&&candidate.tasks.length<=100,'team-status');
  check(Number.isInteger(candidate.maxConcurrent)&&(candidate.maxConcurrent as number)>=1&&(candidate.maxConcurrent as number)<=candidate.members.length,'status-concurrency');
  const tasks=candidate.tasks.map(row=>{
    fields(row,['taskId','memberRef','state','closed','enqueueSequence','result']);check(uuid(row.taskId)&&STATES.includes(row.state as string)
      &&typeof row.closed==='boolean'&&Number.isSafeInteger(row.enqueueSequence)&&(row.enqueueSequence as number)>0,'status-task');
    let result:TeamStatus['tasks'][number]['result']=null;
    if(row.result!==null){fields(row.result,['status','summary']);check(['done','failed'].includes(row.result.status as string)&&text(row.result.summary),'status-result');
      result=Object.freeze({status:row.result.status as 'done'|'failed',summary:row.result.summary});}
    return Object.freeze({taskId:row.taskId,memberRef:coordinationRef(row.memberRef),state:row.state as string,closed:row.closed,enqueueSequence:row.enqueueSequence as number,result});
  });
  check(new Set(tasks.map(row=>row.taskId)).size===tasks.length&&tasks.every((row,i)=>i===0||row.enqueueSequence>tasks[i-1].enqueueSequence),'status-task-order');
  const members=candidate.members.map(row=>{
    fields(row,['memberRef','role','activeTaskId','queuedTaskIds']);check(['leader','member'].includes(row.role as string)
      &&(row.activeTaskId===null||uuid(row.activeTaskId))&&Array.isArray(row.queuedTaskIds)&&row.queuedTaskIds.length<=100&&row.queuedTaskIds.every(uuid),'status-member');
    return Object.freeze({memberRef:coordinationRef(row.memberRef),role:row.role as 'leader'|'member',activeTaskId:row.activeTaskId as string|null,queuedTaskIds:Object.freeze([...row.queuedTaskIds]) as readonly string[]});
  });
  check(new Set(members.map(row=>row.memberRef)).size===members.length&&members.filter(row=>row.role==='leader').length===1,'status-roster');
  check(tasks.every(row=>members.some(member=>member.memberRef===row.memberRef)),'status-task-roster');
  for(const member of members){
    const owned=tasks.filter(row=>row.memberRef===member.memberRef&&!row.closed),queued=owned.filter(row=>row.state==='queued');
    check(JSON.stringify(queued.map(row=>row.taskId))===JSON.stringify(member.queuedTaskIds),'status-fifo');
    const active=owned.filter(row=>row.state!=='queued');check(active.length<=1&&(active[0]?.taskId??null)===member.activeTaskId,'status-occupancy');
  }
  const result=Object.freeze({version:1 as const,sessionId:candidate.sessionId,status:'active' as const,maxConcurrent:candidate.maxConcurrent as number,members:Object.freeze(members),tasks:Object.freeze(tasks)});
  check(Buffer.byteLength(JSON.stringify(result),'utf8')<=24576,'status-bytes');return result;
}
export function coordinationHistory(candidate:unknown):readonly CoordinationMessage[] {
  check(Array.isArray(candidate)&&candidate.length>=1&&candidate.length<=8,'coordination-history-count');
  const first=history([candidate[0]])[0],rows:CoordinationMessage[]=[first];const calls=new Set<string>();let read=false,delegated=false;
  for(let i=1;i<candidate.length;i+=2){
    const call=candidate[i];check(call&&typeof call==='object','coordination-call');
    if(call.kind==='assistant.text'){check(i===candidate.length-1,'coordination-final');rows.push(history([first,call])[1]);break;}
    check(!delegated&&uuid(call.callId)&&!calls.has(call.callId)&&calls.size<2,'coordination-order');calls.add(call.callId);
    if(call.kind==='assistant.delegate'){
      fields(call,['kind','callId','arguments']);const args=delegationArgs(call.arguments),pair=candidate[i+1];fields(pair,['kind','callId','result']);
      check(pair.kind==='delegation.result'&&pair.callId===call.callId,'delegation-pair');const receipt=delegationReceipt(pair.result);
      check(receipt.callId===call.callId&&receipt.taskRef===args.taskRef&&receipt.memberRef===args.memberRef,'delegation-pair-binding');
      rows.push(Object.freeze({kind:'assistant.delegate',callId:call.callId,arguments:args}),Object.freeze({kind:'delegation.result',callId:call.callId,result:receipt}));delegated=true;
    }else{
      check(!read,'coordination-read-once');read=true;
      if(call.kind==='assistant.status'){
        fields(call,['kind','callId']);const pair=candidate[i+1];fields(pair,['kind','callId','result']);check(pair.kind==='status.result'&&pair.callId===call.callId,'status-pair');
        rows.push(Object.freeze({kind:'assistant.status',callId:call.callId}),Object.freeze({kind:'status.result',callId:call.callId,result:teamStatus(pair.result)}));
      }else{const pair=history([first,call,candidate[i+1]]);check(pair[1].kind==='assistant.call','coordination-read-kind');rows.push(pair[1],pair[2]);}
    }
  }
  check(Buffer.byteLength(JSON.stringify(rows),'utf8')<=32768,'coordination-history-bytes');return Object.freeze(rows);
}
export function coordinationInput(candidate:unknown):CoordinationInput {
  fields(candidate,['version','kind','requestId','runId','turn','catalog','messages']);
  check(candidate.version===1&&candidate.kind==='coordination-loop'&&uuid(candidate.requestId)&&uuid(candidate.runId)
    &&Number.isInteger(candidate.turn)&&(candidate.turn as number)>=1&&(candidate.turn as number)<=3,'coordination-input');
  const catalog=coordinationCatalog(candidate.catalog),messages=coordinationHistory(candidate.messages);
  check(messages.length===1+2*((candidate.turn as number)-1)&&!messages.some(row=>row.kind==='assistant.text'),'coordination-turn');
  check(Buffer.byteLength(JSON.stringify({catalog,messages}),'utf8')<=32768,'coordination-catalog-history-bytes');
  for(const row of messages){
    if(row.kind==='tool.result')profile(row.result,catalog.context);
    if(row.kind==='status.result')check(row.result.sessionId===catalog.context.sessionId&&JSON.stringify(row.result.members.map(({memberRef,role})=>({memberRef,role})))===JSON.stringify(catalog.members),'status-catalog');
    if(row.kind==='delegation.result')check(row.result.sessionId===catalog.context.sessionId,'receipt-session');
    if(row.kind==='assistant.delegate')check(catalog.tasks.some(task=>task.taskRef===row.arguments.taskRef)&&catalog.members.some(member=>member.memberRef===row.arguments.memberRef),'delegate-catalog');
  }
  return Object.freeze({version:1,kind:'coordination-loop',requestId:candidate.requestId,runId:candidate.runId,turn:candidate.turn as number,catalog,messages});
}
