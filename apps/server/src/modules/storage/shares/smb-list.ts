/**
 * Asks a file server which shared folders it offers.
 *
 * This is a small SMB client that does one thing: sign in, ask for the list of shares
 * (the `NetrShareEnum` call every SMB server answers), and hang up. It exists so that
 * the person can pick a share instead of having to know its name.
 *
 * It is written here, on Node's own sockets, rather than by running a system tool,
 * because that keeps every rule about passwords and addresses in plain sight:
 *
 *  - There is exactly one connection, made by Outpost, to the one address Outpost has
 *    already checked. No tool gets to resolve a name or open a second connection.
 *  - The password never leaves this process. It is not an argument, an environment
 *    variable or the input of another program. Only proof of knowing it (an NTLMv2
 *    response) goes on the wire, as with any SMB sign-in.
 *  - Nothing here can put a dialog on anyone's screen.
 *  - Everything the server sends is untrusted: every length and offset is checked
 *    against the bytes that actually arrived, and the amount read is capped.
 *
 * What it speaks: SMB 2.0.2 to 3.1.1 with NTLMv2, signing its requests when the server
 * insists. A server that demands encryption, or only takes Kerberos, cannot be listed
 * (the share name can still be typed). Answers are not checked for the server's
 * signature: the list is a convenience, and the mount that follows is made by macOS.
 */
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import net from "node:net";

export interface ListedShare {
  name: string;
  /** What the server says it is. Only "disk" shares hold folders. */
  kind: "disk" | "printer" | "device" | "ipc" | "other";
  /** Marked by the server as administrative (C$, ADMIN$, IPC$ and the like). */
  special: boolean;
  comment: string;
}

export type ListOutcome =
  | { kind: "listed"; shares: ListedShare[] }
  /** The server refused the user name and password. */
  | { kind: "wrong_password" }
  /** The user name is not known to the server, which let the caller in as a guest instead. */
  | { kind: "unknown_user" }
  /** A guest sign-in was asked for and the server does not allow one. */
  | { kind: "guest_refused" }
  /** The account exists but cannot be used: locked out, disabled, expired. */
  | { kind: "account_unusable"; why: "locked" | "disabled" | "expired" | "restricted" }
  /** Signed in, but this account may not ask for the list. */
  | { kind: "not_allowed" }
  /** The server needs something this client does not speak. */
  | { kind: "unsupported"; why: "protocol" | "sign_in" | "signing" }
  | { kind: "no_answer" }
  /** The server answered with something that is not SMB, or broke off. */
  | { kind: "failed"; detail: string };

export interface ListRequest {
  /** The address already checked by the caller. Never a name. */
  address: string;
  port: number;
  /** Leave both out to try as a guest. */
  user?: string;
  password?: string;
}

export type ShareLister = (request: ListRequest, timeoutMs: number) => Promise<ListOutcome>;

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** Shares that are part of how a server runs, not places to keep files. */
const ADMINISTRATIVE = /^(?:ipc|admin|print|[a-z])\$$/i;

/**
 * From everything a server lists, the shares a person could keep a library on: disk
 * shares only, without the administrative ones. `isUsable` is the caller's rule for
 * names; a share whose name fails it is counted, not offered, because it could not be
 * connected anyway. Names ending in `$` are kept but marked hidden.
 */
export function pickDiskShares(
  listed: ListedShare[],
  isUsable: (name: string) => boolean,
): { shares: Array<{ name: string; hidden: boolean; comment: string | null }>; unusable: number } {
  const shares: Array<{ name: string; hidden: boolean; comment: string | null }> = [];
  const seen = new Set<string>();
  let unusable = 0;
  for (const share of listed) {
    if (share.kind !== "disk" || share.special || ADMINISTRATIVE.test(share.name)) continue;
    if (!isUsable(share.name)) {
      unusable += 1;
      continue;
    }
    const key = share.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // The description is the server's free text: kept short, and without control characters.
    const comment = share.comment.replace(CONTROL_CHARACTERS, " ").trim().slice(0, 120);
    shares.push({ name: share.name, hidden: share.name.endsWith("$"), comment: comment || null });
  }
  shares.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { shares, unusable };
}

// ── MD4, which NTLM still needs and current OpenSSL no longer offers ────────

const rotl = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));

