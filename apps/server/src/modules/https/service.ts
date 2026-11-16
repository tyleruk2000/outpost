/**
 * Keeps HTTPS as the setting says it should be: the certificate authority and the
 * server certificate on disk, and a second listener that answers with them.
 *
 * The HTTPS listener hands every request to the same handler as the plain HTTP server,
 * so the request guard, the routes and the headers are the same on both. Nothing here
 * redirects HTTP to HTTPS or sends Strict-Transport-Security: the plain address must
 * keep working, on devices that trust the certificate and on those that do not.
 */
import { createPrivateKey, X509Certificate } from "node:crypto";
import https from "node:https";
import type { AddressInfo } from "node:net";
import os from "node:os";
import type { HttpsAddress, HttpsStatus } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, messageOf } from "../../core/errors.ts";
import { detectHost } from "../storage/shares/host.ts";
import {
  type Authority,
  authorityKeyPem,
  certificateNames,
  commonNameOf,
  createAuthority,
  fingerprintOf,
  issueServerCertificate,
  type Permits,
  permitsName,
  readAuthority,
} from "./certificates.ts";
import {
  hostLabel,
  inUrl,
  PRIVATE_BLOCKS,
  PRIVATE_SUFFIXES,
  parseName,
  type ReachableName,
  reachableNames,
  type ServerName,
  splitNames,
} from "./names.ts";
import { createTlsStore } from "./store.ts";

const DAY = 24 * 60 * 60 * 1000;
/** A server certificate is replaced once it has this long left. */
const RENEW_BEFORE = 30 * DAY;
/** How often the names this server is reached by, and the certificate's age, are looked at again. */
const CHECK_EVERY = 30_000;
/** More names than this on one certificate means something is wrong with the list. */
const MOST_NAMES = 40;
/** How long requests in progress are given when the listener is stopped. */
const CLOSE_GRACE = 1500;
/**
 * A clock that reads earlier than this is wrong: a computer with no clock battery that
 * started without a network. A certificate dated by it would be refused everywhere.
 */
const EARLIEST_CLOCK = Date.UTC(2026, 10, 1);

interface ServerCertificate {
  certificate: X509Certificate;
  pem: string;
  keyPem: string;
}

export interface HttpsService {
  status(): Omit<HttpsStatus, "authorityRight">;
  /** The authority's public certificate, for a device to trust. Null until HTTPS has been turned on once. */
  authorityCertificate(): { pem: string; der: Buffer } | null;
  /** Makes a new authority and a new server certificate. Every device that trusted the old one must trust the new. */
  replaceAuthority(): Promise<void>;
  /** Turns HTTPS off and deletes the authority, the server certificate and their keys. */
  removeAuthority(): Promise<void>;
  /** Looks again at the names this server is reached by and at the certificate's age, and re-issues if either calls for it. */
  check(): Promise<void>;
  /** Resolves when nothing is being started, stopped or re-issued. */
  whenSettled(): Promise<void>;
}

declare module "../../core/context.ts" {
  interface Services {
    https: HttpsService;
  }
}

const sameNames = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

