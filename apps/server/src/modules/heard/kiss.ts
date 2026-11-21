/**
 * KISS framing, as a TNC (Dire Wolf, a hardware modem) sends received packets to a
 * program over TCP. Written from the KISS protocol as Chepponis and Karn described it
 * (1987) and as Dire Wolf's user guide uses it ("KISS TCP"): a frame is FEND (0xC0), a
 * command byte, the data, FEND. Inside the data, FEND is sent as FESC TFEND (0xDB 0xDC)
 * and FESC as FESC TFESC (0xDB 0xDD). The command byte's low four bits are the command
 * (0 is a data frame, a received packet); the high four bits the TNC's port.
 *
 * Outpost only reads. It never sends a frame, so it never asks the TNC to transmit.
 *
 * Untrusted input: a frame longer than the limit is skipped whole, its bytes counted off
 * as they pass, so nothing large is ever held; a frame with a bad escape is dropped.
 */

export const FEND = 0xc0;
export const FESC = 0xdb;
export const TFEND = 0xdc;
export const TFESC = 0xdd;

/** An AX.25 frame is at most about 330 bytes (256 of information, ten addresses); a little room above it. */
export const MAX_KISS_FRAME = 512;

export interface KissFrame {
  /** The TNC's port (the high nibble of the command byte). */
  port: number;
  /** The AX.25 frame, without its checksum. */
  data: Buffer;
}

export class KissReader {
  private readonly buffer = Buffer.alloc(MAX_KISS_FRAME + 1);
  private length = 0;
  private escaped = false;
  private inFrame = false;
  private tooLong = false;
  private badEscape = false;
  /** Frames dropped as too long or wrongly escaped, and frames that were not data. */
  dropped = 0;
  other = 0;

  private readonly onFrame: (frame: KissFrame) => void;

  constructor(onFrame: (frame: KissFrame) => void) {
    this.onFrame = onFrame;
  }

  push(chunk: Uint8Array): void {
    for (const byte of chunk) {
      if (byte === FEND) {
        this.end();
        this.inFrame = true;
        continue;
      }
      if (!this.inFrame) continue;
      let value = byte;
      if (this.escaped) {
        this.escaped = false;
        if (byte === TFEND) value = FEND;
        else if (byte === TFESC) value = FESC;
        else {
          this.badEscape = true;
          continue;
        }
      } else if (byte === FESC) {
        this.escaped = true;
        continue;
      }
      if (this.tooLong) continue;
      if (this.length >= this.buffer.length) {
        this.tooLong = true;
        continue;
      }
      this.buffer[this.length++] = value;
    }
  }

  private end(): void {
    const length = this.length;
    const broken = this.tooLong || this.badEscape || this.escaped;
    this.length = 0;
    this.escaped = false;
    this.tooLong = false;
    this.badEscape = false;
    // Back-to-back FENDs are allowed between frames, and mean nothing.
    if (!this.inFrame || length === 0) return;
    if (broken) {
      this.dropped += 1;
      return;
    }
    const command = this.buffer[0]!;
    if ((command & 0x0f) !== 0) {
      this.other += 1;
      return;
    }
    this.onFrame({ port: command >> 4, data: Buffer.from(this.buffer.subarray(1, length)) });
  }
}

/** A frame as a TNC would send it: for tests, and the stand-in server. Outpost itself never sends one. */
export function kissEncode(data: Uint8Array, port = 0): Buffer {
  const out: number[] = [FEND, (port & 0x0f) << 4];
  for (const byte of data) {
    if (byte === FEND) out.push(FESC, TFEND);
    else if (byte === FESC) out.push(FESC, TFESC);
    else out.push(byte);
  }
  out.push(FEND);
  return Buffer.from(out);
}
