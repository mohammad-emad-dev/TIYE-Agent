import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireCore } from './command';

export const DATABASE_FILE = 'core.sqlite';
const FILES = new Set([DATABASE_FILE, DATABASE_FILE + '-wal', DATABASE_FILE + '-shm', DATABASE_FILE + '-journal']);

export interface RootIdentity { readonly path: string; readonly device: bigint; readonly inode: bigint }

/** The trusted coordinator must establish the current-user private DACL first. */
export function storageRoot(directory: string): RootIdentity {
  requireCore(process.platform === 'win32' && process.arch === 'x64', 'unqualified-core-platform');
  requireCore(process.version === 'v26.7.0', 'unqualified-node-runtime');
  requireCore(/^[A-Za-z]:\\/.test(directory), 'local-drive-root-required');
  requireCore(path.isAbsolute(directory) && directory === path.resolve(directory), 'absolute-root-required');
  let ancestor = directory;
  while (true) {
    const metadata = fs.lstatSync(ancestor, { bigint: true });
    requireCore(metadata.isDirectory() && !metadata.isSymbolicLink(), 'root-link-or-nondirectory');
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const metadata = fs.lstatSync(directory, { bigint: true });
  return Object.freeze({ path: directory, device: metadata.dev, inode: metadata.ino });
}

export function verifyRoot(root: RootIdentity): void {
  const current = storageRoot(root.path);
  requireCore(current.device === root.device && current.inode === root.inode, 'root-identity-drift');
  for (const name of fs.readdirSync(root.path)) {
    requireCore(FILES.has(name), 'unexpected-storage-file');
    const metadata = fs.lstatSync(path.join(root.path, name), { bigint: true });
    requireCore(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1n, 'unsafe-storage-file');
  }
}

export function databasePath(root: RootIdentity): string { return path.join(root.path, DATABASE_FILE); }

export function reserveFreshDatabase(root: RootIdentity): void {
  verifyRoot(root);
  requireCore(fs.readdirSync(root.path).length === 0, 'fresh-root-not-empty');
  const descriptor = fs.openSync(databasePath(root), 'wx', 0o600);
  fs.closeSync(descriptor);
}
