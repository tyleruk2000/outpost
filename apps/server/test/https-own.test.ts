import { spawnSync } from "node:child_process";
import { createPrivateKey, type KeyObject, X509Certificate } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { TLSSocket } from "node:tls";
import { type HttpsStatus, PLAIN_HTTP_ACCEPTED_FIELD } from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import yauzl from "yauzl";
import { contextual, integer, octetString, oid, sequence } from "../src/modules/https/der.ts";
import { type ReachableName, reachableNames } from "../src/modules/https/names.ts";
import { expiryOf, inspectOwn, REMOVE_PASSPHRASE, Refused, type Surroundings } from "../src/modules/https/own.ts";
import { looksLikePkcs12, Pkcs12Error, readPkcs12 } from "../src/modules/https/pkcs12.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type Made, make, makeAuthority } from "./https-certs.ts";

const DAY = 24 * 60 * 60 * 1000;
const OPENSSL = spawnSync("openssl", ["version"], { stdio: "ignore" }).error === undefined;
const FIXTURES = path.join(import.meta.dirname, "fixtures", "https");
/** The four PKCS#12 fixtures hold this one certificate, made with OpenSSL 3.6 and valid for a century. */
const FIXTURE_FINGERPRINT = "5C:78:51:0A:42:F0:0A:CA:A1:C7:A6:B2:5D:B6:55:FA:40:EA:6E:6C:C0:09:A4:D7:11:D7:D1:D5:D8:88:1E:7F";
const FIXTURE_PASSWORD = "outpost-test";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-own-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A home server on a network: one address, a host name, and a public name its owner pointed at it. */
const reached = (extra: string[] = [], allowedHosts: string[] = []): ReachableName[] =>
  reachableNames({
    interfaces: { en0: [{ address: "192.168.1.20", family: "IPv4", internal: false } as os.NetworkInterfaceInfo] },
    hostname: "kitchen-pi",
    lanAccess: true,
    inContainer: false,
    allowedHosts,
    extra,
  });

const around = (over: Partial<Surroundings> = {}): Surroundings => ({
  now: Date.now(),
  reached: reached(),
  // As the request guard has it with LAN access on: addresses and local names, and nothing that looks public.
  answersTo: (name) => !name.includes(".") || /^[\d.]+$/.test(name) || name.includes(":") || /\.(local|lan)$/.test(name),
  publicAuthorities: [],
  ...over,
});

const files = (...texts: Array<string | Buffer>) => ({ files: texts.map((text) => (typeof text === "string" ? Buffer.from(text) : text)) });
const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(Refused);
    return (error as Error).message;
  }
  throw new Error("it was not refused");
};

// Made once: the tests below only read them.
const house = makeAuthority();
const leaf = make({ name: "kitchen-pi.local", issuer: house.intermediate, names: ["kitchen-pi.local", "192.168.1.20"], until: 90 });

