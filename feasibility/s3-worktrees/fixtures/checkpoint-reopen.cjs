'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {git}=require('../scripts/worktree-lifecycle');
const {createGitCheckpoints}=require('../scripts/git-checkpoints');
const job=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
function validate(){
  if(fs.lstatSync(job.member).isSymbolicLink()||fs.realpathSync(job.member)!==job.member||path.dirname(job.member)!==job.base
    ||fs.lstatSync(job.root).isSymbolicLink()||fs.lstatSync(job.base).isSymbolicLink()||fs.realpathSync(job.root)!==job.root||fs.realpathSync(job.base)!==job.base
    ||git(job.member,['rev-parse','--show-toplevel']).output.replace(/\\/g,'/').toLowerCase()!==job.member.replace(/\\/g,'/').toLowerCase()
    ||fs.realpathSync(git(job.member,['rev-parse','--path-format=absolute','--git-common-dir']).output)!==path.join(job.root,'.git')
    ||git(job.member,['symbolic-ref','HEAD']).output!==job.branch)throw new Error('fresh process fixture ownership mismatch');
  const entries=git(job.root,['worktree','list','--porcelain','-z']).output.split('\0\0').filter(Boolean).map(item=>item.split('\0'));
  const matches=entries.filter(fields=>fields.includes('worktree '+job.member.replace(/\\/g,'/')));
  if(matches.length!==1||!matches[0].includes('branch '+job.branch)||matches[0].some(field=>field.startsWith('locked')))throw new Error('fresh process registry mismatch');
}
try{
  const checkpoints=createGitCheckpoints({member:job.member,validate,storeDirectory:job.store});
  const saved=checkpoints.load(job.session,job.sequence,job.commit),plan=checkpoints.prepare(saved,'member-a.txt');
  const outcome=checkpoints.restore(checkpoints.approve(plan),job.sequence+1);
  if(!outcome.restored)throw new Error('fresh process restore refused');
  const safety=checkpoints.load(job.session,job.sequence+1,outcome.safety.commit);
  console.log(JSON.stringify({pid:process.pid,nonce:job.nonce,restored:true,safety:outcome.safety,
    restoredHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(job.member,'member-a.txt'))).digest('hex'),
    checkpointFiles:saved.files,safetyFiles:safety.files}));
}catch{console.error('fresh process checkpoint recovery failed');process.exitCode=2;}
