'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('../../core/node_modules/typescript');
const root=path.resolve(__dirname,'../src');
const common=new Set(['./types','./loop','./core-context','./core-report','./core-question','../../api-adapter/dist']);
for(const name of fs.readdirSync(root)) {
  assert(name.endsWith('.ts'));const source=ts.createSourceFile(name,fs.readFileSync(path.join(root,name),'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node){
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))if(node.moduleSpecifier){
      const target=node.moduleSpecifier.text;
      assert(common.has(target)||(target==='node:crypto'&&name==='loop.ts')
        ||(target==='../../core/dist'&&['core-context.ts','core-report.ts','core-question.ts'].includes(name)&&node.importClause?.isTypeOnly),'unapproved loop import');
    }
    if(ts.isCallExpression(node)||ts.isNewExpression(node))assert(node.expression.kind!==ts.SyntaxKind.ImportKeyword
      &&!['require','eval','Function','fetch','WebSocket','EventSource','setInterval'].includes(node.expression.getText(source)),'forbidden loader/execution');
    if(ts.isIdentifier(node))assert(!['process','global','globalThis','require','eval','Function','fetch','WebSocket','EventSource'].includes(node.text),'forbidden global');
    if(ts.isPropertyAccessExpression(node)) {
      if(['snapshot','member','context'].includes(node.name.text))assert(['core-context.ts','core-report.ts','core-question.ts'].includes(name),'core capability outside bridge');
      const nativePromise=node.name.text==='resolve'&&node.expression.getText(source)==='Promise';
      const reportWriter=name==='core-report.ts'&&node.name.text==='report'&&node.expression.getText(source)==='handle';
      const questionWriter=name==='core-question.ts'&&node.name.text==='ask'&&node.expression.getText(source)==='handle';
      assert(nativePromise||reportWriter||questionWriter||!['owner','scheduler','execute','approve','claim','settle','resolve','report','ask','enqueue','completeMission','handoff','recover','observeFailure','cancel','answer','escalate'].includes(node.name.text),'core writer forbidden: '+node.getText(source));
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
}
console.log('Loop boundary: fixed adapter/crypto only; core type/read capability confined to bridge; report/ask writers confined to separate bridges; no other writers/network/files/processes');
