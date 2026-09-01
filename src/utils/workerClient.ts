import { renderLineArt, type LineArtOptions } from './lineart';
import type { WorkerRequest, WorkerResponse } from '../workers/lineart.worker';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (d: ImageData) => void; reject: (e: Error) => void }>();

/**
 * Set once a Worker cannot be constructed at all — a sandbox whose CSP refuses blob: or
 * data: workers, most notably the single-file review build. `renderLineArt` is pure pixel
 * work with no DOM access, so the main thread can run it; the page just blocks for the
 * duration instead of staying responsive. Correct everywhere, slower in one place.
 */
let workerUnavailable = false;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerUnavailable) return null;
  try {
    worker = new Worker(new URL('../workers/lineart.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    workerUnavailable = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { id, width, height, buffer, error } = e.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) {
      entry.reject(new Error(error));
      return;
    }
    entry.resolve(new ImageData(new Uint8ClampedArray(buffer), width, height));
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Worker crashed');
    pending.forEach((p) => p.reject(err));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Runs line-art processing off the main thread. Pixel buffer is transferred (source ImageData becomes unusable). */
export function processInWorker(source: ImageData, options: LineArtOptions): Promise<ImageData> {
  const id = ++seq;
  const req: WorkerRequest = {
    id,
    width: source.width,
    height: source.height,
    buffer: source.data.buffer as ArrayBuffer,
    options,
  };
  const w = getWorker();
  if (!w) {
    // Main-thread fallback. Yield first so the caller's loading state paints.
    return new Promise<ImageData>((resolve, reject) => {
      setTimeout(() => {
        try {
          const out = renderLineArt(
            { data: new Uint8ClampedArray(req.buffer), width: req.width, height: req.height },
            options,
          );
          resolve(new ImageData(out.data, out.width, out.height));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }, 0);
    });
  }

  return new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(req, [req.buffer]);
  });
}
