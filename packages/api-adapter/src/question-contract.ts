import { check, fields, text, uuid } from './validation';
import { reportHistory, type ReportMessage } from './report-contract';
export type QuestionTool='ask_leader'|'ask_user';
export interface QuestionArgs {text:string;options:readonly string[]}
export interface AskReceipt {callId:string;commandId:string;questionId:string;taskId:string;decision:'accepted'|'rejected';recipient:'leader'|'owner'}
export type Answer={kind:'text';text:string}|{kind:'option';index:number};
export interface QuestionResult {receipt:AskReceipt;status:'rejected'|'answered';answer:Answer|null;answeredBy:string|null;recipient:'leader'|'owner'}
export type QuestionMessage=ReportMessage|{kind:'assistant.question';callId:string;tool:QuestionTool;arguments:QuestionArgs}
  |{kind:'question.result';callId:string;result:QuestionResult};
export interface QuestionInput {version:1;kind:'question-loop';requestId:string;runId:string;turn:number;messages:readonly QuestionMessage[]}
export function questionArgs(value:unknown):QuestionArgs {
  fields(value,['text','options']);check(text(value.text)&&Array.isArray(value.options)&&value.options.length<=3
    &&value.options.every(option=>text(option))&&new Set(value.options).size===value.options.length,'question-arguments');
  return Object.freeze({text:value.text,options:Object.freeze([...value.options])});
}
export function askReceipt(value:unknown):AskReceipt {
  fields(value,['callId','commandId','questionId','taskId','decision','recipient']);
  check(uuid(value.callId)&&uuid(value.commandId)&&uuid(value.questionId)&&uuid(value.taskId)
    &&['accepted','rejected'].includes(value.decision as string)&&['leader','owner'].includes(value.recipient as string),'ask-receipt');
  return Object.freeze({...value}) as unknown as AskReceipt;
}
export function questionResult(value:unknown,args:QuestionArgs):QuestionResult {
  fields(value,['receipt','status','answer','answeredBy','recipient']);const receipt=askReceipt(value.receipt);
  check(['leader','owner'].includes(value.recipient as string),'answer-recipient');
  if(value.status==='rejected'){
    check(receipt.decision==='rejected'&&value.answer===null&&value.answeredBy===null&&value.recipient===receipt.recipient,'rejected-question-result');
    return Object.freeze({receipt,status:'rejected',answer:null,answeredBy:null,recipient:receipt.recipient});
  }
  check(value.status==='answered'&&receipt.decision==='accepted','answered-question-result');
  const answer=value.answer;check(answer!==null&&typeof answer==='object','answer-required');
  const row=answer as Record<string,unknown>;let parsed:Answer;
  if(row.kind==='text'){fields(row,['kind','text']);check(text(row.text),'answer-text');parsed=Object.freeze({kind:'text',text:row.text});}
  else {fields(row,['kind','index']);check(row.kind==='option'&&Number.isSafeInteger(row.index)&&(row.index as number)>=0
    &&(row.index as number)<args.options.length,'answer-option');parsed=Object.freeze({kind:'option',index:row.index as number});}
  check(value.recipient==='owner'?value.answeredBy==='owner':uuid(value.answeredBy),'answer-author');
  return Object.freeze({receipt,status:'answered',answer:parsed,answeredBy:value.answeredBy as string,recipient:value.recipient as 'leader'|'owner'});
}
export function questionHistory(value:unknown):readonly QuestionMessage[] {
  check(Array.isArray(value)&&value.length>=1&&value.length<=8,'question-history-count');
  const first=reportHistory([value[0]])[0];check(first.kind==='user','question-first-user');
  const rows:QuestionMessage[]=[first],seen=new Set<string>();let asked=false,reported=false;
  for(let i=1;i<value.length;i+=2){
    const call=value[i];check(call!==null&&typeof call==='object','question-history-call');
    if(call.kind==='assistant.text'){
      check(i===value.length-1,'question-final-text');rows.push(reportHistory([first,call])[1]);break;
    }
    check(!reported&&seen.size<2&&uuid(call.callId)&&!seen.has(call.callId),'question-tool-order');seen.add(call.callId);
    if(call.kind==='assistant.question'){
      fields(call,['kind','callId','tool','arguments']);check(!asked&&['ask_leader','ask_user'].includes(call.tool as string),'question-call');asked=true;
      const args=questionArgs(call.arguments),result=value[i+1];fields(result,['kind','callId','result']);
      check(result.kind==='question.result'&&result.callId===call.callId,'question-pair');const parsed=questionResult(result.result,args);
      check(parsed.receipt.callId===call.callId&&parsed.receipt.recipient===(call.tool==='ask_user'?'owner':'leader'),'question-receipt-binding');
      rows.push(Object.freeze({kind:'assistant.question',callId:call.callId as string,tool:call.tool as QuestionTool,arguments:args}),
        Object.freeze({kind:'question.result',callId:call.callId,result:parsed}));
    }else{
      const pair=reportHistory([first,call,value[i+1]]);rows.push(pair[1],pair[2]);reported=call.kind==='assistant.report';
    }
  }
  check(Buffer.byteLength(JSON.stringify(rows),'utf8')<=32768,'question-history-bytes');return Object.freeze(rows);
}
export function questionInput(value:unknown):QuestionInput {
  fields(value,['version','kind','requestId','runId','turn','messages']);
  check(value.version===1&&value.kind==='question-loop'&&uuid(value.requestId)&&uuid(value.runId)
    &&Number.isInteger(value.turn)&&(value.turn as number)>=1&&(value.turn as number)<=3,'question-input');
  const messages=questionHistory(value.messages);check(messages.length===1+2*((value.turn as number)-1)
    &&!messages.some(row=>row.kind==='assistant.text'),'question-turn-history');
  return Object.freeze({version:1,kind:'question-loop',requestId:value.requestId,runId:value.runId,turn:value.turn as number,messages});
}
export function resumeInput(value:unknown){
  fields(value,['version','resumeId','runId','questionId']);check(value.version===1&&uuid(value.resumeId)&&uuid(value.runId)&&uuid(value.questionId),'resume-input');
  return Object.freeze({version:1 as const,resumeId:value.resumeId,runId:value.runId,questionId:value.questionId});
}
