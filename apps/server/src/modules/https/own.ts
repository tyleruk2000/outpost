/**
 * A certificate of the person's own: reading what they gave, and checking it before
 * the HTTPS listener is handed it.
 *
 * Some people already have a certificate for this server: from a public authority, for
 * a name they own; from an authority they run at home or at work; or from a tool such
 * as mkcert. This file takes the files as they come (PEM, DER or PKCS#12; the
 * certificate, its chain and its key in one file or several, in any order), finds the
 * server's certificate by its key, puts the chain in order, and says what it found:
 * what cannot work, what will work only at some addresses, and who has to trust what.
 *
 * Nothing here touches a disk or the network. Whether an authority is a public one is
 * judged against the list of public authorities Node carries (Mozilla's, as it stood
 * when this version of Node was made). What a given phone or computer trusts cannot be
 * known from here, and the screen says so.
 */
import { createPrivateKey, type KeyObject, X509Certificate } from "node:crypto";
import tls from "node:tls";
import { messageOf } from "../../core/errors.ts";
import { certificateNamesAsWritten, commonNameOf, toPem } from "./certificates.ts";
import type { ReachableName } from "./names.ts";
import { looksLikePkcs12, Pkcs12Error, readPkcs12 } from "./pkcs12.ts";

const DAY = 24 * 60 * 60 * 1000;
/** A file larger than this is not a certificate or a key. */
export const MOST_FILE_BYTES = 256 * 1024;
/** Apple devices refuse a server certificate valid for longer than this, whoever issued it. */
const APPLE_MOST_DAYS = 825;
const SERVER_AUTH = "1.3.6.1.5.5.7.3.1";
const ANY_PURPOSE = "2.5.29.37.0";

/** How to take the passphrase off a key, with the person's own tools. */
export const REMOVE_PASSPHRASE = "openssl pkey -in privkey.pem -out privkey-open.pem";

/** What was given cannot be used. The message is a sentence for the person who gave it. */
export class Refused extends Error {}

export interface Supplied {
  /** The files as they were given, in any order: certificates and a key may be in any of them. */
  files: Buffer[];
  /** The password of a PKCS#12 file, if one was typed. */
  password?: string;
}

/** A certificate and key ready for the listener. */
export interface OwnBundle {
  leaf: X509Certificate;
  /** The authorities' certificates sent after the server's own, nearest first. Never a root. */
  chain: X509Certificate[];
  /** The root the chain ends at, when it was in the files. Not sent: a device either has it or does not. */
  root: X509Certificate | null;
  /** The server's certificate and the chain, as Node is given them. */
  certPem: string;
  /** The same with the root after it, as it is written to disk. */
  fullPem: string;
  /** The key, without a passphrase, as PKCS#8. Never logged, never served. */
  keyPem: string;
}

export type OwnTrust = "public" | "private" | "self-signed";

export interface OwnReport {
  name: string;
  issuer: string;
  fingerprint: string;
  validFrom: number;
  /** The earliest end among the server's certificate and the chain sent with it. */
  expiresAt: number;
  key: string;
  names: string[];
  chain: string[];
  trust: OwnTrust;
  /** What a device has to trust for this certificate to be accepted. */
  anchor: { name: string; fingerprint: string | null; held: boolean };
  covered: string[];
  notCovered: string[];
  notAnswered: string[];
  /** Addresses a browser can use: names and addresses on the certificate that Outpost answers to. */
  usable: string[];
  warnings: string[];
  notes: string[];
}

export interface Surroundings {
  now: number;
  /** Every name and address this server is reached by (`reachableNames`). */
  reached: ReachableName[];
  /** Whether Outpost answers a request addressed to this name (the Host check). */
  answersTo(name: string): boolean;
  /** The public authorities' root certificates, as PEM. Node's own list unless a test says otherwise. */
  publicAuthorities?: readonly string[];
}

// ── Reading the files ──

interface PemBlock {
  label: string;
  /** The block whole, from BEGIN to END. */
  text: string;
  encrypted: boolean;
}

function pemBlocks(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  for (const match of text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?-----END \1-----/g)) {
    const label = match[1] ?? "";
    blocks.push({ label, text: match[0], encrypted: label === "ENCRYPTED PRIVATE KEY" || /Proc-Type:\s*4,\s*ENCRYPTED/.test(match[0]) });
  }
  return blocks;
}

