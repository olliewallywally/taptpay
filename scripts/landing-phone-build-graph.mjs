#!/usr/bin/env node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Target / hard-fail limits from the landing-phone plan §6. */
const BUDGET = {
  js: { target: 30 * 1024, hard: 35 * 1024, label: 'demo JavaScript (gzip)' },
  css: { target: 6 * 1024, hard: 8 * 1024, label: 'demo CSS (gzip)' },
  img: { target: 37 * 1024, hard: 40 * 1024, label: 'phone images (raw)' },
  total: { target: 70 * 1024, hard: 90 * 1024, label: 'whole phone feature' },
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gzip = (buffer) => gzipSync(buffer, { level: 9 }).length;
const brotli = (buffer) =>
  brotliCompressSync(buffer, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

const normalize = (value) => String(value).replaceAll('\\', '/');
const isImage = (file) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file);

/** Every module under here belongs to the phone feature. */
const PHONE_SOURCE_DIR = '/pages/landing-phone/';
/** The lazy boundary the landing page opens: the feature's canonical root. */
const PHONE_ROOT_SOURCE = `${PHONE_SOURCE_DIR}LandingPhoneMount.tsx`;
/** Rollup names a chunk after its entry module, so phone chunks keep this prefix. */
const PHONE_CHUNK_NAME = /^LandingPhone[A-Za-z0-9]*$/;
const PHONE_ROOT_CHUNK_NAME = 'LandingPhoneMount';

/**
 * Vite keys a manifest node by source path *only while the emitted chunk still
 * has a facade module*. LandingPhoneMount lost its facade when
 * DeferredLandingPhone added a second dynamic boundary and LandingPhoneDemo
 * began importing back into the mount: the chunk became shared, so Vite now
 * keys it `_LandingPhoneMount-<hash>.js` and drops `src` altogether. Resolving
 * the feature by manifest key alone silently found nothing. Match on every name
 * a node can travel under instead.
 */
const nodeIdentity = (key, node) =>
  [key, node.src, node.file, node.name].filter(Boolean).map(normalize);

const isPhoneNode = (key, node) =>
  nodeIdentity(key, node).some((value) => value.includes(PHONE_SOURCE_DIR)) ||
  PHONE_CHUNK_NAME.test(node.name ?? '');

const isPhoneRootNode = (key, node) =>
  nodeIdentity(key, node).some((value) => value.endsWith(PHONE_ROOT_SOURCE)) ||
  node.name === PHONE_ROOT_CHUNK_NAME;

function graphClosure(manifest, roots, includeDynamic) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const key = queue.shift();
    if (!key || seen.has(key)) continue;
    const node = manifest[key];
    if (!node) throw new Error(`manifest graph references missing node: ${key}`);
    seen.add(key);
    queue.push(...(node.imports ?? []));
    if (includeDynamic) queue.push(...(node.dynamicImports ?? []));
  }
  return seen;
}

