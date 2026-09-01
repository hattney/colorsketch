import { renderLineArt, type LineArtOptions } from '../utils/lineart';

export interface WorkerRequest {
  id: number;
  width: number;
  height: number;
  /** RGBA pixels, transferred. */
  buffer: ArrayBuffer;
  options: LineArtOptions;
}

export interface WorkerResponse {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, width, height, buffer, options } = e.data;
  try {
    const result = renderLineArt(
      { data: new Uint8ClampedArray(buffer), width, height },
      options,
    );
    const out: WorkerResponse = {
      id,
      width: result.width,
      height: result.height,
      buffer: result.data.buffer as ArrayBuffer,
    };
    (self as unknown as Worker).postMessage(out, [out.buffer]);
  } catch (err) {
    const out: WorkerResponse = {
      id,
      width,
      height,
      buffer: new ArrayBuffer(0),
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(out);
  }
};
