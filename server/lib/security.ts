import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;

export interface PasswordRecord {
  passwordHash: string;
  passwordSalt: string;
  encryptionSalt: string;
}

export function createPasswordRecord(password: string): PasswordRecord {
  const passwordSalt = randomBase64(16);
  const encryptionSalt = randomBase64(16);
  const passwordHash = derivePasswordHash(password, passwordSalt);

  return {
    passwordHash,
    passwordSalt,
    encryptionSalt
  };
}

export function verifyPassword(password: string, record: PasswordRecord): boolean {
  const expected = Buffer.from(record.passwordHash, 'base64');
  const actual = Buffer.from(derivePasswordHash(password, record.passwordSalt), 'base64');

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function deriveEncryptionKey(password: string, encryptionSalt: string): Buffer {
  return scryptSync(password, encryptionSalt, KEY_LENGTH);
}

export function encryptJson(value: unknown, key: Buffer): { iv: string; data: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    data: Buffer.concat([encrypted, tag]).toString('base64')
  };
}

export function decryptJson<T>(payload: { iv: string; data: string }, key: Buffer): T {
  const raw = Buffer.from(payload.data, 'base64');
  const encrypted = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');

  return JSON.parse(json) as T;
}

export function randomToken(): string {
  return randomBase64(32).replace(/[+/=]/g, '');
}

function derivePasswordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('base64');
}

function randomBase64(size: number): string {
  return randomBytes(size).toString('base64');
}
