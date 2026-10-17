/** Owned synthetic PostgreSQL only; injected provider, no real purchases. */
import assert from 'node:assert/strict';
import pg from 'pg';
import {assertSafePostgresVerifierEnvironment} from './postgres-verifier-safety.mjs';
const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const url=new URL(testDatabaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55440');assert.equal(url.pathname,'/r3_integrated_scratch');
await import('../server/__tests__/support/test-env');
const pools=[new pg.Pool({connectionString:testDatabaseUrl,max:8}),new pg.Pool({connectionString:testDatabaseUrl,max:8})];
try {
  const {runSubscriptionPostgresCases}=await import('./r3-subscription-postgres-cases');
  await runSubscriptionPostgresCases(pools);
}finally{await Promise.all(pools.map(p=>p.end()));}
