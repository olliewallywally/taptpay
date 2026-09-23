// Makes the value for the ADMIN_PASSWORD_HASH secret (owner report 2026-09-23: admin
// sign-in was off because that secret was set nowhere). Run it in the Replit Shell:
//
//   npm run admin:password
//
// Type the new admin password twice; nothing you type is shown. It prints a bcrypt hash
// (cost 12, like every password hash the app writes) to paste into Secrets as
// ADMIN_PASSWORD_HASH, then Stop and Run the app. The password itself goes nowhere else.
import bcrypt from "bcrypt";
import { PASSWORD_RULE, meetsPasswordRule } from "../shared/password-rule";

/** One line typed at the keyboard, not echoed; or, when input is piped, the next line of it. */
function prompt(question: string, piped: string[] | null): Promise<string> {
  if (piped) return Promise.resolve(piped.shift() ?? "");
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let typed = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(typed);
          return;
        }
        if (ch === "\u0003") { // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") typed = typed.slice(0, -1);
        else typed += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function pipedLines(): Promise<string[] | null> {
  if (process.stdin.isTTY) return null;
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text.split(/\r?\n/);
}

const piped = await pipedLines();
const password = await prompt("New admin password: ", piped);
const again = await prompt("Type it again: ", piped);

if (password !== again) {
  console.error("The two passwords did not match. Nothing was made; run it again.");
  process.exit(1);
}
if (!meetsPasswordRule(password)) {
  console.error(PASSWORD_RULE);
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const adminEmail = process.env.ADMIN_EMAIL || "the address in ADMIN_EMAIL";
console.log(`
Your admin password hash:

${hash}

Next:
1. In Replit, open Secrets and add ADMIN_PASSWORD_HASH with the line above as its value
   (or replace it, if it is there already). The published app needs it in its secrets too.
2. Stop and Run the app.
3. Sign in at /admin-login with ${adminEmail} and the password you just typed.
`);