export function md4(input: Buffer): Buffer {
  const padded = Buffer.alloc((((input.length + 8) >> 6) + 1) * 64);
  input.copy(padded);
  padded[input.length] = 0x80;
  padded.writeUInt32LE((input.length * 8) >>> 0, padded.length - 8);
  padded.writeUInt32LE(Math.floor(input.length / 0x20000000), padded.length - 4);

  let a = 0x67452301;
  let b = 0xefcdab89 | 0;
  let c = 0x98badcfe | 0;
  let d = 0x10325476;
  const x = new Int32Array(16);
  const step = (mix: number, word: number, shift: number) => {
    const next = rotl((a + mix + word) | 0, shift);
    a = d;
    d = c;
    c = b;
    b = next;
  };
  const order2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
  const order3 = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) x[i] = padded.readInt32LE(offset + i * 4);
    const [a0, b0, c0, d0] = [a, b, c, d];
    for (let i = 0; i < 16; i += 1) step((b & c) | (~b & d), x[i]!, [3, 7, 11, 19][i % 4]!);
    for (let i = 0; i < 16; i += 1) step(((b & c) | (b & d) | (c & d)) + 0x5a827999, x[order2[i]!]!, [3, 5, 9, 13][i % 4]!);
    for (let i = 0; i < 16; i += 1) step((b ^ c ^ d) + 0x6ed9eba1, x[order3[i]!]!, [3, 9, 11, 15][i % 4]!);
    a = (a + a0) | 0;
    b = (b + b0) | 0;
    c = (c + c0) | 0;
    d = (d + d0) | 0;
  }
  const digest = Buffer.alloc(16);
  digest.writeInt32LE(a, 0);
  digest.writeInt32LE(b, 4);
  digest.writeInt32LE(c, 8);
  digest.writeInt32LE(d, 12);
  return digest;
}

// ── NTLMv2 ──────────────────────────────────────────────────────────────────

const utf16 = (text: string) => Buffer.from(text, "utf16le");
const hmacMd5 = (key: Buffer, ...parts: Buffer[]) => {
  const mac = createHmac("md5", key);
  for (const part of parts) mac.update(part);
  return mac.digest();
};

const NTLM_SIGNATURE = Buffer.from("NTLMSSP\0", "latin1");
// Unicode, request target, NTLM, always sign, extended session security, 128-bit, 56-bit.
const NTLM_FLAGS = 0xa0088205;

export function ntlmNegotiate(): Buffer {
  const message = Buffer.alloc(32);
  NTLM_SIGNATURE.copy(message);
  message.writeUInt32LE(1, 8);
  message.writeUInt32LE(NTLM_FLAGS, 12);
  return message;
}

export interface NtlmChallenge {
  serverChallenge: Buffer;
  targetInfo: Buffer;
  /** The server's clock, when it sent one, as the eight bytes it sent. */
  timestamp: Buffer | undefined;
}

export function parseNtlmChallenge(message: Buffer): NtlmChallenge | undefined {
  if (message.length < 32 || !message.subarray(0, 8).equals(NTLM_SIGNATURE) || message.readUInt32LE(8) !== 2) return undefined;
  const serverChallenge = Buffer.from(message.subarray(24, 32));
  let targetInfo: Buffer = Buffer.alloc(0);
  if (message.length >= 48) {
    const length = message.readUInt16LE(40);
    const offset = message.readUInt32LE(44);
    if (length > 0 && offset + length <= message.length) targetInfo = Buffer.from(message.subarray(offset, offset + length));
  }
  // Target information is a list of (id, length, value); id 7 is the server's time.
  let timestamp: Buffer | undefined;
  for (let at = 0; at + 4 <= targetInfo.length; ) {
    const id = targetInfo.readUInt16LE(at);
    const length = targetInfo.readUInt16LE(at + 2);
    if (id === 0 || at + 4 + length > targetInfo.length) break;
    if (id === 7 && length === 8) timestamp = Buffer.from(targetInfo.subarray(at + 4, at + 12));
    at += 4 + length;
  }
  return { serverChallenge, targetInfo, timestamp };
}

export interface NtlmProof {
  message: Buffer;
  /** Key for signing, known only to someone who knows the password. */
  sessionKey: Buffer;
}

