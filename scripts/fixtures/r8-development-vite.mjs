import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {setupVite} from '../../server/vite.ts';
const app = express(), server = http.createServer(app);
let closeVite;
try {
  closeVite = await setupVite(app, server);
  await new Promise((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
  const get = pathname => new Promise((resolve, reject) => {
    const req = http.get({hostname: '127.0.0.1', port: server.address().port, path: pathname, agent: false}, response => {
      let body = '';response.on('data', chunk => {body += chunk;});response.once('error', reject);
      response.once('end', () => resolve({status: response.statusCode,body}));
    });
    req.once('error', reject);req.setTimeout(10000, () => req.destroy(new Error('DEV_PROBE_TIMEOUT: '+pathname)));
  });
  const page = await get('/');
  assert.equal(page.status, 200);assert.match(page.body, /@vite\/client/);
  const entry = /src="(\/src\/main\.tsx\?v=[^"]+)"/.exec(page.body)?.[1];
  assert.ok(entry, 'DEVELOPMENT_ENTRY_REQUIRED');
  const script = await get(entry);
  assert.equal(script.status, 200);assert.match(script.body, /createRoot/);
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
  if (closeVite) await closeVite();
}
console.log('DEVELOPMENT_VITE_PASS');
