'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const key = value => path.normalize(value).toLowerCase();
function nativeGit(args) {
  const result=spawnSync('git',args,{windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:16000});
  if(result.error||result.status!==0)throw new Error('fixture Git read failed');
  return result.stdout.trim();
}
try {
  const task=JSON.parse(fs.readFileSync('attribution-task.json'));
  if(!/^[a-f0-9-]{36}$/.test(task.taskId)||typeof task.content!=='string')throw new Error('fixture task invalid');
  const directoryMatched=key(fs.realpathSync(process.cwd()))===key(task.worktree)
    && key(fs.realpathSync(nativeGit(['rev-parse','--path-format=absolute','--git-common-dir'])))===key(task.commonGit);
  const author=nativeGit(['var','GIT_AUTHOR_IDENT']),committer=nativeGit(['var','GIT_COMMITTER_IDENT']);
  const authorMatched=author.startsWith(task.memberName+' <'+task.memberId+'@tiye.local> ');
  const committerMatched=committer.startsWith('TIYE Fixture Engine <engine@tiye.local> ');
  if(!directoryMatched||!authorMatched||!committerMatched)throw new Error('fixture attribution mismatch');
  const observation={taskId:task.taskId,directoryMatched,authorMatched,committerMatched,
    workerSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
  fs.writeFileSync('member-a.txt',task.content);
  fs.writeFileSync('attribution-observation.json',JSON.stringify(observation)+'\n',{flag:'wx'});
  console.log(JSON.stringify(observation));
}catch{console.error('fixture attribution task refused');process.exitCode=1;}
