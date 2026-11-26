/**
 * Product photos are thumbnails: the biggest place one is shown is about a
 * hundred points across. So they are stored that small -- a 4 MB camera shot
 * becomes roughly 10 KB -- which keeps the product list fast on a weak signal
 * and the storage bill at nothing.
 */
export const THUMB_MAX_SIDE = 256;
export const THUMB_QUALITY = 0.68;

/** The size that fits inside max x max keeping the shape. Never enlarges. */
export function fitWithin(width, height, max = THUMB_MAX_SIDE) {
  const w = Number(width) || 0, h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * A small JPEG copy of a picked image file.
 *
 * Returns { file, error }. On any failure `file` is null and `error` says why;
 * the caller decides what to do -- it must not quietly upload the original,
 * which is exactly the multi-megabyte file this exists to avoid.
 */
export async function shrinkImageFile(file, { max = THUMB_MAX_SIDE, quality = THUMB_QUALITY } = {}) {
  try {
    if (!file || !String(file.type || '').startsWith('image/')) {
      return { file: null, error: 'That file is not a picture.' };
    }
    // imageOrientation: a phone photo taken upright is stored sideways with a
    // "rotate me" note; without this the thumbnail comes out on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // JPEG has no see-through: a cut-out product on a clear background would
    // otherwise turn black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return { file: null, error: 'This browser could not make the picture smaller.' };
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return { file: new File([blob], `${base}.jpg`, { type: 'image/jpeg' }), error: null };
  } catch (e) {
    return { file: null, error: `This picture could not be read (${e?.message || e}). Try a JPG or PNG.` };
  }
}
