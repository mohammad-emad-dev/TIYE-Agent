'use strict';
const { permissionRunPassed } = require('./permission-evidence');

function approvalScreen({ screen, choices }, command) {
  const labels = ['Allow once', 'Always allow', 'Reject'];
  const valid = typeof screen === 'string' && screen.length <= 20000 && Array.isArray(choices) && choices.length === 3
    && labels.every(label => choices.filter(choice => choice.label === label).length === 1);
  if (!valid) return { visible: false, selected: null };
  const ordered = labels.map(label => choices.find(choice => choice.label === label));
  const lines = screen.split('\n');
  const cardText = line => line.replace(/^[\s│┃╎╏]+|[\s│┃╎╏]+$/g, '');
  const heading = lines.findIndex(line => cardText(line).replace(/^[^\p{L}\p{N}]+/u, '') === 'Permission required');
  const commandRow = lines.findIndex((line, index) => index > heading && cardText(line) === '$ ' + command);
  const style = choice => [choice.fg, choice.bg, choice.fgMode, choice.bgMode, choice.inverse];
  // These colors were observed on this native 2.0.28/default-theme screen.
  // A changed theme/layout is unqualified until independently reviewed.
  const selectedStyle = JSON.stringify([657930, 16429699, 50331648, 50331648, 0]);
  const normalStyle = JSON.stringify([15658734, 1973790, 50331648, 50331648, 0]);
  const selected = ordered.filter(choice => JSON.stringify(style(choice)) === selectedStyle);
  const visible = heading >= 0 && commandRow > heading && ordered.every(choice => Number.isInteger(choice.row)
    && Number.isInteger(choice.column) && choice.row === ordered[0].row && choice.row > commandRow
    && lines[choice.row]?.slice(choice.column, choice.column + choice.label.length) === choice.label)
    && ordered[0].column < ordered[1].column && ordered[1].column < ordered[2].column
    && selected.length === 1 && ordered.filter(choice => choice !== selected[0]).every(choice => JSON.stringify(style(choice)) === normalStyle);
  return { visible, selected: visible ? ({ 'Allow once': 'once', 'Always allow': 'always', Reject: 'reject' })[selected[0].label] : null };
}

function approvalKeyEvidence(input, keys) {
  if (typeof input !== 'string') return { matched: false };
  const focus = input.match(/\x1b\[[IO]/g) || [];
  const stripped = input.replace(/\x1b\[[IO]/g, '');
  const expected = keys.every(key => key === 'Right') ? keys.map(() => '\x1b[C').join('') : keys.length === 1 && keys[0] === 'Return' ? '\r' : null;
  const application = keys.every(key => key === 'Right') ? keys.map(() => '\x1bOC').join('') : expected;
  return { matched: expected !== null && (stripped === expected || stripped === application), inputBytes: Buffer.byteLength(input), focusReports: focus.length };
}

function terminalApprovalRunPassed(run) {
  const cli = run.cli;
  return Boolean(['reject-shell', 'allow-once-shell'].includes(run.caseID) && permissionRunPassed({ run, caseID: run.caseID }) && cli.version === '2.0.28' && cli.serviceVersionAfterCleanup === '2.0.28'
    && cli.freshPromptAndAssistants && cli.uiPendingObservedTwice && cli.uiSelectedDecisionObservedTwice
    && cli.uiScreenQualified && cli.uiNavigationInputMatched && cli.uiDecisionInputMatched && cli.decisionInput?.matched && cli.uiDecisionInputsSent === 1
    && cli.apiApprovalRepliesSent === 0 && cli.apiMutationAttempts === 0 && cli.markerAbsentBeforeDecision
    && Number.isInteger(cli.apiReadAttempts) && cli.apiReadAttempts > 0
    && cli.replyDecision === (run.caseID === 'reject-shell' ? 'reject' : 'once')
    && (run.caseID === 'reject-shell' ? cli.navigationInput?.matched === true : cli.navigationInput === undefined && cli.markerStableAtSecondApproval && cli.markerSamplesAtSecondApproval >= 2));
}

function approvalObservationApi({ api, cwd, sessionID, evidence }) {
  const allowed = [`/api/session/${sessionID}/message?limit=100&order=desc`, `/api/session/${sessionID}/permission`];
  return (method, route) => {
    if (method !== 'GET') { evidence.apiMutationAttempts++; throw new Error('approval observer forbids mutations'); }
    if (!allowed.includes(route)) throw new Error('approval observer scope mismatch');
    evidence.apiReadAttempts++;
    return api(cwd, method, route);
  };
}

module.exports = { approvalScreen, approvalKeyEvidence, terminalApprovalRunPassed, approvalObservationApi };
