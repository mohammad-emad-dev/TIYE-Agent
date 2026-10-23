import Database from 'better-sqlite3/win32-x64';
import { randomUUID } from 'node:crypto';
import { requireCore, UUID } from './command';
import { approvalBinding, Attention, Invocation, invocation, matchesWitness, MockEffect, MockEvent, MockProjection,
  normalizedProof, planHash, replayMock, reservedEvents, resolutionHash, resolutionProof, validatePlan, validateResolution } from './effects-model';
import { configure } from './store';
import { databasePath, reserveFreshDatabase, RootIdentity, storageRoot, verifyRoot } from './storage';

const LIMIT = 1000;
const APPLICATION_ID = 0x54495946;
const PROJECTIONS = ['commands', 'tasks', 'effects', 'approvals'] as const;
const TABLES: Record<string, string> = {
  metadata: 'CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), database_id TEXT NOT NULL) STRICT',
  events: 'CREATE TABLE events (sequence INTEGER PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL CHECK(length(CAST(body AS BLOB))<=16384)) STRICT',
  ...Object.fromEntries(PROJECTIONS.map(name => [name, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`]))
};

function validateSchema(database: Database.Database): void {
  requireCore(database.pragma('application_id', { simple: true }) === APPLICATION_ID
    && database.pragma('user_version', { simple: true }) === 2, 'unsupported-mock-database');
  const schema = database.prepare("SELECT name,type,sql FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY name").all() as { name: string; type: string; sql: string }[];
  requireCore(schema.length === Object.keys(TABLES).length
    && schema.every(row => row.type === 'table' && TABLES[row.name] === row.sql), 'unsupported-mock-schema');
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

function validated(database: Database.Database): MockProjection {
  validateSchema(database);
  const rebuilt = replayMock(events(database));
  for (const name of PROJECTIONS) {
    const rows = database.prepare(`SELECT id,value FROM ${name} ORDER BY rowid LIMIT ?`).all(LIMIT + 1) as { id: string; value: string }[];
    const expected = rebuilt[name].map(([id, value]) => ({ id, value: JSON.stringify(value) }));
    requireCore(JSON.stringify(rows) === JSON.stringify(expected), 'mock-projection-drift');
  }
  return rebuilt;
}

/** Internal synthetic slice. Only returns claims; never executes an effect. */
export class MockEffectStore {
  #closed = false;
  readonly #root: RootIdentity;
  readonly #database: Database.Database;
  private constructor(root: RootIdentity, database: Database.Database) { this.#root = root; this.#database = database; }

  static create(directory: string): MockEffectStore { return MockEffectStore.connect(directory, true); }
  static open(directory: string): MockEffectStore { return MockEffectStore.connect(directory, false); }

  private static connect(directory: string, fresh: boolean): MockEffectStore {
    const root = storageRoot(directory);
    if (fresh) reserveFreshDatabase(root);
    verifyRoot(root);
    const database = new Database(databasePath(root), { fileMustExist: true, timeout: 250 });
    try {
      configure(database);
      database.exec('BEGIN EXCLUSIVE');
      if (fresh) {
        for (const sql of Object.values(TABLES)) database.exec(sql);
        database.prepare('INSERT INTO metadata VALUES (1,?)').run(randomUUID());
        database.pragma('application_id=' + APPLICATION_ID);
        database.pragma('user_version=2');
      }
      validated(database);
      database.exec('COMMIT');
      requireCore(database.pragma(fresh ? 'journal_mode=WAL' : 'journal_mode', { simple: true }) === 'wal', 'mock-wal-required');
      verifyRoot(root);
      return new MockEffectStore(root, database);
    } catch (fault) {
      if (database.inTransaction) database.exec('ROLLBACK');
      database.close(); throw fault;
    }
  }

  snapshot(): MockProjection {
    requireCore(!this.#closed, 'mock-store-closed');
    verifyRoot(this.#root);
    return validated(this.#database);
  }

  plan(candidate: unknown): 'accepted' | 'rejected' {
    const plan = validatePlan(candidate);
    const previous = this.snapshot().commands.find(([id]) => id === plan.commandId);
    if (previous) {
      requireCore(previous[1].hash === planHash(plan), 'mock-command-conflict');
      return previous[1].result;
    }
    return this.append('plan', plan).commands.at(-1)![1].result;
  }

  approve(effectId: string, binding: string): void {
    const effect = this.effect(effectId);
    requireCore(effect.state === 'planned' && binding === approvalBinding(effect.plan), 'mock-approval-mismatch');
    if (this.snapshot().approvals.some(([id, stored]) => id === effectId && stored === binding)) return;
    this.append('approve', { effectId, binding });
  }

  claim(effectId: string): Invocation | null {
    const effect = this.effect(effectId), observedAt = Date.now();
    requireCore(effect.state === 'planned', 'mock-already-claimed-or-stopped');
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
    this.append('stop', { effectId, reason: 'cancel', observedAt: Date.now() });
  }

  settle(effectId: string, proofBytes: Uint8Array): void {
    const effect = this.effect(effectId), proof = normalizedProof(proofBytes);
    if (effect.state === 'completed') {
      requireCore(matchesWitness(effect.plan, proof), 'contradictory-completed-proof'); return;
    }
    if (effect.state === 'needs_attention') return;
    requireCore(effect.state === 'dispatching', 'mock-not-dispatching');
    this.append('settle', { effectId, proof });
  }

  attention(effectId: string): Attention {
    const effect = this.effect(effectId);
    requireCore(effect.state === 'needs_attention', 'mock-not-in-attention');
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
    this.snapshot();
    const history = events(this.#database);
    requireCore(history.length < LIMIT, 'mock-history-limit');
    const event = { sequence: history.length + 1, type, body: JSON.stringify(body) };
    const projection = replayMock([...history, event]);
    requireCore(history.length + 1 + reservedEvents(projection) <= LIMIT, 'mock-reserved-history-limit');
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      this.#database.prepare('INSERT INTO events VALUES (?,?,?)').run(event.sequence, event.type, event.body);
      for (const name of PROJECTIONS) {
        this.#database.exec(`DELETE FROM ${name}`);
        const insert = this.#database.prepare(`INSERT INTO ${name} VALUES (?,?)`);
        for (const [id, value] of projection[name]) insert.run(id, JSON.stringify(value));
      }
      this.#database.exec('COMMIT'); return projection;
    } catch (fault) {
      if (this.#database.inTransaction) this.#database.exec('ROLLBACK');
      throw fault;
    }
  }

  close(): void { if (!this.#closed) { this.#closed = true; this.#database.close(); } }
}
