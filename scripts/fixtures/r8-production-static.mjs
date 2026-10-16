import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import express from 'express';
import {serveStatic} from './static-module.mjs';
const app = express();
serveStatic(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => {server.once('listening', resolve);server.once('error', reject);});
const port = server.address().port;
const get = pathname => new Promise((resolve, reject) => {
  const request = http.get({hostname: '127.0.0.1', port, path: pathname, agent: false}, response => {
    const chunks = [];response.on('data', chunk => chunks.push(chunk));
    response.once('error', reject);response.once('end', () => resolve({status: response.statusCode,
      contentType: response.headers['content-type'],body: Buffer.concat(chunks)}));
  });
  request.once('error', reject);request.setTimeout(5000, () => request.destroy(new Error('STATIC_PROBE_TIMEOUT')));
});
const digest = data => createHash('sha256').update(data).digest('hex');
try {
  const index = await readFile(new URL('./public/index.html', import.meta.url));
  const page = await get('/dashboard');
  assert.equal(page.status, 200);assert.equal(digest(page.body), digest(index));
  const asset = /src="(\/assets\/index-[^"]+\.js)"/.exec(index.toString())?.[1];
  assert.ok(asset, 'BUILT_ENTRY_REQUIRED');
  const script = await get(asset);
  assert.equal(script.status, 200);assert.match(script.contentType, /javascript/);
  assert.equal(digest(script.body), digest(await readFile(new URL('./public'+asset, import.meta.url))));
  console.log('PRODUCTION_STATIC_PASS');
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
