'use strict';
const research = require('../routes.json');
const fields = Object.freeze(['routeId','cli','modelId','providerId','authMethod','accountPlan','accountCountry']);
const authMethods = {
  codex: ['subscription','api-key','enterprise-access-token'],
  claude: ['subscription','api-key','provider-key'],
  gemini: ['google-account','api-key','vertex-ai'],
  opencode: ['provider-key','oauth','command']
};
function pending(category, state = 'not-run') {
  return { state, category, liveEligible: false, fullS4Qualified: false, productionEligible: false };
}
function validShape(declaration) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(declaration))) return false;
  return Reflect.ownKeys(declaration).every(name => fields.includes(name)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(declaration, name), 'value')
    && typeof declaration[name] === 'string' && declaration[name].length <= 160);
}
function assessDeclaration(declaration) {
  if (!validShape(declaration)) return pending('invalid-declaration');
  if (research.blockedRoutes.some(route => route.id === declaration.routeId)) return pending('blocked-route');
  const route = research.routes.find(candidate => candidate.id === declaration.routeId);
  if (declaration.routeId?.trim() && !route) return pending('unknown-route');
  const missing = fields.filter(name => !Object.hasOwn(declaration, name) || !declaration[name].trim());
  if (missing.length) return { ...pending('missing-declaration', 'awaiting-account-declaration'), missing };
  if (route.cli !== declaration.cli) return pending('cli-route-mismatch');
  if (!authMethods[route.cli].includes(declaration.authMethod)) return pending('auth-method-mismatch');
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(declaration.modelId)
      || !/^[a-z][a-z0-9._-]{1,63}$/i.test(declaration.providerId)
      || !/^[a-z0-9][a-z0-9 ._-]{0,63}$/i.test(declaration.accountPlan)
      || !/^[A-Z]{2}$/.test(declaration.accountCountry)) return pending('invalid-identity-syntax');
  if (route.vendor === 'provider-dependent') return pending('provider-identity-unreviewed', 'awaiting-policy-and-native-qualification');
  if (declaration.providerId !== route.vendor.toLowerCase()
      || declaration.modelId.split('/')[0] !== declaration.providerId) return pending('provider-route-mismatch');
  return { ...pending('route-policy-and-native-pending', 'awaiting-policy-and-native-qualification'),
    routeId: route.id, declarationSyntaxValidated: true, blockers: ['route-policy-unreviewed','native-auth-unqualified'] };
}
module.exports = { assessDeclaration, fields };
