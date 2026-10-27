'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('../core/node_modules/typescript');
const workerImports = {
  'worker.cjs':['node:crypto','../core/dist/command','./protocol.cjs','./target.cjs'],
  'protocol.cjs':['../core/dist/record','../core/dist/command'],
  'target.cjs':['../core/node_modules/better-sqlite3/lib/win32-x64.js','../core/dist/storage','../core/dist/store','../core/dist/command']
};
for(const name of ['worker.cjs','protocol.cjs','target.cjs','controller.cjs','owned-worker.cjs','witness.cjs']) {
  const text=fs.readFileSync(path.join(__dirname,name),'utf8');
  const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function visit(node) {
    if(ts.isCallExpression(node)) {
      assert(!['eval','Function'].includes(node.expression.getText(source)),'dynamic code forbidden');
      assert(node.expression.kind!==ts.SyntaxKind.ImportKeyword,'dynamic import forbidden');
      if(node.expression.getText(source)==='require') {
        assert(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]),'nonliteral require');
        const target=node.arguments[0].text;
        if(workerImports[name]) assert(workerImports[name].includes(target),'unapproved worker graph import: '+target);
        if(target==='node:child_process')assert(['owned-worker.cjs','witness.cjs'].includes(name),'unapproved process reachability');
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  assert(!text.includes('shell: true')&&!text.includes('detached: true'),'unexpected process options');
}
console.log('Mock-team fixed worker import graph checked; core process boundary unchanged; no OS sandbox claim');
