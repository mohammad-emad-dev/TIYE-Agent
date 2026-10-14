'use strict';
const [requestId, scenario] = process.argv.slice(2);
const failureCategories = { auth: 'auth', quota: 'quota', model: 'unsupported-model' };
if (scenario === 'invalid') {
  process.stdout.write('invalid synthetic reply');
} else {
  const category = failureCategories[scenario];
  const reply = { requestId: scenario === 'foreign' ? 'foreign-request' : requestId,
    status: category ? 'failed' : 'completed', ...(category ? { category } : {}),
    token: 'SYNTHETIC_TOKEN_DO_NOT_RETAIN', prompt: 'synthetic private field',
    account: { email: 'synthetic@example.invalid' } };
  process.stdout.write(JSON.stringify(reply));
}
process.stderr.write('SYNTHETIC_STDERR_DO_NOT_RETAIN');
if (scenario === 'exit') process.exitCode = 7;