const PASSPHRASE =
  `This key is protected by a passphrase. Outpost starts HTTPS with nobody there to type one, and it does not store passphrases. ` +
  `Take the passphrase off with your own tools, for example: ${REMOVE_PASSPHRASE} (it asks for the passphrase once), then give Outpost the new file and keep it private.`;

function keyFromDer(bytes: Buffer): KeyObject | null {
  for (const type of ["pkcs8", "pkcs1", "sec1"] as const) {
    try {
      return createPrivateKey({ key: bytes, format: "der", type });
    } catch {
      // Not that form.
    }
  }
  return null;
}

/** Everything in the files: the certificates in the order given, and the one private key. */
function gather(supplied: Supplied): { certificates: X509Certificate[]; key: KeyObject } {
  const certificates: X509Certificate[] = [];
  const keys: KeyObject[] = [];
  const add = (der: Buffer | string) => {
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(der);
    } catch {
      throw new Refused("One of the certificates in the file is damaged and cannot be read. Download or export it again.");
    }
    if (!certificates.some((other) => other.fingerprint256 === certificate.fingerprint256)) certificates.push(certificate);
  };

  for (const file of supplied.files) {
    if (file.length === 0) throw new Refused("One of the files is empty.");
    if (file.length > MOST_FILE_BYTES) throw new Refused("One of the files is too large to be a certificate or a key.");
    const text = file.toString("latin1");
    if (text.includes("-----BEGIN ")) {
      for (const block of pemBlocks(text)) {
        if (/^(TRUSTED |X509 )?CERTIFICATE$/.test(block.label)) add(block.text);
        else if (block.label === "CERTIFICATE REQUEST" || block.label === "NEW CERTIFICATE REQUEST") {
          throw new Refused(
            "This is a certificate request, the file that is sent to an authority, not the certificate the authority sends back. Give Outpost the certificate.",
          );
        } else if (block.label === "PKCS7") {
          throw new Refused(
            "This is a PKCS#7 file (.p7b), which Outpost does not read. Convert it with OpenSSL: openssl pkcs7 -print_certs -in file.p7b -out fullchain.pem",
          );
        } else if (block.label === "OPENSSH PRIVATE KEY") {
          throw new Refused(
            "This is a key for SSH, not the key of a certificate. Look for the key file made together with the certificate.",
          );
        } else if (block.label === "PUBLIC KEY" || block.label === "RSA PUBLIC KEY") {
          throw new Refused("This is a public key. Outpost needs the private key the certificate was made with.");
        } else if (/PRIVATE KEY$/.test(block.label)) {
          if (block.encrypted) throw new Refused(PASSPHRASE);
          try {
            keys.push(createPrivateKey(block.text));
          } catch {
            throw new Refused(
              "The private key is damaged or of a kind this server cannot read. Outpost reads RSA and ECDSA keys in PEM form.",
            );
          }
        }
        // Anything else (EC PARAMETERS, a comment block) is passed over.
      }
    } else if (looksLikePkcs12(file)) {
      try {
        const contents = readPkcs12(file, supplied.password ?? "");
        for (const der of contents.certificates) add(der);
        if (contents.key) keys.push(contents.key);
      } catch (error) {
        throw new Refused(error instanceof Pkcs12Error ? error.message : "This file could not be read as PKCS#12 (.pfx, .p12).");
      }
    } else {
      // Not text: a certificate or a key in DER.
      let certificate: X509Certificate | null = null;
      try {
        certificate = new X509Certificate(file);
      } catch {
        // Not a certificate.
      }
      const key = certificate ? null : keyFromDer(file);
      if (certificate) add(file);
      else if (key) keys.push(key);
      else {
        throw new Refused(
          "One of the files is not a certificate or a key Outpost can read. It reads PEM (text beginning -----BEGIN CERTIFICATE----- or -----BEGIN PRIVATE KEY-----), DER, and PKCS#12 (.pfx, .p12).",
        );
      }
    }
  }

  if (certificates.length === 0) {
    throw new Refused("No certificate was found in what you gave. A certificate file has a line reading -----BEGIN CERTIFICATE-----.");
  }
  const distinct = keys.filter((key, index) => keys.findIndex((other) => other.equals(key)) === index);
  if (distinct.length === 0) {
    throw new Refused(
      "No private key was found in what you gave. Outpost needs the key the certificate was made with: a file with a line reading -----BEGIN PRIVATE KEY-----.",
    );
  }
  if (distinct.length > 1) throw new Refused("More than one private key was given. Give the one that belongs to the server's certificate.");
  return { certificates, key: distinct[0] as KeyObject };
}

