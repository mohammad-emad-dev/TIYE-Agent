import { exactFields, requireCore, UUID, validText } from './command';
import { decodeCanonical, hashRecord } from './record';
import { questionContext, QuestionContext } from './engine-question';
import { closeAssignment, spendAssignment } from './engine-lifecycle';
import type { MockProjection } from './effects-model';

const REASONS = ['crash', 'hang', 'rate_limit', 'auth', 'network'] as const;
export type FailureReason = typeof REASONS[number];
export interface FailureNotice {
  sessionId: string; taskId: string; memberId: string; attemptId: string; reason: FailureReason; summary: string;
  observedSequence: number; status: 'awaiting_reconciliation' | 'closed'; closedSequence: number | null;
}
export interface ObserveFailure {
  type: 'team.task.failure'; version: 1; commandId: string; sessionId: string; taskId: string;
  memberId: string; attemptId: string; reason: FailureReason; summary: string;
}
export interface FailureContext extends QuestionContext {
  failures: Map<string, FailureNotice>; attentionSequences: Map<string, number>;
}
export function failureContext(projection: MockProjection): FailureContext {
  return { ...questionContext(projection), failures: new Map(projection.failures ?? []),
    attentionSequences: new Map(projection.attentionSequences ?? []) };
}
function validateFailure(candidate: unknown): ObserveFailure {
  exactFields(candidate, ['type', 'version', 'commandId', 'sessionId', 'taskId', 'memberId', 'attemptId', 'reason', 'summary']);
  requireCore(candidate.type === 'team.task.failure' && candidate.version === 1, 'unsupported-failure-command');
  for (const key of ['commandId', 'sessionId', 'taskId', 'memberId', 'attemptId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-failure-id');
  requireCore(REASONS.includes(candidate.reason as FailureReason) && validText(candidate.summary), 'invalid-failure-reason-or-summary');
  return { type: 'team.task.failure', version: 1, commandId: candidate.commandId as string,
    sessionId: candidate.sessionId as string, taskId: candidate.taskId as string, memberId: candidate.memberId as string,
    attemptId: candidate.attemptId as string, reason: candidate.reason as FailureReason, summary: candidate.summary as string };
}
export function decodeFailure(bytes: Uint8Array): ObserveFailure { return validateFailure(decodeCanonical(bytes)); }
export function failureHash(command: ObserveFailure): string {
  return hashRecord([command.type, 1, 'owner', command.commandId, command.sessionId, command.taskId,
    command.memberId, command.attemptId, command.reason, command.summary]);
}
export function failureDecision(command: ObserveFailure, context: FailureContext): 'accepted' | 'rejected' {
  const session = context.sessions.get(command.sessionId), assignment = context.assignments.get(command.taskId);
  if (!session || session.status === 'completed' || !assignment || assignment.closed || assignment.effectId === null
    || assignment.sessionId !== command.sessionId || assignment.memberId !== command.memberId
    || context.failures.has(command.taskId)) return 'rejected';
  const effect = context.effects.get(assignment.effectId)!;
  if (effect.plan.attemptId !== command.attemptId) return 'rejected';
  const pending = effect.state === 'dispatching' || effect.state === 'needs_attention';
  return assignment.remainingEvents >= (pending ? 2 : 1) ? 'accepted' : 'rejected';
}
export function closeFailure(notice: FailureNotice, sequence: number, context: FailureContext): void {
  closeAssignment(context.assignments.get(notice.taskId)!, context.tasks, 'failed');
  notice.status = 'closed'; notice.closedSequence = sequence;
}
export function reduceFailure(body: unknown, sequence: number, context: FailureContext): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateFailure(body.command);
  requireCore(body.actor === 'owner' && !context.commands.has(command.commandId), 'invalid-failure-authority-or-command');
  const result = failureDecision(command, context);
  requireCore(body.result === result, 'invalid-failure-decision');
  context.commands.set(command.commandId, { hash: failureHash(command), result });
  if (result === 'rejected') return;
  const assignment = context.assignments.get(command.taskId)!, effect = context.effects.get(assignment.effectId!)!;
  spendAssignment(assignment);
  const notice: FailureNotice = { sessionId: command.sessionId, taskId: command.taskId, memberId: command.memberId,
    attemptId: command.attemptId, reason: command.reason, summary: command.summary,
    observedSequence: sequence, status: 'awaiting_reconciliation', closedSequence: null };
  context.failures.set(command.taskId, notice);
  for (const question of context.questions.values()) if (question.taskId === command.taskId && question.status === 'open') {
    question.status = 'cancelled'; question.remainingEvents = 0; question.closedSequence = sequence;
  }
  if (effect.state === 'dispatching') {
    effect.state = 'needs_attention'; context.attentionSequences.set(effect.plan.effectId, sequence);
  }
  if (effect.state === 'needs_attention') context.tasks.set(command.taskId, 'needs_attention');
  else {
    if (effect.state === 'planned') effect.state = 'cancelled';
    closeFailure(notice, sequence, context);
  }
}
export function visibleFailures(notices: FailureNotice[], actor: string, leaderId: string | undefined): FailureNotice[] {
  return notices.filter(row => actor === 'owner' || actor === leaderId || row.memberId === actor).map(row => ({ ...row }));
}
