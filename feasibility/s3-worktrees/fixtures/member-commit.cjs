'use strict';
const { spawnSync } = require('node:child_process');
const [file, session] = process.argv.slice(2);
if (!/^member-[ab]\.txt$/.test(file) || !/^[a-zA-Z0-9-]{1,80}$/.test(session)) process.exit(2);
for (const args of [['add', '--', file], ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture child edit', '--trailer', 'Tiye-Session: ' + session]]) {
  const result = spawnSync('git', args, { windowsHide: true, stdio: 'ignore', timeout: 20000 });
  if (result.error || result.status !== 0) process.exit(1);
}
