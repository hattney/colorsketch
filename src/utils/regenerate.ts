import { readPhoto } from './photoStash';
import type { StyleVariant, SubjectModule } from './prompt';

/**
 * Client half of `/api/regenerate`.
 *
 * The photo is read back out of the buyer's own browser rather than fetched from us — see
 * `photoStash.ts` for why the server does not keep one. A missing stash is an ordinary
 * outcome (different device, cleared storage, more than a day later), not an error, so it
 * gets its own result the UI can explain instead of a thrown exception.
 */

export type RegenOutcome =
  | {
      status: 'ok';
      variants: Partial<Record<StyleVariant, string>>;
      previous: Partial<Record<StyleVariant, string>>;
      regensLeft: number;
    }
  | { status: 'no-photo' }
  | { status: 'error'; message: string };

export async function regeneratePages(
  orderId: string,
  module: SubjectModule,
  otherWord: string,
): Promise<RegenOutcome> {
  const stashed = await readPhoto(orderId);
  if (!stashed) return { status: 'no-photo' };

  let res: Response;
  try {
    res = await fetch('/api/regenerate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        imageBase64: stashed.base64,
        mimeType: stashed.mimeType,
        module,
        otherWord,
      }),
    });
  } catch {
    return { status: 'error', message: 'Could not reach the redraw service. Please try again.' };
  }

  const body = (await res.json().catch(() => null)) as
    | {
        status?: string;
        variants?: Partial<Record<StyleVariant, string>>;
        previous?: Partial<Record<StyleVariant, string>>;
        regensLeft?: number;
        error?: string;
      }
    | null;

  if (!res.ok || body?.status !== 'ok' || !body.variants) {
    return { status: 'error', message: body?.error || 'The redraw did not work. Please try again.' };
  }

  return {
    status: 'ok',
    variants: body.variants,
    previous: body.previous ?? {},
    regensLeft: typeof body.regensLeft === 'number' ? body.regensLeft : 0,
  };
}
