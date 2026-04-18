import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt$";
const SALT_BYTES = 16;
const KEY_LEN = 64;

/** Формат: `scrypt$<hex_salt>$<hex_key>`. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, KEY_LEN);
  return `${PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) {
    return false;
  }
  const rest = stored.slice(PREFIX.length);
  const firstSep = rest.indexOf("$");
  if (firstSep <= 0) {
    return false;
  }
  const saltHex = rest.slice(0, firstSep);
  const keyHex = rest.slice(firstSep + 1);
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(keyHex)) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_LEN) {
    return false;
  }
  const actual = scryptSync(plain, salt, KEY_LEN);
  return timingSafeEqual(actual, expected);
}
