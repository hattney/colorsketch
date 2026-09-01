/**
 * Identifiers (PHASE2_GUIDE.md §2, §(B)).
 *
 * `orderId` is the only credential the download flow has — anyone holding it can fetch the
 * paid file — so it is a 21-char nanoid (~126 bits), never a sequence. `imageHash` is the
 * SHA-256 of the uploaded bytes and is the cache key: the same photo with the same subject
 * module must not pay for a second model call.
 */
import { nanoid } from 'nanoid';

export function newOrderId(): string {
  return nanoid(21);
}

/** Lowercase hex SHA-256. Accepts raw bytes or a string. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of a base64 string's decoded bytes — the form `/api/ai-preview` receives the upload in. */
export async function sha256HexOfBase64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return sha256Hex(bytes);
}
