/** Real Tailwind/nesting/typography and NYC YAML consumers; owned fixtures only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const require = createRequire(import.meta.url);
const fromPackage = name => createRequire(require.resolve(name));
export async function consumerProof() {
  const config = require('tailwindcss/loadConfig')(
    path.resolve('tailwind.config.ts')
  );
  config.content = [
    {
      raw: '<article class="prose prose-sm dark:prose-invert md:flex hover:fill-[#00E5CC] focus:fill-[#00E5CC] [&>p]:text-primary animate-in accordion-down"><p>synthetic</p></article>',
      extension: 'html',
    },
  ];
  config.corePlugins = { preflight: false };
  const nested = fromPackage('tailwindcss')('postcss-nested');
  const css = await postcss([nested(), tailwind(config)]).process(
    '@tailwind components; @tailwind utilities; .outer { & > .inner[data-label="a,b"] { color: red; } }',
    { from: undefined }
  );
  assert.equal(css.warnings().length, 0);
  assert.match(css.css, /\.outer > \.inner/);
  assert.match(css.css, /\.prose/);
  assert.match(css.css, /@media/);
  assert.match(css.css, /hover/);
  assert.match(css.css, /focus/);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'taptpay-r8-config-'));
  try {
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'r8-owned-config-fixture', private: true })
    );
    await writeFile(
      path.join(dir, 'base.yaml'),
      'check-coverage: true\nbranches: 80\nextension: .ts\nsource-map: false\n'
    );
    await writeFile(
      path.join(dir, '.nycrc.yaml'),
      'extends: ./base.yaml\nall: true\nexclude: &paths [vendor/**, synthetic/**]\ninclude: *paths\n'
    );
    const { loadNycConfig } = require('@istanbuljs/load-nyc-config');
    const actual = await loadNycConfig({ cwd: dir, nycrcPath: '.nycrc.yaml' });
    assert.deepEqual(actual, {
      cwd: dir,
      all: true,
      exclude: ['vendor/**', 'synthetic/**'],
      include: ['vendor/**', 'synthetic/**'],
      checkCoverage: true,
      branches: 80,
      extension: ['.ts'],
      sourceMap: false,
    });
    await writeFile(path.join(dir, '.nycrc.yaml'), 'exclude: [unterminated\n');
    await assert.rejects(loadNycConfig({ cwd: dir, nycrcPath: '.nycrc.yaml' }));
    return {
      cssSHA256: createHash('sha256').update(css.css).digest('hex'),
      cssWarnings: 0,
      yamlExtendsAnchorsAndOptions: 'pass',
      malformedYAML: 'refused',
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(process.argv.length, 2, 'INVALID_CSS_CONFIG_ARGUMENT');
  assert.equal(
    require('tailwindcss/package.json').version,
    '3.4.17',
    'TAILWIND_PARENT_CHANGED'
  );
  for (const parent of [
    'tailwindcss',
    'postcss-nested',
    '@tailwindcss/typography',
  ])
    assert.equal(
      fromPackage(parent)('postcss-selector-parser/package.json').version,
      '7.1.6',
      'SELECTOR_OVERRIDE_NOT_RESOLVED'
    );
  assert.equal(
    fromPackage('@istanbuljs/load-nyc-config')('js-yaml/package.json').version,
    '4.3.2',
    'NYC_YAML_OVERRIDE_NOT_RESOLVED'
  );
  const report = await consumerProof();
  assert.equal(
    report.cssSHA256,
    'c9f77a09eb1618569fb01a315574d4db80f7b0cfc532237fb508c41b01bd7f82',
    'CSS_CONSUMER_OUTPUT_CHANGED'
  );
  console.log(JSON.stringify(report));
}
