/**
 * Making the two certificates HTTPS on a home network needs: a certificate authority
 * that belongs to this server alone, and a server certificate signed by it.
 *
 * Keys, signatures and the reading of certificates are Node's (OpenSSL underneath).
 * This file only lays out the fields of an X.509 version 3 certificate (RFC 5280) and
 * hands the result to Node to sign, then reads it back with Node to make sure the two
 * agree before anything is used.
 *
 * The authority is held as tightly as certificates allow:
 *
 *  - It may sign only names and addresses that exist on a private network (critical
 *    name constraints), so on devices that honour them it is of no use against any
 *    public web site even if its key is stolen.
 *  - It may sign only server certificates, not further authorities (path length 0),
 *    and only for identifying web servers (extended key usage).
 */
import {
  createHash,
  createPrivateKey,
  generateKeyPair,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
  X509Certificate,
} from "node:crypto";
import { promisify } from "node:util";
import {
  bitString,
  boolean,
  contextual,
  integer,
  nullValue,
  octetString,
  oid,
  readChildren,
  readOid,
  readValue,
  sequence,
  setOfOne,
  time,
  utf8String,
} from "./der.ts";
import { type AddressBlock, blockBytes, blockFromBytes, inBlock, parseName, type ServerName, underSuffix } from "./names.ts";

const OID = {
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  sha256WithRsa: "1.2.840.113549.1.1.11",
  commonName: "2.5.4.3",
  organization: "2.5.4.10",
  subjectKeyIdentifier: "2.5.29.14",
  keyUsage: "2.5.29.15",
  subjectAltName: "2.5.29.17",
  basicConstraints: "2.5.29.19",
  nameConstraints: "2.5.29.30",
  authorityKeyIdentifier: "2.5.29.35",
  extendedKeyUsage: "2.5.29.37",
  serverAuth: "1.3.6.1.5.5.7.3.1",
};

const DAY = 24 * 60 * 60 * 1000;
/** Ten years. A new authority means trusting it again on every device, so it is long-lived. */
export const AUTHORITY_DAYS = 3650;
/**
 * A server certificate lasts 397 days: inside the 398 days browsers allow public
 * certificates and the 825 days Apple allows any, and long enough that a server whose
 * clock has fallen behind while switched off still presents a certificate that is valid.
 */
export const SERVER_DAYS = 397;
/** Certificates start a day early, so a device whose clock is a little behind still accepts them. */
const BACKDATE = DAY;

export interface Permits {
  /** DNS names the authority may sign: each of these, and any name under one. */
  names: string[];
  blocks: AddressBlock[];
}

export interface Authority {
  certificate: X509Certificate;
  pem: string;
  key: KeyObject;
  permits: Permits;
}

export interface IssuedCertificate {
  certificate: X509Certificate;
  pem: string;
  keyPem: string;
}

