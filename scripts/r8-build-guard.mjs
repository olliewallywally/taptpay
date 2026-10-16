// Imported into every Node process in the build. Never log connection arguments.
import net from 'node:net';
import tls from 'node:tls';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const report=process.env.R8_BUILD_GUARD_REPORT;
if (!report) throw Error('BUILD_GUARD_REPORT_REQUIRED');
function deny(kind) {
  appendFileSync(report,JSON.stringify({kind})+'\n',{mode:0o600});
  throw Error('BUILD_NETWORK_CONNECTION_REFUSED');
}
net.Socket.prototype.connect=function(){return deny('tcp');};
tls.connect=function(){return deny('tls');};
syncBuiltinESMExports();
