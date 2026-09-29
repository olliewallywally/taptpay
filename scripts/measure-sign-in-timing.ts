// R1-T4 phase C follow-up (owner decision 2026-09-23, Q3): how long a refused sign-in
// takes, by whose email it names. The real routes on in-memory storage, run in a child
// process with a clean environment: no database, no ambient credential, simulated email.
//
//   node --import tsx scripts/measure-sign-in-timing.ts
//
// Prints the median time of a wrong-password sign-in, per kind of email. Before the fix,
// an email with no login answered at once, while a login paid for a bcrypt check (about
// 0.27 s at cost 12, 0.07 s at the cost 10 most older accounts carry), so the time taken
// told which emails have logins.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";

const ADMIN_EMAIL = "admin@probe.test";
const PASSWORD = "Probe-password-1";
const WRONG = "Not-the-password-9";

if (process.env.SIGN_IN_TIMING_PROBE !== "child") {
  const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NODE_ENV: "development", APP_ENV: "development", DATABASE_TARGET: "local", ENV_VALIDATION_MODE: "audit",
      PAYMENT_MODE: "disabled", EMAIL_PROVIDER: "simulation", SIGN_IN_TIMING_PROBE: "child",
      JWT_SECRET: "probe-jwt-secret-not-a-real-credential-0001",
      // An admin hash at cost 10, as a hand-made one may well be.
      ADMIN_EMAIL, ADMIN_PASSWORD_HASH: bcrypt.hashSync(PASSWORD, 10),
    },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const { default: express } = await import("express");
const { default: request } = await import("supertest");
const { registerRoutes } = await import("../server/routes");
const { createGlobalErrorHandler } = await import("../server/http-error-handler");
const { storage } = await import("../server/storage");
const { createUser } = await import("../server/auth");

if (process.env.DATABASE_URL) throw new Error("the timing probe runs only on in-memory storage");

const app = express();
app.use(express.json());
await registerRoutes(app);
app.use(createGlobalErrorHandler());

let made = 0;
/** A new active owner login, its password hashed at the given cost. */
async function owner(cost: number): Promise<string> {
  made += 1;
  const email = `owner${made}@probe.test`;
  const merchant = await storage.createMerchant({
    name: "Probe", businessName: "Probe Ltd", businessType: "retail", email,
    phone: "021 555 0100", address: "1 Probe Street, Auckland",
  } as any);
  await storage.updateMerchantStatus(merchant.id, "active");
  const user = await createUser(email, PASSWORD, merchant.id, "merchant");
  if (cost !== 12) await storage.updateUserPassword(user.userId ?? user.id, await bcrypt.hash(PASSWORD, cost));
  return email;
}
const nobody = () => `nobody${(made += 1)}@probe.test`;

/** Milliseconds for one wrong-password sign-in; each email is used once, so none is slowed down. */
async function timed(path: string, email: string): Promise<number> {
  const started = process.hrtime.bigint();
  const res = await request(app).post(path).send({ email, password: WRONG });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (res.status !== 401) throw new Error(`${path} for ${email}: expected 401, got ${res.status}`);
  return ms;
}

const SAMPLES = 9;
const cases: [string, () => Promise<number>, number][] = [
  ["merchant sign-in, no login", async () => timed("/api/auth/login", nobody()), SAMPLES],
  ["merchant sign-in, login at cost 12", async () => timed("/api/auth/login", await owner(12)), SAMPLES],
  ["merchant sign-in, login at cost 10 (older)", async () => timed("/api/auth/login", await owner(10)), SAMPLES],
  // The admin's email is one bucket: its five free attempts are the samples.
  ["admin sign-in, the admin's email", async () => timed("/api/admin/auth/login", ADMIN_EMAIL), 5],
  ["admin sign-in, any other email", async () => timed("/api/admin/auth/login", nobody()), SAMPLES],
];

for (let i = 0; i < 3; i += 1) await timed("/api/auth/login", nobody()); // warm-up, not counted
// Round-robin, so warm-up and background load fall on every case alike.
const times = cases.map((): number[] => []);
for (let round = 0; round < SAMPLES; round += 1) {
  for (const [index, [, sample, count]] of cases.entries()) {
    if (round < count) times[index].push(await sample());
  }
}
for (const [index, [name]] of cases.entries()) {
  const sorted = [...times[index]].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`${name.padEnd(44)} median ${median.toFixed(0).padStart(4)} ms  (n=${sorted.length}, ${sorted[0].toFixed(0)}–${sorted[sorted.length - 1].toFixed(0)})`);
}
process.exit(0);