/** The answer to a challenge: proof of knowing the password, never the password. */
export function ntlmAuthenticate(
  challenge: NtlmChallenge,
  credentials: { user: string; password: string; domain?: string },
  entropy: { clientChallenge?: Buffer; now?: number } = {},
): NtlmProof {
  const domain = credentials.domain ?? "";
  const responseKey = hmacMd5(md4(utf16(credentials.password)), utf16(credentials.user.toUpperCase() + domain));
  const clientChallenge = entropy.clientChallenge ?? randomBytes(8);
  let timestamp = challenge.timestamp;
  if (!timestamp) {
    // Hundreds of nanoseconds since 1601, the way Windows counts time.
    timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64LE((BigInt(entropy.now ?? Date.now()) + 11644473600000n) * 10000n);
  }
  const temp = Buffer.concat([
    Buffer.from([1, 1, 0, 0, 0, 0, 0, 0]),
    timestamp,
    clientChallenge,
    Buffer.alloc(4),
    challenge.targetInfo,
    Buffer.alloc(4),
  ]);
  const proof = hmacMd5(responseKey, challenge.serverChallenge, temp);
  const ntResponse = Buffer.concat([proof, temp]);
  // With the server's time in the challenge, the older second response is left blank.
  const lmResponse = challenge.timestamp
    ? Buffer.alloc(24)
    : Buffer.concat([hmacMd5(responseKey, challenge.serverChallenge, clientChallenge), clientChallenge]);
  const sessionKey = hmacMd5(responseKey, proof);

  const fields = [lmResponse, ntResponse, utf16(domain), utf16(credentials.user), Buffer.alloc(0), Buffer.alloc(0)];
  const header = Buffer.alloc(64);
  NTLM_SIGNATURE.copy(header);
  header.writeUInt32LE(3, 8);
  let offset = header.length;
  fields.forEach((field, index) => {
    const at = 12 + index * 8;
    header.writeUInt16LE(field.length, at);
    header.writeUInt16LE(field.length, at + 2);
    header.writeUInt32LE(offset, at + 4);
    offset += field.length;
  });
  header.writeUInt32LE(NTLM_FLAGS, 60);
  return { message: Buffer.concat([header, ...fields]), sessionKey };
}

// ── The list itself: a remote procedure call carried over a named pipe ──────

const uuid = (text: string) => {
  const hex = text.replace(/-/g, "");
  const bytes = Buffer.from(hex, "hex");
  // The first three groups are little-endian on the wire.
  return Buffer.concat([
    Buffer.from(bytes.subarray(0, 4)).reverse(),
    Buffer.from(bytes.subarray(4, 6)).reverse(),
    Buffer.from(bytes.subarray(6, 8)).reverse(),
    bytes.subarray(8),
  ]);
};
const SRVSVC = uuid("4b324fc8-1670-01d3-1278-5a47bf6ee188");
const NDR = uuid("8a885d04-1ceb-11c9-9fe8-08002b104860");
const NETR_SHARE_ENUM = 15;

function rpcHeader(type: number, bodyLength: number, callId: number): Buffer {
  const header = Buffer.alloc(16);
  header[0] = 5; // version 5.0
  header[2] = type;
  header[3] = 0x03; // first and last fragment
  header[4] = 0x10; // little-endian, ASCII, IEEE floats
  header.writeUInt16LE(16 + bodyLength, 8);
  header.writeUInt32LE(callId, 12);
  return header;
}

export function rpcBind(callId: number): Buffer {
  const body = Buffer.alloc(56);
  body.writeUInt16LE(4280, 0);
  body.writeUInt16LE(4280, 2);
  body[8] = 1; // one presentation context
  body[14] = 1; // one transfer syntax
  SRVSVC.copy(body, 16);
  body.writeUInt16LE(3, 32); // interface version 3.0
  NDR.copy(body, 36);
  body.writeUInt32LE(2, 52);
  return Buffer.concat([rpcHeader(11, body.length, callId), body]);
}

/** A string the way the call wants it: counted, in UTF-16, padded to four bytes. */
function ndrString(text: string): Buffer {
  const chars = utf16(`${text}\0`);
  const count = chars.length / 2;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(count, 0);
  head.writeUInt32LE(count, 8);
  return Buffer.concat([head, chars, Buffer.alloc((4 - (chars.length % 4)) % 4)]);
}

export function rpcShareEnumRequest(callId: number, serverName: string): Buffer {
  const u32 = (...values: number[]) => {
    const buffer = Buffer.alloc(values.length * 4);
    for (const [index, value] of values.entries()) buffer.writeUInt32LE(value >>> 0, index * 4);
    return buffer;
  };
  const stub = Buffer.concat([
    u32(0x00020000),
    ndrString(serverName),
    // Level 1 (name, type, remark), an empty container, as much as the server will send, no resume handle.
    u32(1, 1, 0x00020004, 0, 0, 0xffffffff, 0),
  ]);
  const head = Buffer.alloc(8);
  head.writeUInt32LE(stub.length, 0);
  head.writeUInt16LE(NETR_SHARE_ENUM, 6);
  return Buffer.concat([rpcHeader(0, head.length + stub.length, callId), head, stub]);
}