// ── Putting the chain in order ──

const signs = (issuer: X509Certificate, subject: X509Certificate): boolean => {
  try {
    return subject.checkIssued(issuer) && subject.verify(issuer.publicKey);
  } catch {
    return false;
  }
};
const selfSigned = (certificate: X509Certificate) => signs(certificate, certificate);

const readRoots = (list: readonly string[]): X509Certificate[] =>
  list.flatMap((pem) => {
    try {
      return [new X509Certificate(pem)];
    } catch {
      return [];
    }
  });

let nodesOwn: X509Certificate[] | undefined;
/** The public authorities to judge by. Node's are read once: there are about 150. */
function publicRoots(around: Surroundings): X509Certificate[] {
  if (around.publicAuthorities) return readRoots(around.publicAuthorities);
  nodesOwn ??= readRoots(tls.rootCertificates);
  return nodesOwn;
}

const keyBelongs = (certificate: X509Certificate, key: KeyObject): boolean => {
  try {
    return certificate.checkPrivateKey(key);
  } catch {
    return false;
  }
};

interface Arranged {
  leaf: X509Certificate;
  chain: X509Certificate[];
  root: X509Certificate | null;
  leftOver: X509Certificate[];
  reordered: boolean;
}

function arrange(certificates: X509Certificate[], key: KeyObject): Arranged {
  // The server's certificate is the one the key belongs to. If an old and a renewed one share a key, the later.
  const mine = certificates
    .filter((certificate) => keyBelongs(certificate, key))
    .sort((a, b) => b.validToDate.getTime() - a.validToDate.getTime());
  const leaf = mine[0];
  if (!leaf) {
    const first = certificates[0] as X509Certificate;
    throw new Refused(
      `This key does not belong to ${certificates.length === 1 ? "the certificate" : "any certificate in the file"} (${describe(first)}). ` +
        "A certificate works only with the key it was made with: look for the key file made at the same time, or issue the certificate again.",
    );
  }
  const rest = certificates.filter((certificate) => certificate !== leaf && !mine.includes(certificate));
  const chain: X509Certificate[] = [];
  let root: X509Certificate | null = null;
  for (let current = leaf; chain.length < 10; ) {
    if (selfSigned(current)) {
      if (current !== leaf) root = chain.pop() ?? null;
      break;
    }
    const issuer = rest.find((candidate) => !chain.includes(candidate) && signs(candidate, current));
    if (!issuer) break;
    chain.push(issuer);
    current = issuer;
  }
  const used = [leaf, ...chain, ...(root ? [root] : [])];
  const given = certificates.filter((certificate) => used.includes(certificate));
  return {
    leaf,
    chain,
    root,
    leftOver: rest.filter((certificate) => !used.includes(certificate)),
    reordered: given.some((certificate, index) => certificate !== used[index]),
  };
}

// ── Describing and judging ──

/** The first name on a certificate, or failing that its common name: what a person would call it. */
function describe(certificate: X509Certificate): string {
  const first = certificateNamesAsWritten(certificate)[0]?.text;
  return first ?? commonNameOf(certificate);
}

const issuerNameOf = (certificate: X509Certificate): string => {
  const lines = certificate.issuer.split("\n");
  const line = lines.find((part) => part.startsWith("CN=")) ?? lines.find((part) => part.startsWith("O="));
  return line ? line.slice(line.indexOf("=") + 1) : certificate.issuer;
};

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The key's kind in a few words, and what is wrong with it for a browser, if anything. */
function judgeKey(key: KeyObject): { text: string; refusal?: string; warning?: string } {
  const details = key.asymmetricKeyDetails ?? {};
  if (key.asymmetricKeyType === "rsa") {
    const bits = details.modulusLength ?? 0;
    return bits >= 2048
      ? { text: `RSA ${bits}` }
      : {
          text: `RSA ${bits}`,
          refusal: `The certificate's key is RSA of ${bits} bits. Browsers and Apple devices refuse RSA keys shorter than 2048 bits. Make a new key and certificate.`,
        };
  }
  if (key.asymmetricKeyType === "ec") {
    const curve = details.namedCurve ?? "";
    const known: Record<string, string> = { prime256v1: "P-256", secp384r1: "P-384", secp521r1: "P-521" };
    const text = `ECDSA ${known[curve] ?? curve}`;
    if (curve === "prime256v1" || curve === "secp384r1") return { text };
    if (curve === "secp521r1") {
      return {
        text,
        warning: "Its key is ECDSA P-521, which Chrome does not accept. P-256 and P-384 work everywhere.",
      };
    }
    return {
      text,
      refusal: `The certificate's key is on the curve ${curve}, which browsers do not accept. Use ECDSA P-256 or P-384, or RSA of 2048 bits or more.`,
    };
  }
  const kind = key.asymmetricKeyType ?? "unknown";
  return {
    text: kind,
    refusal: `The certificate's key is of the kind ${kind}, which browsers do not accept in a certificate. Use ECDSA P-256 or P-384, or RSA of 2048 bits or more.`,
  };
}

