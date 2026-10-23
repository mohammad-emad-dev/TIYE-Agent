import { exactFields, requireCore, UUID } from './command';
import { decodeCanonical, hashRecord } from './record';
import type { InboxContext } from './engine-inbox';

interface StopSession {
  type: 'team.session.stop'; version: 1; commandId: string; sessionId: string;
}

function validateStop(candidate: unknown): StopSession {
  exactFields(candidate, ['type', 'version', 'commandId', 'sessionId']);
  requireCore(candidate.type === 'team.session.stop' && candidate.version === 1, 'unsupported-session-stop');
  for (const key of ['commandId', 'sessionId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-session-stop-id');
  return { type: 'team.session.stop', version: 1, commandId: candidate.commandId as string,
    sessionId: candidate.sessionId as string };
}

export function decodeStop(bytes: Uint8Array): StopSession { return validateStop(decodeCanonical(bytes)); }

export function stopHash(command: StopSession): string {
  return hashRecord([command.type, 1, 'owner', command.commandId, command.sessionId]);
}

export function stopDecision(command: StopSession, context: InboxContext): 'accepted' | 'rejected' {
  return context.sessions.get(command.sessionId)?.status === 'active' ? 'accepted' : 'rejected';
}

/** This component admits only queued/planned work. Dispatched effects still refuse upstream. */
export function reduceStop(body: unknown, context: InboxContext): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateStop(body.command);
  requireCore(body.actor === 'owner' && !context.commands.has(command.commandId), 'invalid-stop-authority-or-id');
  const result = stopDecision(command, context);
  requireCore(body.result === result, 'invalid-stop-event-decision');
  context.commands.set(command.commandId, { hash: stopHash(command), result });
  if (result === 'rejected') return;
  for (const assignment of context.assignments.values()) {
    if (assignment.sessionId !== command.sessionId || assignment.closed) continue;
    const effect = assignment.effectId === null ? undefined : context.effects.get(assignment.effectId);
    requireCore(assignment.effectId === null ? context.tasks.get(assignment.taskId) === 'queued'
      : effect?.state === 'planned', 'stop-requires-undispatched-assignment');
    if (effect) effect.state = 'cancelled';
    assignment.closed = true; assignment.remainingEvents = 0;
    context.tasks.set(assignment.taskId, 'cancelled');
  }
  context.sessions.get(command.sessionId)!.status = 'stopped';
}
