/**
 * Bringing a page's pictures along.
 *
 * Only pictures inside the article are considered, and only when the person asked for
 * them. Each is fetched through the same guarded client as the page, one at a time,
 * with nothing sent but the client's name and the picture types wanted: no cookie and
 * no referrer, so a picture host learns that this computer asked for a picture and
 * nothing about which page or which person.
 *
 * There are limits on how many, how large each, how large in all, and how long the
 * whole of it may take. A picture over a limit, or that is not a picture, is left
 * out and the page is saved without it: its description stays in the text.
 */
import type { SkippedPicture, WebPageLimits } from "@outpost/shared";
import type { HttpClient } from "../../core/http.ts";
import { type PictureMime, pictureTypeOf } from "../documents/embedded-pictures.ts";
import { imageSize } from "../ocr/image-size.ts";
import { describeStatus, fetchLimited, megabytes, PrivateAddressError, TooLargeError, TooSlowError } from "./fetch.ts";

export const PICTURE_ACCEPT = "image/png, image/jpeg, image/gif, image/webp";

/** Narrower or shorter than this is a spacer or a counter, not something to look at. */
const SMALLEST_SIDE = 8;

export interface PictureLimits {
  count: number;
  eachBytes: number;
  totalBytes: number;
  /** Longest one picture may take. */
  eachTimeoutMs: number;
  /** Longest all of them may take together. */
  totalTimeoutMs: number;
}

export interface KeptPicture {
  url: string;
  mime: PictureMime;
  bytes: Buffer;
}

export interface PictureOutcome {
  kept: KeptPicture[];
  skipped: SkippedPicture[];
  /** Addresses that answered with something too small to be a picture; they are taken out of the text. */
  notPictures: string[];
}

export const limitsFor = (limits: WebPageLimits): PictureLimits => ({
  count: limits.pictures,
  eachBytes: limits.pictureBytes,
  totalBytes: limits.picturesTotalBytes,
  eachTimeoutMs: 20_000,
  totalTimeoutMs: 180_000,
});

export async function fetchPictures(
  client: HttpClient,
  addresses: readonly string[],
  limits: PictureLimits,
  options: { signal: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<PictureOutcome> {
  const outcome: PictureOutcome = { kept: [], skipped: [], notPictures: [] };
  const wanted = addresses.slice(0, limits.count);
  for (const url of addresses.slice(limits.count)) {
    outcome.skipped.push({
      url,
      reason: `The page has more than ${limits.count} pictures, which is the most Outpost brings with one page.`,
    });
  }
  const deadline = Date.now() + limits.totalTimeoutMs;
  let total = 0;
  for (const [index, url] of wanted.entries()) {
    options.signal.throwIfAborted();
    options.onProgress?.(index, wanted.length);
    const skip = (reason: string) => outcome.skipped.push({ url, reason });
    const left = limits.totalBytes - total;
    const timeLeft = deadline - Date.now();
    if (left <= 0) {
      skip(`The pictures before it came to ${megabytes(limits.totalBytes)}, which is the most Outpost brings with one page.`);
      continue;
    }
    if (timeLeft <= 0) {
      skip("The pictures before it took all the time Outpost allows for a page's pictures.");
      continue;
    }
    try {
      const fetched = await fetchLimited(client, url, {
        accept: PICTURE_ACCEPT,
        maxBytes: Math.min(limits.eachBytes, left),
        timeoutMs: Math.min(limits.eachTimeoutMs, timeLeft),
        signal: options.signal,
        what: "the picture",
      });
      if (fetched.status < 200 || fetched.status >= 300) {
        skip(describeStatus(fetched.status, "the picture"));
        continue;
      }
      const mime = pictureTypeOf(fetched.bytes);
      if (!mime) {
        skip("It is not a PNG, JPEG, GIF or WebP picture, which are the kinds Outpost keeps.");
        continue;
      }
      const size = imageSize(fetched.bytes);
      if (size && (size.width < SMALLEST_SIDE || size.height < SMALLEST_SIDE)) {
        outcome.notPictures.push(url);
        continue;
      }
      total += fetched.bytes.length;
      outcome.kept.push({ url, mime, bytes: fetched.bytes });
    } catch (error) {
      // Stopped by the person: the whole save stops, not just this picture.
      if (options.signal.aborted) throw error;
      if (error instanceof TooLargeError) {
        skip(
          left < limits.eachBytes
            ? `With it the pictures would come to more than ${megabytes(limits.totalBytes)}, which is the most Outpost brings with one page.`
            : `It is larger than ${megabytes(limits.eachBytes)}, which is the most Outpost fetches for one picture.`,
        );
      } else if (error instanceof TooSlowError) skip("It did not arrive in time.");
      else if (error instanceof PrivateAddressError)
        skip("It is at an address on this computer or a private network, which Outpost does not fetch from.");
      else skip(error instanceof Error ? error.message : "It could not be fetched.");
    }
  }
  options.onProgress?.(wanted.length, wanted.length);
  return outcome;
}
