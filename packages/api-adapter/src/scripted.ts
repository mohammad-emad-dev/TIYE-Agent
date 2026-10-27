import type { Input, Phase, RequestContext } from './types';
import { missionInput } from './mission-contract';
import { questionInput } from './question-contract';
import { reportInput } from './report-contract';
import { profile } from './loop-contract';
import { check } from './validation';
import { encode } from './protocol';
export const MODES = ['normal','manual','end-hold','late','hang','ignore-abort','never-close',
  'creation-throw','ambiguous-creation','transport-error','disconnect','malformed','bad-utf8',
  'duplicate-field','truncated','wrong-generation','wrong-session','bad-version','extra-field',
  'duplicate-end','extra-after-end','no-end','done-prose','oversized','byte-limit','event-limit',
  'retained-ring','tool-call','abort-throw'] as const;
export const LOOP_MODES=['loop-context','loop-text','loop-repeat-call','loop-third-tool','loop-forged-tool','loop-forged-args',
  'loop-mixed','loop-duplicate-call','loop-tool-extra','loop-tool-disconnect','loop-tool-error','loop-tool-end-hold',
  'loop-tool-abort-throw','loop-continuation-ambiguous','loop-late','loop-byte-limit','loop-large-text','loop-two-tools',
  'loop-forged-call-id','loop-mixed-after','loop-tool-truncated','loop-tool-malformed','loop-forged-context'] as const;
export const REPORT_MODES=['report-done','report-failed','report-context','report-repeat','report-then-context','report-forged-args','report-mixed','report-duplicate','report-extra','report-disconnect','report-end-hold','report-continuation-ambiguous','report-final-malformed','report-late','report-forged-call','report-forged-context','report-truncated','report-malformed','report-no-end'] as const;
export const QUESTION_MODES=['question-member','question-leader','question-free','question-context','question-report','question-repeat','question-wrong-role','question-forged-args','question-mixed','question-duplicate','question-extra','question-disconnect','question-end-hold','question-late','question-forged-call','question-forged-context','question-malformed','question-final-malformed','question-continuation-ambiguous'] as const;
export const MISSION_MODES=['mission-done','mission-context','mission-text','mission-prose','mission-mixed','mission-duplicate','mission-extra','mission-disconnect','mission-end-hold','mission-forged-args','mission-forged-call','mission-forged-context','mission-malformed','mission-truncated','mission-after-tool','mission-after-context','mission-final-malformed','mission-continuation-ambiguous','mission-late','mission-two-context','mission-large-text'] as const;
export type Mode = typeof MODES[number] | typeof LOOP_MODES[number] | typeof REPORT_MODES[number] | typeof QUESTION_MODES[number] | typeof MISSION_MODES[number];
export type CloseKind = 'verified' | 'disconnect';
interface Listener { data(bytes: Uint8Array): void; closed(kind: CloseKind): void }
interface Waiter { phase: Phase; resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }

