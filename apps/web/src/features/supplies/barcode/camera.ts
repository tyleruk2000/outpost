/**
 * Reading barcodes from the camera, or from a photo.
 *
 * A live camera (`getUserMedia`) is offered by browsers only to a secure page: https, or
 * the computer itself. At a plain http address on a home network it is missing, so
 * `cameraState` says so before anything is called, and the screen says what to do. A
 * photo taken through a file input (`<input type="file" capture>`) needs no secure page,
 * so it is offered everywhere.
 *
 * The browser's own `BarcodeDetector` is used where it exists (Chrome on Android and
 * on some desktops); Safari has none, and there the reader in decode.ts does the work.
 */
import { type BarcodeFormat, type BarcodeRead, decodeBarcode, toLuma } from "./decode";

export type CameraState = "available" | "insecure" | "missing";

export function cameraState(): CameraState {
  if (typeof window === "undefined") return "missing";
  if (!window.isSecureContext) return "insecure";
  return typeof navigator.mediaDevices?.getUserMedia === "function" ? "available" : "missing";
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface Detector {
  detect(source: CanvasImageSource | ImageBitmap): Promise<DetectedBarcode[]>;
}
interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
let detector: Promise<Detector | null> | null = null;

/** The browser's own reader, when it has one that reads retail codes. */
export function nativeDetector(): Promise<Detector | null> {
  if (detector) return detector;
  const Class = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  detector = Class
    ? Class.getSupportedFormats()
        .then((formats) => {
          const usable = WANTED.filter((format) => formats.includes(format));
          return usable.length > 0 ? new Class({ formats: usable }) : null;
        })
        .catch(() => null)
    : Promise.resolve(null);
  return detector;
}

const FORMAT_WORDS: Record<string, string> = { ean_13: "EAN-13", upc_a: "UPC-A", ean_8: "EAN-8", code_128: "Code 128", upc_e: "UPC-E" };
export const formatWords = (format: string): string => FORMAT_WORDS[format] ?? format;

/** A picture drawn no larger than `longest` pixels on its long side, as brightness. */
function pixels(
  source: CanvasImageSource,
  width: number,
  height: number,
  longest: number,
  crop?: { x: number; y: number; w: number; h: number },
) {
  const area = crop ?? { x: 0, y: 0, w: width, h: height };
  const scale = Math.min(1, longest / Math.max(area.w, area.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.w * scale));
  canvas.height = Math.max(1, Math.round(area.h * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, luma: toLuma(data.data, canvas.width, canvas.height) };
}

async function readSource(source: CanvasImageSource, width: number, height: number, quick: boolean): Promise<BarcodeRead | null> {
  const native = await nativeDetector();
  if (native) {
    try {
      const found = await native.detect(source);
      if (found[0]) return { format: found[0].format as BarcodeFormat, text: found[0].rawValue, count: found.length };
    } catch {
      // Fall through to Outpost's own reader.
    }
  }
  const whole = pixels(source, width, height, quick ? 720 : 1280);
  const read = whole ? decodeBarcode(whole.luma, { quick }) : null;
  if (read || quick) return read;
  // A small code in a large photo: look again at the middle, nearer its own size.
  const middle = pixels(source, width, height, 1280, { x: width / 4, y: height / 4, w: width / 2, h: height / 2 });
  return middle ? decodeBarcode(middle.luma) : null;
}

/** The barcode in a photo the person took or chose; null when none could be read. */
export async function readPhoto(file: File): Promise<BarcodeRead | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return await readSource(image, image.naturalWidth, image.naturalHeight, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Watches the camera until a code is read the same twice in a row, or `signal` ends it,
 * or the page is hidden (another tab, a locked phone): then every track of the camera is
 * stopped and the reading of frames with it. Frames are read about five times a second,
 * which leaves a phone room to draw.
 */
export async function scanCamera(video: HTMLVideoElement, signal: AbortSignal): Promise<BarcodeRead | null> {
  const ended = new AbortController();
  const end = () => ended.abort();
  const hidden = () => {
    if (document.visibilityState === "hidden") end();
  };
  signal.addEventListener("abort", end, { once: true });
  document.addEventListener("visibilitychange", hidden);
  if (signal.aborted) end();
  let stream: MediaStream | null = null;
  const stop = () => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    video.srcObject = null;
  };
  ended.signal.addEventListener("abort", stop, { once: true });
  /** A fifth of a second, or less when the scan is ended meanwhile. */
  const pause = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, 200);
      ended.signal.addEventListener("abort", done, { once: true });
      function done() {
        clearTimeout(timer);
        ended.signal.removeEventListener("abort", done);
        resolve();
      }
    });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    if (ended.signal.aborted) return null;
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.muted = true;
    await video.play();
    let last: string | null = null;
    while (!ended.signal.aborted) {
      await pause();
      if (ended.signal.aborted || video.videoWidth === 0) continue;
      const read = await readSource(video, video.videoWidth, video.videoHeight, true);
      if (!read) {
        last = null;
        continue;
      }
      if (read.text === last) return read;
      last = read.text;
    }
    return null;
  } finally {
    stop();
    signal.removeEventListener("abort", end);
    document.removeEventListener("visibilitychange", hidden);
  }
}
