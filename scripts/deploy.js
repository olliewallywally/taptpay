#!/usr/bin/env node
// Presence of credentials cannot establish deployment or payment readiness.
console.error('This legacy deployment helper is retired. Follow DEPLOYMENT.md and the reviewed release/restore runbooks; this command does not deploy or approve a release.');
process.exitCode = 1;