describe("reading a certificate of your own", () => {
  it("takes a certificate, its chain and its key, ECDSA or RSA, and says what it found", () => {
    const { bundle, report, refusals, outOfDate } = inspectOwn(
      files(leaf.pem + house.intermediate.pem + house.root.pem, leaf.keyPem),
      around(),
    );
    expect(refusals).toEqual([]);
    expect(outOfDate).toBeNull();
    expect(report).toMatchObject({
      name: "kitchen-pi.local",
      issuer: "Hill House Root Issuing 1",
      fingerprint: leaf.certificate.fingerprint256,
      key: "ECDSA P-256",
      names: ["kitchen-pi.local", "192.168.1.20"],
      chain: ["Hill House Root Issuing 1"],
      trust: "private",
      anchor: { name: "Hill House Root", fingerprint: house.root.certificate.fingerprint256, held: true },
      covered: ["192.168.1.20", "kitchen-pi.local"],
      notCovered: ["kitchen-pi"],
      notAnswered: [],
      usable: ["kitchen-pi.local", "192.168.1.20"],
      warnings: [],
      notes: [],
    });
    expect(report.expiresAt).toBe(leaf.certificate.validToDate.getTime());
    // What the listener sends is the server's certificate and the intermediate. The root is kept on disk and not sent.
    expect(bundle.certPem).toBe(leaf.pem + house.intermediate.pem);
    expect(bundle.fullPem).toBe(leaf.pem + house.intermediate.pem + house.root.pem);
    expect(createPrivateKey(bundle.keyPem).equals(leaf.key)).toBe(true);

    const rsa = make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], key: "rsa2048" });
    const read = inspectOwn(files(rsa.pem + house.intermediate.pem, rsa.keyPem), around());
    expect(read.refusals).toEqual([]);
    expect(read.report.key).toBe("RSA 2048");
    // The older forms of key file are read as well, and kept as PKCS#8.
    const traditional = (rsa.key as KeyObject).export({ type: "pkcs1", format: "pem" }) as string;
    expect(traditional).toContain("BEGIN RSA PRIVATE KEY");
    expect(inspectOwn(files(rsa.pem, traditional), around()).bundle.keyPem).toContain("BEGIN PRIVATE KEY");
    const sec1 = (leaf.key as KeyObject).export({ type: "sec1", format: "pem" }) as string;
    expect(sec1).toContain("BEGIN EC PRIVATE KEY");
    expect(inspectOwn(files(leaf.pem, sec1), around()).refusals).toEqual([]);
  });

  it("refuses a key that is not the certificate's own", () => {
    const other = make({ name: "other.lan", names: ["other.lan"] });
    expect(refusal(() => inspectOwn(files(leaf.pem + house.intermediate.pem, other.keyPem), around()))).toMatch(
      /This key does not belong to any certificate in the file \(kitchen-pi\.local\).*look for the key file made at the same time/,
    );
    expect(refusal(() => inspectOwn(files(leaf.pem, other.keyPem), around()))).toMatch(/does not belong to the certificate/);
    // The authority's key is not the server's either.
    expect(refusal(() => inspectOwn(files(leaf.pem, house.intermediate.keyPem), around()))).toMatch(/does not belong/);
  });

  it("does not mind which file holds what, and puts a chain that is out of order in order", () => {
    const expected = leaf.pem + house.intermediate.pem;
    // The two files the wrong way round, one file holding everything, and the pieces separately.
    for (const given of [
      files(leaf.keyPem, leaf.pem + house.intermediate.pem),
      files(leaf.keyPem + leaf.pem + house.intermediate.pem),
      files(leaf.pem, leaf.keyPem, house.intermediate.pem + house.root.pem),
      files(leaf.der, house.intermediate.pem, (leaf.key as KeyObject).export({ type: "pkcs8", format: "der" })),
    ]) {
      const read = inspectOwn(given, around());
      expect(read.bundle.certPem).toBe(expected);
      expect(read.report.notes).toEqual([]);
    }
    const shuffled = inspectOwn(files(house.root.pem + house.intermediate.pem + leaf.pem, leaf.keyPem), around());
    expect(shuffled.bundle.certPem).toBe(expected);
    expect(shuffled.bundle.root?.fingerprint256).toBe(house.root.certificate.fingerprint256);
    expect(shuffled.report.notes).toEqual([expect.stringMatching(/were not in order.*Outpost sends them in order/)]);
    expect(shuffled.refusals).toEqual([]);

    // A certificate that has nothing to do with the chain is left out, and said to be.
    const stray = make({ name: "Somebody Else's Authority", authority: true });
    const withStray = inspectOwn(files(leaf.pem + stray.pem + house.intermediate.pem, leaf.keyPem), around());
    expect(withStray.bundle.certPem).toBe(expected);
    expect(withStray.report.notes.join(" ")).toMatch(
      /One certificate in the file is not part of this certificate's chain.*Somebody Else's Authority/,
    );
    // The same certificate twice is one certificate.
    expect(inspectOwn(files(leaf.pem + leaf.pem + house.intermediate.pem, leaf.keyPem), around()).bundle.certPem).toBe(expected);
  });

  it("says when a certificate is out of date, and which one", () => {
    const expired = make({ name: "kitchen-pi.local", issuer: house.intermediate, names: ["kitchen-pi.local"], from: -100, until: -10 });
    const read = inspectOwn(files(expired.pem + house.intermediate.pem, expired.keyPem), around());
    expect(read.refusals).toEqual([]);
    expect(read.outOfDate).toMatch(/^The certificate expired on \d{4}-\d{2}-\d{2}\. Renew it/);
    expect(expiryOf(read.report, Date.now())).toBe("expired");

    const early = make({ name: "kitchen-pi.local", issuer: house.intermediate, names: ["kitchen-pi.local"], from: 3, until: 93 });
    expect(inspectOwn(files(early.pem, early.keyPem), around()).outOfDate).toMatch(
      /not valid until \d{4}-\d{2}-\d{2}, and this computer's clock reads \d{4}-\d{2}-\d{2}/,
    );

    const oldIssuer = make({ name: "Lapsed Issuing 2", authority: true, issuer: house.root, from: -400, until: -5 });
    const under = make({ name: "nas.lan", issuer: oldIssuer, names: ["nas.lan"] });
    const lapsed = inspectOwn(files(under.pem + oldIssuer.pem, under.keyPem), around());
    expect(lapsed.outOfDate).toMatch(/The certificate of Lapsed Issuing 2 in its chain expired on/);
    // The date that matters is the earliest end in what is sent.
    expect(lapsed.report.expiresAt).toBe(oldIssuer.certificate.validToDate.getTime());
  });

  it("warns as the end approaches: two weeks, or a fifth of a short life", () => {
    const now = Date.now();
    const ninety = { validFrom: now - 60 * DAY, expiresAt: now + 30 * DAY };
    expect(expiryOf(ninety, now)).toBe("ok");
    expect(expiryOf(ninety, now + 15 * DAY)).toBe("ok");
    expect(expiryOf(ninety, now + 17 * DAY)).toBe("soon");
    expect(expiryOf(ninety, now + 30 * DAY)).toBe("expired");
    // A six-day certificate is not "about to expire" for its whole life.
    const sixDays = { validFrom: now, expiresAt: now + 6 * DAY };
    expect(expiryOf(sixDays, now + 3 * DAY)).toBe("ok");
    expect(expiryOf(sixDays, now + 5 * DAY)).toBe("soon");
  });

  it("sets the names on the certificate against the addresses this server is reached by", () => {
    // A certificate from a public authority for a name the owner pointed at a private address.
    const named = make({ name: "outpost.example.net", issuer: house.intermediate, names: ["outpost.example.net"] });
    const given = files(named.pem + house.intermediate.pem, named.keyPem);
    const read = inspectOwn(given, around());
    expect(read.refusals).toEqual([]);
    expect(read.report.covered).toEqual([]);
    // It does nothing for the address people type today, and that is said plainly.
    expect(read.report.notCovered).toEqual(["192.168.1.20", "kitchen-pi.local", "kitchen-pi"]);
    // And Outpost does not answer to the name until whoever starts it says so.
    expect(read.report.notAnswered).toEqual(["outpost.example.net"]);
    expect(read.report.usable).toEqual([]);

    const listed = inspectOwn(
      given,
      around({ reached: reached([], ["outpost.example.net"]), answersTo: (name) => name === "outpost.example.net" }),
    );
    expect(listed.report).toMatchObject({ covered: ["outpost.example.net"], notAnswered: [], usable: ["outpost.example.net"] });

    // A wildcard covers a name one level under it, and no deeper.
    const wild = make({ name: "wild", issuer: house.intermediate, names: ["*.home.example.net", "fd12:3456::7"] });
    const wildFiles = files(wild.pem, wild.keyPem);
    const unknown = inspectOwn(wildFiles, around());
    expect(unknown.report.names).toEqual(["*.home.example.net", "fd12:3456::7"]);
    expect(unknown.report.usable).toEqual(["fd12:3456::7"]);
    expect(unknown.report.notes.join(" ")).toMatch(/covers every name directly under home\.example\.net.*list the one you use/);
    const known = inspectOwn(
      wildFiles,
      around({ reached: reached(["pi.home.example.net", "a.b.home.example.net"]), answersTo: () => true }),
    );
    expect(known.report.covered).toEqual(["pi.home.example.net"]);
    expect(known.report.notCovered).toContain("a.b.home.example.net");
    expect(known.report.usable).toEqual(["fd12:3456::7", "pi.home.example.net"]);
    expect(known.report.notes).toEqual([]);

    // No subject alternative name: the common name alone is not read by browsers.
    const bare = make({ name: "kitchen-pi.local", issuer: house.intermediate });
    const bareRead = inspectOwn(files(bare.pem, bare.keyPem), around());
    expect(bareRead.refusals).toEqual([expect.stringMatching(/lists no names: it has no subject alternative name/)]);
    expect(bareRead.report.covered).toEqual([]);
  });

  it("will not take a key protected by a passphrase, and says how to take the passphrase off", () => {
    for (const key of [
      (leaf.key as KeyObject).export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "hunter2" }) as string,
      (leaf.key as KeyObject).export({ type: "sec1", format: "pem", cipher: "aes-256-cbc", passphrase: "hunter2" }) as string,
    ]) {
      expect(key).toMatch(/ENCRYPTED/);
      const said = refusal(() => inspectOwn(files(leaf.pem, key), around()));
      expect(said).toMatch(/protected by a passphrase.*does not store passphrases/);
      expect(said).toContain(REMOVE_PASSPHRASE);
      expect(said).not.toContain("hunter2");
    }
  });

  it.skipIf(!OPENSSL)("gives a command for removing a passphrase that works", () => {
    const dir = scratch();
    const locked = (leaf.key as KeyObject).export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "hunter2" }) as string;
    fs.writeFileSync(path.join(dir, "privkey.pem"), locked);
    const [program, ...args] = REMOVE_PASSPHRASE.split(" ") as [string, ...string[]];
    // A person types the passphrase when asked; here it is handed over instead. Standard input is closed because
    // OpenSSL 3.6 looks for a terminal even then, and fails on the socket a child process is given by default.
    const run = spawnSync(program, [...args, "-passin", "pass:hunter2"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(run.status, run.stderr).toBe(0);
    const open = fs.readFileSync(path.join(dir, "privkey-open.pem"), "utf8");
    expect(inspectOwn(files(leaf.pem, open), around()).refusals).toEqual([]);
  });

  it("refuses keys and signatures browsers do not accept, and warns about ones only some do", () => {
    const check = (made: Made) => inspectOwn(files(made.pem, made.keyPem), around());
    const short = check(make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], key: "rsa1024" }));
    expect(short.report.key).toBe("RSA 1024");
    expect(short.refusals).toEqual([expect.stringMatching(/RSA of 1024 bits.*refuse RSA keys shorter than 2048 bits/)]);
    const edwards = check(make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], key: "ed25519" }));
    expect(edwards.refusals).toEqual([expect.stringMatching(/of the kind ed25519, which browsers do not accept/)]);
    const p384 = check(make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], key: "p384" }));
    expect(p384.report.key).toBe("ECDSA P-384");
    expect([p384.refusals, p384.report.warnings]).toEqual([[], []]);
    const p521 = check(make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], key: "p521" }));
    expect(p521.refusals).toEqual([]);
    expect(p521.report.warnings).toEqual([expect.stringMatching(/P-521, which Chrome does not accept/)]);

    const rsaRoot = make({ name: "Old Root", authority: true, key: "rsa2048" });
    const sha1 = check(make({ name: "nas.lan", issuer: rsaRoot, names: ["nas.lan"], hash: "sha1" }));
    expect(sha1.refusals).toEqual([expect.stringMatching(/signed with SHA-1 or MD5/)]);
    // A certificate for signing in to something, not for a web server.
    const client = check(make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], purposes: ["1.3.6.1.5.5.7.3.2"] }));
    expect(client.refusals).toEqual([expect.stringMatching(/issued for another purpose/)]);
  });

  it("tells a public authority from a private one and a self-signed certificate, as far as it can", () => {
    const given = files(leaf.pem + house.intermediate.pem, leaf.keyPem);
    // The same chain, judged against a list of public authorities that holds its root, and one that does not.
    const publicly = inspectOwn(given, around({ publicAuthorities: [house.root.pem] }));
    expect(publicly.report).toMatchObject({
      trust: "public",
      anchor: { name: "Hill House Root", fingerprint: house.root.certificate.fingerprint256, held: false },
    });
    const withRoot = inspectOwn(
      files(leaf.pem + house.intermediate.pem + house.root.pem, leaf.keyPem),
      around({ publicAuthorities: [house.root.pem] }),
    );
    expect(withRoot.report).toMatchObject({ trust: "public", anchor: { held: false } });

    const privately = inspectOwn(given, around());
    // The root was not given, so all Outpost knows of it is the name the intermediate says issued it.
    expect(privately.report).toMatchObject({ trust: "private", anchor: { name: "Hill House Root", fingerprint: null, held: false } });
    expect(privately.report.warnings).toEqual([]);

    const alone = make({ name: "kitchen-pi.local", names: ["kitchen-pi.local"], until: 365 });
    expect(inspectOwn(files(alone.pem, alone.keyPem), around()).report).toMatchObject({
      trust: "self-signed",
      chain: [],
      anchor: { name: "kitchen-pi.local", fingerprint: alone.certificate.fingerprint256, held: true },
    });

    // Node's own list is what is used outside the tests, and a home authority is not on it.
    const real = inspectOwn(given, { ...around(), publicAuthorities: undefined });
    expect(real.report.trust).toBe("private");
  });

  it("warns when the chain is probably incomplete, and when Apple devices will refuse the lifetime", () => {
    // What a public authority's certificate looks like when it is given without its intermediate (cert.pem, not fullchain.pem).
    const fetched = make({
      name: "outpost.example.net",
      issuer: house.intermediate,
      names: ["outpost.example.net"],
      issuerAddress: "http://ca.example/issuing1.crt",
    });
    const read = inspectOwn(files(fetched.pem, fetched.keyPem), around());
    expect(read.refusals).toEqual([]);
    expect(read.report.warnings).toEqual([
      expect.stringMatching(/Hill House Root Issuing 1\) was not in what you gave.*give Outpost the full chain \(fullchain\.pem\)/),
    ]);
    // With the chain there is nothing to warn about.
    expect(inspectOwn(files(fetched.pem + house.intermediate.pem, fetched.keyPem), around()).report.warnings).toEqual([]);

    const tenYears = make({ name: "kitchen-pi.local", names: ["kitchen-pi.local"], until: 3650 });
    expect(inspectOwn(files(tenYears.pem, tenYears.keyPem), around()).report.warnings).toEqual([
      expect.stringMatching(/valid for 3651 days\. iPhone, iPad and Mac refuse a server certificate valid for more than 825 days/),
    ]);
  });

  it("says what is wrong with a file that is not a certificate and key at all", () => {
    expect(refusal(() => inspectOwn(files(leaf.pem), around()))).toMatch(/No private key was found/);
    expect(refusal(() => inspectOwn(files(leaf.keyPem), around()))).toMatch(/No certificate was found/);
    expect(refusal(() => inspectOwn(files(leaf.pem, leaf.keyPem, house.root.keyPem), around()))).toMatch(/More than one private key/);
    expect(refusal(() => inspectOwn(files(leaf.pem, "not a key"), around()))).toMatch(/not a certificate or a key Outpost can read/);
    expect(refusal(() => inspectOwn(files(leaf.pem, ""), around()))).toMatch(/is empty/);
    expect(refusal(() => inspectOwn(files(Buffer.alloc(300 * 1024, 65)), around()))).toMatch(/too large/);
    expect(
      refusal(() => inspectOwn(files("-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n"), around())),
    ).toMatch(/certificate request.*not the certificate the authority sends back/);
    expect(
      refusal(() => inspectOwn(files("-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n"), around())),
    ).toMatch(/a key for SSH/);
    expect(
      refusal(() => inspectOwn(files("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n", leaf.keyPem), around())),
    ).toMatch(/damaged and cannot be read/);
    const publicKey = leaf.certificate.publicKey.export({ type: "spki", format: "pem" }) as string;
    expect(refusal(() => inspectOwn(files(leaf.pem, publicKey), around()))).toMatch(/This is a public key/);
  });
});

