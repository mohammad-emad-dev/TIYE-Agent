'use strict';
const { prompt, T1_SUMMARY } = require('./terminal-task');
const specification = 'Add clamp(value, min, max) in clamp.js as a CommonJS export { clamp }. Return min below the interval, max above it, otherwise value. Add clamp.test.js with node:test and node:assert/strict cases below, within, and above the bounds. Only edit these two files. Do not run commands, install dependencies, commit or push.';
const question = 'When min is greater than max, should clamp throw or swap the bounds?';
const cases = [
  { id: 'wording-a', kind: 'coding', prompt },
  { id: 'wording-b', kind: 'coding', prompt: `${specification} Completion protocol: call tiye-team-tools_report_result once, with status "done" and summary ${JSON.stringify(T1_SUMMARY)}. A text response alone does not complete the task.` },
  { id: 'wording-c', kind: 'coding', prompt: `Deliverable: ${specification} After creating the function and its tests, send the result through tiye-team-tools_report_result. Use exactly one call, status "done", summary ${JSON.stringify(T1_SUMMARY)}. Stop after the acknowledgment.` },
];
const questionCase = { id: 'ask-leader', kind: 'question', tool: 'ask_leader', question, prompt: `The requested clamp implementation has an unresolved requirement: behavior when min exceeds max. Before editing, ask the Leader by calling tiye-team-tools_ask_leader exactly once with question ${JSON.stringify(question)}. Do not guess, edit files, run commands, or call report_result. Wait for a real decision; a feasibility acknowledgment is not a decision.` };
const nudgeCase = { id: 'induced-omission', kind: 'coding', stopOnIdle: true, prompt: `${specification} For this controlled experiment, do not call report_result or any other team tool yet. Once the function and test file are complete, stop and wait for a reminder. Do not report until reminded.` };
module.exports = { cases, questionCase, nudgeCase };
