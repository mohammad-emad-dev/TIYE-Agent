'use strict';

function acpFailure(category, rpcCode) {
  const failure = new Error(category);
  failure.name = 'AcpFailure';
  failure.category = category;
  if (Number.isInteger(rpcCode)) failure.rpcCode = rpcCode;
  return failure;
}

module.exports = { acpFailure };
