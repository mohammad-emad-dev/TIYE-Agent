import { exactFields, requireCore, UUID, validText } from './command';
import { decodeCanonical, hashRecord } from './record';
import { failureContext, FailureContext } from './engine-failure';
import type { MockProjection } from './effects-model';

export interface Handoff {
  sessionId: string; predecessorTaskId: string; successorTaskId: string; fromMemberId: string;
  targetMemberId: string; title: string; createdBy: string; handoffSequence: number;
}
export interface HandoffCommand {
  type: 'team.task.handoff'; version: 1; commandId: string; sessionId: string;
  predecessorTaskId: string; successorTaskId: string; targetMemberId: string; title: string;
}
export interface HandoffContext extends FailureContext { handoffs: Map<string, Handoff> }
export function handoffContext(projection: MockProjection): HandoffContext {
  return { ...failureContext(projection), handoffs: new Map(projection.handoffs ?? []) };
}
export function validateHandoff(candidate: unknown): HandoffCommand {
  exactFields(candidate, ['type', 'version', 'commandId', 'sessionId', 'predecessorTaskId', 'successorTaskId', 'targetMemberId', 'title']);
  requireCore(candidate.type === 'team.task.handoff' && candidate.version === 1, 'unsupported-handoff-command');
  for (const key of ['commandId', 'sessionId', 'predecessorTaskId', 'successorTaskId', 'targetMemberId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-handoff-id');
  requireCore(validText(candidate.title), 'invalid-handoff-title');
  return { type: 'team.task.handoff', version: 1, commandId: candidate.commandId as string,
    sessionId: candidate.sessionId as string, predecessorTaskId: candidate.predecessorTaskId as string,
    successorTaskId: candidate.successorTaskId as string, targetMemberId: candidate.targetMemberId as string, title: candidate.title as string };
}
export function decodeHandoff(bytes: Uint8Array): HandoffCommand { return validateHandoff(decodeCanonical(bytes)); }
export function handoffHash(command: HandoffCommand, actor: string): string {
  return hashRecord([command.type, 1, actor, command.commandId, command.sessionId, command.predecessorTaskId,
    command.successorTaskId, command.targetMemberId, command.title]);
}
function closedObservedFailure(taskId: string, sessionId: string, context: HandoffContext): boolean {
  const assignment = context.assignments.get(taskId), notice = context.failures.get(taskId);
  if (!assignment || !assignment.closed || assignment.sessionId !== sessionId || assignment.remainingEvents !== 0
    || assignment.result !== null || assignment.effectId === null || context.tasks.get(taskId) !== 'failed'
    || !notice || notice.status !== 'closed' || notice.sessionId !== sessionId || notice.memberId !== assignment.memberId) return false;
  const effect = context.effects.get(assignment.effectId);
  return !!effect && effect.plan.taskId === taskId && notice.attemptId === effect.plan.attemptId
    && ['completed', 'cancelled', 'abandoned'].includes(effect.state)
    && ![...context.questions.values()].some(row => row.taskId === taskId && (row.status === 'open' || row.remainingEvents !== 0));
}
export function handoffDecision(command: HandoffCommand, actor: string, context: HandoffContext): 'accepted' | 'rejected' {
  const session = context.sessions.get(command.sessionId);
  return session?.status === 'active' && session.leaderId === actor
    && session.members.some(row => row.memberId === command.targetMemberId)
    && closedObservedFailure(command.predecessorTaskId, command.sessionId, context)
    && !context.handoffs.has(command.predecessorTaskId) && !context.tasks.has(command.successorTaskId)
    && context.handoffs.size < 10 && context.assignments.size < 100 ? 'accepted' : 'rejected';
}
export function reduceHandoff(body: unknown, sequence: number, context: HandoffContext): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateHandoff(body.command);
  requireCore(typeof body.actor === 'string' && UUID.test(body.actor) && !context.commands.has(command.commandId), 'invalid-handoff-actor-or-command');
  const result = handoffDecision(command, body.actor, context);
  requireCore(body.result === result, 'invalid-handoff-decision');
  context.commands.set(command.commandId, { hash: handoffHash(command, body.actor), result });
  if (result === 'rejected') return;
  context.tasks.set(command.successorTaskId, 'queued');
  context.assignments.set(command.successorTaskId, { sessionId: command.sessionId, taskId: command.successorTaskId,
    memberId: command.targetMemberId, enqueueSequence: sequence, effectId: null, remainingEvents: 8,
    closed: false, recoveryAcknowledged: false, result: null });
  context.handoffs.set(command.predecessorTaskId, { sessionId: command.sessionId, predecessorTaskId: command.predecessorTaskId,
    successorTaskId: command.successorTaskId, fromMemberId: context.assignments.get(command.predecessorTaskId)!.memberId,
    targetMemberId: command.targetMemberId, title: command.title, createdBy: body.actor, handoffSequence: sequence });
}
export function visibleHandoffs(rows: Handoff[], actor: string, leaderId: string | undefined): Handoff[] {
  return rows.filter(row => actor === 'owner' || actor === leaderId || row.fromMemberId === actor || row.targetMemberId === actor)
    .map(row => ({ ...row }));
}
export function recoveredMissionEligible(sessionId: string, context: HandoffContext): boolean {
  if (context.tasks.size !== context.assignments.size || context.effects.size !== context.assignments.size
    || [...context.questions.values()].some(row => row.status === 'open' || row.remainingEvents !== 0)) return false;
  for (const effect of context.effects.values())
    if (context.assignments.get(effect.plan.taskId)?.effectId !== effect.plan.effectId) return false;
  for (const initialTaskId of context.tasks.keys()) {
    const seen = new Set<string>();
    let taskId = initialTaskId;
    while (true) {
      if (seen.has(taskId)) return false;
      seen.add(taskId);
      const assignment = context.assignments.get(taskId);
      if (!assignment || !assignment.closed || assignment.sessionId !== sessionId || assignment.remainingEvents !== 0 || assignment.effectId === null) return false;
      const effect = context.effects.get(assignment.effectId);
      if (context.tasks.get(taskId) === 'done') {
        if (assignment.result?.status !== 'done' || effect?.state !== 'completed') return false;
        break;
      }
      if (!closedObservedFailure(taskId, sessionId, context)) return false;
      const edge = context.handoffs.get(taskId);
      if (!edge || edge.sessionId !== sessionId) return false;
      taskId = edge.successorTaskId;
    }
  }
  return true;
}
