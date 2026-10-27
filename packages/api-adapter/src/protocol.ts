import type { RequestContext } from './types';
import { check, fields, text } from './validation';
export type Frame = RequestContext & ({ type: 'api.text.delta'; text: string } | { type: 'api.response.end' }
  | { type: 'api.transport.error'; code: 'script-error' } | { type: 'api.tool.call'; name: string }
  | { type: 'api.loop.tool_call'; callId: string; name:'get_my_context' });
export function frame(value: unknown, context: RequestContext): Frame {
  check(value !== null && typeof value === 'object', 'frame-required');
  const record = value as Record<string, unknown>, base = ['version','sessionId','memberId','requestId','generation','type'];
  check(['api.text.delta','api.response.end','api.transport.error','api.tool.call','api.loop.tool_call'].includes(record.type as string), 'frame-type');
  if(record.type==='api.loop.tool_call') {
    fields(record,[...base,'callId','name','arguments']);fields(record.arguments,[]);
    check(Object.entries(context).every(([key,expected])=>record[key]===expected),'frame-context');
    check(typeof record.callId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.callId)
      &&record.name==='get_my_context','loop-tool');
    return {...context,type:'api.loop.tool_call',callId:record.callId,name:'get_my_context'};
  }
  fields(record, [...base, ...(record.type === 'api.text.delta' ? ['text'] : record.type === 'api.transport.error' ? ['code'] : record.type === 'api.tool.call' ? ['name'] : [])]);
  check(Object.entries(context).every(([key, expected]) => record[key] === expected), 'frame-context');
  if (record.type === 'api.text.delta') check(text(record.text, 8192, 8192), 'invalid-delta');
  if (record.type === 'api.transport.error') check(record.code === 'script-error', 'invalid-error');
  if (record.type === 'api.tool.call') check(text(record.name), 'invalid-tool');
  if (record.type === 'api.text.delta') return {...context,type:'api.text.delta',text:record.text as string};
  if (record.type === 'api.response.end') return {...context,type:'api.response.end'};
  if (record.type === 'api.transport.error') return {...context,type:'api.transport.error',code:'script-error'};
  return {...context,type:'api.tool.call',name:record.name as string};
}
export function encode(record: unknown): Uint8Array { return Buffer.from(JSON.stringify(record) + '\n'); }
export class Reader {
  private pending = Buffer.alloc(0);
  private total = 0;
  private count = 0;
  constructor(private readonly context: RequestContext, private readonly accept: (record: Frame) => void) {}
  feed(block: Uint8Array): void {
    check(block instanceof Uint8Array && this.total + block.byteLength <= 65536, 'stream-byte-bound');
    this.total += block.byteLength;
    const bytes = Buffer.from(block);
    let offset = 0;
    while (offset < bytes.length) {
      const end = bytes.indexOf(10, offset), part = bytes.subarray(offset, end < 0 ? bytes.length : end);
      check(this.pending.length + part.length + (end < 0 ? 0 : 1) <= 16384, 'frame-byte-bound');
      this.pending = Buffer.concat([this.pending, part]);
      if (end < 0) break;
      check(++this.count <= 128, 'frame-count-bound');
      const source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(this.pending);
      const value: unknown = JSON.parse(source);
      check(JSON.stringify(value) === source, 'noncanonical-frame');
      this.pending = Buffer.alloc(0); this.accept(frame(value, this.context)); offset = end + 1;
    }
  }
  end(): void { check(this.pending.length === 0, 'truncated-frame'); }
  get receivedBytes(): number {return this.total;}
}
