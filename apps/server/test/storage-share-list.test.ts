/**
 * The share lister: the small SMB client that asks a server what it shares. These tests
 * cover what can be checked without a file server: the arithmetic against published
 * test values, reading a real answer and broken ones, which shares are offered, and
 * what happens when the other end misbehaves. No test here reaches beyond this computer.
 */
import net from "node:net";
import { isValidShareName } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  aesCmac,
  type ListedShare,
  listServerShares,
  md4,
  ntlmAuthenticate,
  ntlmNegotiate,
  parseNtlmChallenge,
  parseShareEnumResponse,
  pickDiskShares,
  rpcBind,
  rpcShareEnumRequest,
  smb3SigningKey,
} from "../src/modules/storage/shares/smb-list.ts";

const hex = (text: string) => Buffer.from(text.replace(/\s+/g, ""), "hex");

/**
 * A real answer to NetrShareEnum, recorded from a Samba 4.23 server set up with shares
 * named "Müsik", "public", "outpost-test", "laser" (a printer), "backup$",
 * "Family Photos" and the built-in "IPC$".
 */
const RECORDED = hex(
  "010000000100000008000200070000000c0002000700000010000200000000001400020018000200000000001c00020020000200000000002400020028000200010000002c00020030000200000000003400020038000200000000003c0002004000020003000080440002000600000000000000060000004d00fc00730069006b000000010000000000000001000000000000000700000000000000070000007000750062006c006900630000000000010000000000000001000000000000000d000000000000000d0000006f007500740070006f00730074002d00740065007300740000000000010000000000000001000000000000000600000000000000060000006c0061007300650072000000010000000000000001000000000000000800000000000000080000006200610063006b007500700024000000010000000000000001000000000000000e000000000000000e000000460061006d0069006c0079002000500068006f0074006f0073000000010000000000000001000000000000000500000000000000050000004900500043002400000000001b000000000000001b0000004900500043002000530065007200760069006300650020002800530061006d00620061002000530065007200760065007200290000000000070000000000000000000000",
);