export interface Inspection {
  bundle: OwnBundle;
  report: OwnReport;
  /** Why it cannot work at all, whatever the date. Empty when it can. */
  refusals: string[];
  /** Set when it is out of date now: not yet valid, or expired. A sentence saying which. */
  outOfDate: string | null;
}

/**
 * Reads what was given and judges it. Throws `Refused` when no certificate and key can
 * be made out of it at all; otherwise returns what it found, including the reasons it
 * cannot work (`refusals`, `outOfDate`), which the caller acts on.
 */
export function inspectOwn(supplied: Supplied, around: Surroundings): Inspection {
  const { certificates, key } = gather(supplied);
  const { leaf, chain, root, leftOver, reordered } = arrange(certificates, key);
  const refusals: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const sent = [leaf, ...chain];
  const top = sent[sent.length - 1] as X509Certificate;

  // ── Names ──
  const written = certificateNamesAsWritten(leaf);
  const names = written.map((name) => name.text);
  if (names.length === 0) {
    refusals.push(
      "The certificate lists no names: it has no subject alternative name, which is where browsers read the names a certificate is for. Issue it again with the server's name or address as a subject alternative name.",
    );
  }
  const covers = (name: ReachableName["name"]): boolean =>
    name.kind === "ip" ? leaf.checkIP(name.text) !== undefined : leaf.checkHost(name.text, { subject: "never" }) !== undefined;
  const inUse = around.reached.filter((entry) => entry.origin !== "own");
  const covered = inUse.filter((entry) => covers(entry.name)).map((entry) => entry.name.text);
  const notCovered = inUse.filter((entry) => !covers(entry.name)).map((entry) => entry.name.text);
  // Names a browser could put in its address bar: the ones written out in full, and names in use that a wildcard covers.
  const concrete = [...new Set([...names.filter((name) => !name.startsWith("*.")), ...covered])];
  const usable = concrete.filter((name) => around.answersTo(name));
  const notAnswered = concrete.filter((name) => !around.answersTo(name));
  const wildcards = names.filter((name) => name.startsWith("*."));
  if (wildcards.length > 0 && !wildcards.some((wildcard) => covered.some((name) => name.endsWith(wildcard.slice(1))))) {
    notes.push(
      `It covers every name directly under ${wildcards.map((name) => name.slice(2)).join(" and ")} (${wildcards.join(", ")}). Outpost cannot tell which of those names points at this server: list the one you use under “Other names and addresses”.`,
    );
  }

  // ── The chain, and who has to trust what ──
  let trust: OwnTrust;
  let anchor: OwnReport["anchor"];
  if (selfSigned(leaf)) {
    trust = "self-signed";
    anchor = { name: commonNameOf(leaf), fingerprint: leaf.fingerprint256, held: true };
  } else if (root) {
    const known = publicRoots(around).some((candidate) => candidate.fingerprint256 === root.fingerprint256);
    trust = known ? "public" : "private";
    anchor = { name: commonNameOf(root), fingerprint: root.fingerprint256, held: !known };
  } else {
    const known = publicRoots(around).find((candidate) => signs(candidate, top));
    if (known) {
      trust = "public";
      anchor = { name: commonNameOf(known), fingerprint: known.fingerprint256, held: false };
    } else {
      trust = "private";
      anchor = { name: issuerNameOf(top), fingerprint: null, held: false };
      // A certificate that says where its issuer's certificate can be fetched came from an
      // authority with a public repository: almost always a public one, whose own
      // certificate (an intermediate) is then what is missing here.
      if (/CA Issuers/i.test(top.infoAccess ?? "")) {
        warnings.push(
          `The certificate of the authority that issued it (${issuerNameOf(top)}) was not in what you gave. If that authority is a public one's intermediate, as with Let's Encrypt, most devices will refuse the connection: give Outpost the full chain (fullchain.pem), not the certificate alone.`,
        );
      }
    }
  }
  if (reordered)
    notes.push(
      "The certificates in the file were not in order (the server's own first, then each authority after the one it signed). Outpost sends them in order.",
    );
  if (leftOver.length > 0) {
    notes.push(
      `${leftOver.length === 1 ? "One certificate in the file is" : `${leftOver.length} certificates in the file are`} not part of this certificate's chain and ${leftOver.length === 1 ? "is" : "are"} not sent: ${leftOver.map(commonNameOf).join(", ")}.`,
    );
  }

  // ── The key, and how the certificate was signed ──
  const judged = judgeKey(key);
  if (judged.refusal) refusals.push(judged.refusal);
  if (judged.warning) warnings.push(judged.warning);
  if (/md5|sha1(?!\d)/i.test(leaf.signatureAlgorithm ?? "")) {
    refusals.push(
      "The certificate is signed with SHA-1 or MD5, which browsers stopped accepting years ago. Issue it again signed with SHA-256.",
    );
  }
  const purposes = leaf.keyUsage;
  if (purposes && purposes.length > 0 && !purposes.includes(SERVER_AUTH) && !purposes.includes(ANY_PURPOSE)) {
    refusals.push(
      "The certificate was issued for another purpose (its extended key usage does not include identifying a web server). Issue one for a TLS web server.",
    );
  }

  // ── Dates ──
  const validFrom = Math.max(...sent.map((certificate) => certificate.validFromDate.getTime()));
  const expiresAt = Math.min(...sent.map((certificate) => certificate.validToDate.getTime()));
  let outOfDate: string | null = null;
  const late = sent.find((certificate) => certificate.validToDate.getTime() <= around.now);
  const early = sent.find((certificate) => certificate.validFromDate.getTime() > around.now);
  if (late) {
    outOfDate =
      late === leaf
        ? `The certificate expired on ${dayOf(leaf.validToDate.getTime())}. Renew it, then give Outpost the new one.`
        : `The certificate of ${commonNameOf(late)} in its chain expired on ${dayOf(late.validToDate.getTime())}. Fetch the current chain from the authority.`;
  } else if (early) {
    outOfDate = `The certificate is not valid until ${dayOf(early.validFromDate.getTime())}, and this computer's clock reads ${dayOf(around.now)}. Check the clock, or wait.`;
  }
  const days = (leaf.validToDate.getTime() - leaf.validFromDate.getTime()) / DAY;
  if (trust !== "public" && days > APPLE_MOST_DAYS) {
    warnings.push(
      `It is valid for ${Math.round(days)} days. iPhone, iPad and Mac refuse a server certificate valid for more than ${APPLE_MOST_DAYS} days, whoever issued it.`,
    );
  }

  // ── Node's own verdict ──
  const certPem = sent.map((certificate) => toPem(certificate.raw)).join("");
  const keyPem = key.export({ type: "pkcs8", format: "pem" }) as string;
  if (refusals.length === 0) {
    try {
      tls.createSecureContext({ key: keyPem, cert: certPem, minVersion: "TLSv1.2" });
    } catch (error) {
      refusals.push(`This server cannot use the certificate: ${messageOf(error)}.`);
    }
  }

  return {
    bundle: { leaf, chain, root, certPem, fullPem: certPem + (root ? toPem(root.raw) : ""), keyPem },
    report: {
      name: describe(leaf),
      issuer: issuerNameOf(leaf),
      fingerprint: leaf.fingerprint256,
      validFrom,
      expiresAt,
      key: judged.text,
      names,
      chain: chain.map(commonNameOf),
      trust,
      anchor,
      covered,
      notCovered,
      notAnswered,
      usable,
      warnings,
      notes,
    },
    refusals,
    outOfDate,
  };
}

/** How near its end a certificate is: fine, close, or past. */
export function expiryOf(report: Pick<OwnReport, "validFrom" | "expiresAt">, now: number): "ok" | "soon" | "expired" {
  const left = report.expiresAt - now;
  if (left <= 0) return "expired";
  // Two weeks, or a fifth of its life for a certificate that lives only days.
  return left < Math.min(14 * DAY, (report.expiresAt - report.validFrom) / 5) ? "soon" : "ok";
}
