import type { Binding, Capabilities, CleanupResult, Detection, EventSubscriber, Input, MemberAdapter, MemberEvent, Phase, Reason, RequestContext, State } from './types';
import { check, input, launch } from './validation';
import { Reader, type Frame } from './protocol';
import { ScriptedTransport, type CloseKind, type Mode } from './scripted';
import { reportInput, type ReportArgs } from './report-contract';
import { loopInput, profile } from './loop-contract';

interface Turn {
  context: RequestContext; input: Input; reader: Reader; wire: ScriptedTransport;
  started: number; events: number; endCandidate: boolean; finished: boolean; forceUncertain: boolean;
  reason?: Reason; operation?: ReturnType<typeof setTimeout>; cleanupTimer?: ReturnType<typeof setTimeout>;
  cleanupStarted?: number; settled: Promise<CleanupResult>; resolve(result: CleanupResult): void;
  hasText?: boolean; toolCandidate?: {callId:string;tool:'get_my_context'|'report_result';arguments?:ReportArgs};
}

export class ScriptedAdapter implements MemberAdapter {
  private state: State = 'unstarted';
  private terminal = false;
  private active: Turn | null = null;
  private turns = new Map<string, Turn>();
  private subscribers = new Map<symbol, EventSubscriber>();
  private notifications: {event: MemberEvent; listeners: [symbol, EventSubscriber][]; delivered?: () => void}[] = [];
  private notifying = false;
  private events: MemberEvent[] = [];
  private stopPromise?: Promise<CleanupResult>;
  private subscriberErrors = 0;
  constructor(private readonly binding: Binding, private readonly mode: Mode, private readonly loopProfile=false,private readonly reportProfile=false) {}
  async detect(): Promise<Detection> { return Object.freeze({kind:'scripted-api',available:true,realProvider:false}); }
  capabilities(): Capabilities {
    return Object.freeze({textStreaming:true,realProviders:false,tools:false,files:false,commands:false,remoteCancellationVerified:false,
      ...(this.reportProfile?{reportToolCandidates:true as const}:{}),
      ...(this.loopProfile?{readOnlyToolCandidates:true as const}:{})});
  }
  async start(value: unknown): Promise<void> {
    const context = launch(value);
    check(this.state === 'unstarted' && !this.terminal, 'adapter-start-once');
    check(context.sessionId === this.binding.sessionId && context.memberId === this.binding.memberId, 'launch-binding');
    this.state='ready';
  }
  onEvent(callback: EventSubscriber): () => void {
    check(typeof callback === 'function' && !this.terminal, 'subscriber-refused');
    check(![...this.subscribers.values()].includes(callback) && this.subscribers.size < 16, 'subscriber-bound');
    const token=Symbol('subscription');this.subscribers.set(token,callback);
    return () => {this.subscribers.delete(token);};
  }
  private subscriberFailed(): void {this.subscriberErrors=Math.min(128,this.subscriberErrors+1);}
  private emit(turn: Turn | null, type: MemberEvent['type'], details: Partial<MemberEvent> = {}, delivered?: () => void): void {
    // Six requests * 128 events + one terminal adapter event. Never silently drop.
    check(this.notifications.length < 6*128+1, 'notification-bound');
    if (turn) {
      const terminal = !['request.admitted','text.delta'].includes(type);
      check(turn.events < (terminal ? 128 : 127), 'normalized-event-bound'); turn.events++;
    }
    const event: MemberEvent = {...this.binding,type,requestId:turn?.context.requestId??null,
      taskId:turn?.input.kind === 'task' ? turn.input.taskId : null,generation:turn?.context.generation??null,
      ...((turn?.input.kind==='loop'||turn?.input.kind==='report-loop')?{runId:turn.input.runId,turn:turn.input.turn,receivedBytes:turn.reader.receivedBytes}:{}),...details};
    this.events.push(Object.freeze(event)); if (this.events.length > 64) this.events.shift();
    this.notifications.push({event,listeners:[...this.subscribers.entries()],delivered});
    if (this.notifying) return;
    this.notifying=true;
    try {
      while (this.notifications.length) {
        const next=this.notifications.shift()!;
        for (const [token,subscriber] of next.listeners) {
          if (this.subscribers.get(token) !== subscriber) continue;
          try {
            const result=subscriber(Object.freeze({...next.event}));
            if (result !== undefined) void Promise.resolve(result).catch(()=>this.subscriberFailed());
          } catch {this.subscriberFailed();}
        }
        next.delivered?.();
      }
    } finally {this.notifying=false;}
  }
  async send(value: unknown): Promise<void> {
    const request = this.reportProfile ? reportInput(value) : this.loopProfile ? loopInput(value) : input(value);
    if((request.kind==='loop'||request.kind==='report-loop'))for(const row of request.messages)if(row.kind==='tool.result')profile(row.result,this.binding);
    check(!this.terminal && this.state === 'ready' && !this.active, 'adapter-not-ready');
    check(!this.turns.has(request.requestId), 'duplicate-request');
    check(this.turns.size < 6, 'request-lifetime-bound');
    const context = Object.freeze({...this.binding,requestId:request.requestId,generation:this.turns.size+1});
    let resolve!: (result: CleanupResult) => void;
    const settled = new Promise<CleanupResult>(done => {resolve=done;});
    const turn: Turn = {context,input:request,started:Date.now(),events:0,endCandidate:false,finished:false,forceUncertain:false,
      settled,resolve,reader:new Reader(context,record=>this.record(turn,record)),
      wire:new ScriptedTransport(context,this.mode,{data:bytes=>this.receive(turn,bytes),closed:kind=>this.closed(turn,kind)},request)};
    this.turns.set(request.requestId,turn); this.active=turn; this.state='running';
    turn.operation=setTimeout(()=>this.fail(turn,'deadline'),10000);
    this.emit(turn,'request.admitted');
    // A subscriber may synchronously stop/interrupt admission; never begin afterward.
    if (turn.reason || turn.finished || this.terminal || this.state !== 'running') return;
    try {turn.wire.begin();} catch {
      const reason = (this.mode === 'ambiguous-creation'||this.mode==='report-continuation-ambiguous') ? 'ambiguous_creation' : 'creation_failure';
      turn.forceUncertain = reason === 'ambiguous_creation'; this.fail(turn,reason);
      throw new Error(reason);
    }
  }
  private current(turn: Turn): boolean { return this.active === turn && !turn.finished; }
  private receive(turn: Turn, bytes: Uint8Array): void {
    if (!this.current(turn) || turn.reason) return;
    if (Date.now()-turn.started >= 10000) {this.fail(turn,'deadline');return;}
    try {turn.reader.feed(bytes);} catch {this.fail(turn,'protocol_fault');}
  }
  private record(turn: Turn, record: Frame): void {
    if (!this.current(turn) || turn.reason) return;
    check(!turn.endCandidate, 'frame-after-response-end');
    if(record.type==='api.report.tool_call'){
      check(this.reportProfile&&turn.input.kind==='report-loop'&&!turn.hasText&&!turn.toolCandidate,'report-profile-or-mixture');
      turn.toolCandidate={callId:record.callId,tool:'report_result',arguments:record.arguments};
    }
    else if(record.type==='api.loop.tool_call') {
      check(this.loopProfile&&(turn.input.kind==='loop'||turn.input.kind==='report-loop')&&!turn.hasText&&!turn.toolCandidate,'tool-profile-or-mixture');
      turn.toolCandidate={callId:record.callId,tool:'get_my_context'};
    }
    else if (record.type === 'api.text.delta') {check(!turn.toolCandidate,'mixed-tool-text');turn.hasText=true;this.emit(turn,'text.delta',{text:record.text});}
    else if (record.type === 'api.response.end') turn.endCandidate=true;
    else this.fail(turn,record.type === 'api.tool.call' ? 'unsupported_tool' : 'transport_error');
  }
  private clearTimers(turn: Turn): void {
    clearTimeout(turn.operation); clearTimeout(turn.cleanupTimer); turn.operation=undefined; turn.cleanupTimer=undefined;
  }
  private closed(turn: Turn, kind: CloseKind): void {
    if (!this.current(turn)) return;
    if (kind === 'disconnect') {turn.reason??='disconnect';turn.forceUncertain=true;}
    if (turn.cleanupStarted !== undefined && Date.now()-turn.cleanupStarted >= 5000) turn.forceUncertain=true;
    if (!turn.reason && Date.now()-turn.started >= 10000) turn.reason='deadline';
    if (!turn.reason) {
      try {turn.reader.end();check(turn.endCandidate,'missing-response-end');} catch {turn.reason='protocol_fault';}
    }
    this.finish(turn,true);
  }
  private finish(turn: Turn, localClosed: boolean): void {
    if (!this.current(turn)) return;
    turn.finished=true; this.clearTimers(turn); turn.wire.detach();
    const uncertain = !localClosed || turn.forceUncertain;
    const state: State = uncertain ? 'needs_attention' : this.terminal ? 'stopped' : 'ready';
    this.state=state; if (!uncertain) this.active=null;
    const type = uncertain ? 'request.uncertain' : !turn.reason ? turn.toolCandidate ? 'response.tool_requested' : 'response.completed'
      : ['owner_interrupt','owner_stop'].includes(turn.reason) ? 'request.interrupted' : 'request.failed';
    this.emit(turn,type,{...(turn.reason ? {reason:turn.reason} : {}),...(!turn.reason&&turn.toolCandidate?turn.toolCandidate:{}),localClosed});
    turn.resolve(Object.freeze({state,localClosed,remoteVerified:false}));
  }
  private fail(turn: Turn, reason: Reason): void {
    if (!this.current(turn) || turn.reason) return;
    turn.reason=reason; this.cleanup(turn);
  }
  private cleanup(turn: Turn): Promise<CleanupResult> {
    if (turn.finished || turn.cleanupStarted !== undefined) return turn.settled;
    this.state='cancelling'; turn.cleanupStarted=Date.now(); clearTimeout(turn.operation); turn.operation=undefined;
    turn.cleanupTimer=setTimeout(()=>this.finish(turn,false),5000);
    // Install the cleanup decision/timer before invoking a possibly reentrant transport.
    try {if (!turn.wire.closed) turn.wire.abort();}
    catch {turn.reason='abort_failure';turn.forceUncertain=true;}
    return turn.settled;
  }
  interrupt(): Promise<CleanupResult> {
    const turn=this.active;
    if (!turn) return Promise.resolve(Object.freeze({state:this.state,localClosed:true,remoteVerified:false}));
    if (!turn.finished && !turn.reason) turn.reason='owner_interrupt';
    return this.cleanup(turn);
  }
  stop(): Promise<CleanupResult> {
    if (this.stopPromise) return this.stopPromise;
    this.terminal=true;
    const turn=this.active;
    if (turn && !turn.finished && !turn.reason) turn.reason='owner_stop';
    const decision=turn ? this.cleanup(turn) : Promise.resolve({state:'stopped' as State,localClosed:true,remoteVerified:false as const});
    this.stopPromise=decision.then(result=>{
      this.state=result.state === 'needs_attention' ? 'needs_attention' : 'stopped';
      this.emit(null,'adapter.stopped',{localClosed:result.localClosed},()=>this.subscribers.clear());
      return Object.freeze({state:this.state,localClosed:result.localClosed,remoteVerified:false as const});
    });
    return this.stopPromise;
  }
  inspect() {
    return {state:this.state,terminal:this.terminal,active:this.active ? {...this.active.context} : null,
      seen:this.turns.size,subscribers:this.subscribers.size,subscriberErrors:this.subscriberErrors,pendingNotifications:this.notifications.length,
      timers:[...this.turns.values()].reduce((sum,turn)=>sum+Number(!!turn.operation)+Number(!!turn.cleanupTimer),0),
      events:this.events.map(event=>({...event})),requests:[...this.turns.values()].map(turn=>({
        requestId:turn.context.requestId,generation:turn.context.generation,finished:turn.finished,...turn.wire.inspect()}))};
  }
  private turn(id: string): Turn { const turn=this.turns.get(id);check(turn,'fixture-unknown-request');return turn; }
  waitFor(phase: Phase, id: string): Promise<void> { return this.turn(id).wire.waitFor(phase); }
  settled(id: string): Promise<CleanupResult> { return this.turn(id).settled; }
  release(id: string): void { this.turn(id).wire.release(); }
  late(id: string): void { this.turn(id).wire.emitLate(); }
  async dispose(): Promise<void> { await this.stop();for (const turn of this.turns.values()) turn.wire.dispose(); }
}
