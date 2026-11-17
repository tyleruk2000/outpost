/**
 * Keeps HTTPS as the settings say it should be: a second listener, answering with
 * either the certificate Outpost makes and signs with its own certificate authority,
 * or one the person brought.
 *
 * Which of the two is a setting, and Outpost never changes it by itself. A certificate
 * the person brought that has run out is still served, and one whose files have become
 * unusable is replaced by nothing: falling back to Outpost's own authority would swap
 * the server's identity for one their devices were never told to trust, and would make
 * a certificate authority nobody asked for. The browser's own "expired" warning is the
 * true one, plain HTTP is never affected, and Settings says what is being served.
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
import type { HttpsAddress, HttpsOwn, HttpsStatus } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf } from "../../core/errors.ts";
import { isAllowedHost } from "../../core/guard.ts";
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
  toPem,
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
import { expiryOf, type Inspection, inspectOwn, type OwnBundle, type OwnReport, Refused, type Supplied } from "./own.ts";
import { createTlsStore, OWN_FILES } from "./store.ts";

const DAY = 24 * 60 * 60 * 1000;
/** A server certificate is replaced once it has this long left. */
const RENEW_BEFORE = 30 * DAY;
/**
 * How often the names this server is reached by, and the certificate's age, are looked at
 * again while HTTPS is running as it should. No event says that the computer's addresses
 * have changed, so this is a timer; a few minutes is soon enough for a new address.
 */
const CHECK_EVERY = 5 * 60_000;
/** How often while something stands in the way (the port is taken, a file is missing), so that putting it right is seen soon. */
const CHECK_EVERY_WHILE_WRONG = 30_000;
/** More names than this on one certificate means something is wrong with the list. */
const MOST_NAMES = 40;
/** How long requests in progress are given when the listener is stopped. */
const CLOSE_GRACE = 1500;
/**
 * A clock that reads earlier than this is wrong: a computer with no clock battery that
 * started without a network. A certificate dated by it would be refused everywhere.
 */
const EARLIEST_CLOCK = Date.UTC(2026, 10, 1);

/**
 * How long the folder's files are left alone after a change before they are judged. A
 * renewal writes the certificate and the key one after the other, and a pair caught
 * half replaced does not match.
 */
const SETTLE = 3000;

interface ServerCertificate {
  certificate: X509Certificate;
  pem: string;
  keyPem: string;
}

/** A certificate the person brought, read and checked, with the state of its files when it was read. */
interface OwnLoaded {
  bundle: OwnBundle;
  report: OwnReport;
  stamp: string;
  keyOpenTo: string | null;
}

export type HttpsServiceStatus = Omit<HttpsStatus, "authorityRight" | "own"> & { own: Omit<HttpsOwn, "keyRight"> };

export interface HttpsService {
  status(): HttpsServiceStatus;
  /** The authority's public certificate, for a device to trust. Null until HTTPS has been turned on once. */
  authorityCertificate(): { pem: string; der: Buffer } | null;
  /** Makes a new authority and a new server certificate. Every device that trusted the old one must trust the new. */
  replaceAuthority(): Promise<void>;
  /** Turns HTTPS off and deletes the authority, the server certificate and their keys. */
  removeAuthority(): Promise<void>;
  /**
   * Checks a certificate and key the person gave, keeps them in the folder, and turns
   * HTTPS on with them. Refuses, in a sentence, what cannot work; nothing is kept then.
   */
  importOwn(supplied: Supplied): Promise<void>;
  /** The same for the two files already in the folder, which stay where they are. */
  useOwnFromFolder(): Promise<void>;
  /** Deletes the person's certificate and key from the folder. HTTPS goes off if it was using them. */
  removeOwn(): Promise<void>;
  /** The certificate a device has to trust for the person's own certificate, when Outpost holds it. */
  ownAnchor(): { pem: string; der: Buffer } | null;
  /** Looks again at the names this server is reached by and at the certificate's age, and re-issues if either calls for it. */
  check(): Promise<void>;
  /** Resolves when nothing is being started, stopped or re-issued. */
  whenSettled(): Promise<void>;
  /** How often `check` runs by itself just now, or null when it does not. For tests. */
  checksEvery(): number | null;
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
  /** The fingerprint of the certificate the listener holds. */
  let presented: string | null = null;
  let problem: string | null = null;
  let own: OwnLoaded | null = null;
  /** Why the files in the folder cannot be used as they are now. */
  let ownProblem: string | null = null;
  /** The folder's files as they were when last found unusable, so that the same fault is not judged twice. */
  let judgedStamp: string | null = null;
  /** Set once the plain HTTP server is listening; HTTPS never starts before it. */
  let started = false;
  let timer: NodeJS.Timeout | undefined;
  let queue: Promise<void> = Promise.resolve();

