'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createWorktreeLifecycle}=require('../scripts/worktree-lifecycle');
const {initialize,cleanupArtifacts}=require('../scripts/run-basics');
const {unlinkOwnedDependencyLink}=require('../scripts/dependency-link');

test('owned junction unlink refuses a foreign target and preserves donor bytes',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-link-test-'));
  const root=path.join(base,'root'),slots=path.join(base,'slots'),foreign=path.join(base,'foreign');
  fs.mkdirSync(root);fs.mkdirSync(slots);fs.mkdirSync(foreign);initialize(root,slots);
  const lifecycle=createWorktreeLifecycle({repository:root,base:slots});
  const donor=lifecycle.create({name:'donor',branch:'codex/test-donor'}),borrower=lifecycle.create({name:'borrower',branch:'codex/test-borrower'});
  const modules=path.join(donor,'node_modules'),link=path.join(borrower,'node_modules');
  fs.mkdirSync(modules);fs.writeFileSync(path.join(modules,'canary.txt'),'donor bytes\n');fs.writeFileSync(path.join(foreign,'canary.txt'),'foreign bytes\n');
  try {
    fs.symlinkSync(foreign,link,'junction');
    assert.throws(()=>unlinkOwnedDependencyLink({lifecycle,borrower,donor}));
    assert.equal(fs.lstatSync(link).isSymbolicLink(),true);assert.equal(fs.readFileSync(path.join(foreign,'canary.txt'),'utf8'),'foreign bytes\n');
    if(fs.realpathSync(link)!==fs.realpathSync(foreign))throw new Error('test foreign link identity changed');
    fs.unlinkSync(link);
    fs.symlinkSync(modules,link,'junction');unlinkOwnedDependencyLink({lifecycle,borrower,donor});
    assert.equal(fs.existsSync(link),false);assert.equal(fs.readFileSync(path.join(modules,'canary.txt'),'utf8'),'donor bytes\n');
  } finally {
    if(fs.lstatSync(link,{throwIfNoEntry:false})?.isSymbolicLink()) {
      lifecycle.validate(borrower);
      if(![fs.realpathSync(foreign),fs.realpathSync(modules)].includes(fs.realpathSync(link)))throw new Error('test link cleanup unverified');
      fs.unlinkSync(link);
    }
    for(const directory of [borrower,donor]){cleanupArtifacts(lifecycle,directory);lifecycle.remove(directory);}
    const resolved=fs.realpathSync(base);
    if(path.dirname(resolved).toLowerCase()!==fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tiye-s3-link-test-') || lifecycle.registry().length!==1)throw new Error('test temp cleanup unverified');
    fs.rmSync(resolved,{recursive:true});
  }
});
