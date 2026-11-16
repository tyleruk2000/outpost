/**
 * Certificates for the tests of "a certificate of your own": any chain, any dates, any
 * names, any key, right or wrong. Laid out here with the DER encoders and signed by
 * Node, so that nothing depends on a program being installed.
 */
import { generateKeyPairSync, type KeyObject, randomBytes, sign, X509Certificate } from "node:crypto";
import { toPem } from "../src/modules/https/certificates.ts";
import {
  bitString,
  boolean,
  contextual,
  integer,
  nullValue,
  octetString,
  oid,
  sequence,
  setOfOne,
  time,
  utf8String,
} from "../src/modules/https/der.ts";
import { parseName } from "../src/modules/https/names.ts";

const DAY = 24 * 60 * 60 * 1000;

const SIGNATURES: Record<string, { hash: string; id: Buffer }> = {
  "rsa:sha256": { hash: "sha256", id: sequence(oid("1.2.840.113549.1.1.11"), nullValue()) },
  "rsa:sha1": { hash: "sha1", id: sequence(oid("1.2.840.113549.1.1.5"), nullValue()) },
  "ec:sha256": { hash: "sha256", id: sequence(oid("1.2.840.10045.4.3.2")) },
  "ec:sha1": { hash: "sha1", id: sequence(oid("1.2.840.10045.4.1")) },
};

export type KeyKind = "p256" | "p384" | "p521" | "rsa2048" | "rsa1024" | "ed25519";

export function makeKey(kind: KeyKind = "p256"): { privateKey: KeyObject; publicKey: KeyObject } {
  if (kind === "rsa2048") return generateKeyPairSync("rsa", { modulusLength: 2048 });
  if (kind === "rsa1024") return generateKeyPairSync("rsa", { modulusLength: 1024 });
  if (kind === "ed25519") return generateKeyPairSync("ed25519");
  return generateKeyPairSync("ec", { namedCurve: kind === "p256" ? "prime256v1" : kind === "p384" ? "secp384r1" : "secp521r1" });
}

export interface Made {
  certificate: X509Certificate;
  pem: string;
  der: Buffer;
  key: KeyObject;
  /** The key as unencrypted PKCS#8 PEM. */
  keyPem: string;
  name: string;
}

export interface MakeOptions {
  /** The common name. */
  name: string;
  /** Who signs it. Left out, it signs itself. */
  issuer?: Made;
  key?: KeyKind;
  /** Names and addresses for the subject alternative name. `*.example.net` is allowed. */
  names?: string[];
  /** An authority (basic constraints CA) rather than a server. */
  authority?: boolean;
  /** Days from now, negative for the past. */
  from?: number;
  until?: number;
  /** Extended key usage, as object identifiers. Default: server authentication for a server, none for an authority. */
  purposes?: string[];
  /** Says where the issuer's certificate can be fetched, as a public authority's certificates do. */
  issuerAddress?: string;
  hash?: "sha256" | "sha1";
}

const nameOf = (commonName: string) => sequence(setOfOne(sequence(oid("2.5.4.3"), utf8String(commonName))));
const extension = (id: string, critical: boolean, value: Buffer) =>
  sequence(oid(id), ...(critical ? [boolean(true)] : []), octetString(value));

function generalName(text: string): Buffer {
  if (text.startsWith("*.")) return contextual(2, false, Buffer.from(text, "ascii"));
  const parsed = parseName(text);
  if (!parsed) throw new Error(`not a name: ${text}`);
  return parsed.kind === "dns" ? contextual(2, false, Buffer.from(parsed.text, "ascii")) : contextual(7, false, parsed.bytes);
}

/** One certificate, signed by `issuer` or by itself. */
export function make(options: MakeOptions): Made {
  const { privateKey, publicKey } = makeKey(options.key ?? "p256");
  const signer = options.issuer?.key ?? privateKey;
  const family = signer.asymmetricKeyType === "rsa" ? "rsa" : "ec";
  const signature = SIGNATURES[`${family}:${options.hash ?? "sha256"}`];
  if (!signature) throw new Error("no such signature");
  const now = Date.now();
  const second = (ms: number) => new Date(Math.floor(ms / 1000) * 1000);
  const purposes = options.purposes ?? (options.authority ? [] : ["1.3.6.1.5.5.7.3.1"]);
  const extensions = [
    extension("2.5.29.19", true, options.authority ? sequence(boolean(true)) : sequence()),
    ...(purposes.length > 0 ? [extension("2.5.29.37", false, sequence(...purposes.map((id) => oid(id))))] : []),
    ...(options.names && options.names.length > 0 ? [extension("2.5.29.17", false, sequence(...options.names.map(generalName)))] : []),
    ...(options.issuerAddress
      ? [
          extension(
            "1.3.6.1.5.5.7.1.1",
            false,
            sequence(sequence(oid("1.3.6.1.5.5.7.48.2"), contextual(6, false, Buffer.from(options.issuerAddress, "ascii")))),
          ),
        ]
      : []),
  ];
  const serial = randomBytes(12);
  serial[0] = ((serial[0] ?? 0) & 0x7f) | 0x40;
  const body = sequence(
    contextual(0, true, integer(2)),
    integer(serial),
    signature.id,
    nameOf(options.issuer?.name ?? options.name),
    sequence(time(second(now + (options.from ?? -1) * DAY)), time(second(now + (options.until ?? 90) * DAY))),
    nameOf(options.name),
    publicKey.export({ type: "spki", format: "der" }),
    contextual(3, true, sequence(...extensions)),
  );
  // Ed25519 signs without a separate hash; nothing here is signed by such a key.
  const der = sequence(body, signature.id, bitString(sign(signature.hash, body, signer)));
  return {
    certificate: new X509Certificate(der),
    pem: toPem(der),
    der,
    key: privateKey,
    keyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    name: options.name,
  };
}

/** A private authority with an intermediate under it, as a home or company authority is often set up. */
export function makeAuthority(name = "Hill House Root"): { root: Made; intermediate: Made } {
  const root = make({ name, authority: true, until: 3650, key: "p256" });
  const intermediate = make({ name: `${name} Issuing 1`, authority: true, issuer: root, until: 1800, key: "p256" });
  return { root, intermediate };
}
