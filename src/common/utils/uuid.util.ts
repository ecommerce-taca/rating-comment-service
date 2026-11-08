import { randomBytes, randomUUID } from 'node:crypto';

/** Generates a time-ordered UUIDv7 compliant with RFC 9562 using native node:crypto.
 *  Avoids external ESM package compatibility issues under CommonJS Jest runtime.
 */
export function generateId(): string {
  const bytes = randomBytes(16);
  const now = Date.now();

  // 48-bit timestamp in milliseconds
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7 (0b0111) in bits 48-51
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;

  // Variant 1 (0b10) in bits 64-65
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Generates a standard UUIDv4 as fallback. */
export function generateUuidV4(): string {
  return randomUUID();
}
