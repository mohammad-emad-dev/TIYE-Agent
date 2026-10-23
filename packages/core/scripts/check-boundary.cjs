'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const allowed = new Set(['node:crypto', 'node:fs', 'node:path', 'better-sqlite3/win32-x64']);
for (const name of fs.readdirSync(path.join(root, 'src')).filter(name => name.endsWith('.ts'))) {
  const source = ts.createSourceFile(name, fs.readFileSync(path.join(root, 'src', name), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const target = node.moduleSpecifier.text;
      const typeOnly = node.importClause?.isTypeOnly || name.endsWith('.d.ts');
      assert(target.startsWith('./') || allowed.has(target) || (typeOnly && target === 'better-sqlite3'), 'unapproved core import: ' + target);
    }
    if (ts.isCallExpression(node)) {
      assert(node.expression.kind !== ts.SyntaxKind.ImportKeyword, 'dynamic import forbidden');
      assert(!['require', 'eval', 'Function'].includes(node.expression.getText(source)), 'dynamic loader forbidden');
    }
    if (ts.isPropertyAccessExpression(node)) {
      assert(!['loadExtension', 'unsafeMode', 'backup', 'serialize'].includes(node.name.text), 'unapproved SQLite surface');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const native = path.join(root, 'node_modules/better-sqlite3/prebuilds/win32-x64.node');
assert(fs.statSync(native).isFile(), 'required reviewed prebuild absent');
console.log('Core import boundary checked; fixed Windows prebuild present; no OS sandbox claim');
