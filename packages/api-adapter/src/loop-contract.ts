import { binding, check, fields, text, uuid } from './validation';
export interface Profile { sessionId: string; memberId: string; name: string; instructions: string; role: 'leader' | 'member' }
export type LoopMessage = {kind:'user' | 'assistant.text';text:string}
  | {kind:'assistant.call';callId:string;name:'get_my_context'}
  | {kind:'tool.result';callId:string;result:Profile};
export interface LoopInput {version:1;kind:'loop';requestId:string;runId:string;turn:number;messages:readonly LoopMessage[]}
export function profile(value: unknown, expected?: {sessionId:string;memberId:string}): Profile {
  fields(value,['sessionId','memberId','name','instructions','role']);
  check(uuid(value.sessionId)&&uuid(value.memberId)&&text(value.name)&&text(value.instructions)
    &&(value.role==='leader'||value.role==='member'),'invalid-profile');
  check(!expected||(expected.sessionId===value.sessionId&&expected.memberId===value.memberId),'profile-binding');
  return Object.freeze({...value}) as unknown as Profile;
}
export function history(value: unknown): readonly LoopMessage[] {
  check(Array.isArray(value)&&value.length>=1&&value.length<=8,'history-count');
  const result: LoopMessage[]=value.map((item:unknown,index:number)=>{
    check(item!==null&&typeof item==='object','message-required');const row=item as Record<string,unknown>;
    if(row.kind==='user'||row.kind==='assistant.text') {
      fields(row,['kind','text']);check(text(row.text,row.kind==='user'?1024:65536,row.kind==='user'?256:65536),'history-text');
      check(row.kind!=='user'||index===0,'user-position');return Object.freeze({kind:row.kind,text:row.text});
    }
    if(row.kind==='assistant.call') {
      fields(row,['kind','callId','name']);check(uuid(row.callId)&&row.name==='get_my_context','history-call');
      return Object.freeze({kind:row.kind,callId:row.callId,name:'get_my_context'});
    }
    fields(row,['kind','callId','result']);check(row.kind==='tool.result'&&uuid(row.callId),'history-result');
    return Object.freeze({kind:'tool.result',callId:row.callId,result:profile(row.result)});
  });
  check(result[0].kind==='user','history-user');
  for(let i=1;i<result.length;i++) {
    const row=result[i],previous=result[i-1];
    if(row.kind==='tool.result')check(previous.kind==='assistant.call'&&previous.callId===row.callId,'result-call-match');
    if(previous.kind==='assistant.call')check(row.kind==='tool.result','missing-tool-result');
  }
  check(result.at(-1)!.kind!=='assistant.call','pending-history-call');
  check(Buffer.byteLength(JSON.stringify(result),'utf8')<=32768,'history-bytes');
  return Object.freeze(result);
}
export function loopInput(value: unknown): LoopInput {
  fields(value,['version','kind','requestId','runId','turn','messages']);
  check(value.version===1&&value.kind==='loop'&&uuid(value.requestId)&&uuid(value.runId)
    &&Number.isInteger(value.turn)&&(value.turn as number)>=1&&(value.turn as number)<=3,'loop-input');
  const messages=history(value.messages);check(messages.length===1+2*((value.turn as number)-1),'turn-history-match');
  const seen=new Set<string>();
  for(let i=1;i<messages.length;i+=2){const call=messages[i],result=messages[i+1];
    check(call.kind==='assistant.call'&&result.kind==='tool.result'&&call.callId===result.callId&&!seen.has(call.callId),'request-history-pair');seen.add(call.callId);}
  return Object.freeze({version:1,kind:'loop',requestId:value.requestId,runId:value.runId,turn:value.turn as number,messages});
}
export function loopBinding(value: unknown) {return binding(value);}