describe("the arithmetic", () => {
  it("computes MD4 as RFC 1320 says", () => {
    expect(md4(Buffer.from("")).toString("hex")).toBe("31d6cfe0d16ae931b73c59d7e0c089c0");
    expect(md4(Buffer.from("abc")).toString("hex")).toBe("a448017aaf21d8525fc10ae87aa6729d");
    expect(md4(Buffer.from("message digest")).toString("hex")).toBe("d9130a8164549fe818874806e1c7014b");
    expect(md4(Buffer.from("12345678901234567890123456789012345678901234567890123456789012345678901234567890")).toString("hex")).toBe(
      "e33b4ddc9c38f2199c3e7b164fcc0536",
    );
    // Exactly one block's worth, and one byte either side, where padding goes wrong if it is going to.
    for (const length of [55, 56, 57, 63, 64, 65, 119, 120]) expect(md4(Buffer.alloc(length, 0x61))).toHaveLength(16);
  });

  it("answers an NTLMv2 challenge with the values in the protocol's own worked example", () => {
    // MS-NLMP section 4.2.4: user "User", domain "Domain", password "Password".
    const targetInfo = hex("02000c0044006f006d00610069006e00 01000c00530065007200760065007200 00000000");
    const proof = ntlmAuthenticate(
      { serverChallenge: hex("0123456789abcdef"), targetInfo, timestamp: undefined },
      { user: "User", password: "Password", domain: "Domain" },
      { clientChallenge: hex("aaaaaaaaaaaaaaaa"), now: -11_644_473_600_000 },
    );
    expect(proof.sessionKey.toString("hex")).toBe("8de40ccadbc14a82f15cb0ad0de95ca3");
    const field = (index: number) => {
      const at = 12 + index * 8;
      return proof.message.subarray(
        proof.message.readUInt32LE(at + 4),
        proof.message.readUInt32LE(at + 4) + proof.message.readUInt16LE(at),
      );
    };
    expect(field(0).toString("hex")).toBe("86c35097ac9cec102554764a57cccc19aaaaaaaaaaaaaaaa");
    expect(field(1).subarray(0, 16).toString("hex")).toBe("68cd0ab851e51c96aabc927bebef6a1c");
    expect(field(2).toString("utf16le")).toBe("Domain");
    expect(field(3).toString("utf16le")).toBe("User");
    // The message says what it is, and the password itself is nowhere in it.
    expect(proof.message.subarray(0, 8).toString("latin1")).toBe("NTLMSSP\0");
    expect(proof.message.readUInt32LE(8)).toBe(3);
    expect(proof.message.includes(Buffer.from("Password", "utf16le"))).toBe(false);
    expect(proof.message.includes(Buffer.from("Password"))).toBe(false);
    expect(ntlmNegotiate().readUInt32LE(8)).toBe(1);
  });

  it("uses the server's clock when it sends one, and leaves the older answer blank", () => {
    const time = hex("0090d336b734c301");
    const targetInfo = Buffer.concat([hex("0700 0800"), time, hex("00000000")]);
    const message = Buffer.alloc(48 + targetInfo.length);
    message.write("NTLMSSP\0", "latin1");
    message.writeUInt32LE(2, 8);
    hex("0123456789abcdef").copy(message, 24);
    message.writeUInt16LE(targetInfo.length, 40);
    message.writeUInt32LE(48, 44);
    targetInfo.copy(message, 48);
    const challenge = parseNtlmChallenge(message)!;
    expect(challenge.timestamp?.equals(time)).toBe(true);
    const proof = ntlmAuthenticate(challenge, { user: "u", password: "p" });
    expect(proof.message.subarray(64, 88).equals(Buffer.alloc(24))).toBe(true);
    expect(proof.message.subarray(88 + 16 + 8, 88 + 16 + 16).equals(time)).toBe(true);
  });

  it("refuses a challenge that is not one, without reading past its end", () => {
    expect(parseNtlmChallenge(Buffer.alloc(0))).toBeUndefined();
    expect(parseNtlmChallenge(Buffer.from("not a challenge at all, just some text"))).toBeUndefined();
    const liar = Buffer.alloc(48);
    liar.write("NTLMSSP\0", "latin1");
    liar.writeUInt32LE(2, 8);
    liar.writeUInt16LE(60000, 40); // claims target information far longer than the message
    liar.writeUInt32LE(48, 44);
    expect(parseNtlmChallenge(liar)?.targetInfo).toHaveLength(0);
  });

  it("signs as RFC 4493 says", () => {
    const key = hex("2b7e151628aed2a6abf7158809cf4f3c");
    expect(aesCmac(key, Buffer.alloc(0)).toString("hex")).toBe("bb1d6929e95937287fa37d129b756746");
    expect(aesCmac(key, hex("6bc1bee22e409f96e93d7e117393172a")).toString("hex")).toBe("070a16b46b4d4144f79bdd9dd04a287c");
    expect(aesCmac(key, hex("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411")).toString("hex")).toBe(
      "dfa66747de9ae63030ca32611497c827",
    );
    expect(
      aesCmac(
        key,
        hex(
          "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710",
        ),
      ).toString("hex"),
    ).toBe("51f0bebf7e3b9d92fc49741779363cfe");
    // The two flavours of SMB 3 key differ, and both are sixteen bytes.
    const session = hex("8de40ccadbc14a82f15cb0ad0de95ca3");
    expect(smb3SigningKey(session)).toHaveLength(16);
    expect(smb3SigningKey(session, Buffer.alloc(64, 1))).toHaveLength(16);
    expect(smb3SigningKey(session).equals(smb3SigningKey(session, Buffer.alloc(64, 1)))).toBe(false);
  });

  it("builds the two questions it asks in the shape the protocol fixes", () => {
    const bind = rpcBind(1);
    expect(bind).toHaveLength(72);
    expect(bind.readUInt16LE(8)).toBe(72);
    expect(bind[2]).toBe(11);
    // The share service's identity, as it goes on the wire.
    expect(bind.subarray(32, 48).toString("hex")).toBe("c84f324b7016d30112785a47bf6ee188");
    const ask = rpcShareEnumRequest(2, "192.168.1.20");
    expect(ask.readUInt16LE(8)).toBe(ask.length);
    expect(ask.readUInt16LE(22)).toBe(15);
    expect(ask.length % 4).toBe(0);
    expect(ask.includes(Buffer.from("192.168.1.20\0", "utf16le"))).toBe(true);
  });
});