/** Never more than this many shares, whatever the server claims. */
const MAX_SHARES = 2000;
const MAX_NAME_CHARS = 1024;

const SHARE_KINDS: Record<number, ListedShare["kind"]> = { 0: "disk", 1: "printer", 2: "device", 3: "ipc" };

/**
 * Reads the answer to NetrShareEnum (level 1). Returns undefined if the bytes are not
 * a well-formed answer; nothing is read past the end of what arrived.
 */
export function parseShareEnumResponse(stub: Buffer): { shares: ListedShare[]; status: number } | undefined {
  let at = 0;
  const u32 = (): number | undefined => {
    if (at + 4 > stub.length) return undefined;
    const value = stub.readUInt32LE(at);
    at += 4;
    return value;
  };
  const text = (): string | undefined => {
    const max = u32();
    const offset = u32();
    const count = u32();
    if (max === undefined || offset === undefined || count === undefined) return undefined;
    if (count > MAX_NAME_CHARS || at + count * 2 > stub.length) return undefined;
    const value = stub.toString("utf16le", at, at + count * 2).replace(/\0+$/, "");
    at += count * 2;
    at += (4 - (at % 4)) % 4;
    return value;
  };

  const level = u32();
  const which = u32();
  const container = u32();
  if (level !== 1 || which !== 1 || container === undefined) return undefined;
  const shares: ListedShare[] = [];
  if (container !== 0) {
    const entries = u32();
    const array = u32();
    if (entries === undefined || array === undefined) return undefined;
    if (array !== 0) {
      const count = u32();
      if (count === undefined || count !== entries || count > MAX_SHARES) return undefined;
      const heads: Array<{ name: number; type: number; remark: number }> = [];
      for (let i = 0; i < count; i += 1) {
        const name = u32();
        const type = u32();
        const remark = u32();
        if (name === undefined || type === undefined || remark === undefined) return undefined;
        heads.push({ name, type, remark });
      }
      for (const head of heads) {
        const name = head.name === 0 ? "" : text();
        const comment = head.remark === 0 ? "" : text();
        if (name === undefined || comment === undefined) return undefined;
        shares.push({ name, kind: SHARE_KINDS[head.type & 0x0fffffff] ?? "other", special: (head.type & 0x80000000) !== 0, comment });
      }
    } else if (entries !== 0) {
      return undefined;
    }
  }
  const total = u32();
  const resume = u32();
  if (total === undefined || resume === undefined) return undefined;
  if (resume !== 0 && u32() === undefined) return undefined;
  const status = u32();
  if (status === undefined) return undefined;
  return { shares, status };
}

// ── Signing, for servers that insist on it ──────────────────────────────────

/** AES-CMAC (RFC 4493), which SMB 3.0 signs with. */
export function aesCmac(key: Buffer, message: Buffer): Buffer {
  const encrypt = (block: Buffer) => {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(block), cipher.final()]);
  };
  const double = (block: Buffer) => {
    const out = Buffer.alloc(16);
    let carry = 0;
    for (let i = 15; i >= 0; i -= 1) {
      const shifted = (block[i]! << 1) | carry;
      out[i] = shifted & 0xff;
      carry = shifted >> 8;
    }
    if (block[0]! & 0x80) out[15] = out[15]! ^ 0x87;
    return out;
  };
  const xor = (left: Buffer, right: Buffer) => {
    const out = Buffer.alloc(16);
    for (let i = 0; i < 16; i += 1) out[i] = left[i]! ^ right[i]!;
    return out;
  };
  const k1 = double(encrypt(Buffer.alloc(16)));
  const k2 = double(k1);
  const blocks = Math.max(1, Math.ceil(message.length / 16));
  const whole = message.length > 0 && message.length % 16 === 0;
  const tail = message.subarray((blocks - 1) * 16);
  const last = Buffer.alloc(16);
  tail.copy(last);
  if (!whole) last[tail.length] = 0x80;
  let state: Buffer = Buffer.alloc(16);
  for (let i = 0; i < blocks - 1; i += 1) state = encrypt(xor(state, message.subarray(i * 16, i * 16 + 16)));
  return encrypt(xor(state, xor(last, whole ? k1 : k2)));
}

