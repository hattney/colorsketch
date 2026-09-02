/**
 * Preview cache (PHASE2_GUIDE.md §2, §3-1 step 3).
 *
 * The same photo with the same subject module produces the same page, so a repeat request
 * must not pay for a second model call. The key includes the module *and* the "Other" word,
 * because both change the prompt — dropping either would serve a nature page for a request
 * that asked for a portrait.
 *
 * The bytes go to Blob (a 1280px image does not belong in a Redis value); Redis holds only
 * the URL. Both expire at 7 days, matching the order TTL and the Terms §8 deletion window.
 */
import type { StyleVariant, SubjectModule } from '../../src/utils/prompt';
import { cacheImagePath, putBytes } from './blob';
import { redisGetJSON, redisSetJSON } from './redis';

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Filesystem-safe stand-in for the sanitized "Other" word (letters, digits, spaces, hyphens only). */
function otherKey(otherWord?: string): string {
  return otherWord ? otherWord.replace(/\s+/g, '_') : '-';
}

export function variantCacheKey(
  imageHash: string,
  module: SubjectModule,
  otherWord: string | undefined,
  variant: StyleVariant,
): string {
  return `cache:${imageHash}:${module}:${otherKey(otherWord)}:${variant}`;
}

export interface CachedVariant {
  /** Blob URL of the watermark-free model output, at the resolution the model returned. */
  originalUrl: string;
  /** `image/png` or `image/jpeg` — whatever the model produced. */
  contentType: string;
}

export async function getCachedVariant(
  imageHash: string,
  module: SubjectModule,
  otherWord: string | undefined,
  variant: StyleVariant,
): Promise<CachedVariant | null> {
  return redisGetJSON<CachedVariant>(variantCacheKey(imageHash, module, otherWord, variant));
}

/** Uploads the model output to the cache path and records its URL. Returns what a cache hit would. */
export async function putCachedVariant(
  imageHash: string,
  module: SubjectModule,
  otherWord: string | undefined,
  variant: StyleVariant,
  bytes: Uint8Array,
  contentType: string,
): Promise<CachedVariant> {
  const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
  const url = await putBytes(
    cacheImagePath(imageHash, module, otherKey(otherWord), variant, ext),
    bytes,
    { contentType, addRandomSuffix: true },
  );
  const value: CachedVariant = { originalUrl: url, contentType };
  await redisSetJSON(
    variantCacheKey(imageHash, module, otherWord, variant),
    value,
    CACHE_TTL_SECONDS,
  );
  return value;
}