describe("reading the server's answer", () => {
  it("reads a real one, spaces, accents and all", () => {
    expect(parseShareEnumResponse(RECORDED)).toEqual({
      status: 0,
      shares: [
        { name: "Müsik", kind: "disk", special: false, comment: "" },
        { name: "public", kind: "disk", special: false, comment: "" },
        { name: "outpost-test", kind: "disk", special: false, comment: "" },
        { name: "laser", kind: "printer", special: false, comment: "" },
        { name: "backup$", kind: "disk", special: false, comment: "" },
        { name: "Family Photos", kind: "disk", special: false, comment: "" },
        { name: "IPC$", kind: "ipc", special: true, comment: "IPC Service (Samba Server)" },
      ],
    });
  });

  it("never reads past the end of a short or lying answer", () => {
    // Every way of cutting the real answer short is refused, not misread.
    for (let length = 0; length < RECORDED.length; length += 1) {
      expect(parseShareEnumResponse(RECORDED.subarray(0, length)), `cut at ${length}`).toBeUndefined();
    }
    // A count far larger than what follows.
    const manyShares = Buffer.from(RECORDED);
    manyShares.writeUInt32LE(0x7fffffff, 12);
    manyShares.writeUInt32LE(0x7fffffff, 20);
    expect(parseShareEnumResponse(manyShares)).toBeUndefined();
    // A count that disagrees with itself.
    const mismatch = Buffer.from(RECORDED);
    mismatch.writeUInt32LE(3, 12);
    expect(parseShareEnumResponse(mismatch)).toBeUndefined();
    // A name that claims to be longer than the answer.
    const longName = Buffer.from(RECORDED);
    const firstString = 24 + 7 * 12;
    longName.writeUInt32LE(0x00ffffff, firstString + 8);
    expect(parseShareEnumResponse(longName)).toBeUndefined();
    // Not this kind of answer at all.
    expect(parseShareEnumResponse(Buffer.alloc(64, 0xff))).toBeUndefined();
    expect(parseShareEnumResponse(Buffer.alloc(0))).toBeUndefined();
    // Random noise never throws.
    let seed = 7;
    for (let round = 0; round < 300; round += 1) {
      const noise = Buffer.alloc(8 + (round % 200));
      for (let i = 0; i < noise.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        noise[i] = seed & 0xff;
      }
      noise.writeUInt32LE(1, 0);
      noise.writeUInt32LE(1, 4);
      expect(() => parseShareEnumResponse(noise)).not.toThrow();
    }
  });

  it("reads an answer with no shares, and one that is a refusal", () => {
    const u32 = (...values: number[]) => {
      const buffer = Buffer.alloc(values.length * 4);
      for (const [index, value] of values.entries()) buffer.writeUInt32LE(value >>> 0, index * 4);
      return buffer;
    };
    expect(parseShareEnumResponse(u32(1, 1, 0x20000, 0, 0, 0, 0, 0))).toEqual({ shares: [], status: 0 });
    expect(parseShareEnumResponse(u32(1, 1, 0, 0, 0, 5))).toEqual({ shares: [], status: 5 });
  });
});

