/**
 * Identifiers (PHASE2_GUIDE.md §2, §(B)).
 *
 * `orderId` is the only credential the download flow has — anyone holding it can fetch the
 * paid file — so it is a 21-char URL-safe id (~126 bits), never a sequence. `imageHash` is
 * the SHA-256 of the uploaded bytes and is the cache key.
 *
 * The id generator is inlined (it is nanoid's algorithm) rather than pulled from the `nanoid`
 * package: nanoid v6 is ESM-only and Vercel's function bundler `require()`s it as CJS, which
 * crashes the whole function with ERR_REQUIRE_ESM. `crypto.getRandomValues` is a global on
 * both the Node and Edge runtimes.
 */

// nanoid's default URL-safe alphabet: A-Za-z0-9 plus `_` and `-`, 64 symbols.
const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

export function newOrderId(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] & 63];
  return id;
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
