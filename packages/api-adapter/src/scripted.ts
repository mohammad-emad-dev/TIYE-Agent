import type { Phase, RequestContext } from './types';
import { check } from './validation';
import { encode } from './protocol';
export const MODES = ['normal','manual','end-hold','late','hang','ignore-abort','never-close',
  'creation-throw','ambiguous-creation','transport-error','disconnect','malformed','bad-utf8',
  'duplicate-field','truncated','wrong-generation','wrong-session','bad-version','extra-field',
  'duplicate-end','extra-after-end','no-end','done-prose','oversized','byte-limit','event-limit',
  'retained-ring','tool-call'] as const;
export type Mode = typeof MODES[number];
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
  constructor(readonly context: RequestContext, readonly mode: Mode, listener: Listener) {
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
    queueMicrotask(() => { if (!this.closed && !this.disposed) this.script(); });
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
    if (['manual','late','hang','ignore-abort','never-close'].includes(this.mode)) return;
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
  close(kind: CloseKind = 'verified'): void {
    if (this.closed) return; this.closed=true; this.mark('closed');
    queueMicrotask(() => this.listeners?.closed(kind));
  }
  abort(): void {
    check(this.aborts === 0, 'fixture-abort-once'); this.aborts++; this.mark('aborted');
    if (!['ignore-abort','never-close','ambiguous-creation'].includes(this.mode)) this.close();
  }
  release(): void {
    check(!this.released && !this.disposed, 'fixture-release-once'); this.released=true;
    if (this.closed) return;
    if (this.mode === 'end-hold') this.close();
    else if (this.mode === 'ignore-abort') this.close();
    else { this.normal(); }
  }
  emitLate(): void {
    check(this.mode === 'late' && this.closed && !this.lateSent && !this.disposed, 'fixture-late-bound'); this.lateSent=true;
    this.captured.data(encode(this.record('api.text.delta',{text:'STALE'})));
    this.captured.closed('disconnect');
  }
  detach(): void { this.listeners=null; }
  inspect() {
    return {creates:this.creates,aborts:this.aborts,closed:this.closed,listening:this.listeners!==null,
      waiters:this.waiters.length,phases:[...this.phases]};
  }
  dispose(): void {
    this.disposed=true; this.closed=true; this.listeners=null;
    for (const waiter of this.waiters) {clearTimeout(waiter.timer);waiter.reject(new Error('fixture disposed'));}
    this.waiters=[];
  }
}
