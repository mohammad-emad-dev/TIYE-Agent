'use strict';
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

function attributionEnvironment({ memberId, memberName, sessionId }, inherited = process.env) {
  if (typeof memberId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(memberId) || typeof memberName !== 'string'
    || !memberName.trim() || memberName.length > 80 || /[\x00-\x1f\x7f<>]/.test(memberName)
    || typeof sessionId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(sessionId)) throw new Error('invalid attribution identity');
  const env = Object.fromEntries(Object.entries(inherited).filter(([name]) => !/^GIT_/i.test(name)));
  return { ...env, GIT_AUTHOR_NAME: memberName, GIT_AUTHOR_EMAIL: memberId + '@tiye.local',
    GIT_COMMITTER_NAME: 'TIYE Fixture Engine', GIT_COMMITTER_EMAIL: 'engine@tiye.local',
    GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' };
}

function attributionGit(directory, args, identity, input) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd: directory, env: attributionEnvironment(identity), input, windowsHide: true,
    encoding: 'utf8', timeout: 20000, maxBuffer: 128000 });
  if (result.error || result.status !== 0) throw new Error('attribution Git operation failed');
  return result.stdout;
}

function readCommit(directory, commitId, identity) {
  if (!/^[a-f0-9]{40}$/.test(commitId)) throw new Error('invalid fixture commit ID');
  const fields = attributionGit(directory, ['show', '--no-patch', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%P%x00%B', commitId], identity).trimEnd().split('\0');
  if (fields.length !== 7 || fields[0] !== commitId) throw new Error('commit metadata unverified');
  const [id, authorName, authorEmail, committerName, committerEmail, parentText, message] = fields;
  const trailerText = attributionGit(directory, ['-c', 'trailer.separators=:', 'interpret-trailers', '--parse'], identity, message + '\n');
  const sessions = trailerText.split(/\r?\n/).filter(line => /^Tiye-Session\s*:/i.test(line)).map(line => line.slice(line.indexOf(':') + 1).trim());
  const rawSessionLines = message.split(/\r?\n/).filter(line => /^Tiye-Session\s*:/i.test(line)).length;
  return { id, authorName, authorEmail, committerName, committerEmail, parents: parentText.split(' ').filter(Boolean), sessions,
    rawSessionLines, messageSha256: crypto.createHash('sha256').update(message).digest('hex') };
}

function commitMatches(commit, identity) {
  attributionEnvironment(identity, {});
  return Boolean(commit && /^[a-f0-9]{40}$/.test(commit.id) && commit.authorName === identity.memberName
    && commit.authorEmail === identity.memberId + '@tiye.local' && commit.committerName === 'TIYE Fixture Engine'
    && commit.committerEmail === 'engine@tiye.local' && Array.isArray(commit.sessions)
    && commit.sessions.length === 1 && commit.rawSessionLines === 1 && commit.sessions[0] === identity.sessionId);
}

module.exports = { attributionEnvironment, attributionGit, readCommit, commitMatches };
