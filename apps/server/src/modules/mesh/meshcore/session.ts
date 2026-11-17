/**
 * One conversation with a MeshCore companion radio over a stream (a serial device or a
 * TCP connection): start the app, learn the radio's name and channel slots, take the
 * messages it holds, and send a channel's text.
 *
 * Commands go one at a time and each waits for its answer; a push from the radio
 * (0x80 and above) can arrive at any moment and is never taken for an answer. When the
 * radio says messages are waiting, they are taken one by one until it says there are no
 * more. Between frames nothing runs: the one timer is the wait for an answer to a
 * command that has been sent.
 */
import type { Duplex } from "node:stream";
import {
  appStart,
  type ChannelMessage,
  deviceQuery,
  encodeFrame,
  FrameReader,
  getChannel,
  isPush,
  PUSH,
  parseChannelInfo,
  parseChannelMessage,
  parseSelfInfo,
  parseSent,
  RESP,
  sendChannelText,
  syncNextMessage,
} from "./frames.ts";

/** How long a command waits for the radio's answer. */
const ANSWER_MS = 10_000;
/** Slots asked for when starting: MeshCore radios have a handful; a radio answers ERR past its last. */
const MOST_SLOTS = 8;
/** Messages taken in one go, so that a radio that never says "no more" cannot keep Outpost busy. */
const MOST_PER_SYNC = 100;

export interface CompanionInfo {
  radioName: string | null;
  channels: Array<{ index: number; name: string }>;
}

export interface CompanionSessionOptions {
  stream: Duplex;
  onMessage(message: ChannelMessage): void;
  /** The stream ended or failed; the session is over. */
  onClose(error: Error | null): void;
  answerMs?: number;
}

interface Pending {
  resolve(frame: Buffer): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export class CompanionSession {
  private readonly stream: Duplex;
  private readonly options: CompanionSessionOptions;
  private readonly reader = new FrameReader();
  private readonly queue: Array<() => void> = [];
  private pending: Pending | null = null;
  private busy = false;
  private closed = false;
  private syncing = false;
  private syncAgain = false;

  constructor(options: CompanionSessionOptions) {
    this.options = options;
    this.stream = options.stream;
    this.stream.on("data", (chunk: Buffer) => {
      for (const frame of this.reader.push(chunk)) this.frame(frame);
    });
    this.stream.on("error", (error: Error) => this.end(error));
    this.stream.on("close", () => this.end(null));
    this.stream.on("end", () => this.end(null));
  }

  /** Starts the app on the radio and reads what it is. Then takes any messages it holds. */
  async start(): Promise<CompanionInfo> {
    const self = parseSelfInfo(await this.command(appStart()));
    // Asked as the documentation's start-up does; what it answers is not needed here.
    await this.command(deviceQuery()).catch(() => undefined);
    const channels: CompanionInfo["channels"] = [];
    for (let index = 0; index < MOST_SLOTS; index += 1) {
      const answer = await this.command(getChannel(index));
      const info = parseChannelInfo(answer);
      if (!info) break;
      if (info.name) channels.push({ index: info.index, name: info.name });
    }
    void this.sync();
    return { radioName: self?.name || null, channels };
  }

  /** Sends text on a channel slot. Resolves when the radio says it has sent it. */
  async sendChannelText(index: number, text: string): Promise<{ flood: boolean }> {
    const answer = await this.command(sendChannelText(index, text, Math.floor(Date.now() / 1000)));
    if (answer[0] === RESP.err) throw new Error(`The radio refused the message (error ${answer[1] ?? "?"}).`);
    const sent = parseSent(answer);
    if (!sent) {
      if (answer[0] === RESP.ok) return { flood: true };
      throw new Error(`The radio answered with something other than "sent" (0x${(answer[0] ?? 0).toString(16)}).`);
    }
    return { flood: sent.flood };
  }

  close(): void {
    if (this.closed) return;
    this.stream.destroy();
    this.end(null);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // ── Inside ──

  private end(error: Error | null): void {
    if (this.closed) return;
    this.closed = true;
    const gone = new Error("The radio's connection closed.");
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error ?? gone);
      this.pending = null;
    }
    for (const waiting of this.queue.splice(0)) waiting();
    this.options.onClose(error);
  }

  private frame(frame: Buffer): void {
    const code = frame[0];
    if (code === undefined) return;
    if (isPush(code)) {
      if (code === PUSH.messagesWaiting) void this.sync();
      return;
    }
    const pending = this.pending;
    if (!pending) return; // An answer nobody asked for: ignored.
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(frame);
  }

  /** Sends one command and waits for its answer, after any command already waiting. */
  private command(payload: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const run = () => {
        if (this.closed) {
          reject(new Error("The radio's connection is closed."));
          this.next();
          return;
        }
        this.pending = {
          resolve: (frame) => {
            resolve(frame);
            this.next();
          },
          reject: (error) => {
            reject(error);
            this.next();
          },
          timer: setTimeout(() => {
            const waiting = this.pending;
            this.pending = null;
            waiting?.reject(new Error("The radio did not answer in time."));
          }, this.options.answerMs ?? ANSWER_MS),
        };
        this.stream.write(encodeFrame(payload));
      };
      if (this.busy) this.queue.push(run);
      else {
        this.busy = true;
        run();
      }
    });
  }

  private next(): void {
    const run = this.queue.shift();
    if (run) run();
    else this.busy = false;
  }

  /** Takes the messages the radio holds, one at a time, until it says there are no more. */
  private async sync(): Promise<void> {
    if (this.syncing) {
      this.syncAgain = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.syncAgain = false;
        for (let taken = 0; taken < MOST_PER_SYNC && !this.closed; taken += 1) {
          const answer = await this.command(syncNextMessage());
          if (answer[0] === RESP.noMoreMessages) break;
          const message = parseChannelMessage(answer);
          // A direct message to this radio, or anything else, is taken off the radio's queue and not kept: the board carries channels.
          if (message) this.options.onMessage(message);
        }
      } while (this.syncAgain && !this.closed);
    } catch {
      // The connection went, or the radio stopped answering; the next "messages waiting" tries again.
    } finally {
      this.syncing = false;
    }
  }
}
