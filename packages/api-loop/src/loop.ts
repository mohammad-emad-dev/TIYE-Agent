import { randomUUID } from 'node:crypto';
import { history, loopInput, missionArgs, missionReceipt, missionHistory, type MissionMessage, type MissionReceipt, questionHistory, questionArgs, askReceipt, questionResult, resumeInput, type QuestionMessage, type QuestionArgs, type QuestionTool, type AskReceipt, type QuestionResult, reportHistory, reportArgs, reportReceipt, type ReportReceipt, type MemberAdapter, type MemberEvent } from '../../api-adapter/dist';
import type { Missioner } from './core-mission';
import type { Questioner } from './core-question';
import type { Reporter } from './core-report';
import type { ContextReader, Event, Outcome, OutcomeState, Pause, RequestSlot, Subscriber } from './types';
export interface ResumeAck {readonly status:'still_waiting'|'continued'|'failed'|'stopped'}
interface Run {
  id:string;history:readonly (QuestionMessage|MissionMessage)[];requests:number;reads:number;checks:number;bytes:number;text:string;
  missionAttempts:number;missionState:'none'|'accepted'|'rejected'|'uncertain';missionCommandId?:string;missionReceipt?:MissionReceipt;
  reportAttempts:number;reportState:'none'|'accepted'|'rejected'|'uncertain';receipt?:ReportReceipt;commandId?:string;
  asks:number;answerReads:number;resumeIds:Set<string>;resumeBusy:boolean;waiting:boolean;reserved:boolean;questionState:'none'|'accepted'|'rejected'|'answered'|'uncertain';
  questionId?:string;questionCommandId?:string;questionReceipt?:AskReceipt;answerResult?:QuestionResult;pending?:{callId:string;tool:QuestionTool;args:QuestionArgs;receipt:AskReceipt};
  slot:RequestSlot|null;calls:Set<string>;fenced:boolean;outcome?:Outcome;result:Promise<Outcome>;complete(value:Outcome):void;
}
function requireLoop(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}

