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

function decodeToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
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