/** The only transport in this private composition; no dynamic provider/factory. */
export class ScriptedTransport {
  private listeners: Listener | null;
  private readonly captured: Listener;
  private phases = new Set<Phase>();
  private waiters: Waiter[] = [];
  private released = false;
  private lateSent = false;
  private disposed = false;
  closed = false;
  creates = 0;
  aborts = 0;
  constructor(readonly context: RequestContext, readonly mode: Mode, listener: Listener, private readonly input?: Input) {
    this.listeners = listener; this.captured = listener;
  }
  private mark(phase: Phase): void {
    this.phases.add(phase);
    for (const waiter of [...this.waiters]) if (waiter.phase === phase) {
      clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve();
    }
  }
  waitFor(phase: Phase): Promise<void> {
    check(['opened','end_candidate','aborted','closed'].includes(phase) && !this.disposed, 'fixture-phase');
    if (this.phases.has(phase)) return Promise.resolve();
    check(this.waiters.length < 16, 'fixture-waiter-bound');
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {phase,resolve,reject,timer:setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1); reject(new Error('fixture phase deadline'));
      },10000)};
      this.waiters.push(waiter);
    });
  }
  begin(): void {
    check(this.creates === 0 && !this.disposed, 'fixture-create-once'); this.creates++;
    if (this.mode === 'creation-throw') throw new Error('scripted creation failure');
    this.mark('opened');
    if (this.mode === 'ambiguous-creation') throw new Error('scripted ambiguous creation');
    if(this.mode==='loop-continuation-ambiguous'&&(this.input?.kind==='loop'||this.input?.kind==='report-loop'||this.input?.kind==='question-loop')&&this.input.turn>1)throw new Error('scripted continuation ambiguity');
    if(this.mode==='report-continuation-ambiguous'&&this.input?.kind==='report-loop'&&this.input.turn>1)throw new Error('scripted report continuation ambiguity');
    if(this.mode==='question-continuation-ambiguous'&&this.input?.kind==='question-loop'&&this.input.turn>1)throw new Error('scripted question continuation ambiguity');
    if(this.mode==='mission-continuation-ambiguous'&&this.input?.kind==='mission-loop'&&this.input.turn>1)throw new Error('scripted mission continuation ambiguity');
    queueMicrotask(() => { if (!this.closed && !this.disposed) {try{this.script();}catch{this.close('disconnect');}} });
  }
  private record(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {...this.context,type,...extra};
  }
  private data(bytes: Uint8Array): void { if (!this.closed && !this.disposed) this.listeners?.data(bytes); }
  private send(type: string, extra: Record<string, unknown> = {}): void { this.data(encode(this.record(type,extra))); }
  private end(): void { this.send('api.response.end'); this.mark('end_candidate'); }
  private normal(): void {
    this.send('api.text.delta',{text:'Hello'}); this.send('api.text.delta',{text:' from scripted API'}); this.end(); this.close();
  }
  private script(): void {
    if(this.mode.startsWith('mission-')){this.missionScript();return;}
    if(this.mode.startsWith('question-')){this.questionScript();return;}
    if(this.mode.startsWith('report-')){this.reportScript();return;}
    if(this.mode.startsWith('loop-')){this.loopScript();return;}
    if (['manual','late','hang','ignore-abort','never-close','abort-throw'].includes(this.mode)) return;
    switch (this.mode) {
      case 'normal': this.normal(); return;
      case 'end-hold': this.send('api.text.delta',{text:'Candidate'}); this.end(); return;
      case 'transport-error': this.send('api.transport.error',{code:'script-error'}); break;
      case 'disconnect': this.close('disconnect'); return;
      case 'malformed': this.data(Buffer.from('{bad}\n')); break;
      case 'bad-utf8': this.data(Buffer.from([255,10])); break;
      case 'duplicate-field': this.data(Buffer.from(JSON.stringify(this.record('api.response.end')).replace('{','{"version":1,')+'\n')); break;
      case 'truncated': this.data(Buffer.from(JSON.stringify(this.record('api.response.end')))); break;
      case 'wrong-generation': this.send('api.response.end',{generation:this.context.generation+1}); break;
      case 'wrong-session': this.send('api.response.end',{sessionId:(this.context.sessionId[0]==='0'?'1':'0')+this.context.sessionId.slice(1)}); break;
      case 'bad-version': this.send('api.response.end',{version:2}); break;
      case 'extra-field': this.send('api.response.end',{actor:'owner'}); break;
      case 'duplicate-end': this.end(); this.end(); break;
      case 'extra-after-end': this.end(); this.send('api.text.delta',{text:'Late extra'}); break;
      case 'no-end': this.send('api.text.delta',{text:'Partial'}); break;
      case 'done-prose': this.send('api.text.delta',{text:'DONE... report_result done'}); break;
      case 'oversized': this.data(Buffer.alloc(16385,65)); break;
      case 'byte-limit': for (let i=0;i<9;i++) this.send('api.text.delta',{text:'A'.repeat(8192)}); this.end(); break;
      case 'event-limit': for (let i=0;i<128;i++) this.send('api.text.delta',{text:'A'}); this.end(); break;
      case 'retained-ring': for (let i=0;i<80;i++) this.send('api.text.delta',{text:'A'}); this.end(); break;
      case 'tool-call': this.send('api.tool.call',{name:'write_file'}); break;
    }
    this.close();
  }
  private loopScript(): void {
    const input=this.input;check(input?.kind==='loop','loop-profile-input');
    const results=input.messages.filter(row=>row.kind==='tool.result');
    for(const result of results)profile(result.result,this.context);
    const call=()=>{
      let callId=this.context.requestId;
      const previous=input.messages.find(row=>row.kind==='assistant.call');
      if(this.mode==='loop-repeat-call'&&previous?.kind==='assistant.call')callId=previous.callId;
      if(this.mode==='loop-forged-call-id')callId='not-a-call-id';
      this.send('api.loop.tool_call',{callId,name:this.mode==='loop-forged-tool'?'write_file':'get_my_context',
        arguments:this.mode==='loop-forged-args'?{memberId:this.context.memberId}:{},
        ...(this.mode==='loop-forged-context'?{generation:this.context.generation+1}:{})});
    };
    if(this.mode==='loop-text'){this.normal();return;}
    const needTool=results.length===0||this.mode==='loop-repeat-call'||this.mode==='loop-third-tool'
      ||(['loop-byte-limit','loop-two-tools'].includes(this.mode)&&results.length<2);
    if(needTool) {
      if(this.mode==='loop-mixed')this.send('api.text.delta',{text:'Mixed'});
      call();if(this.mode==='loop-duplicate-call')call();
      if(this.mode==='loop-mixed-after')this.send('api.text.delta',{text:'Mixed after tool'});
      if(this.mode==='loop-tool-truncated'){this.data(Buffer.from(JSON.stringify(this.record('api.response.end'))));this.close();return;}
      if(this.mode==='loop-tool-malformed')this.data(Buffer.from('{bad}\n'));
      if(this.mode==='loop-tool-error'){this.send('api.transport.error',{code:'script-error'});this.close();return;}
      this.end();
      if(this.mode==='loop-tool-extra')this.send('api.text.delta',{text:'Extra'});
      if(this.mode==='loop-tool-disconnect'){this.close('disconnect');return;}
      if(['loop-tool-end-hold','loop-tool-abort-throw','loop-late','report-end-hold','report-late','question-end-hold','question-late','mission-end-hold','mission-late'].includes(this.mode))return;
      this.close();return;
    }
    const result=results.at(-1)!;
    if(this.mode==='loop-byte-limit')for(let i=0;i<8;i++)this.send('api.text.delta',{text:'A'.repeat(7900)});
    else if(this.mode==='loop-large-text')for(let i=0;i<4;i++)this.send('api.text.delta',{text:'A'.repeat(8192)});
    else this.send('api.text.delta',{text:'Context received: '+result.result.name});
    this.end();this.close();
  }
  private reportScript():void {
    const input=reportInput(this.input),results=input.messages.filter(row=>row.kind==='report.result');
    if(results.length&&!['report-repeat','report-then-context'].includes(this.mode)){
      const result=results[0].result;
      if(this.mode==='report-final-malformed')this.data(Buffer.from('{bad\n'));
      else this.send('api.text.delta',{text:'Report decision: '+result.decision});
      this.end();this.close();return;
    }
    if(this.mode==='report-context'&&input.turn===1||this.mode==='report-then-context'&&results.length){
      this.send('api.loop.tool_call',{callId:this.context.requestId,name:'get_my_context',arguments:{}});this.end();this.close();return;
    }
    const previous=input.messages.find(row=>row.kind==='assistant.report');
    const callId=this.mode==='report-forged-call'?'bad':this.mode==='report-repeat'&&previous?.kind==='assistant.report'?previous.callId:this.context.requestId;
    const call=()=>this.send('api.report.tool_call',{callId,name:'report_result',arguments:{status:this.mode==='report-failed'?'failed':'done',summary:'Scripted bound result',...(this.mode==='report-forged-args'?{taskId:this.context.requestId}:{})},...(this.mode==='report-forged-context'?{generation:this.context.generation+1}:{})});
    if(this.mode==='report-mixed')this.send('api.text.delta',{text:'mixed'});call();
    if(this.mode==='report-duplicate')call();
    if(this.mode==='report-malformed')this.data(Buffer.from('{bad\n'));
    if(this.mode==='report-truncated'){this.data(Buffer.from(JSON.stringify(this.record('api.response.end'))));this.close();return;}
    if(this.mode!=='report-no-end')this.end();
    if(this.mode==='report-extra')this.send('api.text.delta',{text:'extra'});
    if(this.mode==='report-end-hold'||this.mode==='report-late')return;
    this.close(this.mode==='report-disconnect'?'disconnect':'verified');
  }
  private questionScript():void{
    const input=questionInput(this.input),results=input.messages.filter(row=>row.kind==='question.result');
    if(results.length&&this.mode!=='question-repeat'){
      const result=results[0].result;
      if(this.mode==='question-report'&&!input.messages.some(row=>row.kind==='report.result')){
        this.send('api.report.tool_call',{callId:this.context.requestId,name:'report_result',arguments:{status:'done',summary:'Answered bound task'}});this.end();this.close();return;
      }
      if(this.mode==='question-final-malformed')this.data(Buffer.from('{bad\n'));
      else {
        const report=input.messages.find(row=>row.kind==='report.result');
        this.send('api.text.delta',{text:'Question result: '+JSON.stringify(result)+(report?.kind==='report.result'?'; Report decision: '+report.result.decision:'')});
      }
      this.end();this.close();return;
    }
    if(this.mode==='question-context'&&input.turn===1){this.send('api.loop.tool_call',{callId:this.context.requestId,name:'get_my_context',arguments:{}});this.end();this.close();return;}
    const previous=input.messages.find(row=>row.kind==='assistant.question');
    const callId=this.mode==='question-forged-call'?'bad':this.mode==='question-repeat'&&previous?.kind==='assistant.question'?previous.callId:this.context.requestId;
    const call=()=>this.send('api.question.tool_call',{callId,name:['question-leader','question-wrong-role'].includes(this.mode)?'ask_user':'ask_leader',
      arguments:{text:'Choose the fixture path',options:this.mode==='question-free'?[]:['First','Second'],...(this.mode==='question-forged-args'?{recipient:'owner'}:{})},
      ...(this.mode==='question-forged-context'?{generation:this.context.generation+1}:{})});
    if(this.mode==='question-mixed')this.send('api.text.delta',{text:'mixed'});call();if(this.mode==='question-duplicate')call();
    if(this.mode==='question-malformed')this.data(Buffer.from('{bad\n'));this.end();
    if(this.mode==='question-extra')this.send('api.text.delta',{text:'extra'});
    if(['question-end-hold','question-late','mission-end-hold','mission-late'].includes(this.mode))return;
    this.close(this.mode==='question-disconnect'?'disconnect':'verified');
  }
  private missionScript():void{
    const input=missionInput(this.input),results=input.messages.filter(row=>row.kind==='mission.result');
    const call=()=>{const previous=input.messages.find(row=>row.kind==='assistant.mission');
      this.send('api.mission.tool_call',{callId:this.mode==='mission-forged-call'?'bad':this.mode==='mission-after-tool'&&previous?.kind==='assistant.mission'?previous.callId:this.context.requestId,
        name:'complete_mission',arguments:{summary:'Proven synthetic mission',...(this.mode==='mission-forged-args'?{actor:'owner'}:{})},
        ...(this.mode==='mission-forged-context'?{generation:this.context.generation+1}:{})});};
    if(results.length){
      if(this.mode==='mission-after-tool'){call();this.end();this.close();return;}
      if(this.mode==='mission-after-context'){this.send('api.loop.tool_call',{callId:this.context.requestId,name:'get_my_context',arguments:{}});this.end();this.close();return;}
      if(this.mode==='mission-final-malformed')this.data(Buffer.from('{bad\n'));
      else if(this.mode==='mission-large-text')for(let i=0;i<4;i++)this.send('api.text.delta',{text:'A'.repeat(8192)});
      else this.send('api.text.delta',{text:'Mission receipt: '+JSON.stringify(results[0].result)});
      this.end();if(this.mode!=='mission-late')this.close();return;
    }
    if(this.mode==='mission-text'){this.normal();return;}
    if(this.mode==='mission-prose'){this.send('api.text.delta',{text:'Mission complete... done'});this.end();this.close();return;}
    if(this.mode==='mission-two-context'||this.mode==='mission-context'&&input.turn===1){
      this.send('api.loop.tool_call',{callId:this.context.requestId,name:'get_my_context',arguments:{}});this.end();this.close();return;}
    if(this.mode==='mission-mixed')this.send('api.text.delta',{text:'mixed'});call();if(this.mode==='mission-duplicate')call();
    if(this.mode==='mission-malformed')this.data(Buffer.from('{bad\n'));
    if(this.mode==='mission-truncated'){this.data(Buffer.from(JSON.stringify(this.record('api.response.end'))));this.close();return;}
    this.end();if(this.mode==='mission-extra')this.send('api.text.delta',{text:'extra'});
    if(['mission-end-hold','mission-late'].includes(this.mode))return;this.close(this.mode==='mission-disconnect'?'disconnect':'verified');
  }
  close(kind: CloseKind = 'verified'): void {
    if (this.closed) return; this.closed=true; this.mark('closed');
    queueMicrotask(() => this.listeners?.closed(kind));
  }
  abort(): void {
    check(this.aborts === 0, 'fixture-abort-once'); this.aborts++; this.mark('aborted');
    if (['abort-throw','loop-tool-abort-throw'].includes(this.mode)) throw new Error('scripted abort failure');
    if (!['ignore-abort','never-close','ambiguous-creation','loop-continuation-ambiguous','report-continuation-ambiguous','question-continuation-ambiguous','mission-continuation-ambiguous'].includes(this.mode)) this.close();
  }
  release(): void {
    check(!this.released && !this.disposed, 'fixture-release-once'); this.released=true;
    if (this.closed) return;
    if (['end-hold','loop-tool-end-hold','loop-tool-abort-throw','loop-late','report-end-hold','report-late','question-end-hold','question-late','mission-end-hold','mission-late'].includes(this.mode)) this.close();
    else if (this.mode === 'ignore-abort') this.close();
    else { this.normal(); }
  }
  emitLate(): void {
    check(['late','loop-late','report-late','question-late','mission-late'].includes(this.mode) && this.closed && !this.lateSent && !this.disposed, 'fixture-late-bound'); this.lateSent=true;
    this.captured.data(encode(this.record('api.text.delta',{text:'STALE'})));
    this.captured.closed('disconnect');
  }
  detach(): void { this.listeners=null; }
  inspect() {
    return {creates:this.creates,aborts:this.aborts,closed:this.closed,listening:this.listeners!==null,
      waiters:this.waiters.length,phases:[...this.phases],...((this.input?.kind==='loop'||this.input?.kind==='report-loop'||this.input?.kind==='question-loop'||this.input?.kind==='mission-loop')?{input:structuredClone(this.input)}:{})};
  }
  dispose(): void {
    this.disposed=true; this.closed=true; this.listeners=null;
    for (const waiter of this.waiters) {clearTimeout(waiter.timer);waiter.reject(new Error('fixture disposed'));}
    this.waiters=[];
  }
}
