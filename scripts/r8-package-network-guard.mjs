// Package CLI proof only. Every socket is refused, including optional tsx IPC.
import net from 'node:net';
import tls from 'node:tls';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const report = process.env.R8_PACKAGE_GUARD_REPORT,
  expected = process.env.R8_PACKAGE_EXPECTED_TSX_IPC;
if (!report || !expected) throw Error('PACKAGE_GUARD_CONFIG_REQUIRED');
function deny(kind) {
  appendFileSync(report, JSON.stringify({ kind }) + '\n', { mode: 0o600 });
  throw Error('PACKAGE_SOCKET_REFUSED');
}
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const ipc = typeof options === 'string' ? options : options?.path;
  return deny(
    ipc === expected
      ? 'optional-tsx-ipc-refused'
      : ipc
        ? 'unexpected-ipc'
        : 'tcp'
  );
};
tls.connect = function () {
  return deny('tls');
};
syncBuiltinESMExports();