/** No raw store/roles here; the only core capability is ContextReader. */
export class ConversationLoop {
  private runs=new Map<string,Run>();private active:Run|null=null;private terminal=false;
  private totalRequests=0;
  private scheduled=false;private pumping=false;private stopping?:Promise<Outcome|null>;private paused=false;
  private work?:Promise<void>;private resumeWork?:Promise<ResumeAck>;
  private gateUsed=false;private gateRelease?:()=>void;private gateTimer?:ReturnType<typeof setTimeout>;
  private events:Event[]=[];private subscribers=new Map<symbol,Subscriber>();private notificationErrors=0;
  private queue:{event:Event;listeners:[symbol,Subscriber][]}[]=[];private notifying=false;
  private remove:()=>void;
  constructor(private readonly reader:ContextReader,private readonly adapter:MemberAdapter,private readonly pause:Pause,private readonly reporter?:Reporter,private readonly questioner?:Questioner,private readonly missioner?:Missioner) {
    this.remove=adapter.onEvent(event=>this.accept(event));
  }
  async start():Promise<void>{await this.adapter.start({...this.reader.binding,briefing:'Fixed read-only context conversation'});}
  onEvent(callback:Subscriber):()=>void {
    requireLoop(!this.terminal&&typeof callback==='function'&&this.subscribers.size<16,'loop-subscriber-refused');
    const token=Symbol('loop-subscription');this.subscribers.set(token,callback);return()=>{this.subscribers.delete(token);};
  }
  private emit(run:Run|null,type:string,extra:Partial<Event>={}):void {
    requireLoop(this.queue.length<1024,'loop-notification-bound');
    const event=Object.freeze({...this.reader.binding,type,runId:run?.id??null,...extra});
    this.events.push(event);if(this.events.length>64)this.events.shift();
    this.queue.push({event,listeners:[...this.subscribers]});if(this.notifying)return;this.notifying=true;
    try{while(this.queue.length){const item=this.queue.shift()!;for(const [token,callback]of item.listeners){
      if(this.subscribers.get(token)!==callback)continue;
      try{const pending=callback(Object.freeze({...item.event}));if(pending!==undefined)void Promise.resolve(pending).catch(()=>{this.notificationErrors=Math.min(128,this.notificationErrors+1);});}
      catch{this.notificationErrors=Math.min(128,this.notificationErrors+1);}
    }}}finally{this.notifying=false;}
  }
  run(value:unknown):Promise<Outcome> {
    requireLoop(value!==null&&typeof value==='object'&&!Array.isArray(value),'run-input');
    const input=value as Record<string,unknown>;
    requireLoop(Object.keys(input).length===3&&['version','runId','text'].every(k=>Object.hasOwn(input,k))&&input.version===1,'run-fields');
    // Reuse the actual structured request parser to validate UUID/text without dispatch.
    const parsed=loopInput({version:1,kind:'loop',requestId:input.runId,runId:input.runId,turn:1,messages:[{kind:'user',text:input.text}]});
    requireLoop(!this.terminal&&!this.active&&!this.runs.has(parsed.runId)&&this.runs.size<(this.missioner?1:2),'loop-admission');
    let resolve!:(value:Outcome)=>void;const result=new Promise<Outcome>(done=>{resolve=done;});
    const run:Run={id:parsed.runId,history:parsed.messages,requests:0,reads:0,checks:0,bytes:0,text:'',missionAttempts:0,missionState:'none',reportAttempts:0,reportState:'none',asks:0,answerReads:0,resumeIds:new Set(),resumeBusy:false,waiting:false,reserved:false,questionState:'none',slot:null,calls:new Set(),fenced:false,result,complete:resolve};
    this.runs.set(run.id,run);this.active=run;this.emit(run,'run.admitted');this.schedule(run);return result;
  }
  private transcript(value:unknown):readonly (QuestionMessage|MissionMessage)[]{return this.missioner?missionHistory(value):this.questioner?questionHistory(value):this.reporter?reportHistory(value):history(value);}
  private live(run:Run):boolean{return this.active===run&&!run.outcome&&!run.fenced&&!this.terminal;}
  private status(run:Run):void {
    requireLoop(run.checks<(this.questioner?10:8),'status-budget');run.checks++;if(this.missioner&&run.missionState==='accepted'){requireLoop(run.missionReceipt,'mission-receipt-required');this.missioner.completed(run.missionReceipt);}else this.reader.active();
  }
  private schedule(run:Run):void {
    if(!this.live(run)||run.waiting||this.scheduled||this.pumping)return;this.scheduled=true;
    queueMicrotask(()=>{
      this.scheduled=false;if(!this.live(run))return;this.pumping=true;
      this.work=this.step(run).catch(()=>this.fail(run,'loop_boundary_failure')).finally(()=>{
        this.pumping=false;const current=this.active;if(current&&this.live(current)&&!current.waiting&&(!current.slot||current.slot.terminal))this.schedule(current);
      });
    });
  }
  private async gate(run:Run,phase:Pause):Promise<void> {
    this.emit(run,'phase',{phase});
    if(this.pause!==phase||this.gateUsed||!this.live(run))return;
    this.gateUsed=true;this.paused=true;
    await new Promise<void>(resolve=>{
      this.gateRelease=()=>{clearTimeout(this.gateTimer);this.gateTimer=undefined;this.gateRelease=undefined;this.paused=false;resolve();};
      this.gateTimer=setTimeout(()=>{this.gateRelease?.();void this.fail(run,'fixture_gate_deadline');},10000);
    });
  }
  private async step(run:Run):Promise<void> {
    if(!this.live(run)||run.waiting)return;
    if(!run.slot){await this.dispatch(run);return;}
    const event=run.slot.terminal;if(!event)return;
    if(event.type!=='response.completed'&&event.type!=='response.tool_requested'){
      await this.fail(run,event.type==='request.uncertain'?'adapter_uncertain':'adapter_failed');return;
    }
    if(event.type==='response.completed'){
      this.status(run);if(!this.live(run))return;run.history=this.transcript([...run.history,{kind:'assistant.text',text:run.text}]);
      this.finish(run,'response_complete','validated_response',true);return;
    }
    requireLoop(!this.missioner||!run.missionAttempts,'tool-after-mission');
    if(event.tool==='complete_mission'){await this.recordMission(run,event);return;}
    if(event.tool==='ask_leader'||event.tool==='ask_user'){await this.recordQuestion(run,event);return;}
    if(event.tool==='report_result'){await this.recordReport(run,event);return;}
    requireLoop(!run.reportAttempts&&(!this.missioner||run.reads===0),'tool-after-report-or-context');
    requireLoop(event.tool==='get_my_context'&&typeof event.callId==='string'&&!run.calls.has(event.callId),'duplicate-or-unknown-tool');
    requireLoop(run.reads+run.reportAttempts+run.asks<2&&run.requests<3,'turn-tool-budget');
    await this.gate(run,'before-read');if(!this.live(run))return;
    this.status(run);
    if(!this.live(run))return;
    run.calls.add(event.callId);run.reads++;
    const profile=this.reader.read();
    run.history=this.transcript([...run.history,{kind:'assistant.call',callId:event.callId,name:'get_my_context'},
      {kind:'tool.result',callId:event.callId,result:profile}]);
    await this.gate(run,'after-read');if(!this.live(run))return;
    run.slot=null;run.text='';await this.gate(run,'before-continuation');if(this.live(run))await this.dispatch(run);
  }
  private async recordMission(run:Run,event:MemberEvent):Promise<void>{
    requireLoop(this.missioner&&typeof event.callId==='string'&&!run.calls.has(event.callId),'mission-capability-or-call');
    requireLoop(run.missionAttempts===0&&run.reads<2&&run.requests<3&&this.totalRequests<3,'mission-capacity');
    const args=missionArgs(event.arguments);await this.gate(run,'before-mission');if(!this.live(run))return;
    this.status(run);if(!this.live(run))return;
    run.calls.add(event.callId);run.missionAttempts++;run.reserved=true;run.missionCommandId=randomUUID();run.missionState='uncertain';
    try{
      const command=JSON.stringify({type:'team.mission.complete',version:1,commandId:run.missionCommandId,sessionId:this.reader.binding.sessionId,summary:args.summary});
      const receipt=missionReceipt(this.missioner.submitMission(event.callId,command));
      requireLoop(receipt.callId===event.callId&&receipt.commandId===run.missionCommandId&&receipt.sessionId===this.reader.binding.sessionId,'mission-receipt-owner');
      run.missionReceipt=receipt;run.missionState=receipt.decision;
      run.history=this.transcript([...run.history,{kind:'assistant.mission',callId:event.callId,arguments:args},{kind:'mission.result',callId:event.callId,result:receipt}]);
    }catch{await this.fail(run,'mission_uncertain');return;}
    await this.gate(run,'after-mission');if(!this.live(run))return;
    run.slot=null;run.text='';await this.gate(run,'before-continuation');if(this.live(run))await this.dispatch(run);
  }
  private async recordReport(run:Run,event:MemberEvent):Promise<void>{
    requireLoop(this.reporter&&typeof event.callId==='string'&&!run.calls.has(event.callId),'report-capability-or-call');
    requireLoop(run.reportAttempts===0&&run.reads+run.asks<2&&run.requests<3,'report-budget');
    const args=reportArgs(event.arguments);await this.gate(run,'before-report');if(!this.live(run))return;
    this.status(run);if(!this.live(run))return;
    run.calls.add(event.callId);run.reportAttempts++;run.commandId=randomUUID();run.reportState='uncertain';
    try{
      const canonicalCommand=JSON.stringify({type:'team.task.report',version:1,commandId:run.commandId,
        sessionId:this.reader.binding.sessionId,taskId:this.reporter.taskId,...args});
      const receipt=reportReceipt(this.reporter.submit(event.callId,canonicalCommand));
      requireLoop(receipt.callId===event.callId&&receipt.commandId===run.commandId,'report-receipt-owner');
      run.receipt=receipt;run.reportState=receipt.decision;
      run.history=this.transcript([...run.history,{kind:'assistant.report',callId:event.callId,arguments:args},
        {kind:'report.result',callId:event.callId,result:receipt}]);
    }catch{await this.fail(run,'report_uncertain');return;}
    await this.gate(run,'after-report');if(!this.live(run))return;
    run.slot=null;run.text='';await this.gate(run,'before-continuation');if(this.live(run))await this.dispatch(run);
  }
  private async recordQuestion(run:Run,event:MemberEvent):Promise<void>{
    requireLoop(this.questioner&&event.tool===this.questioner.tool&&typeof event.callId==='string'&&!run.calls.has(event.callId),'question-role-or-call');
    requireLoop(run.asks===0&&!run.reportAttempts&&run.reads<2&&run.requests<3&&this.totalRequests<6,'question-capacity');
    const args=questionArgs(event.arguments);await this.gate(run,'before-ask');if(!this.live(run))return;
    this.status(run);if(!this.live(run))return;
    run.calls.add(event.callId);run.asks++;run.reserved=true;run.questionId=randomUUID();run.questionCommandId=randomUUID();run.questionState='uncertain';
    try{
      const command=JSON.stringify({type:'team.question.ask',version:1,commandId:run.questionCommandId,sessionId:this.reader.binding.sessionId,
        questionId:run.questionId,taskId:this.questioner.taskId,text:args.text,options:args.options});
      const receipt=askReceipt(this.questioner.submitQuestion(event.callId,command));
      requireLoop(receipt.callId===event.callId&&receipt.commandId===run.questionCommandId&&receipt.questionId===run.questionId&&receipt.taskId===this.questioner.taskId,'question-receipt-owner');
      run.questionReceipt=receipt;run.questionState=receipt.decision;run.pending={callId:event.callId,tool:event.tool,args,receipt};
    }catch{await this.fail(run,'question_uncertain');return;}
    await this.gate(run,'after-ask');if(!this.live(run))return;
    run.slot=null;run.text='';
    if(run.questionState==='accepted'){run.waiting=true;this.emit(run,'waiting_for_answer',{questionId:run.questionId});return;}
    const pending=run.pending!;this.appendAnswer(run,questionResult({receipt:pending.receipt,status:'rejected',answer:null,answeredBy:null,recipient:pending.receipt.recipient},args));
    await this.gate(run,'before-continuation');if(this.live(run))await this.dispatch(run);
  }
  private appendAnswer(run:Run,result:QuestionResult):void{
    const pending=run.pending!;run.history=this.transcript([...run.history,{kind:'assistant.question',callId:pending.callId,tool:pending.tool,arguments:pending.args},
      {kind:'question.result',callId:pending.callId,result}]);run.answerResult=result;run.pending=undefined;
  }
  resume(value:unknown):Promise<ResumeAck>{
    const input=resumeInput(value),run=this.active;
    requireLoop(this.questioner&&run&&this.live(run)&&run.waiting&&run.pending&&run.questionState==='accepted'&&run.id===input.runId
      &&run.questionId===input.questionId&&!run.resumeBusy&&!run.resumeIds.has(input.resumeId)&&run.resumeIds.size<4,'resume-admission');
    run.resumeIds.add(input.resumeId);run.resumeBusy=true;
    const job=this.advanceAnswer(run).finally(()=>{run.resumeBusy=false;});this.resumeWork=job;return job;
  }
  private async advanceAnswer(run:Run):Promise<ResumeAck>{
    await this.work;if(!this.live(run))return Object.freeze({status:'stopped'});
    this.pumping=true;
    try{
      await this.gate(run,'before-answer');if(!this.live(run))return Object.freeze({status:'stopped'});
      this.status(run);if(!this.live(run))return Object.freeze({status:'stopped'});
      run.answerReads++;const pending=run.pending!,result=this.questioner!.readAnswer(pending.receipt,pending.args);
      if(result.status==='open')return Object.freeze({status:'still_waiting'});
      const parsed=questionResult(result,pending.args);this.appendAnswer(run,parsed);run.questionState='answered';run.waiting=false;
      await this.gate(run,'after-answer');if(!this.live(run))return Object.freeze({status:'stopped'});
      run.slot=null;run.text='';await this.gate(run,'before-continuation');if(!this.live(run))return Object.freeze({status:'stopped'});
      await this.dispatch(run);return Object.freeze({status:'continued'});
    }catch{await this.fail(run,'answer_read_failed');return Object.freeze({status:'failed'});}
    finally{this.pumping=false;const current=this.active;if(current&&this.live(current)&&!current.waiting&&(!current.slot||current.slot.terminal))this.schedule(current);}
  }
  private async dispatch(run:Run):Promise<void> {
    if(!this.live(run))return;
    requireLoop(run.requests<3&&this.totalRequests<(this.missioner?3:6),'turn-budget');this.status(run);if(!this.live(run))return;
    const id=randomUUID();run.reserved=false;run.requests++;run.slot={id,generation:++this.totalRequests,bytes:0,terminal:null};run.text='';
    // No await/yield between the active-session check, reservation and send entry.
    await this.adapter.send({version:1,kind:this.missioner?'mission-loop':this.questioner?'question-loop':this.reporter?'report-loop':'loop',requestId:id,runId:run.id,turn:run.requests,messages:run.history});
    await this.gate(run,'after-dispatch');
  }
  private accept(event:MemberEvent):void {
    const run=this.active;if(!run||!this.live(run)||!run.slot||event.requestId!==run.slot.id||event.runId!==run.id
      ||event.generation!==run.slot.generation||event.turn!==run.requests||event.sessionId!==this.reader.binding.sessionId||event.memberId!==this.reader.binding.memberId)return;
    if(run.slot.terminal)return;
    const bytes=event.receivedBytes??0;
    if(bytes<run.slot.bytes||run.bytes+bytes-run.slot.bytes>65536){void this.fail(run,'conversation_byte_bound');return;}
    run.bytes+=bytes-run.slot.bytes;run.slot.bytes=bytes;
    if(event.type==='text.delta'){run.text+=event.text??'';this.emit(run,'text.delta',{requestId:run.slot.id,text:event.text});}
    if(['response.completed','response.tool_requested','request.failed','request.uncertain','request.interrupted'].includes(event.type)){
      if(run.slot.terminal)return;run.slot.terminal=event;this.schedule(run);
    }
    if(event.type==='request.admitted')this.emit(run,'request.admitted',{requestId:run.slot.id});
  }
  private finish(run:Run,state:OutcomeState,reason:string,localClosed:boolean):Outcome {
    if(run.outcome)return run.outcome;
    run.fenced=true;run.waiting=false;this.gateRelease?.();
    const outcome:Outcome={runId:run.id,state,reason,text:state==='response_complete'?run.text:'',requests:run.requests,
      toolReads:run.reads,statusChecks:run.checks,history:this.transcript(run.history),...(this.reporter?{reportAttempts:run.reportAttempts,reportState:run.reportState,
        ...(run.receipt?{reportReceipt:run.receipt}:{}),...(run.commandId?{reportCommandId:run.commandId}:{})}:{}),...(this.questioner?{questionAttempts:run.asks,answerReads:run.answerReads,questionState:run.questionState,
        ...(run.questionId?{questionId:run.questionId,questionCommandId:run.questionCommandId}:{}),
        ...(run.questionReceipt?{questionReceipt:run.questionReceipt}:{}),...(run.answerResult?{answerResult:run.answerResult}:{})}:{}),...(this.missioner?{missionAttempts:run.missionAttempts,missionState:run.missionState,
        ...(run.missionCommandId?{missionCommandId:run.missionCommandId}:{}),...(run.missionReceipt?{missionReceipt:run.missionReceipt}:{})}:{}),localClosed};
    run.outcome=Object.freeze(outcome);if(state==='needs_attention')this.terminal=true;
    if(this.active===run&&state!=='needs_attention')this.active=null;
    this.emit(run,'run.finished',{state,reason});run.complete(outcome);return outcome;
  }
  private async fail(run:Run,reason:string):Promise<void> {
    if(run.outcome||run.fenced)return;run.fenced=true;this.terminal=true;this.gateRelease?.();
    const result=await this.adapter.stop();this.finish(run,run.reportState==='uncertain'||run.questionState==='uncertain'||run.missionState==='uncertain'||result.state==='needs_attention'?'needs_attention':'failed',reason,result.localClosed);
  }
  stop():Promise<Outcome|null> {
    if(this.stopping)return this.stopping;this.terminal=true;const run=this.active;
    if(run)run.fenced=true;this.gateRelease?.();
    this.stopping=this.adapter.stop().then(result=>{
      const outcome=run?this.finish(run,run.reportState==='uncertain'||run.questionState==='uncertain'||run.missionState==='uncertain'||result.state==='needs_attention'?'needs_attention':'stopped','owner_stop',result.localClosed):null;
      this.remove();this.subscribers.clear();return outcome;
    });return this.stopping;
  }
  inspect(){return {terminal:this.terminal,active:this.active?.id??null,paused:this.paused,scheduled:this.scheduled,pumping:this.pumping,
    timers:Number(!!this.gateTimer),subscribers:this.subscribers.size,notificationErrors:this.notificationErrors,
    events:this.events.map(row=>({...row})),runs:[...this.runs.values()].map(run=>({id:run.id,requests:run.requests,toolReads:run.reads,
      statusChecks:run.checks,bytes:run.bytes,...(this.reporter?{reportAttempts:run.reportAttempts,reportState:run.reportState,reportCommandId:run.commandId}:{}),...(this.questioner?{questionAttempts:run.asks,answerReads:run.answerReads,questionState:run.questionState,waiting:run.waiting,resumeBusy:run.resumeBusy,continuationReserved:run.reserved,questionId:run.questionId,questionCommandId:run.questionCommandId}:{}),...(this.missioner?{missionAttempts:run.missionAttempts,missionState:run.missionState,missionCommandId:run.missionCommandId,continuationReserved:run.reserved}:{}),history:structuredClone(run.history),outcome:run.outcome?structuredClone(run.outcome):null}))};}
  release():void {requireLoop(this.paused&&this.gateRelease,'not-paused');this.gateRelease();const run=this.active;if(run)this.schedule(run);}
  async dispose():Promise<void>{await this.stop();this.gateRelease?.();await this.work;await this.resumeWork;this.remove();this.subscribers.clear();}
}
