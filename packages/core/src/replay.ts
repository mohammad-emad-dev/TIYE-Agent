import { commandHash, CreateTask, exactFields, requireCore, validateCommand } from './command';

export interface Decision {
  readonly commandId: string; readonly taskId: string;
  readonly status: 'accepted' | 'rejected'; readonly reason: 'created' | 'task-id-conflict';
}
export interface Task { readonly taskId: string; readonly title: string; readonly status: 'created'; readonly lastSequence: number }
export interface CommandState { readonly commandId: string; readonly payloadHash: string; readonly version: 1; readonly result: Decision }
export interface EventRow { sequence: number; event_id: string; type: string; version: number; command_id: string; task_id: string; body: string }
export interface Projection { commands: CommandState[]; tasks: Task[]; eventCount: number }

export function decisionFor(command: CreateTask, exists: boolean): Decision {
  return { commandId: command.commandId, taskId: command.taskId,
    status: exists ? 'rejected' : 'accepted', reason: exists ? 'task-id-conflict' : 'created' };
}

export function eventFor(command: CreateTask, decision: Decision): string {
  return JSON.stringify({ command, payloadHash: commandHash(command), decision });
}

function checkedBody(row: EventRow): { command: CreateTask; decision: Decision } {
  requireCore(typeof row.body === 'string' && Buffer.byteLength(row.body) <= 16384, 'event-body-bound');
  const body: unknown = JSON.parse(row.body);
  exactFields(body, ['command', 'payloadHash', 'decision']);
  const command = validateCommand(body.command);
  requireCore(row.event_id === command.commandId + ':0' && row.command_id === command.commandId
    && row.task_id === command.taskId && row.version === 1 && body.payloadHash === commandHash(command), 'event-binding');
  const decision = body.decision as Decision;
  // Re-encoding also refuses duplicate JSON members, aliases and noncanonical event bytes.
  requireCore(row.body === eventFor(command, decision), 'noncanonical-event');
  return { command, decision };
}

export function replay(rows: EventRow[]): Projection {
  const commands = new Map<string, CommandState>();
  const tasks = new Map<string, Task>();
  rows.forEach((row, ordinal) => {
    requireCore(row.sequence === ordinal + 1, 'event-sequence-gap');
    const { command, decision } = checkedBody(row);
    requireCore(!commands.has(command.commandId), 'duplicate-command-event');
    const expected = decisionFor(command, tasks.has(command.taskId));
    requireCore(JSON.stringify(decision) === JSON.stringify(expected), 'invalid-event-decision');
    requireCore(row.type === (decision.status === 'accepted' ? 'task.created' : 'command.rejected'), 'event-type');
    commands.set(command.commandId, { commandId: command.commandId, payloadHash: commandHash(command), version: 1, result: expected });
    if (decision.status === 'accepted') tasks.set(command.taskId,
      { taskId: command.taskId, title: command.title, status: 'created', lastSequence: row.sequence });
  });
  return { commands: [...commands.values()], tasks: [...tasks.values()], eventCount: rows.length };
}