  const wanted = () => settings.get("https.enabled") && !config.portable;
  const usingOwn = () => settings.get("https.certificate") === "own";

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

  // ── A certificate of the person's own ──

  /** Reads and judges what was given. `strict` is for a certificate being handed over now: it must also be in date. */
  function judge(supplied: Supplied, strict: boolean): Inspection {
    const inspection = inspectOwn(supplied, {
      now: Date.now(),
      reached: candidates(),
      answersTo: (name) => isAllowedHost(name, config),
    });
    const reasons = [...inspection.refusals];
    // A clock that is plainly wrong cannot judge dates; `assertClock` has already stopped a hand-over by then.
    if (strict && inspection.outOfDate) reasons.unshift(inspection.outOfDate);
    if (reasons.length > 0) throw new Refused(reasons.join(" "));
    return inspection;
  }

  const sayOwn = (loaded: OwnLoaded) =>
    ctx.log.info(
      `HTTPS: using the certificate in ${store.own.dir} for ${loaded.report.names.join(", ")}, valid until ${new Date(loaded.report.expiresAt).toISOString().slice(0, 10)}.`,
    );

  /**
   * Brings the certificate in memory into line with the two files in the folder. This is
   * what takes up a renewal without a restart. Files that cannot be used leave what is
   * in memory alone and say why in `ownProblem`.
   */
  function takeUpOwn(): void {
    let files: ReturnType<typeof store.own.read>;
    try {
      files = store.own.read();
    } catch (error) {
      ownProblem = messageOf(error);
      return;
    }
    if (own && files.stamp === own.stamp) {
      // The same files. The addresses this server is reached by may have moved, so what it covers is looked at again.
      try {
        own.report = judge({ files: [Buffer.from(own.bundle.fullPem), Buffer.from(own.bundle.keyPem)] }, false).report;
      } catch {
        // It was good when it was read; keep what was said of it then.
      }
      own.keyOpenTo = files.keyOpenTo;
      ownProblem = null;
      judgedStamp = null;
      return;
    }
    if (files.stamp === judgedStamp) return;
    const missing = [files.certificate === null ? OWN_FILES.certificate : null, files.key === null ? OWN_FILES.key : null].filter(Boolean);
    if (files.certificate === null || files.key === null) {
      ownProblem =
        missing.length === 2
          ? `There is no certificate in ${store.own.dir}. Outpost looks there for ${OWN_FILES.certificate} and ${OWN_FILES.key}.`
          : `${missing[0]} is missing from ${store.own.dir}. Outpost needs both ${OWN_FILES.certificate} and ${OWN_FILES.key}.`;
      judgedStamp = files.stamp;
      return;
    }
    if (own && Date.now() - files.newest < SETTLE) return;
    let inspection: Inspection;
    try {
      inspection = judge({ files: [files.certificate, files.key] }, false);
    } catch (error) {
      ownProblem = own
        ? `The files in ${store.own.dir} changed, and the new ones cannot be used. ${messageOf(error)} Outpost is still serving the certificate it read before.`
        : `The files in ${store.own.dir} cannot be used. ${messageOf(error)}`;
      judgedStamp = files.stamp;
      return;
    }
    if (inspection.outOfDate && own && expiryOf(own.report, Date.now()) !== "expired") {
      ownProblem = `The files in ${store.own.dir} changed, and the new certificate is out of date. ${inspection.outOfDate} Outpost is still serving the certificate it read before.`;
      judgedStamp = files.stamp;
      return;
    }
    const renewal = own !== null;
    own = { bundle: inspection.bundle, report: inspection.report, stamp: files.stamp, keyOpenTo: files.keyOpenTo };
    ownProblem = null;
    judgedStamp = null;
    if (renewal) ctx.log.info(`HTTPS: the certificate in ${store.own.dir} was replaced; the new one is in use.`);
    sayOwn(own);
  }

