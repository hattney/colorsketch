/**
 * The buyer's photo, kept on their own device and nowhere else.
 *
 * Redrawing a purchased page needs the original photo again, and checkout leaves the site,
 * so by the time someone is back on `/edit` the upload is long gone from memory. The obvious
 * fix is to keep a copy on the server — and that is exactly the copy this product should not
 * be holding. Free conversions never leave the browser at all, and the paid path already
 * promises the photo is only passed through, so storing it to enable a convenience feature
 * would quietly weaken the strongest claim the site makes.
 *
 * So the copy lives in the buyer's own IndexedDB, keyed by order, and is handed back up for
 * the one request that needs it. Server-side storage stays at zero.
 *
 * The trade is real and worth naming: redrawing only works in the browser that bought the
 * order, and only for a day. Downloading, printing and editing the delivered pages work
 * anywhere, forever — it is the redraw that is device-bound, and a buyer who moved devices is
 * asked to re-upload rather than told no.
 */

const DB_NAME = 'colorsketch';
const DB_VERSION = 1;
const STORE = 'photos';

/** Long enough to cover second thoughts the same evening, short enough to be nearly nothing. */
export const STASH_TTL_MS = 24 * 60 * 60 * 1000;

export interface StashedPhoto {
  orderId: string;
  base64: string;
  mimeType: string;
  storedAt: number;
}

/** Resolves null rather than throwing: private windows and blocked storage are normal, not errors. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'orderId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Drops everything past its day. Runs on every open so nothing lingers unnoticed. */
async function purgeExpired(db: IDBDatabase): Promise<void> {
  const all = await tx<StashedPhoto[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<StashedPhoto[]>);
  if (!all) return;
  const cutoff = Date.now() - STASH_TTL_MS;
  const stale = all.filter((p) => !p?.storedAt || p.storedAt < cutoff);
  if (!stale.length) return;
  await Promise.all(stale.map((p) => tx(db, 'readwrite', (s) => s.delete(p.orderId))));
}

/** Keeps the upload that produced `orderId`. Silent on failure — this is a convenience, not the product. */
export async function stashPhoto(orderId: string, base64: string, mimeType: string): Promise<void> {
  if (!orderId || !base64) return;
  const db = await openDb();
  if (!db) return;
  try {
    await purgeExpired(db);
    await tx(db, 'readwrite', (s) =>
      s.put({ orderId, base64, mimeType, storedAt: Date.now() } satisfies StashedPhoto),
    );
  } finally {
    db.close();
  }
}

/** The stashed upload, or null when it was never here, has expired, or storage is unavailable. */
export async function readPhoto(orderId: string): Promise<StashedPhoto | null> {
  if (!orderId) return null;
  const db = await openDb();
  if (!db) return null;
  try {
    await purgeExpired(db);
    const found = await tx<StashedPhoto>(db, 'readonly', (s) => s.get(orderId) as IDBRequest<StashedPhoto>);
    if (!found?.base64) return null;
    if (Date.now() - (found.storedAt ?? 0) > STASH_TTL_MS) return null;
    return found;
  } finally {
    db.close();
  }
}

/** Forgets one order's photo — used once its redraws are spent. */
export async function forgetPhoto(orderId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, 'readwrite', (s) => s.delete(orderId));
  } finally {
    db.close();
  }
}
