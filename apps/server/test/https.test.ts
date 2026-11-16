import { execFile, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net, { type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { HttpsStatus } from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import yauzl from "yauzl";
import {
  type Authority,
  authorityKeyPem,
  certificateNames,
  createAuthority,
  issueServerCertificate,
  type Permits,
  permitsName,
  readAuthority,
  SERVER_DAYS,
} from "../src/modules/https/certificates.ts";
import { inBlock, PRIVATE_BLOCKS, PRIVATE_SUFFIXES, parseName, reachableNames, type ServerName } from "../src/modules/https/names.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const DAY = 24 * 60 * 60 * 1000;
const HOME: Permits = { names: [...PRIVATE_SUFFIXES, "kitchen-pi"], blocks: PRIVATE_BLOCKS };
/** A stand-in for a careless or stolen authority: the same key, signing whatever it is asked to. */
const ANYTHING: Permits = {
  names: ["com", "local"],
  blocks: [
    { family: 4, address: "0.0.0.0", prefix: 0 },
    { family: 6, address: "::", prefix: 0 },
  ],
};

const named = (...texts: string[]): ServerName[] =>
  texts.map((text) => {
    const name = parseName(text);
    if (!name) throw new Error(`not a name: ${text}`);
    return name;
  });

const has = (command: string) => spawnSync(command, ["--version"], { stdio: "ignore" }).error === undefined;
const OPENSSL = has("openssl");
const CURL = has("curl");
const MACOS = process.platform === "darwin" && fs.existsSync("/usr/bin/security");

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-https-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// One authority for the certificate tests: making an RSA key is the slow part.
let shared: Promise<Authority> | undefined;
const homeAuthority = () => {
  shared ??= createAuthority({ label: "Outpost on kitchen-pi (2026-11-16)", permits: HOME });
  return shared;
};

describe("names and addresses", () => {
  it("reads addresses and host names the way people and interfaces write them", () => {
    expect(parseName("192.168.1.20")).toMatchObject({ kind: "ip", family: 4, text: "192.168.1.20" });
    expect(parseName(" Kitchen-Pi.LOCAL. ")).toEqual({ kind: "dns", text: "kitchen-pi.local" });
    expect(parseName("[FD12:3456:0:0:0:0:0:1]")).toMatchObject({ kind: "ip", family: 6, text: "fd12:3456::1" });
    expect(parseName("fe80::1c2b:3aff:fe4d:5e6f%en0")).toMatchObject({ kind: "ip", family: 6, text: "fe80::1c2b:3aff:fe4d:5e6f" });
    expect(parseName("::ffff:192.168.1.20")?.kind).toBe("ip");
    expect(parseName("::1")).toMatchObject({ text: "::1" });
    expect(Buffer.from((parseName("::1") as { bytes: Buffer }).bytes).toString("hex")).toBe("00000000000000000000000000000001");
    expect(Buffer.from((parseName("fd00::a:b") as { bytes: Buffer }).bytes).toString("hex")).toBe("fd0000000000000000000000000a000b");
    for (const bad of [
      "",
      "http://pi.local",
      "pi.local:8443",
      "pi_one.local",
      "-pi.local",
      "300.1.1.1",
      "1.2.3",
      "a..b",
      "x".repeat(64),
      "fd00:::1",
    ]) {
      expect(parseName(bad), bad).toBeNull();
    }
  });

  it("knows which addresses are private", () => {
    const inside = (text: string) => PRIVATE_BLOCKS.some((block) => inBlock((parseName(text) as { bytes: Buffer }).bytes, block));
    for (const address of [
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.20",
      "169.254.3.4",
      "100.64.0.1",
      "100.127.9.9",
      "127.0.0.1",
    ]) {
      expect(inside(address), address).toBe(true);
    }
    for (const address of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.0.1", "100.128.0.1", "11.0.0.1", "203.0.113.9"]) {
      expect(inside(address), address).toBe(false);
    }
    for (const address of ["fd12:3456::1", "fc00::1", "fe80::1", "::1"]) expect(inside(address), address).toBe(true);
    for (const address of ["2a01:4b00::1", "::2", "fec0::1", "ff02::1"]) expect(inside(address), address).toBe(false);
  });

  const lan = { address: "192.168.1.20", family: "IPv4", internal: false } as os.NetworkInterfaceInfo;
  const interfaces = {
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true } as os.NetworkInterfaceInfo],
    en0: [
      { address: "fe80::1c2b:3aff:fe4d:5e6f", family: "IPv6", internal: false } as os.NetworkInterfaceInfo,
      lan,
      { address: "fd12:3456::7", family: "IPv6", internal: false } as os.NetworkInterfaceInfo,
      { address: "2a01:4b00::7", family: "IPv6", internal: false } as os.NetworkInterfaceInfo,
    ],
  };
  const sources = { interfaces, hostname: "Kitchen-Pi.local", lanAccess: true, inContainer: false, allowedHosts: [], extra: [] };

  it("lists the ways in: network addresses, the host's names, what a person listed, then the computer itself", () => {
    expect(
      reachableNames({ ...sources, extra: ["nas.lan"], allowedHosts: ["outpost.example.net"] }).map(
        (entry) => `${entry.origin} ${entry.name.text}`,
      ),
    ).toEqual([
      "network 192.168.1.20",
      "host kitchen-pi.local",
      "host kitchen-pi",
      "listed nas.lan",
      "listed outpost.example.net",
      "network fd12:3456::7",
      "network 2a01:4b00::7",
      "own localhost",
      "own 127.0.0.1",
      "own ::1",
    ]);
  });

  it("does not offer network addresses when only this computer can reach Outpost, or from inside a container", () => {
    const own = ["localhost", "127.0.0.1", "::1"];
    expect(reachableNames({ ...sources, lanAccess: false }).map((entry) => entry.name.text)).toEqual(own);
    expect(reachableNames({ ...sources, inContainer: true, hostname: "3f9a1c2b7d10" }).map((entry) => entry.name.text)).toEqual(own);
    // What a person lists is carried either way: in a container it is the only way to name the host's address.
    expect(reachableNames({ ...sources, inContainer: true, extra: ["192.168.1.20"] }).map((entry) => entry.name.text)).toEqual([
      "192.168.1.20",
      ...own,
    ]);
  });

  it("copes with a host whose name is an address or nothing usable", () => {
    for (const hostname of ["192.168.1.232", "localhost", "", "my_mac"]) {
      expect(
        reachableNames({ ...sources, hostname }).filter((entry) => entry.origin === "host"),
        hostname,
      ).toEqual([]);
    }
  });
});

