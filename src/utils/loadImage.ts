function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/**
 * The object URL behind the image currently open in the editor.
 *
 * It used to be revoked the moment the image decoded, on the reasoning that a decoded
 * HTMLImageElement no longer needs its source. That is true for canvas work and false for
 * everything else: `img.src` is read back later — the AI panel shows the photo it is
 * working from — and a revoked URL renders there as a broken image. Only one upload is ever
 * open at a time, so holding exactly one URL and releasing it when the next arrives keeps
 * the source usable without accumulating anything.
 */
let liveUrl: string | null = null;

function decodeToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (liveUrl) URL.revokeObjectURL(liveUrl);
    const url = URL.createObjectURL(blob);
    liveUrl = url;
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      // A failed decode is the one case with nothing left to point at the URL, including
      // the HEIC path's native-first attempt before it falls back to conversion.
      if (liveUrl === url) {
        URL.revokeObjectURL(url);
        liveUrl = null;
      }
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

async function convertHeic(file: File): Promise<Blob> {
  // Lazy import: libheif WASM is heavy, only iPhone HEIC uploads pay for it.
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}

export class UnsupportedImageError extends Error {
  constructor() {
    super('unsupported-image');
  }
}

/**
 * Decodes any user upload into an HTMLImageElement.
 * HEIC/HEIF (iPhone default): tries native decode first (Safari on Apple devices),
 * falls back to heic2any conversion elsewhere.
 */
export async function fileToImage(file: File): Promise<HTMLImageElement> {
  if (isHeic(file)) {
    try {
      return await decodeToImage(file); // Safari can often decode natively
    } catch {
      try {
        const jpeg = await convertHeic(file);
        return await decodeToImage(jpeg);
      } catch {
        throw new UnsupportedImageError();
      }
    }
  }

  try {
    return await decodeToImage(file);
  } catch {
    throw new UnsupportedImageError();
  }
}
