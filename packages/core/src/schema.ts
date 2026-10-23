import type Database from 'better-sqlite3';
import { requireCore, UUID } from './command';

export const APPLICATION_ID = 0x54495945;
export const TABLES: Record<string, string> = {
  metadata: 'CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL CHECK(schema_version=1), database_id TEXT NOT NULL) STRICT',
  commands: 'CREATE TABLE commands (command_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, version INTEGER NOT NULL CHECK(version=1), result TEXT NOT NULL CHECK(length(CAST(result AS BLOB))<=16384)) STRICT',
  events: 'CREATE TABLE events (sequence INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, version INTEGER NOT NULL, command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id), task_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(CAST(body AS BLOB))<=16384)) STRICT',
  tasks: 'CREATE TABLE tasks (task_id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL CHECK(status=\'created\'), last_sequence INTEGER NOT NULL REFERENCES events(sequence)) STRICT'
};

export function initialize(database: Database.Database, databaseId: string): void {
  database.exec('BEGIN EXCLUSIVE');
  try {
    for (const sql of Object.values(TABLES)) database.exec(sql);
    database.prepare('INSERT INTO metadata VALUES (1,1,?)').run(databaseId);
    database.pragma('application_id=' + APPLICATION_ID);
    database.pragma('user_version=1');
    database.exec('COMMIT');
  } catch (fault) {
    if (database.inTransaction) database.exec('ROLLBACK');
    throw fault;
  }
}

export function validateSchema(database: Database.Database): string {
  requireCore(database.pragma('application_id', { simple: true }) === APPLICATION_ID
    && database.pragma('user_version', { simple: true }) === 1, 'unsupported-database');
  const schema = database.prepare("SELECT name,sql,type FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' ORDER BY name").all() as { name: string; sql: string; type: string }[];
  requireCore(schema.length === 4 && schema.every(row => row.type === 'table' && TABLES[row.name] === row.sql), 'unsupported-schema');
  requireCore((database.prepare('SELECT count(*) AS count FROM sqlite_temp_schema').get() as { count: number }).count === 0, 'unexpected-temporary-schema');
  requireCore(database.pragma('integrity_check', { simple: true }) === 'ok'
    && (database.pragma('foreign_key_check') as unknown[]).length === 0, 'database-integrity-failure');
  const metadata = database.prepare('SELECT * FROM metadata').all() as { singleton: number; schema_version: number; database_id: string }[];
  requireCore(metadata.length === 1 && metadata[0].singleton === 1 && metadata[0].schema_version === 1
    && UUID.test(metadata[0].database_id), 'database-metadata');
  return metadata[0].database_id;
}
