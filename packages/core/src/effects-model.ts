import { commandHash, CoreRefusal, exactFields, requireCore, UUID, validateCommand } from './command';
import { EngineSession, reduceSession } from './engine-session';
import { hashRecord } from './record';
import { MockPlan, validatePlan, planHash, taskPlanHash, invocation, approvalBinding } from './mock-plan';
export { MockPlan, Invocation, validatePlan, planHash, taskPlanHash, invocation, approvalBinding } from './mock-plan';
import { Assignment, reduceInbox } from './engine-inbox';
import { reduceStop } from './engine-stop';
export { hashRecord } from './record';

export type EffectState = 'planned' | 'dispatching' | 'completed' | 'needs_attention' | 'cancelled' | 'abandoned';
export type TaskState = 'created' | 'queued' | 'waiting_approval' | 'running' | EffectState;
export interface TaskRecord { taskId: string; title: string | null; state: TaskState; effectId: string | null }
export interface MockEffect { plan: MockPlan; state: EffectState }
export interface MockProjection {
  commands: [string, { hash: string; result: 'accepted' | 'rejected' }][];
  tasks: [string, TaskState][]; effects: [string, MockEffect][]; approvals: [string, string][];
  sessions?: [string, EngineSession][];
  assignments?: [string, Assignment][];
}
export interface MockEvent { sequence: number; type: string; body: string }
export interface Attention { effectId: string; attemptId: string; attentionSequence: number }
export interface Resolution extends Attention { commandId: string; outcome: 'confirm_completed' | 'close_uncertain' }

