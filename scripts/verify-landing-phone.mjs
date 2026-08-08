#!/usr/bin/env node
/**
 * Transfer-budget gate for the landing phone demo (plan §6).
 *
 * The budget is a release gate, not an end-of-project optimisation, so this
 * runs in CI alongside the tests and exits non-zero the moment a hard limit is
 * breached. Sizes are measured compressed, because that is what a visitor
 * actually downloads.
 *
 * Usage:
 *   node scripts/verify-landing-phone.mjs              # report + enforce
 *   node scripts/verify-landing-phone.mjs --require-wired
 *       also fails when the demo chunk is absent from the build, which is the
 *       P6 acceptance form of the check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist/public/assets';
const PUBLIC_ASSETS = 'client/public/assets';
const requireWired = process.argv.includes('--require-wired');

/** target / hard-fail, in bytes. §6 table. */
const BUDGET = {
  js: { target: 30 * 1024, hard: 35 * 1024, label: 'demo JavaScript (gzip)' },
  css: { target: 6 * 1024, hard: 8 * 1024, label: 'demo CSS (gzip)' },
  img: { target: 37 * 1024, hard: 40 * 1024, label: 'phone images (raw)' },
  total: { target: 70 * 1024, hard: 90 * 1024, label: 'whole phone feature' },
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gzip = (buf) => gzipSync(buf, { level: 9 }).length;
const brotli = (buf) =>
  brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

function listDist() {
  try {
    return readdirSync(DIST).map((f) => join(DIST, f));
  } catch {
    return [];
  }
}

/**
 * The phone demo is emitted as its own dynamic chunk. Vite names it after the
 * entry module, so match on the module name rather than a hash that changes
 * every build — pinning a hash is exactly the failure this plan exists to fix.
 */
const isPhoneChunk = (f) => /landing-?phone/i.test(f);

function measure() {
  const files = listDist().filter(isPhoneChunk);
  const js = files.filter((f) => f.endsWith('.js'));
  const css = files.filter((f) => f.endsWith('.css'));

  const sum = (list, fn) => list.reduce((n, f) => n + fn(readFileSync(f)), 0);

  const images = ['shell-front.webp', 'shell-back.webp']
    .map((f) => join(PUBLIC_ASSETS, f))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });

  return {
    files,
    js: { raw: sum(js, (b) => b.length), gzip: sum(js, gzip), brotli: sum(js, brotli) },
    css: { raw: sum(css, (b) => b.length), gzip: sum(css, gzip), brotli: sum(css, brotli) },
    img: { raw: sum(images, (b) => b.length) },
  };
}

const m = measure();

if (m.files.length === 0) {
  const msg =
    'landing phone chunk not found in ' +
    DIST +
    ' — the demo is not wired into the landing build yet.';
  if (requireWired) {
    console.error(`FAIL  ${msg}`);
    process.exit(1);
  }
  console.log(`SKIP  ${msg}`);
  console.log('      (run after `npm run build`; use --require-wired to enforce)');
  process.exit(0);
}

const rows = [
  ['js', m.js.gzip, `raw ${kb(m.js.raw)} · br ${kb(m.js.brotli)}`],
  ['css', m.css.gzip, `raw ${kb(m.css.raw)} · br ${kb(m.css.brotli)}`],
  ['img', m.img.raw, 'raw'],
];

const total = m.js.gzip + m.css.gzip + m.img.raw;
let failed = false;
let warned = false;

console.log('landing phone transfer budget');
console.log('─'.repeat(64));
for (const [k, value, note] of rows) {
  const b = BUDGET[k];
  const state = value > b.hard ? 'FAIL' : value > b.target ? 'WARN' : 'OK  ';
  if (value > b.hard) failed = true;
  else if (value > b.target) warned = true;
  console.log(`${state}  ${b.label.padEnd(28)} ${kb(value).padStart(9)}  / ${kb(b.target)}  (${note})`);
}

const tState = total > BUDGET.total.hard ? 'FAIL' : total > BUDGET.total.target ? 'WARN' : 'OK  ';
if (total > BUDGET.total.hard) failed = true;
else if (total > BUDGET.total.target) warned = true;
console.log('─'.repeat(64));
console.log(`${tState}  ${BUDGET.total.label.padEnd(28)} ${kb(total).padStart(9)}  / ${kb(BUDGET.total.target)}  (hard ${kb(BUDGET.total.hard)})`);
console.log(`\nchunk files:\n  ${m.files.join('\n  ')}`);

if (failed) {
  console.error('\nhard budget breached — see plan §6.');
  process.exit(1);
}
if (warned) console.log('\nover target but inside the hard limit; trim before release.');
process.exit(0);
