/**
 * AES-256-GCM for secrets at rest (provider GitHub PATs). Server-only (node:crypto).
 *
 * Key: `PAT_ENCRYPTION_KEY`, base64 of exactly 32 random bytes
 * (`openssl rand -base64 32`). During a rotation, set the old key as
 * `PAT_ENCRYPTION_KEY_PREV`: new secrets are sealed with the current key, and opening
 * falls back to the previous one. Each seal uses a fresh 12-byte IV; the 16-byte GCM tag
 * is stored separately. Optional AAD binds a ciphertext to its row (e.g. `submission:<id>`).
 * Errors never include key material or plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SealedSecret {
  /** base64 */
  ciphertext: string;
  /** base64, 12 bytes */
  iv: string;
  /** base64, 16 bytes */
  tag: string;
}

export type SecretBoxErrorCode = 'key_missing' | 'key_invalid' | 'decrypt_failed';

export class SecretBoxError extends Error {
  readonly code: SecretBoxErrorCode;

  constructor(code: SecretBoxErrorCode, message: string) {
    super(message);
    this.name = 'SecretBoxError';
    this.code = code;
  }
}

type Env = Record<string, string | undefined>;

export interface SecretBoxOptions {
  aad?: string;
  env?: Env;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Decode a base64 key; throws unless it is exactly 32 bytes. */
export function parseKey(value: string | undefined, name: string): Buffer {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw new SecretBoxError('key_missing', `${name} is not configured`);
  const key = /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) ? Buffer.from(trimmed, 'base64') : null;
  if (key?.length !== KEY_BYTES) throw new SecretBoxError('key_invalid', `${name} must be base64 of ${KEY_BYTES} bytes`);
  return key;
}

function decryptionKeys(env: Env): Buffer[] {
  const keys = [parseKey(env.PAT_ENCRYPTION_KEY, 'PAT_ENCRYPTION_KEY')];
  try {
    keys.push(parseKey(env.PAT_ENCRYPTION_KEY_PREV, 'PAT_ENCRYPTION_KEY_PREV'));
  } catch {
    // no previous key, or a broken one: secrets sealed with the current key still open
  }
  return keys;
}

export function seal(plaintext: string, { aad, env = process.env }: SecretBoxOptions = {}): SealedSecret {
  const key = parseKey(env.PAT_ENCRYPTION_KEY, 'PAT_ENCRYPTION_KEY');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function open(sealed: SealedSecret, { aad, env = process.env }: SecretBoxOptions = {}): string {
  const keys = decryptionKeys(env);
  const iv = Buffer.from(sealed.iv, 'base64');
  const tag = Buffer.from(sealed.tag, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretBoxError('decrypt_failed', 'Sealed secret is malformed');
  }
  const data = Buffer.from(sealed.ciphertext, 'base64');
  for (const key of keys) {
    try {
      // IV and tag lengths are checked above, so GCM never accepts a truncated tag
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      if (aad !== undefined) decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString();
    } catch {
      // wrong key or tampered data: try the next key
    }
  }
  throw new SecretBoxError('decrypt_failed', 'Could not decrypt the secret with the configured keys');
}
