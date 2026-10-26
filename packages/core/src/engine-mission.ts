import { exactFields, requireCore, UUID, validText } from './command';
import { decodeCanonical, hashRecord } from './record';
import type { QuestionContext } from './engine-question';
import type { EngineSession } from './engine-session';
import { HandoffContext, recoveredMissionEligible } from './engine-handoff';
interface MissionContext extends QuestionContext { recovery?: HandoffContext }

export interface MissionCompletion { summary: string; completedBy: string; sequence: number }
export interface MissionView { sessionId: string; status: EngineSession['status']; completion: MissionCompletion | null }
export interface CompleteMission {
  type: 'team.mission.complete'; version: 1; commandId: string; sessionId: string; summary: string;
}

function validateMission(candidate: unknown): CompleteMission {
  exactFields(candidate, ['type', 'version', 'commandId', 'sessionId', 'summary']);
  requireCore(candidate.type === 'team.mission.complete' && candidate.version === 1, 'unsupported-mission-command');
  for (const key of ['commandId', 'sessionId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-mission-id');
  requireCore(validText(candidate.summary), 'invalid-mission-summary');
  return { type: 'team.mission.complete', version: 1, commandId: candidate.commandId as string,
    sessionId: candidate.sessionId as string, summary: candidate.summary as string };
}

export function decodeMission(bytes: Uint8Array): CompleteMission { return validateMission(decodeCanonical(bytes)); }

export function missionHash(command: CompleteMission, actor: string): string {
  return hashRecord([command.type, 1, actor, command.commandId, command.sessionId, command.summary]);
}

export function missionDecision(command: CompleteMission, actor: string, context: MissionContext): 'accepted' | 'rejected' {
  const session = context.sessions.get(command.sessionId);
  if (!session || session.status !== 'active' || session.leaderId !== actor || context.assignments.size === 0) return 'rejected';
  if (context.recovery) return recoveredMissionEligible(command.sessionId, context.recovery) ? 'accepted' : 'rejected';
  for (const [taskId, state] of context.tasks) {
    const assignment = context.assignments.get(taskId);
    if (state !== 'done' || !assignment || assignment.sessionId !== command.sessionId || !assignment.closed
      || assignment.result?.status !== 'done' || assignment.remainingEvents !== 0 || assignment.effectId === null
      || context.effects.get(assignment.effectId)?.state !== 'completed') return 'rejected';
  }
  if (context.tasks.size !== context.assignments.size || context.effects.size !== context.assignments.size) return 'rejected';
  for (const effect of context.effects.values()) {
    if (effect.state !== 'completed' || context.assignments.get(effect.plan.taskId)?.effectId !== effect.plan.effectId) return 'rejected';
  }
  if ([...context.questions.values()].some(row => row.status === 'open' || row.remainingEvents !== 0)) return 'rejected';
  return 'accepted';
}

export function reduceMission(body: unknown, sequence: number, context: MissionContext): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateMission(body.command);
  requireCore(typeof body.actor === 'string' && UUID.test(body.actor)
    && !context.commands.has(command.commandId), 'invalid-mission-actor-or-command');
  const result = missionDecision(command, body.actor, context);
  requireCore(body.result === result, 'invalid-mission-decision');
  context.commands.set(command.commandId, { hash: missionHash(command, body.actor), result });
  if (result === 'accepted') {
    const session = context.sessions.get(command.sessionId)!;
    session.status = 'completed'; session.completion = { summary: command.summary, completedBy: body.actor, sequence };
  }
}

export function missionView(session: EngineSession | undefined): MissionView | null {
  return session ? { sessionId: session.sessionId, status: session.status,
    completion: session.completion ? { ...session.completion } : null } : null;
}