  /** Forgets the person's certificate and its key. The files are not touched. */
  function forgetOwn(): void {
    own = null;
    ownProblem = null;
    judgedStamp = null;
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

  async function startListener(certificate: { keyPem: string; certPem: string }): Promise<void> {
    const main = app.server;
    // The same handler as the plain HTTP server: every hook, route and header is shared.
    const next = https.createServer({ key: certificate.keyPem, cert: certificate.certPem, minVersion: "TLSv1.2" }, (request, response) => {
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
    presented = null;
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
      if (!wanted()) {
        problem = null;
        // With HTTPS off there is no reason to hold the person's key in memory.
        forgetOwn();
      }
      watch(false);
      return;
    }
    try {
      let next: { keyPem: string; certPem: string; mark: string };
      if (usingOwn()) {
        takeUpOwn();
        if (!own) {
          throw conflict(
            `${ownProblem ?? "There is no certificate of your own to use."} Until that is put right, HTTPS is not running; the plain http address is not affected. You can also go back to Outpost's own certificate in Settings.`,
          );
        }
        next = { keyPem: own.bundle.keyPem, certPem: own.bundle.certPem, mark: own.report.fingerprint };
      } else {
        forgetOwn();
        await ensureCertificates();
        if (!server) throw new Error("no server certificate");
        next = { keyPem: server.keyPem, certPem: server.pem, mark: server.certificate.fingerprint256 };
      }
      if (!listener) await startListener(next);
      else if (presented !== next.mark) listener.setSecureContext({ key: next.keyPem, cert: next.certPem, minVersion: "TLSv1.2" });
      presented = next.mark;
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
      // It is tried again every half minute (CHECK_EVERY_WHILE_WRONG); the log hears about it once.
      if (problem !== said) ctx.log.warn(`HTTPS: ${problem}`);
    }
    watch(true);
  }

  let period: number | null = null;
  function watch(on: boolean): void {
    const wanted = on ? (problem || ownProblem ? CHECK_EVERY_WHILE_WRONG : CHECK_EVERY) : null;
    if (wanted === period) return;
    clearInterval(timer);
    timer = undefined;
    period = wanted;
    if (wanted === null) return;
    timer = setInterval(() => void check(), wanted);
    timer.unref();
  }

  /** Everything Settings shows that can move: which certificate is presented, whether the listener is up, and what is wrong. */
  const seen = () => `${presented}|${Boolean(listener)}|${problem}|${ownProblem}|${own ? expiryOf(own.report, Date.now()) : ""}`;
  /** That state as it was when the browser was last told. A certificate nearing its end changes it with no other event. */
  let told = seen();
  const announce = () => {
    told = seen();
    ctx.events.publish({ type: "https.changed" });
  };

  /** `always` announces even when nothing visible moved: a setting changed, and the status reports settings too. */
  function check(always = false): Promise<void> {
    return enqueue(async () => {
      await sync();
      if (always || told !== seen()) announce();
    }).catch((error) => ctx.log.error({ err: error }, "HTTPS could not be brought into line with its setting"));
  }

  function assertOffered(): void {
    if (config.portable) throw conflict("HTTPS is not offered from a portable drive.");
  }

  /** `judge`, for a certificate being handed over, with its refusal as an answer for the person. */
  function strictly(supplied: Supplied): Inspection {
    try {
      return judge(supplied, true);
    } catch (error) {
      if (error instanceof Refused) throw badRequest(error.message);
      throw error;
    }
  }

  /** Points the settings at the person's certificate, with HTTPS on, and brings the listener into line. */
  async function turnOnWithOwn(): Promise<void> {
    if (!usingOwn() || !settings.get("https.enabled")) settings.update({ "https.certificate": "own", "https.enabled": true });
    await sync();
    announce();
  }

  /** What Settings is told about the person's certificate. The key, and the certificates themselves, stay here. */
  function publicFacts(loaded: OwnLoaded): NonNullable<HttpsOwn["certificate"]> {
    const { usable: _usable, ...report } = loaded.report;
    const warnings = [...report.warnings];
    if (loaded.keyOpenTo) {
      warnings.push(
        `Other accounts on this computer can read the key file (${OWN_FILES.key} has permissions ${loaded.keyOpenTo}). Make it private to the account Outpost runs as: chmod 600 on the file, or chmod 700 on its folder.`,
      );
    }
    return { ...report, warnings };
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
      const mine = usingOwn();
      const outposts = !mine && server && listener ? certificateNames(server.certificate) : [];
      // For the person's own certificate: the names on it that a browser can use and Outpost answers to.
      const carried = mine ? (own && listener ? own.report.usable : []) : outposts;
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
        source: settings.get("https.certificate"),
        unavailable: config.portable ? "portable" : null,
        listening: Boolean(listener),
        port,
        httpPort: (app.server.address() as AddressInfo | null)?.port ?? config.port,
        problem,
        addresses,
        names: mine ? (own && listener ? own.report.names : []) : outposts,
        leftOut: !mine && authority && wanted() ? wantedNames(authority.permits).leftOut : [],
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
        certificateExpiresAt: !listener
          ? null
          : mine
            ? (own?.report.expiresAt ?? null)
            : (server?.certificate.validToDate.getTime() ?? null),
        inContainer,
        lanAccess: config.lanAccess,
        own: {
          folder: store.own.dir,
          files: { ...OWN_FILES },
          inFolder: store.own.present(),
          certificate: mine && own ? publicFacts(own) : null,
          expiry: mine && own ? expiryOf(own.report, Date.now()) : null,
          problem: mine ? ownProblem : null,
        },
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
      // Not when the listener is presenting the person's own certificate: that does not need the authority.
      if (settings.get("https.enabled") && !usingOwn()) settings.update({ "https.enabled": false });
      await enqueue(async () => {
        if (!usingOwn()) await stopListener();
        authority = null;
        server = null;
        problem = null;
        store.clear();
        announce();
      });
    },

    importOwn(supplied) {
      assertOffered();
      return enqueue(async () => {
        assertClock();
        const inspection = strictly(supplied);
        try {
          store.own.write(inspection.bundle.fullPem, inspection.bundle.keyPem);
        } catch (error) {
          throw conflict(`The certificate could not be kept: ${messageOf(error)}`);
        }
        const files = store.own.read();
        own = { bundle: inspection.bundle, report: inspection.report, stamp: files.stamp, keyOpenTo: files.keyOpenTo };
        ownProblem = null;
        judgedStamp = null;
        ctx.log.info(`HTTPS: a certificate was given in Settings and written to ${store.own.dir}.`);
        await turnOnWithOwn();
      });
    },

    useOwnFromFolder() {
      assertOffered();
      return enqueue(async () => {
        assertClock();
        let files: ReturnType<typeof store.own.read>;
        try {
          files = store.own.read();
        } catch (error) {
          throw conflict(messageOf(error));
        }
        if (files.certificate === null || files.key === null) {
          throw conflict(
            `Outpost looked in ${store.own.dir} for ${OWN_FILES.certificate} and ${OWN_FILES.key} and ${files.certificate === null && files.key === null ? "found neither" : `did not find ${files.certificate === null ? OWN_FILES.certificate : OWN_FILES.key}`}. Put both there under exactly those names, then try again.`,
          );
        }
        const inspection = strictly({ files: [files.certificate, files.key] });
        own = { bundle: inspection.bundle, report: inspection.report, stamp: files.stamp, keyOpenTo: files.keyOpenTo };
        ownProblem = null;
        judgedStamp = null;
        await turnOnWithOwn();
      });
    },

    async removeOwn() {
      // Off first, as with the authority: otherwise the moment the files go, Outpost would make an authority of its own.
      if (usingOwn()) settings.update({ "https.enabled": false, "https.certificate": "outpost" });
      await enqueue(async () => {
        forgetOwn();
        store.own.remove();
        ctx.log.info(`HTTPS: the certificate in ${store.own.dir} and its key were deleted.`);
        await sync();
        announce();
      });
    },

    ownAnchor() {
      if (!usingOwn() || !own?.report.anchor.held) return null;
      const certificate = own.report.trust === "self-signed" ? own.bundle.leaf : own.bundle.root;
      return certificate ? { pem: toPem(certificate.raw), der: Buffer.from(certificate.raw) } : null;
    },

    check: () => check(),
    checksEvery: () => period,
    async whenSettled() {
      // Work can be added while waiting, so wait until the queue stops moving.
      for (let seen: Promise<void> | undefined; seen !== queue; ) {
        seen = queue;
        await seen;
      }
    },
  };
}
