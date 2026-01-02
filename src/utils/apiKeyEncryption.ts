import crypto from 'crypto';

/**
 * API Key Encryption Utility
 * 
 * Encrypts user data into an API key that can be decrypted to verify the user.
 * Format: tlz_{encrypted_base64}
 * 
 * Encrypted payload contains: userId|plan|timestamp
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment (must be 32 bytes for AES-256)
function getEncryptionKey(): Buffer {
  const key = process.env.API_KEY_SECRET || process.env.CLERK_SECRET_KEY || '';
  // Use SHA-256 to ensure we have exactly 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

export interface ApiKeyPayload {
  userId: string;
  plan: 'free' | 'pro';
  createdAt: number; // Unix timestamp
}

/**
 * Encrypt user data into an API key
 */
export function encryptApiKey(payload: ApiKeyPayload): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const plaintext = `${payload.userId}|${payload.plan}|${payload.createdAt}`;
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: iv + authTag + encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);
  
  // Base64url encode (URL-safe)
  const base64 = combined.toString('base64url');
  
  return `tlz_${base64}`;
}

/**
 * Decrypt an API key to get the user data
 * Returns null if decryption fails (invalid key)
 */
export function decryptApiKey(apiKey: string): ApiKeyPayload | null {
  try {
    if (!apiKey || !apiKey.startsWith('tlz_')) {
      return null;
    }
    
    const base64 = apiKey.slice(4); // Remove 'tlz_' prefix
    const combined = Buffer.from(base64, 'base64url');
    
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return null;
    }
    
    const key = getEncryptionKey();
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    const plaintext = decrypted.toString('utf8');
    const parts = plaintext.split('|');
    
    if (parts.length !== 3) {
      return null;
    }
    
    const [userId, plan, createdAtStr] = parts;
    const createdAt = parseInt(createdAtStr, 10);
    
    if (!userId || !['free', 'pro'].includes(plan) || isNaN(createdAt)) {
      return null;
    }
    
    return {
      userId,
      plan: plan as 'free' | 'pro',
      createdAt,
    };
  } catch {
    // Decryption failed - invalid key
    return null;
  }
}

/**
 * Validate that an API key is not expired
 * Keys expire after 1 year by default
 */
export function isApiKeyExpired(payload: ApiKeyPayload, maxAgeMs: number = 365 * 24 * 60 * 60 * 1000): boolean {
  const now = Date.now();
  return now - payload.createdAt > maxAgeMs;
}