/**
 * The SMB 3 signing key, derived from the session key (SP 800-108, counter mode).
 * SMB 3.1.1 mixes in a hash of the conversation so far; 3.0 uses fixed words.
 */
export function smb3SigningKey(sessionKey: Buffer, conversationHash?: Buffer): Buffer {
  const label = Buffer.from(conversationHash ? "SMBSigningKey\0" : "SMB2AESCMAC\0", "latin1");
  const context = conversationHash ?? Buffer.from("SmbSign\0", "latin1");
  return createHmac("sha256", sessionKey)
    .update(Buffer.concat([Buffer.from([0, 0, 0, 1]), label, Buffer.from([0]), context, Buffer.from([0, 0, 0, 128])]))
    .digest()
    .subarray(0, 16);
}

// ── SMB2 ────────────────────────────────────────────────────────────────────

const SMB2_MAGIC = Buffer.from([0xfe, 0x53, 0x4d, 0x42]);
const HEADER = 64;
const Command = { negotiate: 0, sessionSetup: 1, treeConnect: 3, create: 5, read: 8, write: 9 } as const;

/** SMB 2.0.2, 2.1, 3.0, 3.0.2 and 3.1.1. */
const DIALECTS = [0x0202, 0x0210, 0x0300, 0x0302, 0x0311];

const STATUS_OK = 0;
const STATUS_PENDING = 0x00000103;
const STATUS_BUFFER_OVERFLOW = 0x80000005;
const STATUS_MORE_PROCESSING = 0xc0000016;
const STATUS_ACCESS_DENIED = 0xc0000022;
const STATUS_NOT_SUPPORTED = 0xc00000bb;
const signInFailures: Record<number, ListOutcome> = {
  3221225581: { kind: "wrong_password" }, // logon failure
  3221225578: { kind: "wrong_password" }, // wrong password
  3221225572: { kind: "wrong_password" }, // no such user
  3221226036: { kind: "account_unusable", why: "locked" },
  3221225586: { kind: "account_unusable", why: "disabled" },
  3221225585: { kind: "account_unusable", why: "expired" },
  3221225875: { kind: "account_unusable", why: "expired" },
  3221226020: { kind: "account_unusable", why: "expired" }, // password must change
  3221225582: { kind: "account_unusable", why: "restricted" },
  3221225583: { kind: "account_unusable", why: "restricted" }, // outside logon hours
  3221225819: { kind: "account_unusable", why: "restricted" }, // logon type not granted
};

/** Cap on what one answer may be, and on the whole list. */
const MAX_FRAME = 1024 * 1024;
const MAX_LIST_BYTES = 2 * 1024 * 1024;

class Stop extends Error {
  readonly outcome: ListOutcome;
  constructor(outcome: ListOutcome) {
    super(outcome.kind);
    this.outcome = outcome;
  }
}

interface Reply {
  status: number;
  /** The whole message, header included. */
  message: Buffer;
  sessionId: bigint;
  treeId: number;
}

class Conversation {
  private readonly socket: net.Socket;
  private received: Buffer = Buffer.alloc(0);
  private waiting: { resolve: (frame: Buffer) => void; reject: (error: Error) => void } | undefined;
  private failure: Error | undefined;
  private messageId = 0n;
  sessionId = 0n;
  treeId = 0;
  /** Set once signed in, if the server insists that requests are signed. */
  sign: ((message: Buffer) => Buffer) | undefined;
  /** A running hash of everything said so far, which SMB 3.1.1 builds its keys on. */
  private hash: Buffer = Buffer.alloc(64);
  /** That hash as it stood when the latest request had been sent. */
  hashAfterRequest: Buffer = Buffer.alloc(64);

  constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => {
      this.received = Buffer.concat([this.received, chunk]);
      if (this.received.length > MAX_FRAME + 4) this.fail(new Stop({ kind: "failed", detail: "the server sent more than expected" }));
      else this.deliver();
    });
    socket.on("error", () => this.fail(new Stop({ kind: "failed", detail: "the connection broke" })));
    socket.on("close", () => this.fail(new Stop({ kind: "failed", detail: "the server closed the connection" })));
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.waiting?.reject(this.failure);
    this.waiting = undefined;
  }

  private deliver(): void {
    if (!this.waiting || this.received.length < 4) return;
    // Four bytes of length, then the message.
    const length = this.received.readUInt32BE(0) & 0x00ffffff;
    if (length > MAX_FRAME) {
      this.fail(new Stop({ kind: "failed", detail: "the server sent more than expected" }));
      return;
    }
    if (this.received.length < 4 + length) return;
    const frame = Buffer.from(this.received.subarray(4, 4 + length));
    this.received = this.received.subarray(4 + length);
    const { resolve } = this.waiting;
    this.waiting = undefined;
    resolve(frame);
  }

  private nextFrame(): Promise<Buffer> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.deliver();
    });
  }

  /** Sends one request and waits for its answer. */
  async ask(command: number, body: Buffer): Promise<Reply> {
    const id = this.messageId;
    this.messageId += 1n;
    const header = Buffer.alloc(HEADER);
    SMB2_MAGIC.copy(header);
    header.writeUInt16LE(HEADER, 4);
    header.writeUInt16LE(command === Command.negotiate ? 0 : 1, 6); // credit charge
    header.writeUInt16LE(command, 12);
    header.writeUInt16LE(16, 14); // credits asked for
    header.writeBigUInt64LE(id, 24);
    header.writeUInt32LE(this.treeId, 36);
    header.writeBigUInt64LE(this.sessionId, 40);
    const message = Buffer.concat([header, body]);
    if (this.sign && command !== Command.negotiate && command !== Command.sessionSetup) {
      message.writeUInt32LE(0x00000008, 16); // signed
      this.sign(message).copy(message, 48, 0, 16);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(message.length);
    this.socket.write(Buffer.concat([length, message]));
    this.hash = createHash("sha512").update(this.hash).update(message).digest();
    this.hashAfterRequest = this.hash;

    for (;;) {
      const frame = await this.nextFrame();
      if (frame.length < HEADER || !frame.subarray(0, 4).equals(SMB2_MAGIC)) {
        throw new Stop({ kind: "failed", detail: "the server did not answer as a file server" });
      }
      if (frame.readBigUInt64LE(24) !== id) continue;
      const status = frame.readUInt32LE(8);
      // "Still working on it": the real answer follows with the same number.
      if (status === STATUS_PENDING) continue;
      this.hash = createHash("sha512").update(this.hash).update(frame).digest();
      return { status, message: frame, sessionId: frame.readBigUInt64LE(40), treeId: frame.readUInt32LE(36) };
    }
  }
}

/** A slice of a reply, or a stop if the server pointed outside what it sent. */
function slice(reply: Reply, offset: number, length: number): Buffer {
  if (offset < HEADER || offset + length > reply.message.length)
    throw new Stop({ kind: "failed", detail: "the server sent a malformed answer" });
  return reply.message.subarray(offset, offset + length);
}

function need(reply: Reply, bodyLength: number): void {
  if (reply.message.length < HEADER + bodyLength) throw new Stop({ kind: "failed", detail: "the server sent a short answer" });
}

