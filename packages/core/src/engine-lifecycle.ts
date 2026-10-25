import { exactFields, requireCore, UUID, validText } from './command';
import { decodeCanonical, hashRecord } from './record';
import type { Assignment, InboxContext } from './engine-inbox';
import type { EffectState, TaskState } from './effects-model';

interface Recover { type: 'team.session.recover'; version: 1; commandId: string; sessionId: string }
interface Report {
  type: 'team.task.report'; version: 1; commandId: string; sessionId: string;
  taskId: string; status: 'done' | 'failed'; summary: string;
}
export type LifecycleCommand = Recover | Report;

function validateLifecycle(candidate: unknown): LifecycleCommand {
  requireCore(candidate !== null && typeof candidate === 'object', 'lifecycle-command-required');
  const command = candidate as Record<string, unknown>, report = command.type === 'team.task.report';
  requireCore(report || command.type === 'team.session.recover', 'unsupported-lifecycle-command');
  exactFields(command, report ? ['type', 'version', 'commandId', 'sessionId', 'taskId', 'status', 'summary']
    : ['type', 'version', 'commandId', 'sessionId']);
  requireCore(command.version === 1, 'unsupported-lifecycle-version');
  for (const key of report ? ['commandId', 'sessionId', 'taskId'] : ['commandId', 'sessionId'])
    requireCore(typeof command[key] === 'string' && UUID.test(command[key]), 'invalid-lifecycle-id');
  if (report) {
    requireCore((command.status === 'done' || command.status === 'failed') && validText(command.summary), 'invalid-result');
    return { type: 'team.task.report', version: 1, commandId: command.commandId as string,
      sessionId: command.sessionId as string, taskId: command.taskId as string, status: command.status, summary: command.summary as string };
  }
  return { type: 'team.session.recover', version: 1, commandId: command.commandId as string, sessionId: command.sessionId as string };
}

export function decodeLifecycle(bytes: Uint8Array, type: LifecycleCommand['type']): LifecycleCommand {
  const command = validateLifecycle(decodeCanonical(bytes));
  requireCore(command.type === type, 'wrong-lifecycle-entry-point'); return command;
}

export function lifecycleHash(command: LifecycleCommand, actor: string): string {
  return hashRecord(command.type === 'team.task.report'
    ? [command.type, 1, actor, command.commandId, command.sessionId, command.taskId, command.status, command.summary]
    : [command.type, 1, actor, command.commandId, command.sessionId]);
}

export function interrupted(context: InboxContext, sessionId: string): Assignment[] {
  return [...context.assignments.values()].filter(row => row.sessionId === sessionId && !row.closed && !row.recoveryAcknowledged
    && row.effectId !== null && context.effects.get(row.effectId)?.state === 'dispatching');
}

export function lifecycleDecision(command: LifecycleCommand, actor: string, context: InboxContext): 'accepted' | 'rejected' {
  const session = context.sessions.get(command.sessionId);
  if (!session) return 'rejected';
  if (command.type === 'team.session.recover') return actor === 'owner' && interrupted(context, command.sessionId).length > 0 ? 'accepted' : 'rejected';
  const assignment = context.assignments.get(command.taskId);
  if (!assignment || assignment.closed || assignment.sessionId !== command.sessionId || assignment.memberId !== actor
    || assignment.effectId === null || context.tasks.get(command.taskId) === 'blocked') return 'rejected';
  const state = context.effects.get(assignment.effectId)!.state;
  if (command.status === 'done') return state === 'completed' && session.status === 'active' ? 'accepted' : 'rejected';
  return ['completed', 'cancelled', 'abandoned'].includes(state) ? 'accepted' : 'rejected';
}

export function spendAssignment(assignment: Assignment): void {
  requireCore(!assignment.closed && assignment.remainingEvents > 0, 'assignment-budget-exhausted');
  assignment.remainingEvents--;
}

export function closeAssignment(assignment: Assignment, tasks: Map<string, TaskState>, state: 'done' | 'failed' | 'cancelled'): void {
  assignment.closed = true; assignment.remainingEvents = 0; tasks.set(assignment.taskId, state);
}

export function assignedTaskState(state: EffectState, assignment: Assignment): TaskState {
  if (state === 'completed') return 'running';
  if (state === 'dispatching') return assignment.recoveryAcknowledged ? 'reconciling' : 'running';
  return 'needs_attention';
}

export function reduceLifecycle(body: unknown, context: InboxContext, type: LifecycleCommand['type']): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateLifecycle(body.command);
  requireCore(command.type === type && typeof body.actor === 'string'
    && (type === 'team.session.recover' ? body.actor === 'owner' : UUID.test(body.actor)), 'invalid-lifecycle-event-binding');
  requireCore(!context.commands.has(command.commandId), 'duplicate-lifecycle-command');
  const result = lifecycleDecision(command, body.actor, context);
  requireCore(body.result === result, 'invalid-lifecycle-decision');
  context.commands.set(command.commandId, { hash: lifecycleHash(command, body.actor), result });
  if (result === 'rejected') return;
  if (command.type === 'team.task.report') {
    const assignment = context.assignments.get(command.taskId)!;
    spendAssignment(assignment); assignment.result = { status: command.status, summary: command.summary };
    closeAssignment(assignment, context.tasks, command.status);
  } else for (const assignment of interrupted(context, command.sessionId)) {
    spendAssignment(assignment); assignment.recoveryAcknowledged = true; context.tasks.set(assignment.taskId, 'reconciling');
  }
}
