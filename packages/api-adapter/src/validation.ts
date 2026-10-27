import type { Binding, Input, LaunchContext } from './types';
export class AdapterRefusal extends Error {
  constructor(readonly code: string) { super(code); this.name = 'AdapterRefusal'; }
}
export function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new AdapterRefusal(code);
}
export function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'object-required');
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'unexpected-fields');
}
export function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}
export function text(value: unknown, bytes = 1024, scalars = 256): value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > bytes || value.includes('\0')) return false;
  const points = [...value];
  return points.length > 0 && points.length <= scalars && points.every(char => {
    const point = char.codePointAt(0)!; return point < 0xd800 || point > 0xdfff;
  });
}
function validateBinding(value: Record<string, unknown>): void {
  check(value.version === 1 && uuid(value.sessionId) && uuid(value.memberId), 'invalid-context');
}
export function binding(value: unknown): Binding {
  fields(value, ['version','sessionId','memberId']); validateBinding(value);
  return Object.freeze({version: 1, sessionId: value.sessionId as string, memberId: value.memberId as string});
}
export function launch(value: unknown): LaunchContext {
  fields(value, ['version','sessionId','memberId','briefing']); validateBinding(value);
  check(text(value.briefing), 'invalid-briefing');
  return {...binding({version:value.version,sessionId:value.sessionId,memberId:value.memberId}), briefing:value.briefing};
}
export function input(value: unknown): Input {
  check(value !== null && typeof value === 'object', 'input-required');
  const candidate = value as Record<string, unknown>;
  check(candidate.kind === 'task' || candidate.kind === 'message', 'input-kind');
  fields(candidate, candidate.kind === 'task' ? ['version','kind','requestId','taskId','text'] : ['version','kind','requestId','text']);
  check(candidate.version === 1 && uuid(candidate.requestId) && text(candidate.text), 'invalid-input');
  if (candidate.kind === 'task') check(uuid(candidate.taskId), 'invalid-task-id');
  return {...candidate} as Input;
}
