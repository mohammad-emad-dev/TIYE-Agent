import Database from 'better-sqlite3/win32-x64';
import { randomUUID } from 'node:crypto';
import { commandHash, CreateTask, decodeCommand, requireCore } from './command';
import { Decision, decisionFor, EventRow, eventFor, Projection, replay } from './replay';
import { initialize, validateSchema } from './schema';
import { databasePath, reserveFreshDatabase, RootIdentity, storageRoot, verifyRoot } from './storage';

const MAX_EVENTS = 10000;

function configure(database: Database.Database): void {
  database.pragma('foreign_keys=ON');
  database.pragma('synchronous=FULL');
  database.pragma('temp_store=MEMORY');
  database.pragma('trusted_schema=OFF');
  requireCore(database.pragma('locking_mode=EXCLUSIVE', { simple: true }) === 'exclusive', 'exclusive-mode-unavailable');
}

function storedDecision(encoded: string): Decision {
  const decision = JSON.parse(encoded) as Decision;
  requireCore(JSON.stringify(decision) === encoded, 'noncanonical-command-result');
  return decision;
}

function storedProjection(database: Database.Database): Projection {
  const commands = database.prepare('SELECT command_id,payload_hash,version,result FROM commands ORDER BY rowid LIMIT ?').all(MAX_EVENTS + 1) as { command_id: string; payload_hash: string; version: 1; result: string }[];
  const tasks = database.prepare('SELECT task_id,title,status,last_sequence FROM tasks ORDER BY rowid LIMIT ?').all(MAX_EVENTS + 1) as { task_id: string; title: string; status: 'created'; last_sequence: number }[];
  requireCore(commands.length <= MAX_EVENTS && tasks.length <= MAX_EVENTS, 'projection-row-limit');
  return { commands: commands.map(row => ({ commandId: row.command_id, payloadHash: row.payload_hash, version: row.version, result: storedDecision(row.result) })),
    tasks: tasks.map(row => ({ taskId: row.task_id, title: row.title, status: row.status, lastSequence: row.last_sequence })), eventCount: commands.length };
}

function validatedProjection(database: Database.Database): Projection {
  validateSchema(database);
  const rows = database.prepare('SELECT * FROM events ORDER BY sequence LIMIT ?').all(MAX_EVENTS + 1) as EventRow[];
  requireCore(rows.length <= MAX_EVENTS, 'internal-event-limit');
  const rebuilt = replay(rows);
  requireCore(JSON.stringify(rebuilt) === JSON.stringify(storedProjection(database)), 'projection-or-command-drift');
  return rebuilt;
}

export class CoreStore {
  readonly #database: Database.Database;
  readonly #root: RootIdentity;
  #closed = false;

  private constructor(root: RootIdentity, database: Database.Database) {
    this.#root = root;
    this.#database = database;
  }

  static create(directory: string): CoreStore {
    const root = storageRoot(directory);
    reserveFreshDatabase(root);
    const database = CoreStore.connection(root);
    try {
      initialize(database, randomUUID());
      requireCore(database.pragma('journal_mode=WAL', { simple: true }) === 'wal', 'wal-unavailable');
      return CoreStore.verified(root, database);
    } catch (fault) { database.close(); throw fault; }
  }

  static open(directory: string): CoreStore {
    const root = storageRoot(directory);
    verifyRoot(root);
    const database = CoreStore.connection(root);
    try {
      CoreStore.claim(database);
      requireCore(database.pragma('journal_mode', { simple: true }) === 'wal', 'existing-database-not-wal');
      return CoreStore.verified(root, database);
    } catch (fault) { database.close(); throw fault; }
  }

  private static connection(root: RootIdentity): Database.Database {
    const database = new Database(databasePath(root), { fileMustExist: true, timeout: 250 });
    try {
      configure(database);
      return database;
    } catch (fault) {
      database.close();
      throw fault;
    }
  }

  private static verified(root: RootIdentity, database: Database.Database): CoreStore {
    validatedProjection(database);
    verifyRoot(root);
    return new CoreStore(root, database);
  }

  private static claim(database: Database.Database): void {
    database.exec('BEGIN EXCLUSIVE');
    try { validateSchema(database); database.exec('COMMIT'); }
    catch (fault) { if (database.inTransaction) database.exec('ROLLBACK'); throw fault; }
  }

  snapshot(): Projection {
    requireCore(!this.#closed, 'core-closed');
    verifyRoot(this.#root);
    return validatedProjection(this.#database);
  }

  execute(bytes: Uint8Array): Decision {
    const command = decodeCommand(bytes);
    const projection = this.snapshot();
    const previous = projection.commands.find(row => row.commandId === command.commandId);
    if (previous) {
      requireCore(previous.payloadHash === commandHash(command), 'command-id-payload-conflict');
      return previous.result;
    }
    requireCore(projection.eventCount < MAX_EVENTS, 'internal-event-limit');
    return this.commitCommand(command, projection);
  }

  private commitCommand(command: CreateTask, projection: Projection): Decision {
    const decision = decisionFor(command, projection.tasks.some(task => task.taskId === command.taskId));
    const sequence = projection.eventCount + 1;
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      this.writeDecision(command, decision, sequence);
      this.#database.exec('COMMIT');
      return decision;
    } catch (fault) {
      if (this.#database.inTransaction) this.#database.exec('ROLLBACK');
      throw fault;
    }
  }

  private writeDecision(command: CreateTask, decision: Decision, sequence: number): void {
    this.#database.prepare('INSERT INTO commands VALUES (?,?,1,?)').run(command.commandId, commandHash(command), JSON.stringify(decision));
    this.#database.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(sequence, command.commandId + ':0',
      decision.status === 'accepted' ? 'task.created' : 'command.rejected', 1, command.commandId, command.taskId, eventFor(command, decision));
    if (decision.status === 'accepted') this.#database.prepare("INSERT INTO tasks VALUES (?,?,'created',?)").run(command.taskId, command.title, sequence);
  }

  close(): void {
    if (!this.#closed) { this.#closed = true; this.#database.close(); }
  }
}
