import { createHash } from 'node:crypto';

export class CoreRefusal extends Error {}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MAX_RECORD_BYTES = 16384;

export function requireCore(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new CoreRefusal(reason);
}

export function exactFields(record: unknown, fields: string[]): asserts record is Record<string, unknown> {
  requireCore(record !== null && typeof record === 'object' && !Array.isArray(record), 'object-required');
  requireCore(Object.keys(record).length === fields.length && fields.every(field => Object.hasOwn(record, field)), 'unexpected-fields');
}

/** Flat primitive-object grammar prevents duplicate members before JSON decoding. */
class CommandReader {
  private offset = 0;
  constructor(private readonly source: string) {}

  whitespace(): void {
    while (/[\x20\t\r\n]/.test(this.source[this.offset] ?? '') && this.offset < this.source.length) this.offset++;
  }

  punctuation(expected: string): void {
    this.whitespace();
    requireCore(this.source[this.offset++] === expected, 'invalid-command-json');
  }

  token(): unknown {
    this.whitespace();
    const tail = this.source.slice(this.offset);
    const matched = /^(?:"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/.exec(tail);
    requireCore(matched, 'invalid-command-token');
    this.offset += matched[0].length;
    return JSON.parse(matched[0]) as unknown;
  }

  object(): Record<string, unknown> {
    const fields: Record<string, unknown> = Object.create(null);
    this.punctuation('{');
    this.whitespace();
    if (this.source[this.offset] !== '}') this.members(fields);
    this.punctuation('}');
    this.whitespace();
    requireCore(this.offset === this.source.length, 'trailing-command-bytes');
    return fields;
  }

  private members(fields: Record<string, unknown>): void {
    for (let count = 0; count < 6; count++) {
      const key = this.token();
      requireCore(typeof key === 'string' && !Object.hasOwn(fields, key), 'duplicate-or-invalid-member');
      this.punctuation(':');
      fields[key] = this.token();
      this.whitespace();
      if (this.source[this.offset] !== ',') return;
      this.punctuation(',');
    }
    throw new CoreRefusal('too-many-command-members');
  }
}

export interface CreateTask {
  readonly type: 'task.create'; readonly version: 1;
  readonly commandId: string; readonly taskId: string; readonly title: string;
}

export function validateCommand(record: unknown): CreateTask {
  exactFields(record, ['type', 'version', 'commandId', 'taskId', 'title']);
  requireCore(record.type === 'task.create' && record.version === 1, 'unsupported-command');
  for (const key of ['commandId', 'taskId']) requireCore(typeof record[key] === 'string' && UUID.test(record[key]), 'invalid-id');
  requireCore(typeof record.title === 'string' && Buffer.byteLength(record.title, 'utf8') <= 1024, 'invalid-title-bytes');
  const scalars = [...record.title];
  requireCore(scalars.length >= 1 && scalars.length <= 256 && scalars.every(scalar => {
    const point = scalar.codePointAt(0)!;
    return point < 0xd800 || point > 0xdfff;
  }), 'invalid-title-scalars');
  return Object.freeze({ type: 'task.create', version: 1, commandId: record.commandId as string,
    taskId: record.taskId as string, title: record.title });
}

export function decodeCommand(bytes: Uint8Array): CreateTask {
  requireCore(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= MAX_RECORD_BYTES, 'command-byte-bound');
  requireCore(!(bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191), 'command-bom');
  return validateCommand(new CommandReader(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).object());
}

export function commandHash(command: CreateTask): string {
  return createHash('sha256').update(JSON.stringify(['task.create', 1, command.commandId, command.taskId, command.title]), 'utf8').digest('hex');
}
