// Passwords are never stored in plain text. Each one gets its own random salt,
// and the hash is computed with scrypt, a slow function that resists guessing.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, KEY_LENGTH);
  return { salt, hash: key.toString('hex') };
}

export async function verifyPassword(password, { salt, hash }) {
  const key = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
