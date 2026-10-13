'use strict';
const path = require('node:path');

function sameSession(before, after, cwd) {
  return before.id === after.id && before.time.created === after.time.created && before.agent === after.agent
    && JSON.stringify(before.model) === JSON.stringify(after.model) && JSON.stringify(before.permissions) === JSON.stringify(after.permissions)
    && path.resolve(after.location.directory).toLowerCase() === path.resolve(cwd).toLowerCase();
}

module.exports = { sameSession };
