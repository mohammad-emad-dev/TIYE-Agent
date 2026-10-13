'use strict';
function phaseEvidence(messages, phasePrompt, priorAssistantIds = new Set()) {
  const users = messages.filter(message => message.type === 'user' && message.text?.trim() === phasePrompt);
  const user = users[0];
  const assistants = users.length === 1 ? messages.filter(message => message.type === 'assistant' && !priorAssistantIds.has(message.id) && message.time?.created >= user.time?.created) : [];
  return { accepted: users.length === 1, assistants, completed: assistants.some(message => Number.isFinite(message.time?.completed) && message.finish === 'stop'), noTools: assistants.every(message => (message.content || []).every(part => part.type !== 'tool')), noErrors: assistants.every(message => !message.error) };
}
function recallEvidence(assistants, expected) {
  const completed = assistants.filter(message => message.finish === 'stop' && Number.isFinite(message.time?.completed));
  if (completed.length !== 1) return { validJson: false, matched: false };
  const text = (completed[0].content || []).filter(part => part.type === 'text').map(part => part.text).join('').trim();
  let recalled;
  try { recalled = JSON.parse(text); } catch { return { validJson: false, matched: false }; }
  const fields = Object.keys(expected);
  const matched = recalled !== null && typeof recalled === 'object' && !Array.isArray(recalled) && Object.keys(recalled).length === fields.length && fields.every(key => Array.isArray(expected[key]) ? Array.isArray(recalled[key]) && recalled[key].length === expected[key].length && recalled[key].every((value, index) => value === expected[key][index]) : recalled[key] === expected[key]);
  return { validJson: true, matched };
}
module.exports = { phaseEvidence, recallEvidence };