export function validateResolution(candidate: unknown): Resolution {
  exactFields(candidate, ['commandId', 'effectId', 'attemptId', 'attentionSequence', 'outcome']);
  for (const key of ['commandId', 'effectId', 'attemptId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-resolution-id');
  requireCore(Number.isSafeInteger(candidate.attentionSequence) && (candidate.attentionSequence as number) > 0, 'invalid-attention-sequence');
  requireCore(candidate.outcome === 'confirm_completed' || candidate.outcome === 'close_uncertain', 'invalid-resolution-outcome');
  return { commandId: candidate.commandId as string, effectId: candidate.effectId as string,
    attemptId: candidate.attemptId as string, attentionSequence: candidate.attentionSequence as number, outcome: candidate.outcome };
}

/** Malformed proofs refuse before command admission; valid nonmatches may be rejected durably. */
export function resolutionProof(request: Resolution, bytes?: Uint8Array): unknown {
  if (request.outcome === 'close_uncertain') {
    requireCore(bytes === undefined, 'unexpected-resolution-proof'); return null;
  }
  requireCore(bytes instanceof Uint8Array && bytes.length <= 16384, 'resolution-proof-bound');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const proof: unknown = JSON.parse(text);
  requireCore(JSON.stringify(proof) === text, 'noncanonical-resolution-proof');
  return proof;
}

export function resolutionHash(request: Resolution, proof: unknown): string {
  return hashRecord(['mock.resolve', 1, request.commandId, request.effectId, request.attemptId,
    request.attentionSequence, request.outcome, hashRecord(proof)]);
}

interface ResolutionContext {
  commands: Map<string, { hash: string; result: 'accepted' | 'rejected' }>;
  effects: Map<string, MockEffect>;
  attentionSequences: Map<string, number>;
}

function reduceResolution(body: unknown, context: ResolutionContext): { effect: MockEffect; state: EffectState } | undefined {
  exactFields(body, ['request', 'proof']);
  const request = validateResolution(body.request);
  requireCore(request.outcome !== 'close_uncertain' || body.proof === null, 'invalid-resolution-proof');
  requireCore(!context.commands.has(request.commandId), 'duplicate-resolution-command');
  const effect = context.effects.get(request.effectId);
  const accepted = effect?.state === 'needs_attention' && effect.plan.attemptId === request.attemptId
    && context.attentionSequences.get(request.effectId) === request.attentionSequence
    && (request.outcome === 'close_uncertain' || matchesWitness(effect.plan, body.proof));
  context.commands.set(request.commandId, { hash: resolutionHash(request, body.proof), result: accepted ? 'accepted' : 'rejected' });
  return accepted ? { effect: effect!, state: request.outcome === 'close_uncertain' ? 'abandoned' : 'completed' } : undefined;
}

/** Reserve claim/outcome/resolution slots; rejection traffic cannot consume these. */
export function reservedEvents(projection: MockProjection): number {
  const approved = new Set(projection.approvals.map(([id]) => id));
  const assigned = new Map(projection.assignments ?? []);
  return [...assigned.values()].reduce((sum, row) => sum + row.remainingEvents, 0)
    + projection.effects.filter(([, effect]) => !assigned.has(effect.plan.taskId)).reduce((sum, [, effect]) => sum
    + (effect.state === 'planned' ? (approved.has(effect.plan.effectId) ? 3 : 4)
      : effect.state === 'dispatching' ? 2 : effect.state === 'needs_attention' ? 1 : 0), 0);
}

/** Events and projections must already have passed replay validation. */
export function taskRegistry(projection: MockProjection, events: MockEvent[]): TaskRecord[] {
  const decisions = new Map(projection.commands), titles = new Map<string, string>();
  for (const event of events) if (event.type === 'task.create') {
    const command = validateCommand(JSON.parse(event.body));
    if (decisions.get(command.commandId)!.result === 'accepted') titles.set(command.taskId, command.title);
  }
  const attachments = new Map(projection.effects.map(([id, effect]) => [effect.plan.taskId, id]));
  return projection.tasks.map(([taskId, state]) => ({ taskId, title: titles.get(taskId) ?? null,
    state, effectId: attachments.get(taskId) ?? null }));
}

export function normalizedProof(bytes: Uint8Array): unknown {
  try {
    requireCore(bytes instanceof Uint8Array && bytes.length <= 16384, 'witness-byte-bound');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const proof: unknown = JSON.parse(text);
    requireCore(JSON.stringify(proof) === text, 'noncanonical-witness');
    return proof;
  } catch (fault) {
    if (fault instanceof CoreRefusal || fault instanceof SyntaxError || fault instanceof TypeError || fault instanceof RangeError)
      return { scope: 'unavailable' };
    throw fault;
  }
}

export function matchesWitness(plan: MockPlan, proof: unknown): boolean {
  try {
    exactFields(proof, ['scope', 'targetId', 'rows']);
    requireCore(proof.scope === 'mock-witness-v1' && proof.targetId === plan.targetId
      && Array.isArray(proof.rows) && proof.rows.length === 1, 'ambiguous-witness');
    const row: unknown = proof.rows[0];
    exactFields(row, ['sequence', 'effectId', 'attemptId', 'targetId', 'operation', 'payloadHash', 'expiresAt']);
    requireCore(Number.isSafeInteger(row.sequence) && (row.sequence as number) > 0, 'witness-sequence');
    const expected = invocation(plan);
    return Object.entries(expected).every(([key, value]) => row[key] === value);
  } catch (fault) {
    if (fault instanceof CoreRefusal) return false;
    throw fault;
  }
}

export function replayMock(events: MockEvent[], engine = false): MockProjection {
  const commands = new Map<string, { hash: string; result: 'accepted' | 'rejected' }>();
  const tasks = new Map<string, TaskState>(), effects = new Map<string, MockEffect>(), approvals = new Map<string, string>();
  const attentionSequences = new Map<string, number>();
  const sessions = new Map<string, EngineSession>();
  const assignments = new Map<string, Assignment>();
  function transition(effect: MockEffect, state: EffectState, sequence: number): void {
    effect.state = state; tasks.set(effect.plan.taskId, state);
    if (state === 'needs_attention') attentionSequences.set(effect.plan.effectId, sequence);
    else attentionSequences.delete(effect.plan.effectId);
  }
  for (const [ordinal, event] of events.entries()) {
    requireCore(event.sequence === ordinal + 1 && Buffer.byteLength(event.body) <= 16384, 'mock-event-sequence-or-size');
    const body: unknown = JSON.parse(event.body);
    requireCore(JSON.stringify(body) === event.body, 'noncanonical-mock-event');
    if (event.type === 'team.task.enqueue' || event.type === 'team.task.start') {
      requireCore(engine, 'engine-event-in-schema2');
      reduceInbox(body, event.sequence, { commands, sessions, tasks, effects, assignments }, event.type);
      continue;
    }
    if (event.type === 'team.session.create') {
      requireCore(engine, 'engine-event-in-schema2');
      reduceSession(body, { commands, sessions });
      continue;
    }
    if (event.type === 'team.session.stop') {
      requireCore(engine, 'engine-event-in-schema2');
      reduceStop(body, { commands, sessions, tasks, effects, assignments });
      continue;
    }
    if (event.type === 'task.create') {
      const command = validateCommand(body);
      requireCore(!commands.has(command.commandId), 'duplicate-task-command');
      const exists = tasks.has(command.taskId);
      commands.set(command.commandId, { hash: commandHash(command), result: exists ? 'rejected' : 'accepted' });
      if (!exists) tasks.set(command.taskId, 'created');
      continue;
    }
    if (event.type === 'resolve') {
      exactFields(body, ['request', 'proof']);
      const resolution = validateResolution(body.request), target = effects.get(resolution.effectId);
      requireCore(!target || !assignments.has(target.plan.taskId), 'engine-dispatch-not-admitted');
      const change = reduceResolution(body, { commands, effects, attentionSequences });
      if (change) transition(change.effect, change.state, event.sequence);
      continue;
    }
    if (event.type === 'plan' || event.type === 'task.plan') {
      const plan = validatePlan(body);
      requireCore(!commands.has(plan.commandId), 'duplicate-mock-command');
      const conflict = (event.type === 'plan' ? tasks.has(plan.taskId) : tasks.get(plan.taskId) !== 'created') || effects.has(plan.effectId)
        || [...effects.values()].some(effect => effect.plan.attemptId === plan.attemptId);
      commands.set(plan.commandId, { hash: event.type === 'plan' ? planHash(plan) : taskPlanHash(plan), result: conflict ? 'rejected' : 'accepted' });
      if (!conflict) { tasks.set(plan.taskId, 'planned'); effects.set(plan.effectId, { plan, state: 'planned' }); }
      continue;
    }
    requireCore(body !== null && typeof body === 'object', 'mock-event-body');
    const request = body as Record<string, unknown>;
    const effect = effects.get(request.effectId as string);
    requireCore(effect, 'unknown-mock-effect');
    const assignment = assignments.get(effect.plan.taskId);
    requireCore(!assignment || event.type === 'approve', 'engine-dispatch-not-admitted');
    if (event.type === 'approve') {
      exactFields(body, ['effectId', 'binding']);
      requireCore(effect.state === 'planned' && request.binding === approvalBinding(effect.plan)
        && !approvals.has(effect.plan.effectId), 'invalid-mock-approval');
      approvals.set(effect.plan.effectId, request.binding as string);
      if (assignment) {
        requireCore(!assignment.closed && sessions.get(assignment.sessionId)?.status === 'active', 'stopped-assignment');
        requireCore(assignment.remainingEvents > 0, 'assignment-budget-exhausted');
        assignment.remainingEvents--; tasks.set(effect.plan.taskId, 'running');
      }
    } else if (event.type === 'claim') {
      exactFields(body, ['effectId', 'observedAt']);
      requireCore(effect.state === 'planned' && approvals.get(effect.plan.effectId) === approvalBinding(effect.plan)
        && Number.isSafeInteger(request.observedAt) && (request.observedAt as number) >= 0
        && (request.observedAt as number) < effect.plan.expiresAt, 'invalid-mock-claim');
      transition(effect, 'dispatching', event.sequence);
    } else if (event.type === 'stop') {
      exactFields(body, ['effectId', 'reason', 'observedAt']);
      requireCore(['cancel', 'deadline'].includes(request.reason as string)
        && Number.isSafeInteger(request.observedAt) && (request.observedAt as number) >= 0
        && (request.reason !== 'deadline' || (request.observedAt as number) >= effect.plan.expiresAt)
        && ['planned', 'dispatching'].includes(effect.state), 'invalid-mock-stop');
      transition(effect, effect.state === 'planned' ? 'cancelled' : 'needs_attention', event.sequence);
    } else if (event.type === 'settle') {
      exactFields(body, ['effectId', 'proof']);
      requireCore(effect.state === 'dispatching', 'invalid-mock-settlement');
      transition(effect, matchesWitness(effect.plan, request.proof) ? 'completed' : 'needs_attention', event.sequence);
    } else requireCore(false, 'unsupported-mock-event');
  }
  return { commands: [...commands], tasks: [...tasks], effects: [...effects], approvals: [...approvals],
    ...(engine ? { sessions: [...sessions], assignments: [...assignments] } : {}) };
}
