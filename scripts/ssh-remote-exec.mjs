#!/usr/bin/env node
/**
 * Одноразовый SSH-раннер для VPS (пароль из SSHPASS / argv).
 * Usage: SSHPASS=secret node scripts/ssh-remote-exec.mjs root@host "command"
 */
import { Client } from "ssh2";

const hostSpec = process.argv[2];
const command = process.argv[3];
const password = process.env.SSHPASS;

if (!hostSpec || !command) {
  console.error("Usage: SSHPASS=... node scripts/ssh-remote-exec.mjs user@host \"remote command\"");
  process.exit(1);
}
if (!password) {
  console.error("Set SSHPASS environment variable");
  process.exit(1);
}

const m = /^([^@]+)@([^:]+)(?::(\d+))?$/.exec(hostSpec);
if (!m) {
  console.error("Invalid host spec:", hostSpec);
  process.exit(1);
}
const [, username, host, portStr] = m;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(command, (err, stream) => {
      if (err) {
        console.error(err.message);
        conn.end();
        process.exit(1);
      }
      let code = 0;
      stream
        .on("close", (exitCode) => {
          code = exitCode ?? 0;
          conn.end();
        })
        .on("data", (d) => process.stdout.write(d))
        .stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", () => process.exit(code));
    });
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({
    host,
    port: portStr ? Number(portStr) : 22,
    username,
    password,
    readyTimeout: 20_000,
  });
