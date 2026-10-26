import Database from 'better-sqlite3/win32-x64';
import { randomUUID } from 'node:crypto';
import { commandHash, decodeCommand, requireCore, UUID } from './command';
import { Decision, decisionFor } from './replay';
import { approvalBinding, Attention, Invocation, invocation, matchesWitness, MockEffect, MockEvent, MockProjection,
  normalizedProof, planHash, replayMock, reservedEvents, resolutionHash, resolutionProof, taskPlanHash, taskRegistry,
  TaskRecord, validatePlan, validateResolution } from './effects-model';
import { configure } from './store';
import { databasePath, reserveFreshDatabase, RootIdentity, storageRoot, verifyRoot } from './storage';
import { decodeSession, EngineMemberHandle, EngineOwner, sessionHash } from './engine-session';
import { decodeInbox, EngineScheduler, inboxContext, inboxDecision, inboxHash, InboxCommand, memberInboxes } from './engine-inbox';
import { decodeStop, stopDecision, stopHash } from './engine-stop';
import { decodeLifecycle, interrupted, lifecycleDecision, lifecycleHash, LifecycleCommand } from './engine-lifecycle';
import { decodeQuestion, questionContext, questionDecision, questionHash, QuestionCommand, questionOpen, visibleQuestions } from './engine-question';
import { decodeMission, missionDecision, missionHash, missionView } from './engine-mission';
import { decodeFailure, failureContext, failureDecision, failureHash, visibleFailures } from './engine-failure';
import { decodeHandoff, handoffContext, handoffDecision, handoffHash, visibleHandoffs } from './engine-handoff';

