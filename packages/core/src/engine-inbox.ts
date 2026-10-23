import { exactFields, requireCore, UUID } from './command';
import { decodeCanonical, hashRecord } from './record';
import { MockPlan, validatePlan } from './mock-plan';
import type { EngineSession } from './engine-session';
import type { MockEffect, MockProjection, TaskState } from './effects-model';

export interface Assignment {
  sessionId: string; taskId: string; memberId: string; enqueueSequence: number;
  effectId: string | null; remainingEvents: number; closed: boolean;
  recoveryAcknowledged: boolean; result: { status: 'done' | 'failed'; summary: string } | null;
}
export interface MemberInbox { memberId: string; queuedTaskIds: string[]; activeTaskId: string | null }
export interface EngineScheduler {
  start(bytes: Uint8Array): 'accepted' | 'rejected';
  inboxes(): MemberInbox[];
}
interface Enqueue {
  type: 'team.task.enqueue'; version: 1; commandId: string; sessionId: string; taskId: string; memberId: string;
}
interface Start extends MockPlan { type: 'team.task.start'; version: 1; sessionId: string; memberId: string }
export type InboxCommand = Enqueue | Start;
export interface InboxContext {
  commands: Map<string, { hash: string; result: 'accepted' | 'rejected' }>;
  sessions: Map<string, EngineSession>; tasks: Map<string, TaskState>;
  effects: Map<string, MockEffect>; assignments: Map<string, Assignment>;
}

export function inboxContext(projection: MockProjection): InboxContext {
  return { commands: new Map(projection.commands), tasks: new Map(projection.tasks), effects: new Map(projection.effects),
    sessions: new Map(projection.sessions ?? []), assignments: new Map(projection.assignments ?? []) };
}

export function validateInbox(candidate: unknown): InboxCommand {
  requireCore(candidate !== null && typeof candidate === 'object', 'inbox-command-required');
  const request = candidate as Record<string, unknown>;
  const start = request.type === 'team.task.start';
  requireCore(start || request.type === 'team.task.enqueue', 'unsupported-inbox-command');
  exactFields(request, start ? ['type', 'version', 'commandId', 'sessionId', 'memberId', 'taskId',
    'effectId', 'attemptId', 'targetId', 'payload', 'expiresAt'] : ['type', 'version', 'commandId', 'sessionId', 'taskId', 'memberId']);
  requireCore(request.version === 1, 'unsupported-inbox-version');
  for (const key of ['commandId', 'sessionId', 'memberId', 'taskId'])
    requireCore(typeof request[key] === 'string' && UUID.test(request[key]), 'invalid-inbox-id');
  if (start) return { type: 'team.task.start', version: 1, sessionId: request.sessionId as string,
    memberId: request.memberId as string, ...startPlan(request) };
  return { type: 'team.task.enqueue', version: 1, commandId: request.commandId as string,
    sessionId: request.sessionId as string, taskId: request.taskId as string, memberId: request.memberId as string };
}

export function startPlan(request: Record<string, unknown>): MockPlan {
  return validatePlan({ commandId: request.commandId, taskId: request.taskId, effectId: request.effectId,
    attemptId: request.attemptId, targetId: request.targetId, payload: request.payload, expiresAt: request.expiresAt });
}

export function decodeInbox(bytes: Uint8Array, type: InboxCommand['type']): InboxCommand {
  const command = validateInbox(decodeCanonical(bytes));
  requireCore(command.type === type, 'wrong-inbox-entry-point'); return command;
}

export function inboxHash(command: InboxCommand, actor: string): string {
  return hashRecord(command.type === 'team.task.enqueue'
    ? [command.type, 1, actor, command.commandId, command.sessionId, command.taskId, command.memberId]
    : [command.type, 1, actor, command.commandId, command.sessionId, command.memberId, command.taskId,
      command.effectId, command.attemptId, command.targetId, command.payload, command.expiresAt]);
}

export function inboxDecision(command: InboxCommand, actor: string, context: InboxContext): 'accepted' | 'rejected' {
  const session = context.sessions.get(command.sessionId);
  if (!session || session.status !== 'active' || !session.members.some(row => row.memberId === command.memberId)) return 'rejected';
  if (command.type === 'team.task.enqueue') return actor === session.leaderId
    && context.tasks.get(command.taskId) === 'created' && !context.assignments.has(command.taskId)
    && context.assignments.size < 100 ? 'accepted' : 'rejected';
  const assignments = [...context.assignments.values()], assignment = context.assignments.get(command.taskId);
  const first = assignments.find(row => !row.closed && row.memberId === command.memberId && row.effectId === null);
  const active = assignments.filter(row => !row.closed && row.effectId !== null);
  return actor === 'scheduler' && assignment?.sessionId === command.sessionId && assignment.memberId === command.memberId
    && first?.taskId === command.taskId && assignment.effectId === null && context.tasks.get(command.taskId) === 'queued'
    && !active.some(row => row.memberId === command.memberId) && active.length < session.maxConcurrent
    && !context.effects.has(command.effectId) && ![...context.effects.values()].some(row => row.plan.attemptId === command.attemptId)
    ? 'accepted' : 'rejected';
}

export function reduceInbox(body: unknown, sequence: number, context: InboxContext, type: InboxCommand['type']): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateInbox(body.command);
  requireCore(command.type === type, 'inbox-event-type-binding');
  requireCore(typeof body.actor === 'string' && (command.type === 'team.task.start'
    ? body.actor === 'scheduler' : UUID.test(body.actor)), 'invalid-inbox-actor');
  requireCore(!context.commands.has(command.commandId), 'duplicate-inbox-command');
  const result = inboxDecision(command, body.actor, context);
  requireCore(body.result === result, 'invalid-inbox-event-decision');
  context.commands.set(command.commandId, { hash: inboxHash(command, body.actor), result });
  if (result === 'rejected') return;
  if (command.type === 'team.task.enqueue') {
    context.assignments.set(command.taskId, { sessionId: command.sessionId, taskId: command.taskId,
      memberId: command.memberId, enqueueSequence: sequence, effectId: null, remainingEvents: 8, closed: false,
      recoveryAcknowledged: false, result: null });
    context.tasks.set(command.taskId, 'queued');
  } else {
    const assignment = context.assignments.get(command.taskId)!;
    assignment.effectId = command.effectId; assignment.remainingEvents--;
    context.effects.set(command.effectId, { plan: startPlan({ ...command }), state: 'planned' });
    context.tasks.set(command.taskId, 'waiting_approval');
  }
}

export function memberInboxes(session: EngineSession | undefined, assignments: Assignment[]): MemberInbox[] {
  return session?.members.map(member => ({ memberId: member.memberId,
    queuedTaskIds: assignments.filter(row => !row.closed && row.memberId === member.memberId && row.effectId === null).map(row => row.taskId),
    activeTaskId: assignments.find(row => !row.closed && row.memberId === member.memberId && row.effectId !== null)?.taskId ?? null })) ?? [];
}
