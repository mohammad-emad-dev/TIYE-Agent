import { exactFields, requireCore, UUID, validText } from './command';
import { hashRecord } from './record';

export interface MockPlan {
  commandId: string; taskId: string; effectId: string; attemptId: string;
  targetId: string; payload: string; expiresAt: number;
}
export interface Invocation { effectId: string; attemptId: string; targetId: string; operation: 'mock.record'; payloadHash: string; expiresAt: number }

export function validatePlan(candidate: unknown): MockPlan {
  exactFields(candidate, ['commandId', 'taskId', 'effectId', 'attemptId', 'targetId', 'payload', 'expiresAt']);
  for (const key of ['commandId', 'taskId', 'effectId', 'attemptId', 'targetId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-mock-id');
  requireCore(validText(candidate.payload), 'invalid-mock-payload');
  requireCore(Number.isSafeInteger(candidate.expiresAt) && (candidate.expiresAt as number) >= 0, 'invalid-mock-deadline');
  return { commandId: candidate.commandId as string, taskId: candidate.taskId as string,
    effectId: candidate.effectId as string, attemptId: candidate.attemptId as string,
    targetId: candidate.targetId as string, payload: candidate.payload, expiresAt: candidate.expiresAt as number };
}

export function planHash(plan: MockPlan): string { return hashPlan(plan, 'mock.plan'); }
export function taskPlanHash(plan: MockPlan): string { return hashPlan(plan, 'task.mock.plan'); }
function hashPlan(plan: MockPlan, domain: string): string {
  return hashRecord([domain, 1, plan.commandId, plan.taskId, plan.effectId,
    plan.attemptId, plan.targetId, plan.payload, plan.expiresAt]);
}

export function invocation(plan: MockPlan): Invocation {
  return { effectId: plan.effectId, attemptId: plan.attemptId, targetId: plan.targetId,
    operation: 'mock.record', payloadHash: hashRecord(['mock.record', 1, plan.targetId, plan.payload]), expiresAt: plan.expiresAt };
}

export function approvalBinding(plan: MockPlan): string {
  const request = invocation(plan);
  return hashRecord(['mock.approval', 1, request.effectId, request.attemptId, request.targetId,
    request.operation, request.payloadHash, request.expiresAt]);
}
