import { exactFields, requireCore, UUID, validText } from './command';
import { decodeCanonical, hashRecord } from './record';
import { inboxContext, InboxContext } from './engine-inbox';
import type { MockProjection } from './effects-model';

export type Answer = { kind: 'option'; index: number } | { kind: 'text'; text: string };
export interface Question {
  questionId: string; sessionId: string; taskId: string; authorId: string; text: string; options: string[];
  initialRecipient: 'leader' | 'owner'; recipient: 'leader' | 'owner'; escalated: boolean;
  status: 'open' | 'answered' | 'cancelled'; answer: Answer | null; answeredBy: string | null;
  openedSequence: number; escalatedSequence: number | null; closedSequence: number | null; remainingEvents: number;
}
export type VisibleQuestion = Omit<Question, 'remainingEvents'>;
interface QuestionBase { version: 1; commandId: string; sessionId: string; questionId: string }
interface Ask extends QuestionBase { type: 'team.question.ask'; taskId: string; text: string; options: string[] }
interface Escalate extends QuestionBase { type: 'team.question.escalate' }
interface Reply extends QuestionBase { type: 'team.question.answer'; answer: Answer }
export type QuestionCommand = Ask | Escalate | Reply;
export interface QuestionContext extends InboxContext { approvals: Map<string, string>; questions: Map<string, Question> }

export function questionContext(projection: MockProjection): QuestionContext {
  return { ...inboxContext(projection), approvals: new Map(projection.approvals), questions: new Map(projection.questions ?? []) };
}

function validateAnswer(candidate: unknown): Answer {
  requireCore(candidate !== null && typeof candidate === 'object', 'answer-required');
  const answer = candidate as Record<string, unknown>;
  if (answer.kind === 'option') {
    exactFields(answer, ['kind', 'index']); requireCore(Number.isSafeInteger(answer.index), 'invalid-answer-index');
    return { kind: 'option', index: answer.index as number };
  }
  exactFields(answer, ['kind', 'text']); requireCore(answer.kind === 'text' && validText(answer.text), 'invalid-answer-text');
  return { kind: 'text', text: answer.text as string };
}

function validateQuestion(candidate: unknown): QuestionCommand {
  requireCore(candidate !== null && typeof candidate === 'object', 'question-command-required');
  const request = candidate as Record<string, unknown>, type = request.type;
  requireCore(type === 'team.question.ask' || type === 'team.question.escalate' || type === 'team.question.answer', 'unsupported-question-command');
  exactFields(request, ['type', 'version', 'commandId', 'sessionId', 'questionId',
    ...(type === 'team.question.ask' ? ['taskId', 'text', 'options'] : type === 'team.question.answer' ? ['answer'] : [])]);
  requireCore(request.version === 1, 'unsupported-question-version');
  for (const key of type === 'team.question.ask' ? ['commandId', 'sessionId', 'questionId', 'taskId'] : ['commandId', 'sessionId', 'questionId'])
    requireCore(typeof request[key] === 'string' && UUID.test(request[key]), 'invalid-question-id');
  const base: QuestionBase = { version: 1, commandId: request.commandId as string, sessionId: request.sessionId as string, questionId: request.questionId as string };
  if (type === 'team.question.answer') return { type, ...base, answer: validateAnswer(request.answer) };
  if (type === 'team.question.escalate') return { type, ...base };
  requireCore(validText(request.text) && Array.isArray(request.options) && request.options.length <= 3
    && request.options.every(validText) && new Set(request.options).size === request.options.length, 'invalid-question-text-or-options');
  return { type, ...base, taskId: request.taskId as string, text: request.text as string, options: [...request.options] as string[] };
}

export function decodeQuestion(bytes: Uint8Array, type: QuestionCommand['type']): QuestionCommand {
  const command = validateQuestion(decodeCanonical(bytes));
  requireCore(command.type === type, 'wrong-question-entry-point'); return command;
}

export function questionHash(command: QuestionCommand, actor: string): string {
  const base = [command.type, 1, actor, command.commandId, command.sessionId];
  if (command.type === 'team.question.ask') return hashRecord([...base, command.taskId, command.questionId, command.text, command.options]);
  if (command.type === 'team.question.answer') return hashRecord([...base, command.questionId, command.answer.kind,
    command.answer.kind === 'option' ? command.answer.index : command.answer.text]);
  return hashRecord([...base, command.questionId]);
}

