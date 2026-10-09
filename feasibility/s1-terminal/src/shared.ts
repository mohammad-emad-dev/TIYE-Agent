// Shared IPC contract for the S1a prototype.
// Imported by main and preload only. The renderer sees this surface
// exclusively through the validated `window.tiyeTerminal` API.

export const CHANNELS = {
  READY: 'tiye-term-ready',
  DATA: 'tiye-term-data',
  INPUT: 'tiye-term-input',
  RESIZE: 'tiye-term-resize',
  EXIT: 'tiye-term-exit',
} as const;

export interface ResizeRequest {
  cols: number;
  rows: number;
}

export interface ExitInfo {
  exitCode: number;
  signal?: number;
}

/** Upper bound for a single input write; oversized payloads are dropped. */
export const MAX_INPUT = 65536;

export function isValidInput(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_INPUT;
}

export function isValidResize(value: unknown): value is ResizeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { cols, rows } = value as Record<string, unknown>;
  return (
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    (cols as number) >= 2 &&
    (cols as number) <= 500 &&
    (rows as number) >= 1 &&
    (rows as number) <= 200
  );
}
