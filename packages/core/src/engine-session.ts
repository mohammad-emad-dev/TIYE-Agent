import { exactFields, requireCore, UUID, validText } from './command';
import { decodeCanonical, hashRecord } from './record';
import type { MemberInbox } from './engine-inbox';
import type { VisibleQuestion } from './engine-question';

export interface EngineMember { memberId: string; name: string; instructions: string }
export interface EngineSession {
  sessionId: string; leaderId: string; members: EngineMember[]; maxConcurrent: number; status: 'active' | 'stopped';
}
export interface CreateSession {
  type: 'team.session.create'; version: 1; commandId: string; sessionId: string;
  leaderId: string; members: EngineMember[]; maxConcurrent: number;
}
export interface EngineOwner {
  createSession(bytes: Uint8Array): 'accepted' | 'rejected';
  stop(bytes: Uint8Array): 'accepted' | 'rejected';
  recover(bytes: Uint8Array): 'accepted' | 'rejected';
  answer(bytes: Uint8Array): 'accepted' | 'rejected';
  questions(): VisibleQuestion[];
  session(): EngineSession | null;
}
export interface MemberContext extends EngineMember { sessionId: string; role: 'leader' | 'member' }
export interface EngineMemberHandle {
  context(): MemberContext;
  enqueue(bytes: Uint8Array): 'accepted' | 'rejected';
  report(bytes: Uint8Array): 'accepted' | 'rejected';
  ask(bytes: Uint8Array): 'accepted' | 'rejected';
  escalate(bytes: Uint8Array): 'accepted' | 'rejected';
  answer(bytes: Uint8Array): 'accepted' | 'rejected';
  questions(): VisibleQuestion[];
  inbox(): MemberInbox;
}

export function validateSession(candidate: unknown): CreateSession {
  exactFields(candidate, ['type', 'version', 'commandId', 'sessionId', 'leaderId', 'members', 'maxConcurrent']);
  requireCore(candidate.type === 'team.session.create' && candidate.version === 1, 'unsupported-session-command');
  for (const key of ['commandId', 'sessionId', 'leaderId'])
    requireCore(typeof candidate[key] === 'string' && UUID.test(candidate[key]), 'invalid-session-id');
  requireCore(Array.isArray(candidate.members) && candidate.members.length >= 1 && candidate.members.length <= 5, 'session-roster-bound');
  const members = candidate.members.map((member: unknown): EngineMember => {
    exactFields(member, ['memberId', 'name', 'instructions']);
    requireCore(typeof member.memberId === 'string' && UUID.test(member.memberId), 'invalid-member-id');
    requireCore(validText(member.name) && validText(member.instructions), 'invalid-member-text');
    return { memberId: member.memberId, name: member.name, instructions: member.instructions };
  });
  requireCore(new Set(members.map(member => member.memberId)).size === members.length, 'duplicate-roster-member');
  requireCore(members.some(member => member.memberId === candidate.leaderId), 'leader-outside-roster');
  requireCore(Number.isInteger(candidate.maxConcurrent) && (candidate.maxConcurrent as number) >= 1
    && (candidate.maxConcurrent as number) <= members.length, 'invalid-session-concurrency');
  return { type: 'team.session.create', version: 1, commandId: candidate.commandId as string,
    sessionId: candidate.sessionId as string, leaderId: candidate.leaderId as string,
    members, maxConcurrent: candidate.maxConcurrent as number };
}

export function decodeSession(bytes: Uint8Array): CreateSession {
  return validateSession(decodeCanonical(bytes));
}

export function sessionHash(command: CreateSession): string {
  return hashRecord(['team.session.create', 1, 'owner', command.commandId, command.sessionId,
    command.leaderId, command.maxConcurrent, command.members.map(member => [member.memberId, member.name, member.instructions])]);
}

interface SessionContext {
  commands: Map<string, { hash: string; result: 'accepted' | 'rejected' }>;
  sessions: Map<string, EngineSession>;
}

export function reduceSession(body: unknown, context: SessionContext): void {
  exactFields(body, ['command', 'actor', 'result']);
  const command = validateSession(body.command);
  requireCore(body.actor === 'owner' && !context.commands.has(command.commandId), 'invalid-session-event-authority-or-id');
  const result = context.sessions.size === 0 ? 'accepted' : 'rejected';
  requireCore(body.result === result, 'invalid-session-event-decision');
  context.commands.set(command.commandId, { hash: sessionHash(command), result });
  if (result === 'accepted') context.sessions.set(command.sessionId, {
    sessionId: command.sessionId, leaderId: command.leaderId, members: command.members,
    maxConcurrent: command.maxConcurrent, status: 'active'
  });
}
