'use strict';
const fs = require('node:fs');
const [name, content] = process.argv.slice(2);
if (!['member-a.txt', 'member-b.txt', 'shared.txt'].includes(name) || !/^[a-z -]{1,60}$/.test(content || '')) throw new Error('fixture write selection invalid');
fs.writeFileSync(name, content + '\n');
