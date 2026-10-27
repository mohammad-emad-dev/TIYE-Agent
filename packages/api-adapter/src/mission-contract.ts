import { check, fields, text, uuid } from './validation';
import { history, type LoopMessage } from './loop-contract';
export interface MissionArgs {summary:string}
export interface Completion {summary:string;completedBy:string;sequence:number}
export interface MissionReceipt {callId:string;commandId:string;sessionId:string;decision:'accepted'|'rejected';completion:Completion|null}
export type MissionMessage=LoopMessage|{kind:'assistant.mission';callId:string;arguments:MissionArgs}
  |{kind:'mission.result';callId:string;result:MissionReceipt};
export interface MissionInput {version:1;kind:'mission-loop';requestId:string;runId:string;turn:number;messages:readonly MissionMessage[]}
export function missionArgs(value:unknown):MissionArgs {
  fields(value,['summary']);check(text(value.summary),'mission-summary');return Object.freeze({summary:value.summary});
}
export function missionReceipt(value:unknown):MissionReceipt {
  fields(value,['callId','commandId','sessionId','decision','completion']);
  check(uuid(value.callId)&&uuid(value.commandId)&&uuid(value.sessionId)&&['accepted','rejected'].includes(value.decision as string),'mission-receipt');
  let completion:Completion|null=null;
  if(value.decision==='accepted'){
    fields(value.completion,['summary','completedBy','sequence']);const row=value.completion;
    check(text(row.summary)&&uuid(row.completedBy)&&Number.isSafeInteger(row.sequence)&&(row.sequence as number)>0,'mission-completion');
    completion=Object.freeze({summary:row.summary,completedBy:row.completedBy,sequence:row.sequence as number});
  }else check(value.completion===null,'rejected-mission-completion');
  return Object.freeze({callId:value.callId,commandId:value.commandId,sessionId:value.sessionId,decision:value.decision as MissionReceipt['decision'],completion});
}
export function missionHistory(value:unknown):readonly MissionMessage[] {
  check(Array.isArray(value)&&value.length>=1&&value.length<=8,'mission-history-count');
  const first=history([value[0]])[0];check(first.kind==='user','mission-first-user');
  const rows:MissionMessage[]=[first],seen=new Set<string>();let completed=false,read=false;
  for(let i=1;i<value.length;i+=2){
    const call=value[i];check(call!==null&&typeof call==='object','mission-history-call');
    if(call.kind==='assistant.text'){check(i===value.length-1,'mission-final-text');rows.push(history([first,call])[1]);break;}
    check(!completed&&seen.size<2&&uuid(call.callId)&&!seen.has(call.callId),'mission-tool-order');seen.add(call.callId);
    if(call.kind==='assistant.mission'){
      fields(call,['kind','callId','arguments']);const args=missionArgs(call.arguments),result=value[i+1];
      fields(result,['kind','callId','result']);check(result.kind==='mission.result'&&result.callId===call.callId,'mission-pair');
      const receipt=missionReceipt(result.result);check(receipt.callId===call.callId
        &&(receipt.decision!=='accepted'||receipt.completion!.summary===args.summary),'mission-call-receipt');
      rows.push(Object.freeze({kind:'assistant.mission',callId:call.callId as string,arguments:args}),
        Object.freeze({kind:'mission.result',callId:call.callId as string,result:receipt}));completed=true;
    }else{
      check(!read&&call.kind==='assistant.call','mission-context-once');read=true;
      const pair=history([first,call,value[i+1]]);rows.push(pair[1],pair[2]);
    }
  }
  check(Buffer.byteLength(JSON.stringify(rows),'utf8')<=32768,'mission-history-bytes');return Object.freeze(rows);
}
export function missionInput(value:unknown):MissionInput {
  fields(value,['version','kind','requestId','runId','turn','messages']);
  check(value.version===1&&value.kind==='mission-loop'&&uuid(value.requestId)&&uuid(value.runId)
    &&Number.isInteger(value.turn)&&(value.turn as number)>=1&&(value.turn as number)<=3,'mission-input');
  const messages=missionHistory(value.messages);check(messages.length===1+2*((value.turn as number)-1)
    &&!messages.some(row=>row.kind==='assistant.text'),'mission-turn-history');
  return Object.freeze({version:1,kind:'mission-loop',requestId:value.requestId,runId:value.runId,turn:value.turn as number,messages});
}
