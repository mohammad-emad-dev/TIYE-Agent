'use strict';
const recallPrompt = 'State your session team briefing as one JSON object only, without Markdown or prose. Include exactly self, role, leader, teammates, ownedFiles, completionTool. Use the original identifiers and exact role label. Do not call tools, edit files, or run commands.';
const profiles = [
  { self: 'member-a', role: 'worker', leader: 'leader-copper-17', teammates: ['peer-indigo-29'], ownedFiles: ['clamp.js', 'clamp.test.js'], completionTool: 'report_result' },
  { self: 'member-a', role: 'worker', leader: 'leader-silver-31', teammates: ['peer-amber-43'], ownedFiles: ['clamp.js', 'clamp.test.js'], completionTool: 'report_result' },
  { self: 'member-a', role: 'worker', leader: 'leader-violet-53', teammates: ['peer-jade-67'], ownedFiles: ['clamp.js', 'clamp.test.js'], completionTool: 'report_result' },
];
const cases = profiles.map((profile, index) => ({ id: `briefing-${index + 1}`, kind: 'coding', briefing: { profile, prompt: `Team briefing: ${JSON.stringify(profile)}. This defines your role for this session and later tasks. Do not call tools, edit files or run commands for this message. Acknowledge briefly, then wait for a task.`, recallPrompt } }));
module.exports = { cases };
