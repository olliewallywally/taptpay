import {createHash} from 'node:crypto';
/** Only for a newly created, empty R8 CI database, never a real inventory. */
export function emptyCIUploadInventory(target: {host: string; port: number; database: string}) {
  if (target.host !== '127.0.0.1' || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535
    || !/^r8_ci_[a-f0-9]{16}$/.test(target.database)) throw Error('CI_INVENTORY_TARGET_REFUSED');
  const source = JSON.stringify({version: 2, target,
    approvedBy: 'R8 reviewed CI: newly created empty owned database; no uploaded documents',
    approvedAt: '2026-10-16T00:00:00Z', entries: []});
  return {source, sha256: createHash('sha256').update(source).digest('hex')};
}
