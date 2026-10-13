'use strict';

function quiescentMessages({ messages, pending, createdAt }) {
  const assistants = Array.isArray(messages) ? messages.filter(message => message.type === 'assistant') : [];
  return assistants.length > 0 && assistants.every(message => Number.isFinite(message.time?.completed)
    && message.time.completed >= createdAt && Array.isArray(message.content) && message.content.every(part => part.type !== 'tool' || ['completed', 'error'].includes(part.state?.status)))
    && Array.isArray(pending) && pending.length === 0;
}

module.exports = { quiescentMessages };
