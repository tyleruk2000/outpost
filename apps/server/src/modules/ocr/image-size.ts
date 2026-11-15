/**
 * The pixel size of an image file, read from its first bytes without decoding it, so
 * that a picture too large to read safely is turned away before any memory is spent.
 */

export interface ImageSize {
  width: number;
  height: number;
}

function png(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  if (bytes.length < 24 || view.getUint32(12) !== 0x49484452) return undefined;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gif(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  if (bytes.length < 10) return undefined;
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpeg(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  let at = 2;
  while (at + 9 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] ?? 0;
    // Padding, and markers that stand alone with no length after them.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    // Start-of-frame markers carry the size; C4, C8 and CC are other things.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + view.getUint16(at + 2);
  }
  return undefined;
}

function webp(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  if (bytes.length < 30) return undefined;
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === "VP8X") {
    return {
      width: 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)),
      height: 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)),
    };
  }
  if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return undefined;
}

/** Undefined when the bytes are not the start of a PNG, JPEG, GIF or WebP file that states its size. */
export function imageSize(bytes: Uint8Array): ImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return png(bytes, view);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes, view);
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return gif(bytes, view);
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return webp(bytes, view);
  } catch {
    // Cut short: a damaged file, which the engine will report in its own way.
  }
  return undefined;
}
