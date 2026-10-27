import { check, fields, text, uuid } from './validation';
import { profile, type LoopMessage } from './loop-contract';
export interface ReportArgs {status:'done'|'failed';summary:string}
export interface ReportReceipt {callId:string;commandId:string;taskId:string;decision:'accepted'|'rejected'}
export type ReportMessage=LoopMessage|{kind:'assistant.report';callId:string;arguments:ReportArgs}
  |{kind:'report.result';callId:string;result:ReportReceipt};
export interface ReportInput {version:1;kind:'report-loop';requestId:string;runId:string;turn:number;messages:readonly ReportMessage[]}
export function reportArgs(value:unknown):ReportArgs {
  fields(value,['status','summary']);check(['done','failed'].includes(value.status as string)&&text(value.summary),'report-arguments');
  return Object.freeze({status:value.status as ReportArgs['status'],summary:value.summary as string});
}
export function reportReceipt(value:unknown):ReportReceipt {
  fields(value,['callId','commandId','taskId','decision']);
  check(uuid(value.callId)&&uuid(value.commandId)&&uuid(value.taskId)&&['accepted','rejected'].includes(value.decision as string),'report-receipt');
  return Object.freeze({...value}) as unknown as ReportReceipt;
}
export function reportHistory(value:unknown):readonly ReportMessage[] {
  check(Array.isArray(value)&&value.length>=1&&value.length<=8,'report-history-count');
  const rows:ReportMessage[]=value.map((item:unknown,index:number)=>{
    check(item!==null&&typeof item==='object','report-message');const row=item as Record<string,unknown>;
    if(row.kind==='user'||row.kind==='assistant.text'){
      fields(row,['kind','text']);check(text(row.text,row.kind==='user'?1024:65536,row.kind==='user'?256:65536),'report-history-text');
      check(row.kind==='user'?index===0:index===(value as unknown[]).length-1,'report-text-position');
      return Object.freeze({kind:row.kind,text:row.text});
    }
    if(row.kind==='assistant.call'){
      fields(row,['kind','callId','name']);check(uuid(row.callId)&&row.name==='get_my_context','report-context-call');
      return Object.freeze({kind:'assistant.call',callId:row.callId,name:'get_my_context'});
    }
    if(row.kind==='assistant.report'){
      fields(row,['kind','callId','arguments']);check(uuid(row.callId),'report-call-id');
      return Object.freeze({kind:'assistant.report',callId:row.callId,arguments:reportArgs(row.arguments)});
    }
    fields(row,['kind','callId','result']);check(uuid(row.callId),'report-result-id');
    if(row.kind==='tool.result')return Object.freeze({kind:'tool.result',callId:row.callId,result:profile(row.result)});
    check(row.kind==='report.result','report-result-kind');
    const receipt=reportReceipt(row.result);check(receipt.callId===row.callId,'report-receipt-call');
    return Object.freeze({kind:'report.result',callId:row.callId,result:receipt});
  });
  check(rows[0].kind==='user','report-first-user');const seen=new Set<string>();let reported=false;
  for(let i=1;i<rows.length;i+=2){
    const call=rows[i];if(call.kind==='assistant.text'){check(i===rows.length-1,'report-final-text');break;}
    check(!reported&&seen.size<2&&(call.kind==='assistant.call'||call.kind==='assistant.report'),'report-tool-order');
    check(!seen.has(call.callId),'report-duplicate-call');seen.add(call.callId);const result=rows[i+1];
    check(!!result&&(result.kind==='tool.result'||result.kind==='report.result')&&result.callId===call.callId,'report-result-pair');
    check(call.kind==='assistant.report'?result.kind==='report.result':result.kind==='tool.result','report-result-type');
    reported=call.kind==='assistant.report';
  }
  check(Buffer.byteLength(JSON.stringify(rows),'utf8')<=32768,'report-history-bytes');return Object.freeze(rows);
}
export function reportInput(value:unknown):ReportInput {
  fields(value,['version','kind','requestId','runId','turn','messages']);
  check(value.version===1&&value.kind==='report-loop'&&uuid(value.requestId)&&uuid(value.runId)
    &&Number.isInteger(value.turn)&&(value.turn as number)>=1&&(value.turn as number)<=3,'report-input');
  const messages=reportHistory(value.messages);
  check(messages.length===1+2*((value.turn as number)-1)&&!messages.some(row=>row.kind==='assistant.text'),'report-turn-history');
  return Object.freeze({version:1,kind:'report-loop',requestId:value.requestId,runId:value.runId,turn:value.turn as number,messages});
}
