import { createHash } from 'node:crypto';

export function hashRecord(record: unknown): string {
  return createHash('sha256').update(JSON.stringify(record), 'utf8').digest('hex');
}