describe("PKCS#12 files", () => {
  const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name));

  it("reads a file encrypted the current way (AES) and the older way (triple DES), and one with no password", () => {
    for (const [name, password] of [
      ["aes.p12", FIXTURE_PASSWORD],
      ["tripledes.p12", FIXTURE_PASSWORD],
      ["nopassword.p12", ""],
    ] as const) {
      const file = fixture(name);
      expect(looksLikePkcs12(file), name).toBe(true);
      const contents = readPkcs12(file, password);
      expect(contents.certificates, name).toHaveLength(1);
      const certificate = new X509Certificate(contents.certificates[0] as Buffer);
      expect(certificate.fingerprint256, name).toBe(FIXTURE_FINGERPRINT);
      expect(contents.key && certificate.checkPrivateKey(contents.key), name).toBe(true);

      const read = inspectOwn({ files: [file], password }, around({ answersTo: () => true }));
      expect(read.refusals, name).toEqual([]);
      expect(read.report, name).toMatchObject({ name: "fixture.outpost.test", key: "ECDSA P-256", trust: "self-signed" });
      // What is kept is the key without a password, which is why none has to be stored.
      expect(read.bundle.keyPem).toContain("BEGIN PRIVATE KEY");
    }
  });

  it("says so when the password is wrong or missing, and when the file is too old to read", () => {
    const wrong = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        expect(error).toBeInstanceOf(Pkcs12Error);
        return (error as Error).message;
      }
      throw new Error("it was read");
    };
    for (const name of ["aes.p12", "tripledes.p12"]) {
      expect(
        wrong(() => readPkcs12(fixture(name), "not-it")),
        name,
      ).toMatch(/not the password this file was exported with/);
      expect(
        wrong(() => readPkcs12(fixture(name), "")),
        name,
      ).toMatch(/protected by a password\. Type the password/);
    }
    const old = wrong(() => readPkcs12(fixture("rc2.p12"), FIXTURE_PASSWORD));
    expect(old).toMatch(/old method this server cannot read/);
    expect(old).toMatch(/openssl pkcs12 -in file\.pfx -nodes -out pair\.pem \(add -legacy/);
    expect(refusal(() => inspectOwn({ files: [fixture("aes.p12")], password: "not-it" }, around()))).toMatch(/not the password/);
    // Something else that merely starts like one.
    expect(looksLikePkcs12(leaf.der)).toBe(false);
    expect(looksLikePkcs12(Buffer.from("hello"))).toBe(false);
    expect(wrong(() => readPkcs12(Buffer.concat([fixture("aes.p12").subarray(0, 200), Buffer.alloc(40)]), FIXTURE_PASSWORD))).toMatch(
      /could not be read as PKCS#12/,
    );
  });

  it("refuses a file that asks for an absurd amount of work to open, without doing the work", () => {
    // A container whose one sealed part names a billion rounds of key derivation.
    const sealed = (method: Buffer) =>
      sequence(
        integer(3),
        sequence(
          oid("1.2.840.113549.1.7.1"),
          contextual(
            0,
            true,
            octetString(
              sequence(
                sequence(
                  oid("1.2.840.113549.1.7.6"),
                  contextual(
                    0,
                    true,
                    sequence(integer(0), sequence(oid("1.2.840.113549.1.7.1"), method, contextual(0, false, Buffer.alloc(32)))),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    const salt = octetString(Buffer.alloc(8, 1));
    const pbes2 = sequence(
      oid("1.2.840.113549.1.5.13"),
      sequence(
        sequence(oid("1.2.840.113549.1.5.12"), sequence(salt, integer(1_000_000_000))),
        sequence(oid("2.16.840.1.101.3.4.1.42"), octetString(Buffer.alloc(16))),
      ),
    );
    const tripleDes = sequence(oid("1.2.840.113549.1.12.1.3"), sequence(salt, integer(1_000_000_000)));
    for (const method of [pbes2, tripleDes]) {
      const file = sealed(method);
      expect(looksLikePkcs12(file)).toBe(true);
      const started = Date.now();
      expect(() => readPkcs12(file, "x")).toThrow(/asks for more work to open than any real one does/);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });

  it.skipIf(!OPENSSL)("reads what openssl exports today, with a chain inside and an RSA key", () => {
    const dir = scratch();
    const rsa = make({ name: "nas.lan", issuer: house.intermediate, names: ["nas.lan"], key: "rsa2048" });
    fs.writeFileSync(path.join(dir, "cert.pem"), rsa.pem);
    fs.writeFileSync(path.join(dir, "key.pem"), rsa.keyPem);
    fs.writeFileSync(path.join(dir, "chain.pem"), house.intermediate.pem + house.root.pem);
    const args = ["pkcs12", "-export", "-in", "cert.pem", "-inkey", "key.pem", "-certfile", "chain.pem", "-out", "pair.pfx"];
    const run = spawnSync("openssl", [...args, "-passout", "pass:pässword ✓"], { cwd: dir, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const read = inspectOwn({ files: [fs.readFileSync(path.join(dir, "pair.pfx"))], password: "pässword ✓" }, around());
    expect(read.refusals).toEqual([]);
    expect(read.report).toMatchObject({ name: "nas.lan", key: "RSA 2048", chain: ["Hill House Root Issuing 1"], anchor: { held: true } });
    expect(read.bundle.certPem).toBe(rsa.pem + house.intermediate.pem);
  });
});

// ── The listener ──

interface Answer {
  status: number;
  body: string;
  certificate: X509Certificate;
}

/** One HTTPS request that trusts `ca` and nothing else. */
function secure(
  url: string,
  ca: string,
  options: { method?: string; headers?: Record<string, string>; body?: string | Buffer; servername?: string } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const settings = { ca, agent: false, method: options.method ?? "GET", headers: options.headers, servername: options.servername };
    const request = https.request(url, settings, (response) => {
      const certificate = (response.socket as TLSSocket).getPeerX509Certificate();
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        if (!certificate) return reject(new Error("no certificate"));
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), certificate });
      });
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

/** A multipart body holding the given files, and a password if there is one. */
function form(
  parts: Array<string | Buffer>,
  password?: string,
  fields: Record<string, string> = {},
): { body: Buffer; headers: Record<string, string> } {
  const boundary = "----formboundary7MA4YWxkTrZu0gW";
  const chunks: Buffer[] = [];
  parts.forEach((part, index) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file${index}"; filename="file${index}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      typeof part === "string" ? Buffer.from(part) : part,
      Buffer.from("\r\n"),
    );
  });
  for (const [name, value] of Object.entries(password === undefined ? fields : { password, ...fields })) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

interface Running {
  app: TestApp;
  dir: string;
  http: string;
  status(): Promise<HttpsStatus>;
  settle(): Promise<void>;
  /** Gives Outpost files as Settings does, from the computer it runs on unless told otherwise. */
  give(
    parts: Array<string | Buffer>,
    options?: { password?: string; from?: string; fields?: Record<string, string> },
  ): Promise<{ status: number; body: HttpsStatus & { error: { message: string } } }>;
  /** Looks at the folder again, as the half-minute check does. */
  tick(): Promise<void>;
}

async function start(env: Record<string, string> = {}, existing?: string): Promise<Running> {
  const dir = existing ?? scratch();
  fs.mkdirSync(path.join(dir, "web"), { recursive: true });
  fs.writeFileSync(path.join(dir, "web", "index.html"), "<!doctype html><title>Outpost</title><div id=root></div>");
  const app = await createTestApp({ OUTPOST_HTTPS_PORT: "0", ...env }, dir);
  let closed = false;
  const close = app.close;
  app.close = async () => {
    if (closed) return;
    closed = true;
    await close();
  };
  cleanups.push(() => app.close());
  const address = await app.app.listen({ port: 0, host: "127.0.0.1" });
  const settle = () => app.ctx.services.https.whenSettled();
  await settle();
  return {
    app,
    dir,
    http: address,
    settle,
    status: async () => (await app.api<HttpsStatus>("GET", "/api/https")).body,
    async give(parts, options = {}) {
      const { body, headers } = form(parts, options.password, options.fields);
      const answer = await app.api("POST", "/api/https/own", body, { headers, ...(options.from ? { remoteAddress: options.from } : {}) });
      await settle();
      return answer;
    },
    async tick() {
      await app.ctx.services.https.check();
    },
  };
}

const own = (dir: string, name = "") => path.join(dir, "data", "tls", "own", name);
/** Puts the two files in the folder as a person or a renewal script would, dated a little in the past so they count as settled. */
function place(dir: string, certificate: string, key: string, age = 10): void {
  fs.mkdirSync(own(dir), { recursive: true });
  for (const [name, text] of [
    ["fullchain.pem", certificate],
    ["privkey.pem", key],
  ] as const) {
    fs.writeFileSync(own(dir, name), text);
    const when = new Date(Date.now() - age * 1000 - Math.random() * 1000);
    fs.utimesSync(own(dir, name), when, when);
  }
}

/** A certificate for the names a test server is reached by, from the house authority. */
const forThisComputer = (options: Partial<Parameters<typeof make>[0]> = {}) =>
  make({ name: "localhost", issuer: house.intermediate, names: ["localhost", "127.0.0.1"], until: 90, ...options });
const chainOf = (made: Made) => made.pem + house.intermediate.pem + house.root.pem;

describe("HTTPS with a certificate of your own", () => {
  it("takes a certificate given in Settings, keeps it privately, and serves it with a chain Node verifies", async () => {
    const w = await start();
    const mine = forThisComputer();
    const given = await w.give([chainOf(mine), mine.keyPem]);
    expect(given.status).toBe(200);
    // Giving a certificate is asking for it to be used: HTTPS is on, with it.
    expect(given.body).toMatchObject({ enabled: true, source: "own", listening: true, problem: null, leftOut: [] });
    expect(w.app.ctx.services.settings.get("https.certificate")).toBe("own");
    expect(given.body.names).toEqual(["localhost", "127.0.0.1"]);
    expect(given.body.addresses.map((address) => address.url)).toEqual([
      `https://localhost:${given.body.port}`,
      `https://127.0.0.1:${given.body.port}`,
    ]);
    expect(given.body.certificateExpiresAt).toBe(mine.certificate.validToDate.getTime());
    expect(given.body.own).toMatchObject({
      folder: own(w.dir).replace(/\/$/, ""),
      files: { certificate: "fullchain.pem", key: "privkey.pem" },
      inFolder: { certificate: true, key: true },
      expiry: "ok",
      problem: null,
      keyRight: { allowed: true, reason: "local" },
      certificate: {
        name: "localhost",
        issuer: "Hill House Root Issuing 1",
        fingerprint: mine.certificate.fingerprint256,
        key: "ECDSA P-256",
        trust: "private",
        anchor: { name: "Hill House Root", fingerprint: house.root.certificate.fingerprint256, held: true },
        warnings: [],
      },
    });
    // Outpost made no authority of its own: nobody asked for one.
    expect(given.body.authority).toBeNull();
    expect(fs.readdirSync(path.join(w.dir, "data", "tls"))).toEqual(["own"]);

    // A client that trusts the house root, and nothing else, accepts the address: the chain is sent whole and in order.
    const health = await secure(`https://127.0.0.1:${given.body.port}/api/health`, house.root.pem);
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body).status).toBe("ok");
    expect(health.certificate.fingerprint256).toBe(mine.certificate.fingerprint256);
    expect((await secure(`https://localhost:${given.body.port}/settings`, house.root.pem)).body).toContain("<title>Outpost</title>");
    await expect(secure(`https://127.0.0.1:${given.body.port}/api/health`, "")).rejects.toThrow();
    // Trusting the intermediate alone is not enough for Node, and trusting a stranger is not either.
    await expect(secure(`https://127.0.0.1:${given.body.port}/api/health`, makeAuthority("Stranger").root.pem)).rejects.toThrow();
    // Plain HTTP is untouched.
    expect((await fetch(`${w.http}/api/health`)).status).toBe(200);

    if (process.platform !== "win32") {
      const mode = (target: string) => fs.statSync(target).mode & 0o777;
      expect(mode(path.join(w.dir, "data", "tls"))).toBe(0o700);
      expect(mode(own(w.dir))).toBe(0o700);
      expect(mode(own(w.dir, "privkey.pem"))).toBe(0o600);
    }
    expect(fs.readdirSync(own(w.dir)).sort()).toEqual(["fullchain.pem", "privkey.pem"]);
    expect(fs.readFileSync(own(w.dir, "fullchain.pem"), "utf8")).toBe(chainOf(mine));
    expect(createPrivateKey(fs.readFileSync(own(w.dir, "privkey.pem"))).equals(mine.key)).toBe(true);
  });

  it("serves an RSA certificate, and one from a PKCS#12 file with its password", async () => {
    const w = await start();
    const rsa = forThisComputer({ key: "rsa2048" });
    const first = await w.give([rsa.keyPem, rsa.pem, house.intermediate.pem]);
    expect(first.status).toBe(200);
    expect(first.body.own.certificate).toMatchObject({ key: "RSA 2048", anchor: { held: false, fingerprint: null } });
    expect((await secure(`https://127.0.0.1:${first.body.port}/api/health`, house.root.pem)).certificate.fingerprint256).toBe(
      rsa.certificate.fingerprint256,
    );

    // Replacing it with another needs nothing but giving the other one.
    const file = fs.readFileSync(path.join(FIXTURES, "aes.p12"));
    const wrong = await w.give([file], { password: "nope" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/not the password this file was exported with/);
    expect((await w.status()).own.certificate?.fingerprint).toBe(rsa.certificate.fingerprint256);
    const second = await w.give([file], { password: FIXTURE_PASSWORD });
    expect(second.status).toBe(200);
    expect(second.body.own.certificate).toMatchObject({
      name: "fixture.outpost.test",
      trust: "self-signed",
      fingerprint: FIXTURE_FINGERPRINT,
    });
    // Outpost does not answer to that name, and says so rather than listing an address that would be refused.
    expect(second.body.own.certificate?.notAnswered).toEqual(["fixture.outpost.test"]);
    expect(second.body.addresses).toEqual([]);
    const served = await secure(`https://127.0.0.1:${second.body.port}/api/health`, fs.readFileSync(own(w.dir, "fullchain.pem"), "utf8"), {
      servername: "fixture.outpost.test",
    });
    expect(served.certificate.fingerprint256).toBe(FIXTURE_FINGERPRINT);
    // The password is not kept: what is on disk is the key itself, private to the account.
    expect(fs.readFileSync(own(w.dir, "privkey.pem"), "utf8")).toContain("BEGIN PRIVATE KEY");
    expect(fs.readdirSync(own(w.dir)).sort()).toEqual(["fullchain.pem", "privkey.pem"]);
  });

  it("refuses what cannot work, with the reason, and keeps nothing of it", async () => {
    const w = await start();
    const stranger = make({ name: "other", names: ["other.lan"] });
    const expired = forThisComputer({ from: -100, until: -3 });
    const early = forThisComputer({ from: 2, until: 92 });
    const locked = (forThisComputer().key as KeyObject).export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "x" });
    const mine = forThisComputer();
    for (const [parts, reason] of [
      [[chainOf(mine), stranger.keyPem], /This key does not belong to any certificate in the file/],
      [[chainOf(expired), expired.keyPem], /The certificate expired on \d{4}-\d{2}-\d{2}\. Renew it/],
      [[chainOf(early), early.keyPem], /not valid until/],
      [[chainOf(mine), locked as string], /protected by a passphrase/],
      [[chainOf(mine)], /No private key was found/],
      [["hello", "world"], /not a certificate or a key Outpost can read/],
    ] as const) {
      const answer = await w.give([...parts]);
      expect(answer.status, String(reason)).toBe(400);
      expect(answer.body.error.message).toMatch(reason);
    }
    expect((await w.app.api("POST", "/api/https/own", form([]).body, { headers: form([]).headers })).status).toBe(400);
    expect((await w.give(["a", "b", "c", "d"])).status).toBe(400);
    expect((await w.give([Buffer.alloc(400 * 1024, 65)])).status).toBe(413);
    expect(await w.status()).toMatchObject({ enabled: false, source: "outpost", listening: false });
    expect(fs.existsSync(path.join(w.dir, "data", "tls"))).toBe(false);
  });

  it("accepts a key by upload only from the computer Outpost runs on, or over HTTPS", async () => {
    const w = await start({ OUTPOST_LAN_ACCESS: "true", OUTPOST_ALLOW_REMOTE_ERASE: "true" });
    const mine = forThisComputer();
    const phone = "192.168.1.50";
    // A phone on the plain http address: the key would cross the network in the clear. The option that
    // allows erasing from anywhere does not change that.
    expect((await w.app.api<HttpsStatus>("GET", "/api/https", undefined, { remoteAddress: phone })).body.own.keyRight).toEqual({
      allowed: false,
      reason: "remote",
    });
    const refused = await w.give([chainOf(mine), mine.keyPem], { from: phone });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/crosses your network unencrypted/);
    expect(refused.body.error.message).toContain(`put the two files in ${own(w.dir).replace(/\/$/, "")}`);
    // Through a proxy on this computer counts as remote too, and every change needs the app's own header.
    const { body, headers } = form([chainOf(mine), mine.keyPem]);
    expect((await w.app.api("POST", "/api/https/own", body, { headers: { ...headers, "x-forwarded-for": "203.0.113.9" } })).status).toBe(
      403,
    );
    expect(
      (await w.app.app.inject({ method: "POST", url: "/api/https/own", payload: body, headers: { host: "localhost", ...headers } }))
        .statusCode,
    ).toBe(403);
    expect(fs.existsSync(path.join(w.dir, "data", "tls"))).toBe(false);
    expect(await w.status()).toMatchObject({ enabled: false, source: "outpost" });

    // At the computer itself it is accepted.
    expect((await w.status()).own.keyRight).toEqual({ allowed: true, reason: "local" });
    const first = await w.give([chainOf(mine), mine.keyPem]);
    expect(first.status).toBe(200);

    // And from elsewhere once the connection is HTTPS: here, a request through the HTTPS listener that a
    // forwarding header marks as not local.
    const base = `https://127.0.0.1:${first.body.port}`;
    const far = { "x-outpost-request": "1", "x-forwarded-for": "192.168.1.50", origin: base };
    const seen = await secure(`${base}/api/https`, house.root.pem, { headers: far });
    expect(JSON.parse(seen.body).own.keyRight).toEqual({ allowed: true, reason: "https" });
    const renewed = forThisComputer();
    const again = form([chainOf(renewed), renewed.keyPem]);
    const sent = await secure(`${base}/api/https/own`, house.root.pem, {
      method: "POST",
      headers: { ...far, ...again.headers },
      body: again.body,
    });
    expect(sent.status).toBe(200);
    await w.settle();
    expect((await w.status()).own.certificate?.fingerprint).toBe(renewed.certificate.fingerprint256);
    // The same request over plain http, marked the same way, is refused.
    const plain = await new Promise<number>((resolve, reject) => {
      const request = http.request(
        `${w.http}/api/https/own`,
        { method: "POST", headers: { ...far, origin: w.http, ...again.headers }, agent: false },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode ?? 0));
        },
      );
      request.on("error", reject);
      request.end(again.body);
    });
    expect(plain).toBe(403);
  });

  it("takes a key from another device over plain http when the person says they accept it crossing the network, and logs that", async () => {
    const w = await start({ OUTPOST_LAN_ACCESS: "true" });
    const lines: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(w.app.ctx.log, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.filter((arg) => typeof arg === "string").join(" "));
      });
    }
    const mine = forThisComputer();
    // TEST-NET-1: never this computer's own address.
    const phone = "192.0.2.50";
    // Only the exact field and value count: no default, no near miss.
    const nearMisses: Array<Record<string, string>> = [
      {},
      { [PLAIN_HTTP_ACCEPTED_FIELD]: "true" },
      { [PLAIN_HTTP_ACCEPTED_FIELD]: "" },
      { acceptKey: "yes" },
    ];
    for (const fields of nearMisses) {
      const refused = await w.give([chainOf(mine), mine.keyPem], { from: phone, fields });
      expect(refused.status, JSON.stringify(fields)).toBe(403);
      expect(refused.body.error.message).toContain(PLAIN_HTTP_ACCEPTED_FIELD);
    }
    expect(fs.existsSync(path.join(w.dir, "data", "tls"))).toBe(false);

    const taken = await w.give([chainOf(mine), mine.keyPem], { from: phone, fields: { [PLAIN_HTTP_ACCEPTED_FIELD]: "yes" } });
    expect(taken.status).toBe(200);
    expect(taken.body).toMatchObject({ enabled: true, source: "own", listening: true });
    // The answer is still about this device: it is not now "allowed" to send keys without saying so.
    expect(taken.body.own.keyRight).toEqual({ allowed: false, reason: "remote" });
    const said = lines.join("\n");
    expect(said).toMatch(/private key was accepted over plain http from another device, 192\.0\.2\.50/);
    expect(said).not.toMatch(/PRIVATE KEY/);
    expect(said).not.toContain(mine.keyPem.split("\n")[1]);

    // PKCS#12 with its password, which crosses in the clear as well. (Here the fields come after the files: order does not matter.)
    const file = fs.readFileSync(path.join(FIXTURES, "aes.p12"));
    const twelve = await w.give([file], { from: phone, password: FIXTURE_PASSWORD, fields: { [PLAIN_HTTP_ACCEPTED_FIELD]: "yes" } });
    expect(twelve.status).toBe(200);
    expect(twelve.body.own.certificate?.fingerprint).toBe(FIXTURE_FINGERPRINT);
    expect(lines.join("\n")).not.toContain(FIXTURE_PASSWORD);

    // At the computer itself the field is not needed, and not logged.
    lines.length = 0;
    const local = await w.give([chainOf(mine), mine.keyPem]);
    expect(local.status).toBe(200);
    expect(lines.join("\n")).not.toMatch(/plain http/);
  });

  it("uses the two files a person put in the folder, from any device, and leaves them as they are", async () => {
    const w = await start({ OUTPOST_LAN_ACCESS: "true" });
    const phone = { remoteAddress: "192.168.1.50" };
    // Nothing there yet.
    expect((await w.status()).own).toMatchObject({ inFolder: { certificate: false, key: false }, certificate: null });
    const none = await w.app.api("POST", "/api/https/own/use", undefined, phone);
    expect(none.status).toBe(409);
    expect(none.body.error.message).toMatch(/looked in .*tls\/own for fullchain\.pem and privkey\.pem and found neither/);

    const mine = forThisComputer();
    fs.mkdirSync(own(w.dir), { recursive: true });
    fs.writeFileSync(own(w.dir, "fullchain.pem"), chainOf(mine));
    const half = await w.app.api("POST", "/api/https/own/use", undefined, phone);
    expect(half.status).toBe(409);
    expect(half.body.error.message).toMatch(/did not find privkey\.pem/);
    fs.writeFileSync(own(w.dir, "privkey.pem"), mine.keyPem, { mode: 0o640 });
    expect((await w.status()).own.inFolder).toEqual({ certificate: true, key: true });

    // No key crosses the network, so the phone may press "Use them".
    const used = await w.app.api<HttpsStatus>("POST", "/api/https/own/use", undefined, phone);
    await w.settle();
    expect(used.status).toBe(200);
    expect(used.body).toMatchObject({ enabled: true, source: "own", listening: true });
    expect((await secure(`https://127.0.0.1:${used.body.port}/api/health`, house.root.pem)).certificate.fingerprint256).toBe(
      mine.certificate.fingerprint256,
    );
    // The person's files are theirs: not rewritten, not re-permissioned.
    expect(fs.readFileSync(own(w.dir, "fullchain.pem"), "utf8")).toBe(chainOf(mine));
    expect(fs.readFileSync(own(w.dir, "privkey.pem"), "utf8")).toBe(mine.keyPem);
    if (process.platform !== "win32") {
      expect(fs.statSync(own(w.dir, "privkey.pem")).mode & 0o777).toBe(0o640);
      // A key other accounts can read is pointed out, not silently changed.
      expect((await w.status()).own.certificate?.warnings.join(" ")).toMatch(
        /Other accounts on this computer can read the key file \(privkey\.pem has permissions 640\)/,
      );
      fs.chmodSync(own(w.dir, "privkey.pem"), 0o600);
      await w.tick();
      expect((await w.status()).own.certificate?.warnings).toEqual([]);
    }

    // A pair in the folder that cannot work is refused when pressed, and what was in use carries on.
    const other = forThisComputer();
    fs.writeFileSync(own(w.dir, "privkey.pem"), other.keyPem);
    const bad = await w.app.api("POST", "/api/https/own/use");
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/This key does not belong/);
    expect((await secure(`https://127.0.0.1:${used.body.port}/api/health`, house.root.pem)).certificate.fingerprint256).toBe(
      mine.certificate.fingerprint256,
    );
  });

  it("takes up a renewed certificate from the folder without a restart", async () => {
    const w = await start();
    const first = forThisComputer({ until: 30 });
    place(w.dir, chainOf(first), first.keyPem);
    const before = (await w.app.api<HttpsStatus>("POST", "/api/https/own/use")).body;
    await w.settle();
    const url = `https://127.0.0.1:${before.port}/api/health`;
    expect((await secure(url, house.root.pem)).certificate.fingerprint256).toBe(first.certificate.fingerprint256);

    // Nothing changed, nothing announced.
    const events: string[] = [];
    const stop = w.app.ctx.events.subscribe((event) => events.push(event.type));
    await w.tick();
    expect(events).toEqual([]);

    // A renewal script writes the new certificate and its new key over the old.
    const renewed = forThisComputer({ until: 90 });
    place(w.dir, chainOf(renewed), renewed.keyPem);
    await w.tick();
    stop();
    expect(events).toContain("https.changed");
    const after = await w.status();
    expect(after).toMatchObject({ listening: true, port: before.port, problem: null });
    expect(after.own).toMatchObject({ problem: null, certificate: { fingerprint: renewed.certificate.fingerprint256 } });
    expect(after.certificateExpiresAt).toBe(renewed.certificate.validToDate.getTime());
    const served = await secure(url, house.root.pem);
    expect(served.certificate.fingerprint256).toBe(renewed.certificate.fingerprint256);
    expect(served.status).toBe(200);
  });

  it("does not judge a pair caught half written, and keeps the old one when the new one cannot be used", async () => {
    const w = await start();
    const first = forThisComputer();
    place(w.dir, chainOf(first), first.keyPem);
    const { port } = (await w.app.api<HttpsStatus>("POST", "/api/https/own/use")).body;
    await w.settle();
    const serving = async () => (await secure(`https://127.0.0.1:${port}/api/health`, house.root.pem)).certificate.fingerprint256;

    // The certificate has been replaced this instant; its key has not been yet.
    const renewed = forThisComputer();
    fs.writeFileSync(own(w.dir, "fullchain.pem"), chainOf(renewed));
    await w.tick();
    expect((await w.status()).own).toMatchObject({ problem: null, certificate: { fingerprint: first.certificate.fingerprint256 } });
    expect(await serving()).toBe(first.certificate.fingerprint256);

    // Left like that, it is a pair that does not match: said plainly, and the old certificate is still what is served.
    place(w.dir, chainOf(renewed), first.keyPem);
    await w.tick();
    const stuck = await w.status();
    expect(stuck.listening).toBe(true);
    expect(stuck.problem).toBeNull();
    expect(stuck.own.problem).toMatch(
      /files in .*tls\/own changed, and the new ones cannot be used\. This key does not belong.*still serving the certificate it read before/,
    );
    expect(stuck.own.certificate?.fingerprint).toBe(first.certificate.fingerprint256);
    expect(await serving()).toBe(first.certificate.fingerprint256);

    // A file deleted is said too.
    fs.rmSync(own(w.dir, "privkey.pem"));
    await w.tick();
    expect((await w.status()).own.problem).toMatch(/privkey\.pem is missing from/);
    expect(await serving()).toBe(first.certificate.fingerprint256);

    // The key arrives: taken up.
    place(w.dir, chainOf(renewed), renewed.keyPem);
    await w.tick();
    expect((await w.status()).own).toMatchObject({ problem: null, certificate: { fingerprint: renewed.certificate.fingerprint256 } });
    expect(await serving()).toBe(renewed.certificate.fingerprint256);

    // A renewal that produced a certificate already out of date does not displace one that is in date.
    const stale = forThisComputer({ from: -100, until: -1 });
    place(w.dir, chainOf(stale), stale.keyPem);
    await w.tick();
    expect((await w.status()).own.problem).toMatch(/new certificate is out of date\. The certificate expired on/);
    expect(await serving()).toBe(renewed.certificate.fingerprint256);
  });

  it("warns as the certificate nears its end, and goes on serving it once expired rather than change what devices see", async () => {
    const w = await start();
    const mine = forThisComputer({ until: 90 });
    const given = await w.give([chainOf(mine), mine.keyPem]);
    expect(given.body.own.expiry).toBe("ok");
    const url = `https://127.0.0.1:${given.body.port}/api/health`;
    const realNow = Date.now();
    const clock = vi.spyOn(Date, "now");
    const events: string[] = [];
    const stop = w.app.ctx.events.subscribe((event) => events.push(event.type));

    clock.mockReturnValue(realNow + 80 * DAY);
    await w.tick();
    expect((await w.status()).own.expiry).toBe("soon");
    expect(events).toEqual(["https.changed"]);

    clock.mockReturnValue(realNow + 91 * DAY);
    await w.tick();
    stop();
    expect(events).toEqual(["https.changed", "https.changed"]);
    const late = await w.status();
    // Still listening, still the person's certificate, and no authority of Outpost's has appeared.
    expect(late).toMatchObject({ enabled: true, source: "own", listening: true, problem: null, authority: null });
    expect(late.own).toMatchObject({ expiry: "expired", certificate: { fingerprint: mine.certificate.fingerprint256 } });
    expect(fs.readdirSync(path.join(w.dir, "data", "tls"))).toEqual(["own"]);
    clock.mockRestore();
    // What a device sees is the same certificate, which it judges by its own clock.
    expect((await secure(url, house.root.pem)).certificate.fingerprint256).toBe(mine.certificate.fingerprint256);

    // After a restart with nothing better in the folder, the expired certificate is still what is served.
    await w.app.close();
    const again = await start({}, w.dir);
    vi.spyOn(Date, "now").mockReturnValue(realNow + 91 * DAY);
    await again.tick();
    const restarted = await again.status();
    expect(restarted).toMatchObject({ listening: true, problem: null });
    expect(restarted.own).toMatchObject({ expiry: "expired", certificate: { fingerprint: mine.certificate.fingerprint256 } });
    vi.restoreAllMocks();
    expect((await secure(`https://127.0.0.1:${restarted.port}/api/health`, house.root.pem)).certificate.fingerprint256).toBe(
      mine.certificate.fingerprint256,
    );
  });

  it("says so when the files are unusable at start-up, serves nothing in their place, and leaves plain HTTP alone", async () => {
    const first = await start();
    const mine = forThisComputer();
    expect((await first.give([chainOf(mine), mine.keyPem])).status).toBe(200);
    await first.app.close();
    fs.writeFileSync(own(first.dir, "privkey.pem"), forThisComputer().keyPem);

    const w = await start({}, first.dir);
    const status = await w.status();
    expect(status).toMatchObject({ enabled: true, source: "own", listening: false, addresses: [], authority: null });
    expect(status.problem).toMatch(/files in .*tls\/own cannot be used\. This key does not belong/);
    expect(status.problem).toMatch(/HTTPS is not running; the plain http address is not affected.*go back to Outpost's own certificate/);
    expect(status.own).toMatchObject({ certificate: null, inFolder: { certificate: true, key: true } });
    expect(fs.readdirSync(path.join(w.dir, "data", "tls"))).toEqual(["own"]);
    expect((await fetch(`${w.http}/api/health`)).status).toBe(200);

    // Putting the right key back is enough; the half-minute check takes it up.
    place(w.dir, chainOf(mine), mine.keyPem);
    await w.tick();
    const mended = await w.status();
    expect(mended).toMatchObject({ listening: true, problem: null });
    expect((await secure(`https://127.0.0.1:${mended.port}/api/health`, house.root.pem)).status).toBe(200);

    // The folder emptied while HTTPS was off: turning it on again says what is missing.
    await w.app.api("PATCH", "/api/settings", { "https.enabled": false });
    await w.settle();
    fs.rmSync(own(w.dir), { recursive: true });
    await w.app.api("PATCH", "/api/settings", { "https.enabled": true });
    await w.settle();
    expect((await w.status()).problem).toMatch(
      /There is no certificate in .*tls\/own\. Outpost looks there for fullchain\.pem and privkey\.pem/,
    );
  });

  it("goes back to Outpost's own authority in one step, with the authority and the person's files as they were", async () => {
    const w = await start();
    // Outpost's own first, as most people have it.
    await w.app.api("PATCH", "/api/settings", { "https.enabled": true });
    await w.settle();
    const outposts = await w.status();
    const authority = (await w.app.api("GET", "/api/https/outpost-authority.pem")).body as unknown as string;
    const url = `https://127.0.0.1:${outposts.port}/api/health`;
    const outpostsOwn = (await secure(url, authority)).certificate.fingerprint256;
    const caKey = fs.readFileSync(path.join(w.dir, "data", "tls", "ca.key"), "utf8");

    const mine = forThisComputer();
    const given = await w.give([chainOf(mine), mine.keyPem]);
    expect(given.body).toMatchObject({ source: "own", listening: true, port: outposts.port });
    // The authority is kept, untouched, while the person's certificate is in use.
    expect(given.body.authority?.fingerprint).toBe(outposts.authority?.fingerprint);
    expect((await secure(url, house.root.pem)).certificate.fingerprint256).toBe(mine.certificate.fingerprint256);
    await expect(secure(url, authority)).rejects.toThrow();

    // One setting, from any device.
    expect((await w.app.api("PATCH", "/api/settings", { "https.certificate": "outpost" }, { remoteAddress: "192.168.1.50" })).status).toBe(
      200,
    );
    await w.settle();
    const back = await w.status();
    expect(back).toMatchObject({ enabled: true, source: "outpost", listening: true, port: outposts.port, problem: null });
    expect(back.authority?.fingerprint).toBe(outposts.authority?.fingerprint);
    expect(fs.readFileSync(path.join(w.dir, "data", "tls", "ca.key"), "utf8")).toBe(caKey);
    // A device that trusted Outpost's authority before has nothing to do: it is the very same server certificate.
    expect((await secure(url, authority)).certificate.fingerprint256).toBe(outpostsOwn);
    await expect(secure(url, house.root.pem)).rejects.toThrow();
    expect(back.own).toMatchObject({ certificate: null, problem: null, inFolder: { certificate: true, key: true } });
    expect(back.names).toEqual(["localhost", "127.0.0.1", "::1"]);

    // The person's files are still there, so going the other way is one step too.
    expect(fs.readFileSync(own(w.dir, "fullchain.pem"), "utf8")).toBe(chainOf(mine));
    const forth = await w.app.api<HttpsStatus>("POST", "/api/https/own/use");
    await w.settle();
    expect(forth.body.own.certificate?.fingerprint).toBe(mine.certificate.fingerprint256);
    expect((await secure(url, house.root.pem)).status).toBe(200);

    // Deleting Outpost's authority does not touch the person's certificate, or stop HTTPS that is not using it.
    const removed = await w.app.api<HttpsStatus>("DELETE", "/api/https/authority");
    expect(removed.body).toMatchObject({ enabled: true, source: "own", listening: true, authority: null });
    expect(fs.readdirSync(path.join(w.dir, "data", "tls"))).toEqual(["own"]);
    expect((await secure(url, house.root.pem)).status).toBe(200);
  });

  it("deletes the person's certificate and key only at the computer Outpost runs on, and turns HTTPS off with them", async () => {
    const w = await start({ OUTPOST_LAN_ACCESS: "true" });
    const mine = forThisComputer();
    const { port } = (await w.give([chainOf(mine), mine.keyPem])).body;
    const far = await w.app.api("DELETE", "/api/https/own", undefined, { remoteAddress: "192.168.1.50" });
    expect(far.status).toBe(403);
    expect(far.body.error.message).toMatch(/can only be deleted at the computer Outpost runs on.*OUTPOST_ALLOW_REMOTE_ERASE=true/);
    expect(fs.existsSync(own(w.dir, "privkey.pem"))).toBe(true);

    const removed = await w.app.api<HttpsStatus>("DELETE", "/api/https/own");
    await w.settle();
    expect(removed.status).toBe(200);
    // Not swapped for Outpost's own behind the person's back: HTTPS is off.
    expect(await w.status()).toMatchObject({ enabled: false, source: "outpost", listening: false, authority: null });
    expect(fs.existsSync(path.join(w.dir, "data", "tls"))).toBe(false);
    await expect(secure(`https://127.0.0.1:${port}/api/health`, house.root.pem)).rejects.toThrow();
  });

  it("hands out the root a device has to trust when it holds it, and never a key", async () => {
    const w = await start();
    const mine = forThisComputer();
    expect((await w.app.api("GET", "/api/https/own-root.crt")).status).toBe(404);
    const { port } = (await w.give([chainOf(mine), mine.keyPem])).body;

    const der = await w.app.app.inject({ method: "GET", url: "/api/https/own-root.crt", headers: { host: "localhost" } });
    expect(der.statusCode).toBe(200);
    expect(der.headers["content-type"]).toBe("application/x-x509-ca-cert");
    expect(der.headers["content-disposition"]).toBeUndefined();
    expect(new X509Certificate(der.rawPayload).fingerprint256).toBe(house.root.certificate.fingerprint256);
    const pem = await w.app.api("GET", "/api/https/own-root.pem");
    expect(pem.headers["content-disposition"]).toBe('attachment; filename="own-root.pem"');
    expect(pem.body).toBe(house.root.pem);
    // Outpost's own authority has the same two addresses.
    expect((await w.app.api("GET", "/api/https/outpost-authority.pem")).status).toBe(404);

    const secrets = [mine.keyPem.split("\n")[1] as string, fs.readFileSync(own(w.dir, "privkey.pem"), "utf8").split("\n")[1] as string];
    const leaks = (body: string | Buffer) =>
      secrets.some((line) => body.toString("latin1").includes(line)) || /PRIVATE KEY/.test(body.toString("latin1"));
    const get = (base: string, pathname: string): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const secureBase = base.startsWith("https");
        const request = (secureBase ? https : http).request(
          {
            host: "127.0.0.1",
            port: new URL(base).port,
            path: pathname,
            headers: { host: "localhost" },
            agent: false,
            ...(secureBase ? { ca: house.root.pem, servername: "localhost" } : {}),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("latin1") }));
          },
        );
        request.on("error", reject);
        request.end();
      });
    for (const guess of [
      "/tls/own/privkey.pem",
      "/data/tls/own/privkey.pem",
      "/privkey.pem",
      "/api/https/own/privkey.pem",
      "/api/https/own",
      "/api/https/own/use",
      "/api/https/own-root.crt?format=key",
      "/api/https/own-root.key",
      "/api/https/own-root.crt/../own/privkey.pem",
      "/assets/../../data/tls/own/privkey.pem",
      "/assets/%2e%2e/%2e%2e/data/tls/own/privkey.pem",
      `/api/storage/browse?path=${encodeURIComponent(own(w.dir))}`,
      `/api/documents/file?path=${encodeURIComponent(own(w.dir, "privkey.pem"))}`,
    ]) {
      for (const base of [w.http, `https://127.0.0.1:${port}`]) {
        const answer = await get(base, guess);
        expect(leaks(answer.body), `${base}${guess}`).toBe(false);
      }
    }
    expect(leaks(JSON.stringify(await w.status()))).toBe(false);

    // A backup does not carry the folder.
    const backup = await w.app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(backup.statusCode).toBe(200);
    const zip = path.join(w.dir, "backup.zip");
    fs.writeFileSync(zip, backup.rawPayload);
    const entries = await new Promise<string[]>((resolve, reject) => {
      yauzl.open(zip, { lazyEntries: false }, (error, file) => {
        if (error) return reject(error);
        const found: string[] = [];
        file.on("entry", (entry: yauzl.Entry) => found.push(entry.fileName));
        file.on("end", () => resolve(found));
        file.on("error", reject);
      });
    });
    expect(entries).toContain("outpost.db");
    expect(entries.filter((name) => /tls|privkey|fullchain|\.pem|\.key/.test(name))).toEqual([]);
    expect(leaks(backup.rawPayload)).toBe(false);
  });

  it("does not write the key, or a password, to the log", async () => {
    const lines: string[] = [];
    const w = await start();
    for (const level of ["info", "warn", "error", "debug"] as const) {
      // What a line carries: its words, and the message of an error logged with it.
      vi.spyOn(w.app.ctx.log, level).mockImplementation((...args: unknown[]) => {
        const said = args.map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg instanceof Error) return arg.message;
          const carried = (arg as { err?: unknown } | null)?.err;
          return carried instanceof Error ? carried.message : "";
        });
        lines.push(said.join(" "));
      });
    }
    const mine = forThisComputer();
    await w.give([fs.readFileSync(path.join(FIXTURES, "aes.p12"))], { password: "nope-not-this" });
    await w.give([chainOf(mine), mine.keyPem]);
    await w.give([fs.readFileSync(path.join(FIXTURES, "aes.p12"))], { password: FIXTURE_PASSWORD });
    place(w.dir, chainOf(mine), forThisComputer().keyPem);
    await w.tick();
    const said = lines.join("\n");
    expect(said).toMatch(/HTTPS: a certificate was given in Settings/);
    expect(said).not.toMatch(/PRIVATE KEY/);
    expect(said).not.toContain(mine.keyPem.split("\n")[1]);
    expect(said).not.toContain(FIXTURE_PASSWORD);
    expect(said).not.toContain("nope-not-this");
  });

  it("will not write through a link to files kept elsewhere", async () => {
    const w = await start();
    const elsewhere = path.join(w.dir, "letsencrypt");
    fs.mkdirSync(elsewhere);
    const mine = forThisComputer();
    fs.writeFileSync(path.join(elsewhere, "fullchain.pem"), chainOf(mine));
    fs.writeFileSync(path.join(elsewhere, "privkey.pem"), mine.keyPem);
    fs.mkdirSync(own(w.dir), { recursive: true });
    for (const name of ["fullchain.pem", "privkey.pem"]) fs.symlinkSync(path.join(elsewhere, name), own(w.dir, name));
    // Read through the links: that is how a renewal tool's own folder is used in place.
    const used = await w.app.api<HttpsStatus>("POST", "/api/https/own/use");
    expect(used.status).toBe(200);
    expect(used.body.own.certificate?.fingerprint).toBe(mine.certificate.fingerprint256);
    // But a certificate given in Settings does not replace what the links point at, or the links.
    const other = forThisComputer();
    const given = await w.give([chainOf(other), other.keyPem]);
    expect(given.status).toBe(409);
    expect(given.body.error.message).toMatch(/is a link to somewhere else, and Outpost does not write through links/);
    expect(fs.readFileSync(path.join(elsewhere, "privkey.pem"), "utf8")).toBe(mine.keyPem);
    expect(fs.lstatSync(own(w.dir, "privkey.pem")).isSymbolicLink()).toBe(true);
  });

  it("reads nothing from the folder that is not a small file", async () => {
    const w = await start();
    const mine = forThisComputer();
    fs.mkdirSync(own(w.dir, "privkey.pem"), { recursive: true });
    fs.writeFileSync(own(w.dir, "fullchain.pem"), chainOf(mine));
    const folder = await w.app.api("POST", "/api/https/own/use");
    expect(folder.status).toBe(409);
    expect(folder.body.error.message).toMatch(/privkey\.pem is not a file/);
    fs.rmdirSync(own(w.dir, "privkey.pem"));
    fs.writeFileSync(own(w.dir, "privkey.pem"), Buffer.alloc(300 * 1024, 65));
    const large = await w.app.api("POST", "/api/https/own/use");
    expect(large.status).toBe(409);
    expect(large.body.error.message).toMatch(/privkey\.pem is too large to be a certificate or a key/);
    expect(await w.status()).toMatchObject({ enabled: false, source: "outpost" });
  });

  it("is not offered from a portable drive, and waits for a clock that is right", async () => {
    const mine = forThisComputer();
    const portable = await start({ OUTPOST_PORTABLE: "true" });
    expect((await portable.give([chainOf(mine), mine.keyPem])).status).toBe(409);
    expect((await portable.app.api("POST", "/api/https/own/use")).status).toBe(409);
    expect(fs.existsSync(path.join(portable.dir, "data", "tls"))).toBe(false);

    const w = await start();
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2001, 0, 1));
    const answer = await w.give([chainOf(mine), mine.keyPem]);
    expect(answer.status).toBe(409);
    expect(answer.body.error.message).toMatch(/clock reads .* which cannot be right/);
  });
});
