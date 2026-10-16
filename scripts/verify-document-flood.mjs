// Bounded loopback HTTP client. No app modules, provider credentials or live URLs.
import http from 'node:http';
import assert from 'node:assert/strict';
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 200) throw Error('INVALID_FLOOD_INPUT');
}
const {port, token} = JSON.parse(input);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
assert.match(token, /^[A-Za-z0-9_-]{27}$/);
const deadline = setTimeout(() => process.exit(1), 4000);
const agent = new http.Agent({keepAlive: true, maxSockets: 64});
const get = path => new Promise((resolve, reject) => {
  const req = http.get({hostname: '127.0.0.1', port, path, agent}, response => {
    response.once('error', reject); response.once('end', () => resolve(response.statusCode)); response.resume();
  });
  req.once('error', reject); req.setTimeout(1500, () => req.destroy(new Error('DOCUMENT_REQUEST_TIMEOUT')));
});
try {
  let unknown = 0, rejected = 0;
  for (let start = 0; start < 601; start += 64) {
    const statuses = await Promise.all(Array.from({length: Math.min(64, 601 - start)},
      (_, offset) => get('/api/checkout/document/junk-' + (start + offset))));
    unknown += statuses.length; rejected += statuses.filter(status => status === 404).length;
  }
  const valid = await get('/api/checkout/document/' + token);
  assert.equal(unknown, 601); assert.equal(rejected, 601); assert.equal(valid, 200);
  process.stdout.write(JSON.stringify({unknown, rejected, valid}));
} finally {agent.destroy(); clearTimeout(deadline);}