describe("which shares are offered", () => {
  const share = (name: string, extra: Partial<ListedShare> = {}): ListedShare => ({
    name,
    kind: "disk",
    special: false,
    comment: "",
    ...extra,
  });

  it("offers disk shares and hides the ones that are part of how a server runs", () => {
    const { shares, unusable } = pickDiskShares(parseShareEnumResponse(RECORDED)!.shares, isValidShareName);
    // No printer, no IPC$; the hidden one is kept but marked.
    expect(shares).toEqual([
      { name: "backup$", hidden: true, comment: null },
      { name: "Family Photos", hidden: false, comment: null },
      { name: "Müsik", hidden: false, comment: null },
      { name: "outpost-test", hidden: false, comment: null },
      { name: "public", hidden: false, comment: null },
    ]);
    expect(unusable).toBe(0);

    const windows = pickDiskShares(
      [
        share("C$", { special: true, comment: "Default share" }),
        share("D$", { special: true }),
        share("ADMIN$", { special: true, comment: "Remote Admin" }),
        share("IPC$", { kind: "ipc", special: true }),
        share("print$", { comment: "Printer Drivers" }),
        share("PRINT$"),
        share("c$"), // named like an administrative share even though the server did not flag it
        share("HP LaserJet", { kind: "printer" }),
        share("COM1", { kind: "device" }),
        share("Users", { comment: "  People's   folders  " }),
        share("Projects$"),
        share("special-but-disk", { special: true }),
        share("strange", { kind: "other" }),
      ],
      isValidShareName,
    );
    expect(windows.shares).toEqual([
      { name: "Projects$", hidden: true, comment: null },
      { name: "Users", hidden: false, comment: "People's   folders" },
    ]);
  });

  it("holds names to the caller's rule, counts the rest, and trims what the server says about them", () => {
    const { shares, unusable } = pickDiskShares(
      [
        share("media", { comment: "line one\nline two\u0000 \u001b[31mred" }),
        share("Media"),
        share('a"; do shell script "id'),
        share("../up"),
        share("with/slash"),
        share("back\\slash"),
        share("new\nline"),
        share(""),
        share("long", { comment: "x".repeat(500) }),
      ],
      isValidShareName,
    );
    expect(shares.map((entry) => entry.name)).toEqual(["long", "media"]);
    expect(unusable).toBe(6);
    // Line breaks, NUL and the escape character are each turned into a space.
    expect(shares[1]!.comment).toBe("line one line two   [31mred");
    expect(shares[0]!.comment).toHaveLength(120);
  });
});

