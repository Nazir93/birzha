#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Client } from "ssh2";

const hostSpec = process.argv[2];
const localPath = process.argv[3];
const remotePath = process.argv[4];
const password = process.env.SSHPASS;

if (!hostSpec || !localPath || !remotePath || !password) {
  console.error("Usage: SSHPASS=... node scripts/ssh-upload.mjs user@host local remote");
  process.exit(1);
}

const body = readFileSync(localPath);
const m = /^([^@]+)@([^:]+)$/.exec(hostSpec);
if (!m) process.exit(1);
const [, username, host] = m;

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err.message);
        process.exit(1);
      }
      const stream = sftp.createWriteStream(remotePath);
      stream.on("close", () => {
        console.log(`uploaded ${basename(localPath)} -> ${remotePath}`);
        conn.end();
      });
      stream.on("error", (e) => {
        console.error(e.message);
        process.exit(1);
      });
      stream.end(body);
    });
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username, password, readyTimeout: 30_000 });
