'use strict';
const fs = require('node:fs');
const path = require('node:path');
const key = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);

function unlinkOwnedDependencyLink({ lifecycle, borrower, donor }) {
  lifecycle.validate(borrower); lifecycle.validate(donor);
  if (key(path.resolve(borrower)) === key(path.resolve(donor))) throw new Error('dependency link requires distinct worktrees');
  const link = path.join(borrower, 'node_modules'), target = path.join(donor, 'node_modules');
  if (!fs.lstatSync(link).isSymbolicLink() || fs.lstatSync(target).isSymbolicLink() || !fs.lstatSync(target).isDirectory()
    || key(fs.realpathSync(link)) !== key(fs.realpathSync(target))
    || key(path.dirname(fs.realpathSync(target))) !== key(fs.realpathSync(donor))) throw new Error('owned dependency link target unverified');
  // Unlink this exact junction, never recursively traverse it or delete its donor.
  fs.unlinkSync(link);
  if (fs.existsSync(link) || !fs.existsSync(target)) throw new Error('dependency link removal unverified');
}

module.exports = { unlinkOwnedDependencyLink };