function askEligible(command: Ask, actor: string, context: QuestionContext): boolean {
  const assignment = context.assignments.get(command.taskId), history = [...context.questions.values()];
  if (!assignment || assignment.closed || assignment.sessionId !== command.sessionId || assignment.memberId !== actor
    || assignment.effectId === null || context.questions.has(command.questionId) || history.length >= 20
    || history.some(row => row.taskId === command.taskId)) return false;
  return ['planned', 'completed'].includes(context.effects.get(assignment.effectId)!.state);
}

export function questionDecision(command: QuestionCommand, actor: string, context: QuestionContext): 'accepted' | 'rejected' {
  const session = context.sessions.get(command.sessionId);
  if (!session || session.status !== 'active') return 'rejected';
  if (command.type === 'team.question.ask') return askEligible(command, actor, context) ? 'accepted' : 'rejected';
  const question = context.questions.get(command.questionId);
  if (!question || question.sessionId !== command.sessionId || question.status !== 'open') return 'rejected';
  if (command.type === 'team.question.escalate') return actor === session.leaderId && question.recipient === 'leader'
    && !question.escalated && question.authorId !== session.leaderId ? 'accepted' : 'rejected';
  const authorized = question.recipient === 'owner' ? actor === 'owner' : actor === session.leaderId;
  const validChoice = command.answer.kind === 'text' || command.answer.index >= 0 && command.answer.index < question.options.length;
  return authorized && validChoice ? 'accepted' : 'rejected';
}

export function restoreQuestionTask(question: Question, context: QuestionContext): void {
  const assignment = context.assignments.get(question.taskId)!, effect = context.effects.get(assignment.effectId!)!;
  context.tasks.set(question.taskId, effect.state === 'planned' && !context.approvals.has(effect.plan.effectId) ? 'waiting_approval' : 'running');
}

export function reduceQuestion(body: unknown, sequence: number, context: QuestionContext, type: QuestionCommand['type']): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateQuestion(body.command);
  requireCore(command.type === type && typeof body.actor === 'string' && (body.actor === 'owner' || UUID.test(body.actor)), 'invalid-question-event-binding');
  requireCore(!context.commands.has(command.commandId), 'duplicate-question-command');
  const result = questionDecision(command, body.actor, context);
  requireCore(body.result === result, 'invalid-question-decision');
  context.commands.set(command.commandId, { hash: questionHash(command, body.actor), result });
  if (result === 'rejected') return;
  if (command.type === 'team.question.ask') {
    const recipient = body.actor === context.sessions.get(command.sessionId)!.leaderId ? 'owner' : 'leader';
    context.questions.set(command.questionId, { questionId: command.questionId, sessionId: command.sessionId,
      taskId: command.taskId, authorId: body.actor, text: command.text, options: command.options,
      initialRecipient: recipient, recipient, escalated: false, status: 'open', answer: null, answeredBy: null,
      openedSequence: sequence, escalatedSequence: null, closedSequence: null, remainingEvents: 2 });
    context.tasks.set(command.taskId, 'blocked'); return;
  }
  const question = context.questions.get(command.questionId)!;
  requireCore(question.remainingEvents > 0, 'question-budget-exhausted'); question.remainingEvents--;
  if (command.type === 'team.question.escalate') {
    question.recipient = 'owner'; question.escalated = true; question.escalatedSequence = sequence;
  } else {
    question.answer = command.answer; question.answeredBy = body.actor; question.status = 'answered';
    question.closedSequence = sequence; question.remainingEvents = 0; restoreQuestionTask(question, context);
  }
}

export function questionOpen(questions: Iterable<Question>, taskId: string): boolean {
  return [...questions].some(row => row.taskId === taskId && row.status === 'open');
}

export function cancelQuestions(sessionId: string, sequence: number, context: QuestionContext): void {
  for (const question of context.questions.values()) if (question.sessionId === sessionId && question.status === 'open') {
    question.status = 'cancelled'; question.closedSequence = sequence; question.remainingEvents = 0;
    restoreQuestionTask(question, context);
  }
}

export function visibleQuestions(questions: Question[], actor: string, leaderId: string | undefined): VisibleQuestion[] {
  return questions.filter(row => actor === 'owner' ? row.recipient === 'owner'
    : row.authorId === actor || actor === leaderId && row.initialRecipient === 'leader').map(({ remainingEvents: _budget, ...visible }) => visible);
}
