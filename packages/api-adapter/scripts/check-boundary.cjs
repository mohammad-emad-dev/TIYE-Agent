'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('../../core/node_modules/typescript');
const root=path.resolve(__dirname,'../src');
const allowed=new Set(['./types','./validation','./protocol','./scripted','./adapter']);
for(const name of fs.readdirSync(root)) {
  assert(name.endsWith('.ts'),'unexpected runtime source');
  const source=ts.createSourceFile(name,fs.readFileSync(path.join(root,name),'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node) {
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) {
      if(node.moduleSpecifier)assert(allowed.has(node.moduleSpecifier.text),'forbidden runtime import');
    }
    if(ts.isCallExpression(node)||ts.isNewExpression(node)) {
      const expression=node.expression;
      assert(expression.kind!==ts.SyntaxKind.ImportKeyword,'dynamic import');
      assert(!['require','eval','Function','fetch','WebSocket','EventSource','setInterval'].includes(expression.getText(source)),'forbidden execution surface');
    }
    if(ts.isIdentifier(node)&&['global','globalThis','require','eval','Function','fetch','WebSocket','EventSource'].includes(node.text))assert.fail('forbidden global');
    if(ts.isIdentifier(node)&&node.text==='process') {
      assert(ts.isPropertyAccessExpression(node.parent),'process alias');
      const property=node.parent.getText(source);
      assert(['process.version','process.platform','process.arch','process.versions'].includes(property),'forbidden process access');
      if(property==='process.versions')assert(ts.isPropertyAccessExpression(node.parent.parent)&&node.parent.parent.name.text==='modules','versions alias');
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
}
console.log('API adapter boundary: relative fixed modules only; no network, credentials, filesystem, processes or dynamic loaders');
