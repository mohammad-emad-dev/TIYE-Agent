'use strict';

function joinWrappedLines(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`row ${i} must be an object`);
    }
    if (typeof row.isWrapped !== 'boolean') {
      throw new TypeError(`row ${i}.isWrapped must be boolean`);
    }
    if (typeof row.text !== 'string') {
      throw new TypeError(`row ${i}.text must be a string`);
    }
    if (row.isWrapped) {
      if (out.length === 0) {
        throw new Error('row 0 isWrapped=true: missing prefix');
      }
      out[out.length - 1] += row.text;
    } else {
      out.push(row.text);
    }
  }
  return out;
}

module.exports = { joinWrappedLines };