describe("the certificates", () => {
  it("makes an authority that may sign server certificates for home-network names only", async () => {
    const authority = await homeAuthority();
    const { certificate } = authority;
    expect(certificate.ca).toBe(true);
    expect(certificate.subject).toBe("O=Outpost\nCN=Outpost on kitchen-pi (2026-11-16)");
    expect(certificate.issuer).toBe(certificate.subject);
    expect(certificate.verify(certificate.publicKey)).toBe(true);
    expect(certificate.publicKey.asymmetricKeyType).toBe("rsa");
    expect(certificate.publicKey.asymmetricKeyDetails?.modulusLength).toBe(3072);
    expect(certificate.signatureAlgorithm).toBe("sha256WithRSAEncryption");
    // Extended key usage: identifying a web server, nothing else.
    expect(certificate.keyUsage).toEqual(["1.3.6.1.5.5.7.3.1"]);
    const years = (certificate.validToDate.getTime() - certificate.validFromDate.getTime()) / (365 * DAY);
    expect(years).toBeGreaterThan(9.9);
    expect(years).toBeLessThan(10.1);
    // What it may sign is read back from the certificate itself, not remembered beside it.
    expect(authority.permits).toEqual(HOME);
    const again = readAuthority(authority.pem, authorityKeyPem(authority));
    expect(again.permits).toEqual(HOME);
    expect(permitsName(again.permits, named("pi.local")[0]!)).toBe(true);
    expect(permitsName(again.permits, named("local")[0]!)).toBe(true);
    expect(permitsName(again.permits, named("kitchen-pi")[0]!)).toBe(true);
    expect(permitsName(again.permits, named("notlocal")[0]!)).toBe(false);
    expect(permitsName(again.permits, named("pi.local.example.com")[0]!)).toBe(false);
    expect(permitsName(again.permits, named("8.8.8.8")[0]!)).toBe(false);
  });

  it("refuses to pair an authority with a key that is not its own", async () => {
    const authority = await homeAuthority();
    const other = issueServerCertificate(authority, named("localhost"));
    expect(() => readAuthority(authority.pem, other.keyPem)).toThrow(/do not belong together/);
    expect(() => readAuthority(other.pem, other.keyPem)).toThrow(/do not belong together/);
  });

  it("issues a server certificate that meets what browsers and Apple devices ask of one", async () => {
    const authority = await homeAuthority();
    const names = named("192.168.1.20", "kitchen-pi.local", "kitchen-pi", "fd12:3456::1", "localhost", "127.0.0.1", "::1");
    const { certificate } = issueServerCertificate(authority, names);
    expect(certificate.ca).toBe(false);
    expect(certificate.verify(authority.certificate.publicKey)).toBe(true);
    expect(certificate.checkIssued(authority.certificate)).toBe(true);
    // The names are in the subject alternative name; the subject itself is not a host name.
    expect(certificate.subjectAltName).toBe(
      "IP Address:192.168.1.20, DNS:kitchen-pi.local, DNS:kitchen-pi, IP Address:FD12:3456:0:0:0:0:0:1, DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1",
    );
    expect(certificateNames(certificate)).toEqual(names.map((name) => name.text));
    expect(certificate.checkHost("kitchen-pi.local")).toBe("kitchen-pi.local");
    expect(certificate.checkHost("other.local")).toBeUndefined();
    expect(certificate.checkIP("192.168.1.20")).toBe("192.168.1.20");
    expect(certificate.checkIP("192.168.1.21")).toBeUndefined();
    expect(certificate.keyUsage).toEqual(["1.3.6.1.5.5.7.3.1"]);
    expect(certificate.publicKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
    expect(certificate.signatureAlgorithm).toBe("sha256WithRSAEncryption");
    const days = (certificate.validToDate.getTime() - certificate.validFromDate.getTime()) / DAY;
    expect(days).toBe(SERVER_DAYS + 1);
    expect(days).toBeLessThanOrEqual(398);
    expect(certificate.validFromDate.getTime()).toBeLessThan(Date.now());
    // Each certificate has a serial number and a key of its own.
    const second = issueServerCertificate(authority, names).certificate;
    expect(second.serialNumber).not.toBe(certificate.serialNumber);
    expect(second.publicKey.equals(certificate.publicKey)).toBe(false);
  });

  it("will not sign for a name outside the authority's limits", async () => {
    const authority = await homeAuthority();
    expect(() => issueServerCertificate(authority, named("localhost", "example.com"))).toThrow(/may not sign for example\.com/);
    expect(() => issueServerCertificate(authority, named("8.8.8.8"))).toThrow(/may not sign for 8\.8\.8\.8/);
    expect(() => issueServerCertificate(authority, [])).toThrow(/at least one name/);
  });

  it("never dates a server certificate past its authority", async () => {
    const authority = await homeAuthority();
    const nearEnd = authority.certificate.validToDate.getTime() - 10 * DAY;
    const late = issueServerCertificate(authority, named("localhost"), { now: nearEnd }).certificate;
    expect(late.validToDate.getTime()).toBe(authority.certificate.validToDate.getTime());
    expect(() => issueServerCertificate(authority, named("localhost"), { now: nearEnd + 11 * DAY })).toThrow(/expired/);
  });

  /** Connects to a server presenting `certificate`, trusting only the authority, and reports how it went. */
  async function handshake(authority: Authority, issued: { pem: string; keyPem: string }, servername: string): Promise<string> {
    const server = https.createServer({ key: issued.keyPem, cert: issued.pem }, (_request, response) => response.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      return await new Promise<string>((resolve) => {
        const request = https.request(
          {
            host: "127.0.0.1",
            port: (server.address() as AddressInfo).port,
            servername,
            ca: authority.pem,
            agent: false,
            headers: { host: servername },
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve("trusted"));
          },
        );
        // OpenSSL's reasons do not all have a code of their own in Node; the words say which it was.
        request.on("error", (error: NodeJS.ErrnoException) =>
          resolve(error.code === "UNSPECIFIED" ? error.message : (error.code ?? error.message)),
        );
        request.end();
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("is trusted by Node for a name it lists, and for no other", async () => {
    const authority = await homeAuthority();
    const issued = issueServerCertificate(authority, named("kitchen-pi.local", "192.168.1.20"));
    expect(await handshake(authority, issued, "kitchen-pi.local")).toBe("trusted");
    expect(await handshake(authority, issued, "other.local")).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
    const stranger = await createAuthority({ label: "Someone else", permits: HOME });
    expect(await handshake(stranger, issued, "kitchen-pi.local")).not.toBe("trusted");
  });

  it("cannot be used for a public name or address even with the authority's key: Node refuses the chain", async () => {
    const authority = await homeAuthority();
    const stolen = { ...authority, permits: ANYTHING };
    expect(await handshake(authority, issueServerCertificate(stolen, named("www.example.com")), "www.example.com")).toMatch(
      /permitted subtree violation/,
    );
    expect(await handshake(authority, issueServerCertificate(stolen, named("pi.local", "8.8.8.8")), "pi.local")).toMatch(
      /permitted subtree violation/,
    );
    expect(await handshake(authority, issueServerCertificate(stolen, named("2a01:4b00::7")), "pi.local")).toMatch(
      /permitted subtree violation/,
    );
  });

  it.skipIf(!OPENSSL)("verifies with openssl, strictly, and openssl refuses a name outside the limits", async () => {
    const authority = await homeAuthority();
    const dir = scratch();
    const file = (name: string, text: string) => {
      fs.writeFileSync(path.join(dir, name), text);
      return path.join(dir, name);
    };
    const ca = file("ca.pem", authority.pem);
    const good = file("good.pem", issueServerCertificate(authority, named("kitchen-pi.local", "192.168.1.20", "fd12:3456::1")).pem);
    const stolen = { ...authority, permits: ANYTHING };
    const badName = file("bad-name.pem", issueServerCertificate(stolen, named("www.example.com")).pem);
    const badAddress = file("bad-address.pem", issueServerCertificate(stolen, named("8.8.8.8")).pem);
    const verify = (...args: string[]) => {
      const run = spawnSync("openssl", ["verify", "-x509_strict", "-CAfile", ca, ...args], { encoding: "utf8" });
      return `${run.status} ${run.stdout}${run.stderr}`;
    };
    expect(verify(good)).toMatch(/^0 .*good\.pem: OK/s);
    expect(verify("-verify_hostname", "kitchen-pi.local", good)).toMatch(/^0 /);
    expect(verify("-verify_ip", "192.168.1.20", good)).toMatch(/^0 /);
    expect(verify("-verify_hostname", "other.local", good)).toMatch(/^[^0].*hostname mismatch/is);
    expect(verify(badName)).toMatch(/^[^0].*permitted subtree violation/s);
    expect(verify(badAddress)).toMatch(/^[^0].*permitted subtree violation/s);
  });

  it.skipIf(!MACOS)("passes macOS's own trust evaluation, which also refuses a name outside the limits", async () => {
    const authority = await homeAuthority();
    const dir = scratch();
    const file = (name: string, text: string) => {
      fs.writeFileSync(path.join(dir, name), text);
      return path.join(dir, name);
    };
    const ca = file("ca.pem", authority.pem);
    const good = file("good.pem", issueServerCertificate(authority, named("kitchen-pi.local", "192.168.1.20", "fd12:3456::1")).pem);
    const stolen = { ...authority, permits: ANYTHING };
    const badName = file("bad-name.pem", issueServerCertificate(stolen, named("www.example.com")).pem);
    const badAddress = file("bad-address.pem", issueServerCertificate(stolen, named("8.8.8.8")).pem);
    // -r names the authority as a trusted root for this one evaluation; nothing is added to any keychain.
    const evaluate = (certificate: string, name: string) =>
      spawnSync("/usr/bin/security", ["verify-cert", "-c", certificate, "-r", ca, "-p", "ssl", "-n", name, "-L", "-q"], { stdio: "ignore" })
        .status;
    expect(evaluate(good, "kitchen-pi.local")).toBe(0);
    expect(evaluate(good, "192.168.1.20")).toBe(0);
    expect(evaluate(good, "fd12:3456::1")).toBe(0);
    expect(evaluate(good, "other.local")).not.toBe(0);
    expect(evaluate(badName, "www.example.com")).not.toBe(0);
    expect(evaluate(badAddress, "8.8.8.8")).not.toBe(0);
  });
});

// ── The listener ──

interface Answer {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  certificate: X509Certificate;
}

/** One HTTPS request that trusts `ca` and nothing else. */
function secure(
  url: string,
  ca: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; servername?: string } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const settings = { ca, agent: false, method: options.method ?? "GET", headers: options.headers, servername: options.servername };
    const request = https.request(url, settings, (response) => {
      const certificate = (response.socket as import("node:tls").TLSSocket).getPeerX509Certificate();
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        if (!certificate) return reject(new Error("no certificate"));
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8"), certificate });
      });
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

interface Running {
  app: TestApp;
  dir: string;
  http: string;
  on(): Promise<HttpsStatus>;
  status(): Promise<HttpsStatus>;
  ca(): Promise<string>;
}

/** A listening server with a small web app, HTTPS on a port the system picks. */
async function start(env: Record<string, string> = {}, existing?: string): Promise<Running> {
  const dir = existing ?? scratch();
  fs.mkdirSync(path.join(dir, "web", "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "web", "index.html"), "<!doctype html><title>Outpost</title><div id=root></div>");
  fs.writeFileSync(path.join(dir, "web", "assets", "index-abc123.js"), "console.log('outpost')");
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
  await app.ctx.services.https.whenSettled();
  const status = async () => (await app.api<HttpsStatus>("GET", "/api/https")).body;
  return {
    app,
    dir,
    http: address,
    status,
    async on() {
      expect((await app.api("PATCH", "/api/settings", { "https.enabled": true })).status).toBe(200);
      await app.ctx.services.https.whenSettled();
      return status();
    },
    async ca() {
      const response = await app.api("GET", "/api/https/authority.crt?format=pem");
      expect(response.status).toBe(200);
      return response.body as unknown as string;
    },
  };
}

const tls = (dir: string, name = "") => path.join(dir, "data", "tls", name);
const refused = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.on("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(true));
  });

describe("HTTPS on the home network", () => {
  it("is off until asked for: no listener, no keys, no certificate to download", async () => {
    const w = await start();
    const status = await w.status();
    expect(status).toMatchObject({ enabled: false, listening: false, problem: null, addresses: [], authority: null, unavailable: null });
    expect(fs.existsSync(tls(w.dir))).toBe(false);
    const download = await w.app.api("GET", "/api/https/authority.crt");
    expect(download.status).toBe(404);
    expect(download.body.error.message).toMatch(/turn HTTPS on in Settings/);
  });

  it("serves the app and the API over HTTPS with a chain Node verifies, while plain HTTP carries on", async () => {
    const w = await start();
    const status = await w.on();
    expect(status).toMatchObject({ enabled: true, listening: true, problem: null });
    expect(status.port).toBeGreaterThan(0);
    expect(status.httpPort).toBe(Number(new URL(w.http).port));
    // Only this computer can reach a server without LAN access, so only its own names are listed.
    expect(status.names).toEqual(["localhost", "127.0.0.1", "::1"]);
    expect(status.addresses.map((address) => address.url)).toEqual([
      `https://localhost:${status.port}`,
      `https://127.0.0.1:${status.port}`,
      `https://[::1]:${status.port}`,
    ]);
    expect(status.authority?.name).toMatch(/^Outpost( on [a-z0-9-]+)? \(\d{4}-\d{2}-\d{2}\)$/);
    expect(status.authority?.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(status.authority?.permittedNames).toEqual(expect.arrayContaining(["local", "lan", "home.arpa"]));
    expect(status.authority?.permittedBlocks).toContain("192.168.0.0/16");

    const ca = await w.ca();
    const health = await secure(`https://127.0.0.1:${status.port}/api/health`, ca);
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body).status).toBe("ok");
    expect((await secure(`https://localhost:${status.port}/api/health`, ca)).status).toBe(200);

    const page = await secure(`https://127.0.0.1:${status.port}/settings`, ca);
    expect(page.status).toBe(200);
    expect(page.body).toContain("<title>Outpost</title>");
    expect(page.headers["content-security-policy"]).toContain("default-src 'self'");
    const script = await secure(`https://127.0.0.1:${status.port}/assets/index-abc123.js`, ca);
    expect(script.body).toContain("outpost");
    expect(script.headers["cache-control"]).toContain("immutable");

    // Without the authority, the same address is not trusted.
    await expect(secure(`https://127.0.0.1:${status.port}/api/health`, "")).rejects.toMatchObject({
      code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    });
    // Plain HTTP is untouched.
    expect((await fetch(`${w.http}/api/health`)).status).toBe(200);
    expect(await (await fetch(`${w.http}/settings`)).text()).toContain("<title>Outpost</title>");
  });

  it("holds HTTPS requests to the same guard as HTTP, and sends the same headers and no HSTS", async () => {
    const w = await start();
    const { port } = await w.on();
    const ca = await w.ca();
    const base = `https://127.0.0.1:${port}`;
    const json = { "content-type": "application/json" };
    const note = JSON.stringify({ title: "Over HTTPS" });

    // No X-Outpost-Request header: refused.
    const bare = await secure(`${base}/api/notes`, ca, { method: "POST", headers: json, body: note });
    expect(bare.status).toBe(403);
    expect(JSON.parse(bare.body).error.message).toMatch(/did not come from the Outpost app/);
    // With it, from the app's own HTTPS origin: accepted.
    const own = await secure(`${base}/api/notes`, ca, {
      method: "POST",
      headers: { ...json, "x-outpost-request": "1", origin: base, "sec-fetch-site": "same-origin" },
      body: note,
    });
    expect(own.status).toBeLessThan(300);
    // From another site, or with another site's origin: refused.
    const elsewhere: Array<Record<string, string>> = [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example.com" }];
    for (const headers of elsewhere) {
      const cross = await secure(`${base}/api/notes`, ca, {
        method: "POST",
        headers: { ...json, "x-outpost-request": "1", ...headers },
        body: note,
      });
      expect(cross.status, JSON.stringify(headers)).toBe(403);
    }
    // A name Outpost does not answer to (DNS rebinding): refused, as on HTTP.
    for (const scheme of [base, w.http]) {
      const answer =
        scheme === base
          ? await secure(`${base}/api/health`, ca, { headers: { host: "evil.example.com" }, servername: "localhost" })
          : await fetchWithHost(`${w.http}/api/health`, "evil.example.com");
      expect(answer.status, scheme).toBe(403);
      expect(answer.body).toMatch(/not one Outpost answers to/);
    }
    // Percent-escapes in the path do not slip past the guard.
    expect((await secure(`${base}/%61pi/notes`, ca, { method: "POST", headers: json, body: note })).status).toBe(403);

    // The same headers on both, and nothing that would pin a browser to HTTPS.
    for (const route of ["/api/health", "/settings"]) {
      const overHttps = await secure(`${base}${route}`, ca);
      const overHttp = await fetch(`${w.http}${route}`);
      const names = (headers: Iterable<[string, unknown]> | http.IncomingHttpHeaders) =>
        (Symbol.iterator in headers ? [...(headers as Iterable<[string, unknown]>)].map(([name]) => name) : Object.keys(headers))
          .filter((name) => !["date", "connection", "keep-alive"].includes(name))
          .sort();
      expect(names(overHttps.headers), route).toEqual(names(overHttp.headers));
      for (const name of [
        "x-content-type-options",
        "referrer-policy",
        "cross-origin-opener-policy",
        "x-frame-options",
        "content-security-policy",
      ]) {
        expect(overHttps.headers[name], `${route} ${name}`).toBe(overHttp.headers.get(name) ?? undefined);
      }
      expect(overHttps.headers["strict-transport-security"]).toBeUndefined();
      expect(overHttp.headers.get("strict-transport-security")).toBeNull();
      expect(overHttps.headers["set-cookie"]).toBeUndefined();
      expect(overHttp.headers.get("location")).toBeNull();
    }
  });

  it("carries live events over HTTPS", async () => {
    const w = await start();
    const { port } = await w.on();
    const ca = await w.ca();
    const seen = await new Promise<string>((resolve, reject) => {
      let text = "";
      const request = https.request(`https://127.0.0.1:${port}/api/events`, { ca, agent: false }, (response) => {
        expect(response.headers["content-type"]).toBe("text/event-stream");
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
          if (text.includes("retry: 3000") && !text.includes("event:")) w.app.ctx.events.publish({ type: "notes.changed", id: "n1" });
          if (text.includes("event: notes.changed")) {
            request.destroy();
            resolve(text);
          }
        });
      });
      request.on("error", (error) => (text.includes("notes.changed") ? undefined : reject(error)));
      request.end();
    });
    expect(seen).toContain('event: notes.changed\ndata: {"id":"n1"}');
  });

  it("serves reference pages through the Kiwix proxy over HTTPS, sandboxed, naming the HTTPS origin", async () => {
    const kiwix = http.createServer((request, response) => {
      response.setHeader("Content-Security-Policy", "default-src 'self'; sandbox allow-scripts allow-same-origin;");
      if (request.url === "/content/knots/Bowline") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        return response.end("<html><head><title>Bowline</title></head><body>A loop that does not slip.</body></html>");
      }
      response.statusCode = 404;
      response.end("nope");
    });
    await new Promise<void>((resolve) => kiwix.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => kiwix.close(() => resolve())));
    const w = await start({ OUTPOST_KIWIX_URL: `http://127.0.0.1:${(kiwix.address() as AddressInfo).port}` });
    const { port } = await w.on();
    const page = await secure(`https://localhost:${port}/kiwix/open/content/knots/Bowline`, await w.ca());
    expect(page.status).toBe(200);
    expect(page.body).toContain("A loop that does not slip.");
    expect(page.body).toContain("outpost:reader");
    const policy = String(page.headers["content-security-policy"]);
    expect(policy).toContain(`default-src 'self' https://localhost:${port} `);
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).not.toContain("allow-same-origin");
    expect(page.headers["x-frame-options"]).toBeUndefined();
  });

  it.skipIf(!CURL)("is accepted by curl given the authority's certificate, and not without it", async () => {
    const w = await start();
    const { port } = await w.on();
    const file = path.join(w.dir, "authority.pem");
    fs.writeFileSync(file, await w.ca());
    // Not the blocking form: the server curl talks to lives in this process.
    const curl = (...args: string[]) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        execFile("curl", ["--silent", "--show-error", "--max-time", "20", ...args], { encoding: "utf8" }, (error, stdout) =>
          resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: stdout }),
        );
      });
    // Trusting this authority alone, not the system's list.
    const trusted = await curl("--cacert", file, `https://localhost:${port}/api/health`);
    expect(trusted.code).toBe(0);
    expect(JSON.parse(trusted.out).status).toBe("ok");
    expect((await curl("--cacert", file, `https://127.0.0.1:${port}/api/health`)).code).toBe(0);
    const without = await curl(`https://localhost:${port}/api/health`);
    expect(without.code).not.toBe(0);
  });

  it.skipIf(process.platform === "win32")("keeps the keys readable by the account that runs Outpost and nobody else", async () => {
    const w = await start();
    await w.on();
    const mode = (name: string) => fs.statSync(tls(w.dir, name)).mode & 0o777;
    expect(mode("")).toBe(0o700);
    expect(mode("ca.key")).toBe(0o600);
    expect(mode("server.key")).toBe(0o600);
    expect(fs.readdirSync(tls(w.dir)).sort()).toEqual(["ca.crt", "ca.key", "server.crt", "server.key"]);
    expect(fs.readFileSync(tls(w.dir, "ca.key"), "utf8")).toContain("BEGIN PRIVATE KEY");
  });

  it("never serves a private key: not by any address, not in the download, not in a backup", async () => {
    const w = await start();
    const { port } = await w.on();
    const ca = await w.ca();
    const secrets = ["ca.key", "server.key"].map((name) => fs.readFileSync(tls(w.dir, name), "utf8").split("\n")[1]!);
    expect(secrets.every((line) => line.length > 40)).toBe(true);
    const leaks = (body: string | Buffer) =>
      secrets.some((line) => body.toString("latin1").includes(line)) || /PRIVATE KEY/.test(body.toString("latin1"));

    const guesses = [
      "/tls/ca.key",
      "/data/tls/ca.key",
      "/ca.key",
      "/server.key",
      "/api/https/ca.key",
      "/api/https/authority.key",
      "/api/https/authority.crt/../ca.key",
      "/api/https/authority.crt?format=key",
      "/api/https/server.key",
      "/assets/../../data/tls/ca.key",
      "/assets/%2e%2e/%2e%2e/data/tls/ca.key",
      "/..%2fdata%2ftls%2fca.key",
      `/api/storage/browse?path=${encodeURIComponent(tls(w.dir))}`,
      `/api/documents/file?path=${encodeURIComponent(tls(w.dir, "ca.key"))}`,
    ];
    for (const guess of guesses) {
      for (const answer of [await fetchRaw(w.http, guess), await secureRaw(port, ca, guess)]) {
        expect(leaks(answer.body), guess).toBe(false);
        expect(answer.status === 200 && /key/.test(guess) && !answer.body.includes("<title>Outpost</title>"), guess).toBe(false);
      }
    }

    // The two forms of the download hold the public certificate and nothing else.
    const pem = await w.app.api("GET", "/api/https/authority.crt?format=pem");
    expect(pem.headers["content-type"]).toBe("application/x-pem-file");
    expect((pem.body as unknown as string).match(/-----BEGIN [A-Z ]+-----/g)).toEqual(["-----BEGIN CERTIFICATE-----"]);
    const der = await w.app.app.inject({ method: "GET", url: "/api/https/authority.crt", headers: { host: "localhost" } });
    expect(der.headers["content-type"]).toBe("application/x-x509-ca-cert");
    expect(der.headers["content-disposition"]).toBe('attachment; filename="outpost-authority.crt"');
    expect(new X509Certificate(der.rawPayload).fingerprint256).toBe(new X509Certificate(ca).fingerprint256);
    expect(der.rawPayload.equals(new X509Certificate(ca).raw)).toBe(true);
    expect((await w.app.api("GET", "/api/https/authority.crt?format=key")).status).toBe(400);
    // The status says only public things.
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
    expect(entries.filter((name) => /tls|\.key|\.crt/.test(name))).toEqual([]);
  });

  it("re-issues the certificate when a name is added, without restarting the listener", async () => {
    const w = await start();
    const before = await w.on();
    const ca = await w.ca();
    const first = (await secure(`https://127.0.0.1:${before.port}/api/health`, ca)).certificate;

    expect((await w.app.api("PATCH", "/api/settings", { "https.names": "192.168.50.4, Outpost.LAN" })).status).toBe(200);
    await w.app.ctx.services.https.whenSettled();
    const after = await w.status();
    expect(after.port).toBe(before.port);
    expect(after.names).toEqual(["192.168.50.4", "outpost.lan", "localhost", "127.0.0.1", "::1"]);
    expect(after.addresses[0]).toEqual({ url: `https://192.168.50.4:${after.port}`, name: "192.168.50.4", kind: "address" });
    expect(after.addresses[1]).toEqual({ url: `https://outpost.lan:${after.port}`, name: "outpost.lan", kind: "name" });
    const second = (await secure(`https://127.0.0.1:${after.port}/api/health`, ca)).certificate;
    expect(second.fingerprint256).not.toBe(first.fingerprint256);
    expect(second.checkIP("192.168.50.4")).toBe("192.168.50.4");
    expect(second.checkHost("outpost.lan")).toBe("outpost.lan");
    // Nothing changed, nothing re-issued.
    await w.app.ctx.services.https.check();
    expect((await secure(`https://127.0.0.1:${after.port}/api/health`, ca)).certificate.fingerprint256).toBe(second.fingerprint256);
  });

  it("says which listed names the certificate cannot carry, and why, and refuses what is not a name at all", async () => {
    const w = await start();
    await w.on();
    await w.app.api("PATCH", "/api/settings", { "https.names": "outpost.example.net 8.8.8.8 nas pi.local" });
    await w.app.ctx.services.https.whenSettled();
    const status = await w.status();
    expect(status.names).toEqual(["pi.local", "localhost", "127.0.0.1", "::1"]);
    expect(status.leftOut.map((entry) => entry.name)).toEqual(["outpost.example.net", "8.8.8.8", "nas"]);
    expect(status.leftOut[0]?.reason).toMatch(/only for names ending in \.local, \.lan, \.home, \.internal, \.home\.arpa/);
    expect(status.leftOut[1]?.reason).toMatch(/not an address on a private network/);
    expect(status.leftOut[2]?.reason).toMatch(/Use nas\.local, or make a new certificate authority/);

    const bad = await w.app.api("PATCH", "/api/settings", { "https.names": "http://pi.local:8443" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/is not a host name or an address/);
    expect(
      (await w.app.api("PATCH", "/api/settings", { "https.names": Array.from({ length: 21 }, (_, i) => `h${i}.lan`).join(",") })).status,
    ).toBe(400);
  });

  it("follows the computer's addresses when it is shared on the network: a new address means a new certificate", async () => {
    const at = (address: string) =>
      ({
        en0: [{ address, family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: `${address}/24` }],
      }) as ReturnType<typeof os.networkInterfaces>;
    const interfaces = vi.spyOn(os, "networkInterfaces").mockReturnValue(at("192.168.50.4"));
    vi.spyOn(os, "hostname").mockReturnValue("Kitchen-Pi.local");
    const w = await start({ OUTPOST_LAN_ACCESS: "true" });
    const before = await w.on();
    expect(before.names).toEqual(["192.168.50.4", "kitchen-pi.local", "kitchen-pi", "localhost", "127.0.0.1", "::1"]);
    expect(before.authority?.name).toMatch(/^Outpost on kitchen-pi \(/);
    expect(before.authority?.permittedNames).toContain("kitchen-pi");
    const ca = await w.ca();
    expect((await secure(`https://127.0.0.1:${before.port}/api/health`, ca)).certificate.checkIP("192.168.50.4")).toBe("192.168.50.4");

    // The router hands out a different address.
    interfaces.mockReturnValue(at("192.168.50.9"));
    const events: string[] = [];
    const stop = w.app.ctx.events.subscribe((event) => events.push(event.type));
    await w.app.ctx.services.https.check();
    stop();
    expect(events).toContain("https.changed");
    const after = await w.status();
    expect(after.names[0]).toBe("192.168.50.9");
    expect(after.names).not.toContain("192.168.50.4");
    const served = (await secure(`https://127.0.0.1:${after.port}/api/health`, ca)).certificate;
    expect(served.checkIP("192.168.50.9")).toBe("192.168.50.9");
    expect(served.checkIP("192.168.50.4")).toBeUndefined();
    // The authority did not change, so no device has anything to do.
    expect(after.authority?.fingerprint).toBe(before.authority?.fingerprint);

    // A public address on an interface is neither certified nor remarked on.
    interfaces.mockReturnValue(at("203.0.113.9"));
    await w.app.ctx.services.https.check();
    const publicOnly = await w.status();
    expect(publicOnly.names).toEqual(["kitchen-pi.local", "kitchen-pi", "localhost", "127.0.0.1", "::1"]);
    expect(publicOnly.leftOut).toEqual([]);
  });

  it("renews the server certificate when it has a month left, and not before", async () => {
    const w = await start();
    const before = await w.on();
    const realNow = Date.now();
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(realNow + (SERVER_DAYS - 40) * DAY);
    await w.app.ctx.services.https.check();
    expect((await w.status()).certificateExpiresAt).toBe(before.certificateExpiresAt);
    clock.mockReturnValue(realNow + (SERVER_DAYS - 20) * DAY);
    await w.app.ctx.services.https.check();
    const after = await w.status();
    expect(after.certificateExpiresAt).toBeGreaterThan((before.certificateExpiresAt ?? 0) + 300 * DAY);
    expect(after.authority?.fingerprint).toBe(before.authority?.fingerprint);
    expect(after.listening).toBe(true);
  });

  it("keeps the same authority and certificate across a restart", async () => {
    const first = await start();
    const before = await first.on();
    const ca = await first.ca();
    const served = (await secure(`https://127.0.0.1:${before.port}/api/health`, ca)).certificate.fingerprint256;
    await first.app.close();

    const second = await start({}, first.dir);
    const after = await second.status();
    expect(after).toMatchObject({ enabled: true, listening: true, problem: null });
    expect(after.authority?.fingerprint).toBe(before.authority?.fingerprint);
    expect((await secure(`https://127.0.0.1:${after.port}/api/health`, ca)).certificate.fingerprint256).toBe(served);
  });

  it("closes the HTTPS address when turned off, keeps the authority, and comes back trusted", async () => {
    const w = await start();
    const before = await w.on();
    const ca = await w.ca();
    expect(await refused(before.port)).toBe(false);
    await w.app.api("PATCH", "/api/settings", { "https.enabled": false });
    await w.app.ctx.services.https.whenSettled();
    const off = await w.status();
    expect(off).toMatchObject({ enabled: false, listening: false, addresses: [], names: [] });
    expect(await refused(before.port)).toBe(true);
    // The authority stays, so that turning it on again asks nothing of any device.
    expect(off.authority?.fingerprint).toBe(before.authority?.fingerprint);
    expect((await w.app.api("GET", "/api/https/authority.crt")).status).toBe(200);
    expect((await fetch(`${w.http}/api/health`)).status).toBe(200);
    const again = await w.on();
    expect((await secure(`https://127.0.0.1:${again.port}/api/health`, ca)).status).toBe(200);
  });

  it("lets only the computer Outpost runs on replace or delete the authority", async () => {
    const w = await start({ OUTPOST_LAN_ACCESS: "true" });
    const before = await w.on();
    const oldCa = await w.ca();
    const phone = { remoteAddress: "192.168.1.50" };

    expect((await w.app.api<HttpsStatus>("GET", "/api/https", undefined, phone)).body.authorityRight).toEqual({
      allowed: false,
      reason: "remote",
      option: "OUTPOST_ALLOW_REMOTE_ERASE",
    });
    for (const [method, url] of [
      ["POST", "/api/https/authority/replace"],
      ["DELETE", "/api/https/authority"],
    ] as const) {
      const answer = await w.app.api(method, url, undefined, phone);
      expect(answer.status, url).toBe(403);
      expect(answer.body.error.message).toMatch(/only be replaced or deleted at the computer Outpost runs on/);
      expect(answer.body.error.message).toMatch(/OUTPOST_ALLOW_REMOTE_ERASE=true/);
      // Arriving through a proxy on this computer counts as remote too.
      expect((await w.app.api(method, url, undefined, { headers: { "x-forwarded-for": "203.0.113.9" } })).status).toBe(403);
      // And like every change, it needs the app's own header.
      expect((await w.app.app.inject({ method, url, headers: { host: "localhost" } })).statusCode).toBe(403);
    }
    expect((await w.status()).authority?.fingerprint).toBe(before.authority?.fingerprint);
    // The phone may still turn HTTPS on and off and download the certificate: none of that breaks anything.
    expect((await w.app.api("GET", "/api/https/authority.crt", undefined, phone)).status).toBe(200);

    // At the computer itself: a new authority, a new certificate, the same port.
    expect((await w.status()).authorityRight).toEqual({ allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" });
    const replaced = await w.app.api<HttpsStatus>("POST", "/api/https/authority/replace");
    expect(replaced.status).toBe(200);
    expect(replaced.body.authority?.fingerprint).not.toBe(before.authority?.fingerprint);
    expect(replaced.body).toMatchObject({ listening: true, port: before.port });
    const newCa = await w.ca();
    expect((await secure(`https://127.0.0.1:${before.port}/api/health`, newCa)).status).toBe(200);
    // A device that trusted the old one no longer trusts this server.
    await expect(secure(`https://127.0.0.1:${before.port}/api/health`, oldCa)).rejects.toThrow();

    // Deleting turns HTTPS off and leaves nothing behind.
    const removed = await w.app.api<HttpsStatus>("DELETE", "/api/https/authority");
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ enabled: false, listening: false, authority: null });
    expect(fs.existsSync(tls(w.dir))).toBe(false);
    expect(await refused(before.port)).toBe(true);
    expect(w.app.ctx.services.settings.get("https.enabled")).toBe(false);
    expect((await w.app.api("GET", "/api/https/authority.crt")).status).toBe(404);
  });

  it("allows replacing from any device when the start-up option says so", async () => {
    const w = await start({ OUTPOST_LAN_ACCESS: "true", OUTPOST_ALLOW_REMOTE_ERASE: "true" });
    const before = await w.on();
    const phone = { remoteAddress: "192.168.1.50" };
    expect((await w.app.api<HttpsStatus>("GET", "/api/https", undefined, phone)).body.authorityRight).toMatchObject({
      allowed: true,
      reason: "option",
    });
    const replaced = await w.app.api<HttpsStatus>("POST", "/api/https/authority/replace", undefined, phone);
    expect(replaced.status).toBe(200);
    expect(replaced.body.authority?.fingerprint).not.toBe(before.authority?.fingerprint);
  });

  it("says so when the port is taken, and keeps serving plain HTTP", async () => {
    const squatter = net.createServer();
    await new Promise<void>((resolve) => squatter.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => squatter.close(() => resolve())));
    const port = (squatter.address() as AddressInfo).port;
    const w = await start({ OUTPOST_HTTPS_PORT: String(port) });
    const status = await w.on();
    expect(status).toMatchObject({ enabled: true, listening: false, addresses: [] });
    expect(status.problem).toMatch(new RegExp(`Port ${port} is already in use on this computer`));
    expect(status.problem).toMatch(/OUTPOST_HTTPS_PORT/);
    expect((await fetch(`${w.http}/api/health`)).status).toBe(200);
  });

  it("does not replace an authority it cannot read, and says what to do", async () => {
    const first = await start();
    await first.on();
    await first.app.close();
    const key = tls(first.dir, "ca.key");
    fs.writeFileSync(key, "not a key");
    const w = await start({}, first.dir);
    const status = await w.status();
    expect(status).toMatchObject({ enabled: true, listening: false, authority: null });
    expect(status.problem).toMatch(/certificate authority in .*tls cannot be used/);
    expect(status.problem).toMatch(/make a new certificate authority from Settings/);
    expect(fs.readFileSync(key, "utf8")).toBe("not a key");
    // Making a new one, at this computer, is the way out.
    const replaced = await w.app.api<HttpsStatus>("POST", "/api/https/authority/replace");
    expect(replaced.body).toMatchObject({ listening: true, problem: null });
  });

  it("will not date a certificate by a clock that is plainly wrong", async () => {
    const w = await start();
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2001, 0, 1));
    const status = await w.on();
    expect(status).toMatchObject({ listening: false, authority: null });
    expect(status.problem).toMatch(/clock reads .* which cannot be right/);
    expect(fs.existsSync(tls(w.dir))).toBe(false);
  });

  it("is not offered from a portable drive", async () => {
    const w = await start({ OUTPOST_PORTABLE: "true" });
    const status = await w.on();
    expect(status).toMatchObject({ unavailable: "portable", listening: false, authority: null });
    expect(fs.existsSync(tls(w.dir))).toBe(false);
    expect((await w.app.api("POST", "/api/https/authority/replace")).status).toBe(409);
  });
});

/** A plain HTTP GET with a Host header of the test's choosing. */
function fetchWithHost(url: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { headers: { host }, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

/** A request whose path is sent exactly as written, dots and all. */
function rawGet(module: typeof http | typeof https, options: https.RequestOptions): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = module.request({ ...options, agent: false, method: "GET" }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("latin1") }));
    });
    request.on("error", reject);
    request.end();
  });
}
const fetchRaw = (base: string, pathname: string) =>
  rawGet(http, { host: "127.0.0.1", port: new URL(base).port, path: pathname, headers: { host: "localhost" } });
const secureRaw = (port: number, ca: string, pathname: string) =>
  rawGet(https, { host: "127.0.0.1", port, path: pathname, ca, servername: "localhost", headers: { host: "localhost" } });
