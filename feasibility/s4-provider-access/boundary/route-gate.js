'use strict';
const research = require('../routes.json');
const conditions = require('../conditions/review.json');

function simulatedGate(request) {
  if (request.mode !== 'offline') return { state: 'not-run', category: 'live-disabled' };
  if (research.blockedRoutes.some(route => route.id === request.routeId)) return { state: 'not-run', category: 'blocked-route' };
  const route = conditions.routes.find(candidate => candidate.id === request.routeId);
  if (!route) return { state: 'not-run', category: 'unknown-route' };
  const missing = route.requiredPrerequisites.filter(name => request.declarations?.[name] !== 'satisfied');
  if (missing.length) return { state: 'not-run', category: 'missing-prerequisites', missing };
  return { state: 'ready-for-fake-execution', liveEligible: false };
}

module.exports = { simulatedGate };