export function createHttpsService(app: FastifyInstance, ctx: AppContext): HttpsService {
  const { config } = ctx;
  const { settings } = ctx.services;
  const store = createTlsStore(config.dataDir);
  const inContainer = detectHost().inContainer;

  let authority: Authority | null = null;
  let server: ServerCertificate | null = null;
  let listener: https.Server | null = null;
  let problem: string | null = null;
  /** Set once the plain HTTP server is listening; HTTPS never starts before it. */
  let started = false;
  let timer: NodeJS.Timeout | undefined;
  let queue: Promise<void> = Promise.resolve();

  const wanted = () => settings.get("https.enabled") && !config.portable;

  /** Runs one change at a time, in the order asked for. */
  function enqueue(work: () => Promise<void> | void): Promise<void> {
    const run = queue.then(work);
    queue = run.catch(() => {});
    return run;
  }

  // ── Names ──

  function candidates(): ReachableName[] {
    return reachableNames({
      interfaces: os.networkInterfaces(),
      hostname: os.hostname(),
      lanAccess: config.lanAccess,
      inContainer,
      allowedHosts: config.allowedHosts,
      extra: splitNames(settings.get("https.names")),
    });
  }

  function whyLeftOut(name: ServerName, permits: Permits): string {
    if (name.kind === "ip") {
      return "It is not an address on a private network, and this certificate authority signs only for those.";
    }
    const endings = permits.names
      .filter((suffix) => PRIVATE_SUFFIXES.includes(suffix) && suffix !== "localhost")
      .map((suffix) => `.${suffix}`);
    return name.text.includes(".")
      ? `This certificate authority signs only for names ending in ${endings.join(", ")}.`
      : `A one-word name has to be known when the certificate authority is made. Use ${name.text}.local, or make a new certificate authority.`;
  }

  /**
   * The names the server certificate should carry, and the ones it cannot. An address
   * of a network interface that the authority may not sign (a public one) is passed
   * over without comment; a name a person gave, or the host's own, is reported.
   */
  function wantedNames(permits: Permits): { names: ServerName[]; leftOut: Array<{ name: string; reason: string }> } {
    const names: ServerName[] = [];
    const leftOut: Array<{ name: string; reason: string }> = [];
    for (const { name, origin } of candidates()) {
      if (!permitsName(permits, name)) {
        if (origin !== "network") leftOut.push({ name: name.text, reason: whyLeftOut(name, permits) });
      } else if (names.length < MOST_NAMES) names.push(name);
      else leftOut.push({ name: name.text, reason: `A certificate lists at most ${MOST_NAMES} names.` });
    }
    return { names, leftOut };
  }

  // ── Certificates ──

  function assertClock(): void {
    if (Date.now() >= EARLIEST_CLOCK) return;
    throw conflict(
      `This computer's clock reads ${new Date().toISOString().slice(0, 10)}, which cannot be right. Certificates are dated, so set the clock first, then turn HTTPS on again.`,
    );
  }

  /** Reads the authority from disk. Null when there is none; an error when what is there cannot be used. */
  function loadAuthority(): Authority | null {
    const pem = store.read("authorityCertificate");
    const keyPem = store.read("authorityKey");
    if (pem === null && keyPem === null) return null;
    try {
      if (pem === null || keyPem === null) throw new Error("one of its two files is missing");
      return readAuthority(pem, keyPem);
    } catch (error) {
      throw conflict(
        `The certificate authority in ${store.dir} cannot be used (${messageOf(error)}). Put the folder back from a copy, or make a new certificate authority from Settings.`,
      );
    }
  }

  async function newAuthority(): Promise<Authority> {
    assertClock();
    const label = inContainer ? null : hostLabel(os.hostname());
    // One-word names cannot be added to an authority later, so every one known now goes in.
    const single = candidates()
      .map(({ name }) => name)
      .filter((name) => name.kind === "dns" && !name.text.includes(".") && !PRIVATE_SUFFIXES.includes(name.text))
      .map((name) => name.text);
    const day = new Date().toISOString().slice(0, 10);
    const made = await createAuthority({
      label: label ? `Outpost on ${label} (${day})` : `Outpost (${day})`,
      permits: { names: [...PRIVATE_SUFFIXES, ...single], blocks: PRIVATE_BLOCKS },
    });
    // The key first: a certificate without its key is the state that says "unfinished".
    store.write("authorityKey", authorityKeyPem(made));
    store.write("authorityCertificate", made.pem);
    server = null;
    ctx.log.info(`HTTPS: made a new certificate authority, "${commonNameOf(made.certificate)}".`);
    return made;
  }

  function loadServerCertificate(): ServerCertificate | null {
    const pem = store.read("serverCertificate");
    const keyPem = store.read("serverKey");
    if (pem === null || keyPem === null) return null;
    try {
      const certificate = new X509Certificate(pem);
      return certificate.checkPrivateKey(createPrivateKey(keyPem)) ? { certificate, pem, keyPem } : null;
    } catch {
      // Unreadable: it is simply issued again.
      return null;
    }
  }

  const signedBy = (current: ServerCertificate, from: Authority): boolean =>
    current.certificate.checkIssued(from.certificate) && current.certificate.verify(from.certificate.publicKey);

  /** Whether the certificate in hand is still the right one: signed by this authority, for these names, with time left. */
  function stillGood(current: ServerCertificate, from: Authority, names: ServerName[]): boolean {
    const now = Date.now();
    return (
      signedBy(current, from) &&
      current.certificate.validFromDate.getTime() <= now &&
      current.certificate.validToDate.getTime() - now > RENEW_BEFORE &&
      sameNames(
        certificateNames(current.certificate),
        names.map((name) => name.text),
      )
    );
  }

  /** Makes sure there is an authority and a current server certificate. Returns whether the certificate is new. */
  async function ensureCertificates(): Promise<boolean> {
    authority ??= loadAuthority() ?? (await newAuthority());
    server ??= loadServerCertificate();
    // A computer that has lost track of the date cannot judge a certificate's dates, and
    // must not date a new one. What it issued while its clock was right is still good to
    // the phones, whose clocks are right, so it goes on serving that.
    if (Date.now() < EARLIEST_CLOCK && server && signedBy(server, authority)) return false;
    assertClock();
    if (authority.certificate.validToDate.getTime() <= Date.now()) {
      throw conflict("The certificate authority has expired. Make a new one from Settings, then trust it on each device again.");
    }
    const { names } = wantedNames(authority.permits);
    if (server && stillGood(server, authority, names)) return false;
    const issued = issueServerCertificate(authority, names);
    store.write("serverKey", issued.keyPem);
    store.write("serverCertificate", issued.pem);
    server = issued;
    ctx.log.info(`HTTPS: issued a server certificate for ${names.map((name) => name.text).join(", ")}.`);
    return true;
  }

  // ── The listener ──

  function listenProblem(error: NodeJS.ErrnoException): string {
    if (error.code === "EADDRINUSE") {
      return `Port ${config.httpsPort} is already in use on this computer, so HTTPS could not start. Start Outpost with OUTPOST_HTTPS_PORT set to a free port.`;
    }
    if (error.code === "EACCES") {
      return `Outpost is not allowed to listen on port ${config.httpsPort}. Ports below 1024 need administrator rights; start Outpost with OUTPOST_HTTPS_PORT set to a higher one.`;
    }
    return `HTTPS could not start: ${error.message}`;
  }

  async function startListener(certificate: ServerCertificate): Promise<void> {
    const main = app.server;
    // The same handler as the plain HTTP server: every hook, route and header is shared.
    const next = https.createServer({ key: certificate.keyPem, cert: certificate.pem, minVersion: "TLSv1.2" }, (request, response) => {
      main.emit("request", request, response);
    });
    next.keepAliveTimeout = main.keepAliveTimeout;
    next.requestTimeout = main.requestTimeout;
    next.headersTimeout = main.headersTimeout;
    next.timeout = main.timeout;
    next.on("clientError", (error, socket) => {
      if (main.listenerCount("clientError") > 0) main.emit("clientError", error, socket);
      else socket.destroy();
    });
    // A device that has not trusted the certificate yet ends the handshake; that is not news.
    next.on("tlsClientError", (error) => ctx.log.debug({ err: error }, "HTTPS handshake did not complete"));
    await new Promise<void>((resolve, reject) => {
      next.once("error", reject);
      next.listen(config.httpsPort, config.host, () => {
        next.off("error", reject);
        resolve();
      });
    });
    next.on("error", (error) => ctx.log.error({ err: error }, "HTTPS listener error"));
    listener = next;
    ctx.log.info(`HTTPS is on, at port ${(next.address() as AddressInfo).port}.`);
  }

  async function stopListener(): Promise<void> {
    const current = listener;
    if (!current) return;
    listener = null;
    await new Promise<void>((resolve) => {
      // Live-event streams never end by themselves; they are cut after a moment's grace.
      const force = setTimeout(() => current.closeAllConnections(), CLOSE_GRACE);
      current.close(() => {
        clearTimeout(force);
        resolve();
      });
      current.closeIdleConnections();
    });
  }

  /** Brings what is running into line with the setting. */
  async function sync(): Promise<void> {
    if (!wanted() || !started) {
      await stopListener();
      if (!wanted()) problem = null;
      watch(false);
      return;
    }
    try {
      const renewed = await ensureCertificates();
      if (!server) throw new Error("no server certificate");
      if (!listener) await startListener(server);
      else if (renewed) listener.setSecureContext({ key: server.keyPem, cert: server.pem, minVersion: "TLSv1.2" });
      problem = null;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const said = problem;
      problem =
        error instanceof AppError
          ? error.message
          : code
            ? listenProblem(error as NodeJS.ErrnoException)
            : `HTTPS could not start: ${messageOf(error)}`;
      // It is tried again every half minute; the log hears about it once.
      if (problem !== said) ctx.log.warn(`HTTPS: ${problem}`);
    }
    watch(true);
  }

  function watch(on: boolean): void {
    if (on && !timer) {
      timer = setInterval(() => void check(), CHECK_EVERY);
      timer.unref();
    } else if (!on && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  const announce = () => ctx.events.publish({ type: "https.changed" });

  /** `always` announces even when nothing visible moved: a setting changed, and the status reports settings too. */
  function check(always = false): Promise<void> {
    return enqueue(async () => {
      const before = `${server?.certificate.fingerprint256}|${Boolean(listener)}|${problem}`;
      await sync();
      if (always || before !== `${server?.certificate.fingerprint256}|${Boolean(listener)}|${problem}`) announce();
    }).catch((error) => ctx.log.error({ err: error }, "HTTPS could not be brought into line with its setting"));
  }

  // ── Wiring ──

  try {
    authority = loadAuthority();
  } catch (error) {
    problem = messageOf(error);
  }

  settings.onChange(() => void check(true));
  app.addHook("onListen", async () => {
    started = true;
    // Not waited for: making keys the first time must not hold up plain HTTP.
    void check();
  });
  // The HTTPS listener stops accepting when the plain one does, not after it has drained.
  const stop = async () => {
    started = false;
    watch(false);
    await enqueue(stopListener);
  };
  ctx.stopping.addEventListener("abort", () => void stop(), { once: true });
  ctx.onClose.push(stop);

  return {
    status() {
      const port = listener ? (listener.address() as AddressInfo).port : config.httpsPort;
      const carried = server && listener ? certificateNames(server.certificate) : [];
      const addresses: HttpsAddress[] = [];
      for (const text of carried) {
        const name = parseName(text);
        if (!name) continue;
        const own = ["localhost", "127.0.0.1", "::1"].includes(name.text);
        addresses.push({
          url: `https://${inUrl(name)}:${port}`,
          name: name.text,
          kind: own ? "this-computer" : name.kind === "ip" ? "address" : "name",
        });
      }
      return {
        enabled: settings.get("https.enabled"),
        unavailable: config.portable ? "portable" : null,
        listening: Boolean(listener),
        port,
        httpPort: (app.server.address() as AddressInfo | null)?.port ?? config.port,
        problem,
        addresses,
        names: carried,
        leftOut: authority && wanted() ? wantedNames(authority.permits).leftOut : [],
        authority: authority
          ? {
              name: commonNameOf(authority.certificate),
              fingerprint: fingerprintOf(authority.certificate),
              createdAt: authority.certificate.validFromDate.getTime(),
              expiresAt: authority.certificate.validToDate.getTime(),
              permittedNames: authority.permits.names,
              permittedBlocks: authority.permits.blocks.map((block) => `${block.address}/${block.prefix}`),
            }
          : null,
        certificateExpiresAt: server && listener ? server.certificate.validToDate.getTime() : null,
        inContainer,
        lanAccess: config.lanAccess,
      };
    },

    authorityCertificate() {
      return authority ? { pem: authority.pem, der: Buffer.from(authority.certificate.raw) } : null;
    },

    replaceAuthority() {
      if (config.portable) throw conflict("HTTPS is not offered from a portable drive.");
      return enqueue(async () => {
        authority = await newAuthority();
        problem = null;
        await sync();
        announce();
      });
    },

    async removeAuthority() {
      // Off first, so that nothing makes a new authority the moment the old one is gone.
      if (settings.get("https.enabled")) settings.update({ "https.enabled": false });
      await enqueue(async () => {
        await stopListener();
        authority = null;
        server = null;
        problem = null;
        store.clear();
        announce();
      });
    },

    check: () => check(),
    async whenSettled() {
      // Work can be added while waiting, so wait until the queue stops moving.
      for (let seen: Promise<void> | undefined; seen !== queue; ) {
        seen = queue;
        await seen;
      }
    },
  };
}
