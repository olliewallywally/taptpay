/**
 * The owner's R3 cutover gate (docs/operations/runbook-2026-10-15-r3-cutover.md). Run with the app
 * stopped. Prints counts only. Exits 1 while anything blocks cutover.
 *
 *   DATABASE_URL=... node --import tsx scripts/r3-cutover.ts check  --before=<ISO time>
 *   DATABASE_URL=... node --import tsx scripts/r3-cutover.ts retire --before=<ISO time> [--apply]
 */
import pg from 'pg';
import {readCutoverGate,retireLegacyOutbox} from '../server/payment-cutover';

const [mode,...flags]=process.argv.slice(2);
const beforeFlag=flags.find(flag=>flag.startsWith('--before='));
if(!['check','retire'].includes(mode??'') || !beforeFlag){console.error('usage: r3-cutover.ts check|retire --before=<ISO time> [--apply]');process.exit(2);}
const before=new Date(beforeFlag!.slice('--before='.length));
if(Number.isNaN(before.getTime())){console.error('--before must be an ISO time');process.exit(2);}
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required');process.exit(2);}
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
  if(mode==='retire'){
    const result=await retireLegacyOutbox(client,{before,apply:flags.includes('--apply')});
    console.log(JSON.stringify({mode,applied:flags.includes('--apply'),...result}));
  }
  const gate=await readCutoverGate(client,before);
  console.log(JSON.stringify(gate,null,2));
  process.exitCode=gate.ok?0:1;
} finally {await client.end();}