/** The lines of a PEM block around DER bytes. */
export function toPem(der: Buffer, label = "CERTIFICATE"): string {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

const distinguishedName = (organization: string, commonName: string): Buffer =>
  sequence(
    setOfOne(sequence(oid(OID.organization), utf8String(organization))),
    setOfOne(sequence(oid(OID.commonName), utf8String(commonName))),
  );

const extension = (id: string, critical: boolean, value: Buffer): Buffer =>
  sequence(oid(id), ...(critical ? [boolean(true)] : []), octetString(value));

/** A key's identifier: the first 160 bits of the SHA-256 of its public key (RFC 7093, method 4). */
const keyIdentifier = (publicKey: KeyObject): Buffer =>
  createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest()
    .subarray(0, 20);

/** A random, positive serial number of 128 bits. */
function serialNumber(): Buffer {
  const bytes = randomBytes(16);
  bytes[0] = ((bytes[0] ?? 0) & 0x7f) | 0x40;
  return bytes;
}

function generalName(name: ServerName): Buffer {
  return name.kind === "dns" ? contextual(2, false, Buffer.from(name.text, "ascii")) : contextual(7, false, name.bytes);
}

interface Fields {
  issuer: Buffer;
  subject: Buffer;
  notBefore: Date;
  notAfter: Date;
  publicKey: KeyObject;
  extensions: Buffer[];
}

/** Lays out the certificate, has `signer` sign it, and returns the finished DER. */
function assemble(fields: Fields, signer: KeyObject): Buffer {
  // SHA-256 either way. An RSA signature's identifier carries empty parameters; an ECDSA one carries none.
  const algorithm = signer.asymmetricKeyType === "rsa" ? sequence(oid(OID.sha256WithRsa), nullValue()) : sequence(oid(OID.ecdsaWithSha256));
  const body = sequence(
    contextual(0, true, integer(2)), // version 3
    integer(serialNumber()),
    algorithm,
    fields.issuer,
    sequence(time(fields.notBefore), time(fields.notAfter)),
    fields.subject,
    fields.publicKey.export({ type: "spki", format: "der" }),
    contextual(3, true, sequence(...fields.extensions)),
  );
  return sequence(body, algorithm, bitString(sign("sha256", body, signer)));
}

/**
 * The authority's key is RSA, 3072 bits: Apple's deployment guide names RSA keys for
 * a certificate a person installs, and no iPhone was at hand to try anything else.
 * Making one takes a moment on a small computer, so it is done off the main thread.
 */
const newAuthorityKeyPair = () => promisify(generateKeyPair)("rsa", { modulusLength: 3072 });
/** The server's own key is ECDSA P-256, as most web sites' are: quick to make each time the certificate is renewed. */
const newServerKeyPair = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" });

/** Whole seconds, because that is all a certificate's dates hold. */
const atSecond = (ms: number) => new Date(Math.floor(ms / 1000) * 1000);

/**
 * A new certificate authority: its own key, and a certificate it signs itself.
 * `label` is how devices will list it, so it should say which server it belongs to.
 */
export async function createAuthority(options: { label: string; permits: Permits; now?: number }): Promise<Authority> {
  const now = options.now ?? Date.now();
  const { privateKey, publicKey } = await newAuthorityKeyPair();
  const name = distinguishedName("Outpost", options.label);
  const subtrees = [
    ...options.permits.names.map((text) => sequence(contextual(2, false, Buffer.from(text, "ascii")))),
    ...options.permits.blocks.map((block) => sequence(contextual(7, false, blockBytes(block)))),
  ];
  const der = assemble(
    {
      issuer: name,
      subject: name,
      notBefore: atSecond(now - BACKDATE),
      notAfter: atSecond(now + AUTHORITY_DAYS * DAY),
      publicKey,
      extensions: [
        // An authority, which may sign server certificates but no authorities under it.
        extension(OID.basicConstraints, true, sequence(boolean(true), integer(0))),
        // keyCertSign only (bit 5).
        extension(OID.keyUsage, true, bitString(Buffer.from([0x04]), 2)),
        extension(OID.extendedKeyUsage, false, sequence(oid(OID.serverAuth))),
        extension(OID.nameConstraints, true, sequence(contextual(0, true, ...subtrees))),
        extension(OID.subjectKeyIdentifier, false, octetString(keyIdentifier(publicKey))),
      ],
    },
    privateKey,
  );
  const authority = readAuthority(toPem(der), privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  if (!authority.certificate.verify(publicKey) || !authority.certificate.ca) {
    throw new Error("The new certificate authority did not pass its own check.");
  }
  return authority;
}

/** The private key of an authority, as the text kept on disk. */
export const authorityKeyPem = (authority: Authority): string => authority.key.export({ type: "pkcs8", format: "pem" }) as string;

/** The parts of a certificate Node does not hand out: the subject as bytes, and the extensions. */
function dissect(certificate: X509Certificate): { subject: Buffer; extensions: Map<string, Buffer> } {
  const [body] = readChildren(readValue(certificate.raw).content);
  if (!body) throw new Error("Not a certificate.");
  const fields = readChildren(body.content);
  // version, serial, signature algorithm, issuer, validity, subject, key, then extensions in [3].
  const offset = fields[0]?.tag === 0xa0 ? 1 : 0;
  const subject = fields[offset + 4];
  if (!subject) throw new Error("Not a certificate.");
  const extensions = new Map<string, Buffer>();
  const holder = fields.find((field) => field.tag === 0xa3);
  if (holder) {
    for (const item of readChildren(readValue(holder.content).content)) {
      const parts = readChildren(item.content);
      const id = parts[0];
      const value = parts[parts.length - 1];
      if (id?.tag === 0x06 && value?.tag === 0x04) extensions.set(readOid(id.content), value.content);
    }
  }
  return { subject: subject.raw, extensions };
}

/** What an authority's name constraints allow it to sign. Nothing, if it has none that this code understands. */
function readPermits(extensions: Map<string, Buffer>): Permits {
  const permits: Permits = { names: [], blocks: [] };
  const value = extensions.get(OID.nameConstraints);
  if (!value) return permits;
  const permitted = readChildren(readValue(value).content).find((part) => part.tag === 0xa0);
  for (const subtree of permitted ? readChildren(permitted.content) : []) {
    const base = readChildren(subtree.content)[0];
    if (base?.tag === 0x82) permits.names.push(base.content.toString("ascii").toLowerCase());
    else if (base?.tag === 0x87) {
      const block = blockFromBytes(base.content);
      if (block) permits.blocks.push(block);
    }
  }
  return permits;
}

/** Reads an authority back from what is kept on disk, and checks that the key is the certificate's own. */
export function readAuthority(pem: string, keyPem: string): Authority {
  const certificate = new X509Certificate(pem);
  const key = createPrivateKey(keyPem);
  if (!certificate.ca || !certificate.checkPrivateKey(key)) {
    throw new Error("The certificate authority's key and certificate do not belong together.");
  }
  return { certificate, pem: toPem(certificate.raw), key, permits: readPermits(dissect(certificate).extensions) };
}

/** Whether the authority may sign for this name or address. */
export function permitsName(permits: Permits, name: ServerName): boolean {
  if (name.kind === "dns") return permits.names.some((suffix) => underSuffix(name.text, suffix));
  return permits.blocks.some((block) => inBlock(name.bytes, block));
}

/** A new key and a certificate for this server, naming every way it is reached, signed by the authority. */
export function issueServerCertificate(authority: Authority, names: ServerName[], options: { now?: number } = {}): IssuedCertificate {
  if (names.length === 0) throw new Error("A server certificate needs at least one name.");
  const refused = names.find((name) => !permitsName(authority.permits, name));
  if (refused) throw new Error(`The certificate authority may not sign for ${refused.text}.`);
  const now = options.now ?? Date.now();
  const { privateKey, publicKey } = newServerKeyPair();
  // Never valid before or after the authority that signed it.
  const notBefore = Math.max(now - BACKDATE, authority.certificate.validFromDate.getTime());
  const notAfter = Math.min(now + SERVER_DAYS * DAY, authority.certificate.validToDate.getTime());
  if (notAfter <= now) throw new Error("The certificate authority has expired.");
  const authorityKeyId = keyIdentifier(authority.certificate.publicKey);
  const der = assemble(
    {
      issuer: dissect(authority.certificate).subject,
      // Not a host name: the names are in the subject alternative name, where browsers read them.
      subject: distinguishedName("Outpost", "Outpost server certificate"),
      notBefore: atSecond(notBefore),
      notAfter: atSecond(notAfter),
      publicKey,
      extensions: [
        extension(OID.basicConstraints, true, sequence()),
        // digitalSignature only (bit 0): all an ECDSA key does in TLS.
        extension(OID.keyUsage, true, bitString(Buffer.from([0x80]), 7)),
        extension(OID.extendedKeyUsage, false, sequence(oid(OID.serverAuth))),
        extension(OID.subjectAltName, false, sequence(...names.map(generalName))),
        extension(OID.subjectKeyIdentifier, false, octetString(keyIdentifier(publicKey))),
        extension(OID.authorityKeyIdentifier, false, sequence(contextual(0, false, authorityKeyId))),
      ],
    },
    authority.key,
  );
  const certificate = new X509Certificate(der);
  if (!certificate.verify(authority.certificate.publicKey) || !certificate.checkIssued(authority.certificate) || certificate.ca) {
    throw new Error("The new server certificate did not pass its own check.");
  }
  return { certificate, pem: toPem(der), keyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string };
}

/** The names a certificate carries, in the form `parseName` gives. */
export function certificateNames(certificate: X509Certificate): string[] {
  const names: string[] = [];
  const value = dissect(certificate).extensions.get(OID.subjectAltName);
  for (const entry of value ? readChildren(readValue(value).content) : []) {
    const text = entry.tag === 0x82 ? entry.content.toString("ascii") : entry.tag === 0x87 ? addressText(entry.content) : null;
    const parsed = text ? parseName(text) : null;
    if (parsed) names.push(parsed.text);
  }
  return names;
}

function addressText(bytes: Buffer): string | null {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length !== 16) return null;
  return Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16)).join(":");
}

/** A certificate's SHA-256 fingerprint as devices show it: pairs of capitals with colons. */
export const fingerprintOf = (certificate: X509Certificate): string => certificate.fingerprint256;

/** The common name of a certificate's subject, which is how devices list it. */
export function commonNameOf(certificate: X509Certificate): string {
  const line = certificate.subject.split("\n").find((part) => part.startsWith("CN="));
  return line ? line.slice(3) : certificate.subject;
}
