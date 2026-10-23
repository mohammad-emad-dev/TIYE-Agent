import { createHash } from 'node:crypto';
import { requireCore } from './command';

export function hashRecord(record: unknown): string {
  return createHash('sha256').update(JSON.stringify(record), 'utf8').digest('hex');
}

export function decodeCanonical(bytes: Uint8Array): unknown {
  requireCore(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 16384, 'record-byte-bound');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const candidate: unknown = JSON.parse(text);
  requireCore(JSON.stringify(candidate) === text, 'noncanonical-record-wire');
  return candidate;
}