const LIMIT = 1000;
const APPLICATION_ID = 0x54495946;
const PROJECTIONS = ['commands', 'tasks', 'effects', 'approvals'] as const;
const ENGINE_PROJECTIONS = [...PROJECTIONS, 'sessions'] as const;
const QUESTION_PROJECTIONS = [...ENGINE_PROJECTIONS, 'questions'] as const;
const FAILURE_PROJECTIONS = [...QUESTION_PROJECTIONS, 'failures'] as const;
const HANDOFF_PROJECTIONS = [...FAILURE_PROJECTIONS, 'handoffs'] as const;
type StoreVersion = 2 | 3 | 4 | 5 | 6 | 7;
function projectionNames(version: StoreVersion) { return version === 7 ? HANDOFF_PROJECTIONS : version === 6 ? FAILURE_PROJECTIONS : version >= 4 ? QUESTION_PROJECTIONS : version === 3 ? ENGINE_PROJECTIONS : PROJECTIONS; }
const TABLES: Record<string, string> = {
  metadata: 'CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), database_id TEXT NOT NULL) STRICT',
  events: 'CREATE TABLE events (sequence INTEGER PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL CHECK(length(CAST(body AS BLOB))<=16384)) STRICT',
  ...Object.fromEntries(PROJECTIONS.map(name => [name, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`]))
};

function tables(version: StoreVersion): Record<string, string> {
  return version === 2 ? TABLES : { ...TABLES, sessions: 'CREATE TABLE sessions (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT',
    ...(version >= 4 ? { questions: 'CREATE TABLE questions (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT' } : {}),
    ...(version >= 6 ? { failures: 'CREATE TABLE failures (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT' } : {}),
    ...(version === 7 ? { handoffs: 'CREATE TABLE handoffs (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT' } : {}) };
}

function validateSchema(database: Database.Database, version: StoreVersion): void {
  requireCore(database.pragma('application_id', { simple: true }) === APPLICATION_ID
    && database.pragma('user_version', { simple: true }) === version, 'unsupported-mock-database');
  const schema = database.prepare("SELECT name,type,sql FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY name").all() as { name: string; type: string; sql: string }[];
  const expected = tables(version);
  requireCore(schema.length === Object.keys(expected).length
    && schema.every(row => row.type === 'table' && expected[row.name] === row.sql), 'unsupported-mock-schema');
  requireCore((database.prepare('SELECT count(*) AS count FROM sqlite_temp_schema').get() as { count: number }).count === 0, 'unexpected-temporary-schema');
  requireCore(database.pragma('integrity_check', { simple: true }) === 'ok', 'mock-integrity');
  const metadata = database.prepare('SELECT * FROM metadata').all() as { singleton: number; database_id: string }[];
  requireCore(metadata.length === 1 && metadata[0].singleton === 1 && UUID.test(metadata[0].database_id), 'mock-metadata');
}

function events(database: Database.Database): MockEvent[] {
  const rows = database.prepare('SELECT * FROM events ORDER BY sequence LIMIT ?').all(LIMIT + 1) as MockEvent[];
  requireCore(rows.length <= LIMIT, 'mock-history-limit');
  return rows;
}

function validated(database: Database.Database, version: StoreVersion): MockProjection {
  validateSchema(database, version);
  const rebuilt = replayMock(events(database), version);
  for (const name of projectionNames(version)) {
    const rows = database.prepare(`SELECT id,value FROM ${name} ORDER BY rowid LIMIT ?`).all(LIMIT + 1) as { id: string; value: string }[];
    const expected = (rebuilt[name] ?? []).map(([id, value]) => ({ id, value: JSON.stringify(value) }));
    requireCore(JSON.stringify(rows) === JSON.stringify(expected), 'mock-projection-drift');
  }
  return rebuilt;
}

/** Internal synthetic slice. Only returns claims; never executes an effect. */
export class MockEffectStore {
  #closed = false;
  readonly #root: RootIdentity;
  readonly #database: Database.Database;
  readonly #version: StoreVersion;
  readonly #interruptedAtOpen: Set<string>;
  private constructor(root: RootIdentity, database: Database.Database, version: StoreVersion, projection: MockProjection) {
    this.#root = root; this.#database = database; this.#version = version;
    this.#interruptedAtOpen = new Set((projection.sessions ?? []).flatMap(([id]) => interrupted(inboxContext(projection), id).map(row => row.taskId)));
  }

  static create(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true, 2); }
  static open(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false, 2); }
  static createEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true, 3); }
  static openEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false, 3); }
  static createQuestionEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true, 4); }
  static openQuestionEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false, 4); }
  static createMissionEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true, 5); }
  static openMissionEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false, 5); }
  static createFailureEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true, 6); }
  static openFailureEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false, 6); }
  static createHandoffEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true, 7); }
  static openHandoffEngine(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false, 7); }

  private static connect(directory: string, fresh: boolean, version: StoreVersion): MockEffectStore {
    const root = storageRoot(directory);
    if (fresh) reserveFreshDatabase(root);
    verifyRoot(root);
    const database = new Database(databasePath(root), { fileMustExist: true, timeout: 250 });
    try {
      configure(database);
      database.exec('BEGIN EXCLUSIVE');
      if (fresh) {
        for (const sql of Object.values(tables(version))) database.exec(sql);
        database.prepare('INSERT INTO metadata VALUES (1,?)').run(randomUUID());
        database.pragma('application_id=' + APPLICATION_ID);
        database.pragma('user_version=' + version);
      }
      const projection = validated(database, version);
      database.exec('COMMIT');
      requireCore(database.pragma(fresh ? 'journal_mode=WAL' : 'journal_mode', { simple: true }) === 'wal', 'mock-wal-required');
      verifyRoot(root);
      return new MockEffectStore(root, database, version, projection);
    } catch (fault) {
      if (database.inTransaction) database.exec('ROLLBACK');
      database.close(); throw fault;
    }
  }

  snapshot(): MockProjection {
    requireCore(!this.#closed, 'mock-store-closed');
    verifyRoot(this.#root);
    return validated(this.#database, this.#version);
  }

  owner(): EngineOwner {
    requireCore(this.#version >= 3, 'engine-root-required');
    this.snapshot();
    return Object.freeze({ createSession: (bytes: Uint8Array) => this.#createSession(bytes),
      observeFailure: (bytes: Uint8Array) => this.#observeFailure(bytes),
      failures: () => this.#failures('owner'),
      handoffs: () => this.#handoffs('owner'),
      stop: (bytes: Uint8Array) => this.#stopSession(bytes),
      recover: (bytes: Uint8Array) => this.#lifecycle(bytes, 'team.session.recover', 'owner'),
      answer: (bytes: Uint8Array) => this.#question(bytes, 'team.question.answer', 'owner'),
      questions: () => this.#questions('owner'),
      mission: () => this.#mission(),
      session: () => this.snapshot().sessions?.[0]?.[1] ?? null });
  }

  member(memberId: string): EngineMemberHandle {
    requireCore(this.#version >= 3 && typeof memberId === 'string' && UUID.test(memberId), 'invalid-engine-member');
    const context = () => {
      const session = this.snapshot().sessions?.[0]?.[1];
      const member = session?.members.find(row => row.memberId === memberId);
      requireCore(session && member, 'member-outside-session');
      return { ...member, sessionId: session.sessionId, role: memberId === session.leaderId ? 'leader' as const : 'member' as const };
    };
    context();
    return Object.freeze({ context,
      handoff: (bytes: Uint8Array) => { context(); return this.#handoff(bytes, memberId); },
      handoffs: () => { context(); return this.#handoffs(memberId); },
      failures: () => { context(); return this.#failures(memberId); },
      completeMission: (bytes: Uint8Array) => { context(); return this.#completeMission(bytes, memberId); },
      mission: () => { context(); return this.#mission()!; },
      enqueue: (bytes: Uint8Array) => { context(); return this.#inbox(bytes, 'team.task.enqueue', memberId); },
      report: (bytes: Uint8Array) => { context(); return this.#lifecycle(bytes, 'team.task.report', memberId); },
      ask: (bytes: Uint8Array) => { context(); return this.#question(bytes, 'team.question.ask', memberId); },
      escalate: (bytes: Uint8Array) => { context(); return this.#question(bytes, 'team.question.escalate', memberId); },
      answer: (bytes: Uint8Array) => { context(); return this.#question(bytes, 'team.question.answer', memberId); },
      questions: () => { context(); return this.#questions(memberId); },
      inbox: () => { context(); return this.#inboxes().find(row => row.memberId === memberId)!; } });
  }

  scheduler(): EngineScheduler {
    requireCore(this.#version >= 3, 'engine-root-required'); this.snapshot();
    return Object.freeze({ start: (bytes: Uint8Array) => this.#inbox(bytes, 'team.task.start', 'scheduler'),
      inboxes: () => this.#inboxes() });
  }

  #inboxes() {
    const projection = this.snapshot();
    return memberInboxes(projection.sessions?.[0]?.[1], (projection.assignments ?? []).map(([, row]) => row));
  }

  #inbox(bytes: Uint8Array, type: InboxCommand['type'], actor: string): 'accepted' | 'rejected' {
    const command = decodeInbox(bytes, type), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === inboxHash(command, actor), 'mock-command-conflict'); return previous[1].result;
    }
    const result = inboxDecision(command, actor, inboxContext(projection));
    this.append(type, { command, actor, result }); return result;
  }

  #createSession(bytes: Uint8Array): 'accepted' | 'rejected' {
    const command = decodeSession(bytes);
    const projection = this.snapshot(), previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === sessionHash(command), 'mock-command-conflict'); return previous[1].result;
    }
    const result = projection.sessions!.length === 0 ? 'accepted' : 'rejected';
    this.append('team.session.create', { command, actor: 'owner', result });
    return result;
  }

  #stopSession(bytes: Uint8Array): 'accepted' | 'rejected' {
    const command = decodeStop(bytes), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === stopHash(command), 'mock-command-conflict'); return previous[1].result;
    }
    const result = stopDecision(command, inboxContext(projection));
    this.append('team.session.stop', { command, actor: 'owner', result }); return result;
  }

  #lifecycle(bytes: Uint8Array, type: LifecycleCommand['type'], actor: string): 'accepted' | 'rejected' {
    const command = decodeLifecycle(bytes, type), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === lifecycleHash(command, actor), 'mock-command-conflict'); return previous[1].result;
    }
    const result = lifecycleDecision(command, actor, inboxContext(projection));
    this.append(type, { command, actor, result }); return result;
  }

  #question(bytes: Uint8Array, type: QuestionCommand['type'], actor: string): 'accepted' | 'rejected' {
    requireCore(this.#version >= 4, 'question-root-required');
    const command = decodeQuestion(bytes, type), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === questionHash(command, actor), 'mock-command-conflict'); return previous[1].result;
    }
    const result = questionDecision(command, actor, questionContext(projection));
    this.append(type, { command, actor, result }); return result;
  }

  #questions(actor: string) {
    requireCore(this.#version >= 4, 'question-root-required');
    const projection = this.snapshot();
    return visibleQuestions((projection.questions ?? []).map(([, row]) => row), actor, projection.sessions?.[0]?.[1].leaderId);
  }

  #guardQuestion(effect: MockEffect): void {
    requireCore(!questionOpen((this.snapshot().questions ?? []).map(([, row]) => row), effect.plan.taskId), 'question-blocked');
  }

  #observeFailure(bytes: Uint8Array): 'accepted' | 'rejected' {
    requireCore(this.#version >= 6, 'failure-root-required');
    const command = decodeFailure(bytes), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === failureHash(command), 'mock-command-conflict'); return previous[1].result;
    }
    const result = failureDecision(command, failureContext(projection));
    this.append(command.type, { command, actor: 'owner', result }); return result;
  }

  #failures(actor: string) {
    requireCore(this.#version >= 6, 'failure-root-required');
    const projection = this.snapshot();
    return visibleFailures((projection.failures ?? []).map(([, row]) => row), actor, projection.sessions?.[0]?.[1].leaderId);
  }

  #handoff(bytes: Uint8Array, actor: string): 'accepted' | 'rejected' {
    requireCore(this.#version === 7, 'handoff-root-required');
    const command = decodeHandoff(bytes), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === handoffHash(command, actor), 'mock-command-conflict'); return previous[1].result;
    }
    const result = handoffDecision(command, actor, handoffContext(projection));
    this.append(command.type, { command, actor, result }); return result;
  }

  #handoffs(actor: string) {
    requireCore(this.#version === 7, 'handoff-root-required');
    const projection = this.snapshot();
    return visibleHandoffs((projection.handoffs ?? []).map(([, row]) => row), actor, projection.sessions?.[0]?.[1].leaderId);
  }

  #completeMission(bytes: Uint8Array, actor: string): 'accepted' | 'rejected' {
    requireCore(this.#version >= 5, 'mission-root-required');
    const command = decodeMission(bytes), projection = this.snapshot();
    const previous = projection.commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === missionHash(command, actor), 'mock-command-conflict'); return previous[1].result;
    }
    const result = missionDecision(command, actor, { ...questionContext(projection),
      ...(this.#version === 7 ? { recovery: handoffContext(projection) } : {}) });
    this.append(command.type, { command, actor, result }); return result;
  }

  #mission() {
    requireCore(this.#version >= 5, 'mission-root-required');
    return missionView(this.snapshot().sessions?.[0]?.[1]);
  }

  execute(bytes: Uint8Array): Decision {
    const command = decodeCommand(bytes);
    const previous = this.snapshot().commands.find(([id]) => id === command.commandId);
    if (previous) {
      requireCore(previous[1].hash === commandHash(command), 'mock-command-conflict');
      return decisionFor(command, previous[1].result === 'rejected');
    }
    const result = this.append('task.create', command).commands.at(-1)![1].result;
    return decisionFor(command, result === 'rejected');
  }

  registry(): TaskRecord[] { return taskRegistry(this.snapshot(), events(this.#database)); }

  plan(candidate: unknown): 'accepted' | 'rejected' { return this.commitPlan(candidate, 'plan'); }

  planForTask(candidate: unknown): 'accepted' | 'rejected' { return this.commitPlan(candidate, 'task.plan'); }

  private commitPlan(candidate: unknown, type: 'plan' | 'task.plan'): 'accepted' | 'rejected' {
    const plan = validatePlan(candidate);
    const hash = type === 'plan' ? planHash(plan) : taskPlanHash(plan);
    const previous = this.snapshot().commands.find(([id]) => id === plan.commandId);
    if (previous) {
      requireCore(previous[1].hash === hash, 'mock-command-conflict');
      return previous[1].result;
    }
    return this.append(type, plan).commands.at(-1)![1].result;
  }

  approve(effectId: string, binding: string): void {
    const effect = this.effect(effectId);
    requireCore(effect.state === 'planned' && binding === approvalBinding(effect.plan), 'mock-approval-mismatch');
    if (this.snapshot().approvals.some(([id, stored]) => id === effectId && stored === binding)) return;
    this.#guardQuestion(effect);
    this.append('approve', { effectId, binding });
  }

  claim(effectId: string): Invocation | null {
    const effect = this.effect(effectId), observedAt = Date.now();
    requireCore(effect.state === 'planned', 'mock-already-claimed-or-stopped');
    this.#guardQuestion(effect);
    if (observedAt >= effect.plan.expiresAt) {
      this.append('stop', { effectId, reason: 'deadline', observedAt });
      return null;
    }
    this.append('claim', { effectId, observedAt });
    return invocation(effect.plan);
  }

  cancel(effectId: string): void {
    const effect = this.effect(effectId);
    if (effect.state === 'cancelled' || effect.state === 'needs_attention') return;
    requireCore(effect.state !== 'completed', 'mock-already-completed');
    this.#guardQuestion(effect);
    this.append('stop', { effectId, reason: 'cancel', observedAt: Date.now() });
  }

  settle(effectId: string, proofBytes: Uint8Array): void {
    const effect = this.effect(effectId), proof = normalizedProof(proofBytes);
    if (effect.state === 'completed') {
      requireCore(matchesWitness(effect.plan, proof), 'contradictory-completed-proof'); return;
    }
    if (effect.state === 'needs_attention') return;
    requireCore(effect.state === 'dispatching', 'mock-not-dispatching');
    this.#guardQuestion(effect);
    this.append('settle', { effectId, proof });
  }

  attention(effectId: string): Attention {
    const effect = this.effect(effectId);
    requireCore(effect.state === 'needs_attention', 'mock-not-in-attention');
    const derived = this.snapshot().attentionSequences?.find(([id]) => id === effectId)?.[1];
    if (derived !== undefined) return { effectId, attemptId: effect.plan.attemptId, attentionSequence: derived };
    const transition = events(this.#database).reverse().find(event => ['stop', 'settle'].includes(event.type)
      && (JSON.parse(event.body) as { effectId: string }).effectId === effectId);
    requireCore(transition, 'missing-attention-transition');
    return { effectId, attemptId: effect.plan.attemptId, attentionSequence: transition.sequence };
  }

  resolve(candidate: unknown, proofBytes?: Uint8Array): 'accepted' | 'rejected' {
    const request = validateResolution(candidate), proof = resolutionProof(request, proofBytes);
    const previous = this.snapshot().commands.find(([id]) => id === request.commandId);
    if (previous) {
      requireCore(previous[1].hash === resolutionHash(request, proof), 'mock-command-conflict');
      return previous[1].result;
    }
    return this.append('resolve', { request, proof }).commands.at(-1)![1].result;
  }

  private effect(id: string): MockEffect {
    const effect = this.snapshot().effects.find(([key]) => key === id)?.[1];
    requireCore(effect, 'unknown-mock-effect'); return effect;
  }

  private append(type: string, body: unknown): MockProjection {
    const current = this.snapshot();
    if (type !== 'team.session.stop' && type !== 'team.session.recover' && type !== 'team.task.failure') {
      const pending = (current.sessions ?? []).flatMap(([id]) => interrupted(inboxContext(current), id));
      requireCore(!pending.some(row => this.#interruptedAtOpen.has(row.taskId)), 'engine-recovery-required');
    }
    const history = events(this.#database);
    requireCore(history.length < LIMIT, 'mock-history-limit');
    const event = { sequence: history.length + 1, type, body: JSON.stringify(body) };
    const projection = replayMock([...history, event], this.#version);
    const sessionStopReserve = projection.sessions?.some(([, session]) => session.status === 'active') ? 1 : 0;
    requireCore(history.length + 1 + reservedEvents(projection) + sessionStopReserve <= LIMIT, 'mock-reserved-history-limit');
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      this.#database.prepare('INSERT INTO events VALUES (?,?,?)').run(event.sequence, event.type, event.body);
      for (const name of projectionNames(this.#version)) {
        this.#database.exec(`DELETE FROM ${name}`);
        const insert = this.#database.prepare(`INSERT INTO ${name} VALUES (?,?)`);
        for (const [id, value] of projection[name] ?? []) insert.run(id, JSON.stringify(value));
      }
      this.#database.exec('COMMIT'); return projection;
    } catch (fault) {
      if (this.#database.inTransaction) this.#database.exec('ROLLBACK');
      throw fault;
    }
  }

  close(): void { if (!this.#closed) { this.#closed = true; this.#database.close(); } }
}