describe("a server that misbehaves", () => {
  let server: net.Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });
  /** A stand-in on this computer that does whatever the test says when someone connects. */
  const serve = (onConnection: (socket: net.Socket) => void): Promise<number> =>
    new Promise((resolve) => {
      const sockets = new Set<net.Socket>();
      server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on("error", () => {});
        onConnection(socket);
      });
      server.on("close", () => {
        for (const socket of sockets) socket.destroy();
      });
      server.listen(0, "127.0.0.1", () => resolve((server!.address() as net.AddressInfo).port));
    });
  const ask = (port: number, timeoutMs = 2000) =>
    listServerShares({ address: "127.0.0.1", port, user: "walker", password: "secret" }, timeoutMs);
  /** One SMB2 answer: a header saying `status`, echoing the request's number, then `body`. */
  const reply = (request: Buffer, status: number, body: Buffer) => {
    const header = Buffer.alloc(64);
    Buffer.from([0xfe, 0x53, 0x4d, 0x42]).copy(header);
    header.writeUInt16LE(64, 4);
    header.writeUInt32LE(status >>> 0, 8);
    request.copy(header, 12, 4 + 12, 4 + 14);
    request.copy(header, 24, 4 + 24, 4 + 32);
    const message = Buffer.concat([header, body]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(message.length);
    return Buffer.concat([length, message]);
  };

  it("gives up on one that is not there, hangs up, or never speaks", async () => {
    const free = await serve(() => {});
    server!.close();
    server = undefined;
    expect(await ask(free)).toEqual({ kind: "no_answer" });

    const hangsUp = await serve((socket) => socket.destroy());
    expect((await ask(hangsUp)).kind).toBe("failed");
    server!.close();

    const silent = await serve(() => {});
    const started = Date.now();
    expect(await ask(silent, 250)).toEqual({ kind: "no_answer" });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("does not take something else for a file server", async () => {
    const web = await serve((socket) => socket.once("data", () => socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")));
    expect((await ask(web)).kind).toBe("failed");
    server!.close();

    const flood = await serve((socket) => socket.once("data", () => socket.write(Buffer.from([0x00, 0xff, 0xff, 0xff]))));
    const started = Date.now();
    expect(await ask(flood)).toEqual({ kind: "failed", detail: "the server sent more than expected" });
    expect(Date.now() - started).toBeLessThan(1500);
    server!.close();

    // Endless bytes that never add up to a message are cut off, not collected for ever.
    const endless = await serve((socket) =>
      socket.once("data", () => {
        socket.write(Buffer.from([0x00, 0x0f, 0xff, 0xff]));
        const timer = setInterval(() => (socket.destroyed ? clearInterval(timer) : socket.write(Buffer.alloc(65536, 1))), 1);
      }),
    );
    expect((await ask(endless, 1500)).kind).toMatch(/failed|no_answer/);
  });

  it("stops at a server that speaks SMB but not in a way it can follow", async () => {
    const refusesDialects = await serve((socket) =>
      socket.once("data", (request) => socket.write(reply(request, 0xc00000bb, Buffer.alloc(9)))),
    );
    expect(await ask(refusesDialects)).toEqual({ kind: "unsupported", why: "protocol" });
    server!.close();

    // Claims a dialect that was never offered.
    const oddDialect = await serve((socket) =>
      socket.once("data", (request) => {
        const body = Buffer.alloc(65);
        body.writeUInt16LE(65, 0);
        body.writeUInt16LE(0x02ff, 4);
        socket.write(reply(request, 0, body));
      }),
    );
    expect(await ask(oddDialect)).toEqual({ kind: "unsupported", why: "protocol" });
    server!.close();

    const shortAnswer = await serve((socket) => socket.once("data", (request) => socket.write(reply(request, 0, Buffer.alloc(8)))));
    expect(await ask(shortAnswer)).toEqual({ kind: "failed", detail: "the server sent a short answer" });
    server!.close();

    // Agrees a dialect, then refuses the sign-in outright or points outside its own message.
    const negotiated = (then: (socket: net.Socket, request: Buffer) => void) =>
      serve((socket) => {
        let step = 0;
        socket.on("data", (request) => {
          step += 1;
          if (step === 1) {
            const body = Buffer.alloc(65);
            body.writeUInt16LE(65, 0);
            body.writeUInt16LE(0x0210, 4);
            socket.write(reply(request, 0, body));
          } else then(socket, request);
        });
      });
    const locked = await negotiated((socket, request) => socket.write(reply(request, 0xc0000234, Buffer.alloc(9))));
    expect(await ask(locked)).toEqual({ kind: "account_unusable", why: "locked" });
    server!.close();

    const liar = await negotiated((socket, request) => {
      const body = Buffer.alloc(9);
      body.writeUInt16LE(9, 0);
      body.writeUInt16LE(60000, 4); // the challenge is "at" an offset beyond the message
      body.writeUInt16LE(500, 6);
      socket.write(reply(request, 0xc0000016, body));
    });
    expect(await ask(liar)).toEqual({ kind: "failed", detail: "the server sent a malformed answer" });
    server!.close();

    const notNtlm = await negotiated((socket, request) => {
      const body = Buffer.alloc(8 + 16);
      body.writeUInt16LE(9, 0);
      body.writeUInt16LE(72, 4);
      body.writeUInt16LE(16, 6);
      socket.write(reply(request, 0xc0000016, body));
    });
    expect(await ask(notNtlm)).toEqual({ kind: "unsupported", why: "sign_in" });
  });
});