function referencedPublicAssets(buildDir, outputFiles) {
  const found = new Set();
  const urlPattern = /(?:["'(]|url\()\/?(assets\/[A-Za-z0-9_./@+~-]+\.(?:avif|gif|jpe?g|png|svg|webp))/gi;
  for (const output of outputFiles) {
    if (!/\.(?:css|js)$/i.test(output)) continue;
    const body = readFileSync(join(buildDir, output), 'utf8');
    for (const match of body.matchAll(urlPattern)) {
      const candidate = normalize(match[1]);
      if (existsSync(join(buildDir, candidate))) found.add(candidate);
    }
  }
  return found;
}

function measureFiles(buildDir, files) {
  const groups = { js: [], css: [], img: [] };
  for (const file of files) {
    if (file.endsWith('.js')) groups.js.push(file);
    else if (file.endsWith('.css')) groups.css.push(file);
    else if (isImage(file)) groups.img.push(file);
  }

  const measureCompressed = (list) => {
    const buffers = list.map((file) => readFileSync(join(buildDir, file)));
    return {
      raw: buffers.reduce((sum, buffer) => sum + buffer.length, 0),
      gzip: buffers.reduce((sum, buffer) => sum + gzip(buffer), 0),
      brotli: buffers.reduce((sum, buffer) => sum + brotli(buffer), 0),
    };
  };

  return {
    groups,
    js: measureCompressed(groups.js),
    css: measureCompressed(groups.css),
    img: {
      raw: groups.img.reduce((sum, file) => sum + statSync(join(buildDir, file)).size, 0),
    },
  };
}

function buildFresh(buildDir) {
  const vite = join(ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) throw new Error('Vite is not installed; run npm install before this gate.');
  const result = spawnSync(
    process.execPath,
    [vite, 'build', '--manifest', '--outDir', buildDir, '--emptyOutDir'],
    {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`fresh Vite build failed with exit ${result.status ?? 'unknown'}`);
  }
}

function inspectBuild(buildDir) {
  const manifestPath = join(buildDir, '.vite/manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Vite manifest not found at ${relative(ROOT, manifestPath)}; the graph cannot be verified.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entries = Object.entries(manifest)
    .filter(([, node]) => node.isEntry)
    .map(([key]) => key);
  if (entries.length !== 1) {
    throw new Error(`expected one Vite entry, found ${entries.length}: ${entries.join(', ')}`);
  }

  const phoneNodes = Object.entries(manifest).filter(([key, node]) => isPhoneNode(key, node));

  // The mount is the boundary the landing page opens; it must exist, exactly
  // once, and it must still be a code-split chunk. If a static import pulled it
  // back into the entry chunk it stops being a manifest node at all, which is
  // what this count catches.
  const rootCandidates = phoneNodes.filter(([key, node]) => isPhoneRootNode(key, node)).map(([key]) => key);
  if (rootCandidates.length !== 1) {
    throw new Error(
      `expected exactly one LandingPhoneMount chunk in the manifest, found ${rootCandidates.length}` +
        (rootCandidates.length ? `: ${rootCandidates.join(', ')}` : ' (a static import may have inlined it into the entry chunk)'),
    );
  }
  const root = rootCandidates[0];
  if (!manifest[root].isDynamicEntry) {
    throw new Error(`LandingPhoneMount (${root}) is not a dynamic entry; the lazy boundary regressed.`);
  }

  // The feature is split across more than one lazy chunk (mount + demo), so the
  // budget is measured over every phone chunk, not just whichever one is first.
  const phoneRoots = phoneNodes.filter(([, node]) => node.isDynamicEntry).map(([key]) => key);

  const eager = graphClosure(manifest, entries, false);
  const complete = graphClosure(manifest, entries, true);
  const phone = graphClosure(manifest, phoneRoots, true);

  const unreachable = phoneRoots.filter((key) => !complete.has(key));
  if (unreachable.length) {
    throw new Error(`phone chunks are not reachable from the application entry: ${unreachable.join(', ')}`);
  }
  if (eager.has(root)) throw new Error('LandingPhoneMount is in the eager entry graph; the lazy boundary regressed.');

  const eagerPhoneEntries = [...eager].filter((key) => isPhoneNode(key, manifest[key]));
  if (eagerPhoneEntries.length) {
    throw new Error(`phone modules leaked into the eager graph: ${eagerPhoneEntries.join(', ')}`);
  }

  const incrementalNodes = [...phone].filter((key) => !eager.has(key));
  const outputFiles = new Set();
  for (const key of incrementalNodes) {
    const node = manifest[key];
    if (node.file) outputFiles.add(normalize(node.file));
    for (const file of node.css ?? []) outputFiles.add(normalize(file));
    for (const file of node.assets ?? []) outputFiles.add(normalize(file));
  }
  for (const asset of referencedPublicAssets(buildDir, outputFiles)) outputFiles.add(asset);

  const missing = [...outputFiles].filter((file) => !existsSync(join(buildDir, file)));
  if (missing.length) throw new Error(`manifest outputs are missing: ${missing.join(', ')}`);
  if (![...outputFiles].some((file) => file.endsWith('.js'))) {
    throw new Error('the phone graph contains no JavaScript output');
  }

  const jsText = [...outputFiles]
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(buildDir, file), 'utf8'))
    .join('\n');
  const forbiddenLibraries = [
    ['Three.js', /three\.module|WebGLRenderer|THREE\.REVISION/],
    ['Framer Motion', /framer-motion|motion-dom/],
    ['React Query', /@tanstack\/react-query/],
  ];
  const forbidden = forbiddenLibraries.filter(([, pattern]) => pattern.test(jsText)).map(([name]) => name);

  return {
    manifest,
    entries,
    eager,
    phone,
    phoneRoots,
    root,
    incrementalNodes,
    outputFiles: [...outputFiles].sort(),
    forbidden,
  };
}

function printBudget(measurement) {
  const rows = [
    ['js', measurement.js.gzip, `raw ${kb(measurement.js.raw)} · br ${kb(measurement.js.brotli)}`],
    ['css', measurement.css.gzip, `raw ${kb(measurement.css.raw)} · br ${kb(measurement.css.brotli)}`],
    ['img', measurement.img.raw, 'raw'],
  ];
  const total = measurement.js.gzip + measurement.css.gzip + measurement.img.raw;
  let failed = false;
  let warned = false;

  console.log('\nlanding phone transfer budget (actual dynamic import graph)');
  console.log('─'.repeat(72));
  for (const [key, value, note] of rows) {
    const budget = BUDGET[key];
    const state = value > budget.hard ? 'FAIL' : value > budget.target ? 'WARN' : 'OK  ';
    if (value > budget.hard) failed = true;
    else if (value > budget.target) warned = true;
    console.log(
      `${state}  ${budget.label.padEnd(28)} ${kb(value).padStart(9)} / ${kb(budget.target)}  (${note})`,
    );
  }

  const totalState =
    total > BUDGET.total.hard ? 'FAIL' : total > BUDGET.total.target ? 'WARN' : 'OK  ';
  if (total > BUDGET.total.hard) failed = true;
  else if (total > BUDGET.total.target) warned = true;
  console.log('─'.repeat(72));
  console.log(
    `${totalState}  ${BUDGET.total.label.padEnd(28)} ${kb(total).padStart(9)} / ${kb(BUDGET.total.target)}  (hard ${kb(BUDGET.total.hard)})`,
  );
  return { failed, warned };
}

export function runLandingPhoneBuildGraph() {
  const keepBuild = process.argv.includes('--keep-build');
  const buildDir = mkdtempSync(join(tmpdir(), 'taptpay-landing-phone-build-'));
  try {
    console.log(`building fresh client bundle in ${buildDir}`);
    buildFresh(buildDir);
    const graph = inspectBuild(buildDir);
    const measurement = measureFiles(buildDir, graph.outputFiles);

    console.log(`entry: ${graph.entries[0]}`);
    console.log(`phone root: ${graph.root}`);
    console.log(`lazy phone chunks measured: ${graph.phoneRoots.join(', ')}`);
    console.log(`phone graph: ${graph.incrementalNodes.length} incremental manifest node(s)`);
    for (const key of graph.incrementalNodes) console.log(`  ${key}`);
    console.log('measured outputs:');
    for (const file of graph.outputFiles) console.log(`  ${file}`);

    let failed = false;
    if (graph.forbidden.length) {
      failed = true;
      console.error(`FAIL  forbidden phone dependency in built graph: ${graph.forbidden.join(', ')}`);
    } else {
      console.log('OK    no Three.js, Framer Motion, or React Query signature in the phone graph');
    }

    const budget = printBudget(measurement);
    failed ||= budget.failed;
    if (budget.warned && !budget.failed) {
      console.log('\nover target but inside the hard limit; trim before release.');
    }
    if (failed) {
      console.error('\nlanding phone build-graph gate failed.');
      return 1;
    }
    console.log('\nlanding phone build-graph gate passed.');
    return 0;
  } finally {
    if (keepBuild) console.log(`fresh build retained at ${buildDir}`);
    else rmSync(buildDir, { recursive: true, force: true });
  }
}