async function converse(talk: Conversation, request: ListRequest): Promise<ListOutcome> {
  const guest = request.user === undefined;
  const user = request.user ?? "guest";
  const password = request.password ?? "";

  // 1. Agree on a dialect.
  // SMB 3.1.1 wants one extra item: which hash the two sides will keep of the conversation.
  const contextAt = Math.ceil((HEADER + 36 + DIALECTS.length * 2) / 8) * 8;
  const negotiate = Buffer.alloc(contextAt - HEADER + 8 + 38);
  negotiate.writeUInt16LE(36, 0);
  negotiate.writeUInt16LE(DIALECTS.length, 2);
  negotiate.writeUInt16LE(1, 4); // signing possible, not demanded
  randomBytes(16).copy(negotiate, 12);
  negotiate.writeUInt32LE(contextAt, 28);
  negotiate.writeUInt16LE(1, 32); // one context
  for (const [index, dialect] of DIALECTS.entries()) negotiate.writeUInt16LE(dialect, 36 + index * 2);
  const context = contextAt - HEADER;
  negotiate.writeUInt16LE(1, context); // pre-authentication integrity
  negotiate.writeUInt16LE(38, context + 2);
  negotiate.writeUInt16LE(1, context + 8); // one algorithm
  negotiate.writeUInt16LE(32, context + 10); // salt length
  negotiate.writeUInt16LE(1, context + 12); // SHA-512
  randomBytes(32).copy(negotiate, context + 14);
  const agreed = await talk.ask(Command.negotiate, negotiate);
  if (agreed.status === STATUS_NOT_SUPPORTED) return { kind: "unsupported", why: "protocol" };
  if (agreed.status !== STATUS_OK) return { kind: "failed", detail: `negotiation was refused (${agreed.status.toString(16)})` };
  need(agreed, 64);
  const dialect = agreed.message.readUInt16LE(HEADER + 4);
  if (!DIALECTS.includes(dialect)) return { kind: "unsupported", why: "protocol" };
  const signingRequired = (agreed.message.readUInt16LE(HEADER + 2) & 0x02) !== 0;

  // 2. Sign in, in two steps: ask for a challenge, then answer it.
  const setup = (blob: Buffer) => {
    const body = Buffer.alloc(24);
    body.writeUInt16LE(25, 0);
    body[3] = 1; // signing possible
    body.writeUInt16LE(HEADER + 24, 12);
    body.writeUInt16LE(blob.length, 14);
    return Buffer.concat([body, blob]);
  };
  const challenged = await talk.ask(Command.sessionSetup, setup(ntlmNegotiate()));
  if (challenged.status !== STATUS_MORE_PROCESSING) {
    return signInFailures[challenged.status] ?? { kind: "unsupported", why: "sign_in" };
  }
  need(challenged, 8);
  const challenge = parseNtlmChallenge(
    slice(challenged, challenged.message.readUInt16LE(HEADER + 4), challenged.message.readUInt16LE(HEADER + 6)),
  );
  if (!challenge) return { kind: "unsupported", why: "sign_in" };
  talk.sessionId = challenged.sessionId;
  const proof = ntlmAuthenticate(challenge, { user, password });
  const signedIn = await talk.ask(Command.sessionSetup, setup(proof.message));
  const conversationHash = talk.hashAfterRequest;
  // Refused outright, not as a wrong password: typically a server that insists on encryption.
  if (signedIn.status === STATUS_ACCESS_DENIED) return { kind: "unsupported", why: "sign_in" };
  if (signedIn.status !== STATUS_OK) {
    const refused = signInFailures[signedIn.status];
    if (guest) return refused?.kind === "wrong_password" || !refused ? { kind: "guest_refused" } : refused;
    return refused ?? { kind: "failed", detail: `sign-in was refused (${signedIn.status.toString(16)})` };
  }
  need(signedIn, 4);
  const sessionFlags = signedIn.message.readUInt16LE(HEADER + 2);
  const asGuest = (sessionFlags & 0x03) !== 0;
  // Asked in as a named user, let in as a guest: the server does not know that name.
  if (asGuest && !guest) return { kind: "unknown_user" };
  // The server will only talk in cipher for this session, which this client does not do.
  if ((sessionFlags & 0x04) !== 0) return { kind: "unsupported", why: "protocol" };
  // SMB 3.1.1 expects a signed-in user's requests to be signed whether or not it says so.
  if (signingRequired || (dialect === 0x0311 && !asGuest)) {
    if (asGuest) return { kind: "unsupported", why: "signing" };
    if (dialect >= 0x0300) {
      const key = smb3SigningKey(proof.sessionKey, dialect === 0x0311 ? conversationHash : undefined);
      talk.sign = (message) => aesCmac(key, message);
    } else {
      talk.sign = (message) => createHmac("sha256", proof.sessionKey).update(message).digest();
    }
  }

  // 3. Open the server's own "inter-process" share and the pipe that answers questions about shares.
  const path = utf16(`\\\\${request.address}\\IPC$`);
  const connect = Buffer.alloc(8);
  connect.writeUInt16LE(9, 0);
  connect.writeUInt16LE(HEADER + 8, 4);
  connect.writeUInt16LE(path.length, 6);
  const tree = await talk.ask(Command.treeConnect, Buffer.concat([connect, path]));
  if (tree.status === STATUS_ACCESS_DENIED) return guest ? { kind: "guest_refused" } : { kind: "not_allowed" };
  if (tree.status !== STATUS_OK) return { kind: "failed", detail: `the server would not open IPC$ (${tree.status.toString(16)})` };
  talk.treeId = tree.treeId;

  const name = utf16("srvsvc");
  const create = Buffer.alloc(56);
  create.writeUInt16LE(57, 0);
  create.writeUInt32LE(2, 4); // act as the signed-in user
  create.writeUInt32LE(0x0012019f, 24); // read and write
  create.writeUInt32LE(0x00000007, 32); // share with others
  create.writeUInt32LE(1, 36); // open what exists
  create.writeUInt16LE(HEADER + 56, 44);
  create.writeUInt16LE(name.length, 46);
  const opened = await talk.ask(Command.create, Buffer.concat([create, name]));
  if (opened.status === STATUS_ACCESS_DENIED) return guest ? { kind: "guest_refused" } : { kind: "not_allowed" };
  if (opened.status !== STATUS_OK)
    return { kind: "failed", detail: `the server would not answer questions about shares (${opened.status.toString(16)})` };
  need(opened, 88);
  const fileId = Buffer.from(opened.message.subarray(HEADER + 64, HEADER + 80));

  const write = async (data: Buffer) => {
    const body = Buffer.alloc(48);
    body.writeUInt16LE(49, 0);
    body.writeUInt16LE(HEADER + 48, 2);
    body.writeUInt32LE(data.length, 4);
    fileId.copy(body, 16);
    const reply = await talk.ask(Command.write, Buffer.concat([body, data]));
    if (reply.status !== STATUS_OK)
      throw new Stop({ kind: "failed", detail: `the question could not be sent (${reply.status.toString(16)})` });
  };
  const read = async (): Promise<Buffer> => {
    const body = Buffer.alloc(49);
    body.writeUInt16LE(49, 0);
    body.writeUInt32LE(65535, 4);
    fileId.copy(body, 16);
    const reply = await talk.ask(Command.read, body);
    if (reply.status !== STATUS_OK && reply.status !== STATUS_BUFFER_OVERFLOW) {
      throw new Stop({ kind: "failed", detail: `the answer could not be read (${reply.status.toString(16)})` });
    }
    need(reply, 16);
    return slice(reply, reply.message[HEADER + 2]!, reply.message.readUInt32LE(HEADER + 4));
  };
  /** One whole fragment of an answer, however the pipe chose to cut it up. */
  const fragment = async (): Promise<Buffer> => {
    let data = await read();
    while (data.length < 16 || data.length < data.readUInt16LE(8)) {
      if (data.length > MAX_FRAME) throw new Stop({ kind: "failed", detail: "the server sent more than expected" });
      const more = await read();
      if (more.length === 0) throw new Stop({ kind: "failed", detail: "the answer stopped short" });
      data = Buffer.concat([data, more]);
    }
    return data;
  };

  // 4. Say which service we want to talk to, then ask it for the list.
  await write(rpcBind(1));
  const bound = await fragment();
  if (bound[2] !== 12) return { kind: "failed", detail: "the server's share service refused the conversation" };

  await write(rpcShareEnumRequest(2, request.address));
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const part = await fragment();
    if (part[2] === 3) {
      // A fault. 5 is "access denied".
      const fault = part.length >= 28 ? part.readUInt32LE(24) : 0;
      return fault === 5
        ? guest
          ? { kind: "guest_refused" }
          : { kind: "not_allowed" }
        : { kind: "failed", detail: `the share service reported a fault (${fault.toString(16)})` };
    }
    if (part[2] !== 2 || part.length < 24) return { kind: "failed", detail: "the share service answered with something unexpected" };
    const stub = part.subarray(24, part.readUInt16LE(8) - part.readUInt16LE(10));
    total += stub.length;
    if (total > MAX_LIST_BYTES) return { kind: "failed", detail: "the list of shares is too long" };
    parts.push(stub);
    if ((part[3]! & 0x02) !== 0) break;
  }
  const parsed = parseShareEnumResponse(Buffer.concat(parts));
  if (!parsed) return { kind: "failed", detail: "the list of shares could not be read" };
  if (parsed.status === 5) return guest ? { kind: "guest_refused" } : { kind: "not_allowed" };
  if (parsed.status !== 0) return { kind: "failed", detail: `the share service refused (${parsed.status})` };
  return { kind: "listed", shares: parsed.shares };
}

/**
 * Lists a server's shares. Always settles within `timeoutMs`, and always closes the
 * connection, whatever the server does.
 */
export const listServerShares: ShareLister = (request, timeoutMs) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: request.address, port: request.port });
    socket.setNoDelay(true);
    let settled = false;
    const finish = (outcome: ListOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "no_answer" }), timeoutMs);
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish(
        ["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EHOSTDOWN"].includes(error.code ?? "")
          ? { kind: "no_answer" }
          : { kind: "failed", detail: "the connection broke" },
      );
    });
    socket.once("connect", () => {
      converse(new Conversation(socket), request).then(finish, (error: unknown) => {
        finish(error instanceof Stop ? error.outcome : { kind: "failed", detail: "something unexpected happened while reading the list" });
      });
    });
  });
