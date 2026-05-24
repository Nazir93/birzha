#!/usr/bin/env node
/** Загрузить локальный .sh на VPS и выполнить: SSHPASS=... node scripts/ssh-run-script.mjs user@host path/to/script.sh */
import { readFileSync } from "node:fs";
import { Client } from "ssh2";

const hostSpec = process.argv[2];
const scriptPath = process.argv[3];
const password = process.env.SSHPASS;

if (!hostSpec || !scriptPath || !password) {
  console.error("Usage: SSHPASS=... node scripts/ssh-run-script.mjs user@host script.sh");
  process.exit(1);
}

const script = readFileSync(scriptPath, "utf8");
const m = /^([^@]+)@([^:]+)$/.exec(hostSpec);
if (!m) {
  console.error("Invalid host:", hostSpec);
  process.exit(1);
}
const [, username, host] = m;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec("bash -s", (err, stream) => {
      if (err) {
        console.error(err.message);
        process.exit(1);
      }
      let code = 0;
      stream
        .on("close", (c) => {
          conn.end();
          process.exit(c ?? code);
        })
        .on("data", (d) => process.stdout.write(d))
        .stderr.on("data", (d) => process.stderr.write(d));
      stream.write(script);
      stream.end();
    });
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username, password, readyTimeout: 30_000 });
