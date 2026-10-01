import fs from "node:fs";
import path from "node:path";
import { sseBroker } from "../../sse-broker";
import * as push from "../../push";
import * as windcave from "../../windcave";
import * as email from "../../email-service";
import * as multiEmail from "../../email-service-multi";
import * as trades from "../../trades-delivery";

/** Start after arranging fixtures. Audit logs remain permitted; delivery/payment
 * calls are not permitted even if their test double would hide the real effect.
 */
export function observeRefusalEffects() {
  const observed: Array<{ name: string; spy: jest.SpyInstance; before: number; owned: boolean }> = [];
  const watch = (target: any, name: string, label = name) => {
    const owned = !jest.isMockFunction(target[name]);
    const spy = owned ? jest.spyOn(target, name) : target[name];
    observed.push({ name: label, spy, before: spy.mock.calls.length, owned });
  };
  watch(sseBroker, "broadcast", "SSE broadcast");
  watch(push, "sendPushToMerchant");
  for (const module of [windcave, email, multiEmail, trades]) {
    for (const name of Object.keys(module)) {
      if (/^(send|resend|create.*Session|query.*Session|charge|submit)/.test(name) && typeof (module as any)[name] === "function") watch(module, name);
    }
  }
  watch(globalThis, "fetch", "outbound fetch");
  // Audit logging uses appendFile and is explicitly permitted. Resource creation,
  // replacement and deletion are not legitimate consequences of a refusal.
  for (const name of ["writeFile", "writeFileSync", "unlink", "unlinkSync", "rename", "renameSync", "rm", "rmSync"]) watch(fs, name, `fs.${name}`);
  for (const name of ["writeFile", "unlink", "rename", "rm"]) watch(fs.promises, name, `fs.promises.${name}`);
  return {
    assertNone() {
      const prohibited = observed.filter(({ name, spy, before }) => spy.mock.calls.slice(before).some(args => {
        // Node implements appendFileSync through writeFileSync. Permit ONLY an
        // append to the application's designated security audit, not other writes.
        const auditAppend = name === "fs.writeFileSync" && args[0] === path.join(process.cwd(), "logs", "security-audit.log") && args[2]?.flag === "a";
        return !auditAppend;
      }));
      expect(prohibited.map(({ name }) => name)).toEqual([]);
    },
    restore() { for (const { spy, owned } of observed) if (owned) spy.mockRestore(); },
  };
}
