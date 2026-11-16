/**
 * Reading a PKCS#12 file (`.pfx`, `.p12`): one file holding a certificate, its chain and
 * its key, protected by a password. Windows and many appliances export this form.
 *
 * Node can load such a file into a TLS listener, but it will not hand the key back, and
 * Outpost has to keep the key in a form it can load again without the password (it does
 * not store passwords). So this file walks the container (RFC 7292) with the DER reader
 * and takes the pieces out:
 *
 *  - the key and the certificates are decrypted with Node's PBKDF2, AES and triple DES,
 *    and the key is then read by Node (`createPrivateKey`). The only arithmetic of this
 *    file's own is the PKCS#12 key derivation that the older triple-DES form uses
 *    (RFC 7292, appendix B).
 *
 * A file says how much work opening it takes (how many rounds of key derivation), so
 * every derivation is done here, where the count is looked at first and a file asking
 * for more than any real one does is refused. That is also why the file is not handed
 * to OpenSSL whole to check its integrity code: OpenSSL would do whatever count the
 * file names. A wrong password shows instead as contents that do not decrypt, and the
 * key is checked against the certificate afterwards in any case.
 *
 * What it does not read: files whose certificates are encrypted with RC2 (the default
 * of old tools; OpenSSL 3 as Node ships it has no RC2), and files written with
 * indefinite lengths (BER) rather than DER. Both are refused with the command that
 * converts them.
 */
import { createDecipheriv, createHash, createPrivateKey, type KeyObject, pbkdf2Sync } from "node:crypto";
import { type DerValue, readChildren, readOid, readValue } from "./der.ts";

const OID = {
  data: "1.2.840.113549.1.7.1",
  encryptedData: "1.2.840.113549.1.7.6",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  shroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
  x509Certificate: "1.2.840.113549.1.9.22.1",
  pbes2: "1.2.840.113549.1.5.13",
  pbkdf2: "1.2.840.113549.1.5.12",
  pbeSha1TripleDes: "1.2.840.113549.1.12.1.3",
  pbeSha1Rc2With128: "1.2.840.113549.1.12.1.5",
  pbeSha1Rc2With40: "1.2.840.113549.1.12.1.6",
};

/** The pseudo-random functions PBKDF2 is used with, by object identifier. HMAC-SHA-1 is the default when none is named. */
const PRF: Record<string, string> = {
  "1.2.840.113549.2.7": "sha1",
  "1.2.840.113549.2.9": "sha256",
  "1.2.840.113549.2.10": "sha384",
  "1.2.840.113549.2.11": "sha512",
};

/** The ciphers PBES2 is used with, by object identifier: Node's name and the key length in bytes. */
const CIPHER: Record<string, { name: string; keyLength: number }> = {
  "2.16.840.1.101.3.4.1.2": { name: "aes-128-cbc", keyLength: 16 },
  "2.16.840.1.101.3.4.1.22": { name: "aes-192-cbc", keyLength: 24 },
  "2.16.840.1.101.3.4.1.42": { name: "aes-256-cbc", keyLength: 32 },
  "1.2.840.113549.3.7": { name: "des-ede3-cbc", keyLength: 24 },
};

/**
 * More rounds than this is not a real file, and deriving the key would hold the server
 * up. Tools write 2,000 to 600,000 for PBKDF2, which Node does natively; the older
 * derivation is done here in JavaScript, where tools write 2,000 to 100,000.
 */
const MOST_ROUNDS = 5_000_000;
const MOST_OLD_ROUNDS = 250_000;
const TOO_MUCH_WORK = "This file asks for more work to open than any real one does, so it was not read.";

const CONVERT =
  "Convert it with OpenSSL: openssl pkcs12 -in file.pfx -nodes -out pair.pem (add -legacy for a very old file), then give Outpost pair.pem.";

/** An error whose words are for the person who gave the file. */
export class Pkcs12Error extends Error {}

export interface Pkcs12Contents {
  /** Every certificate in the file, as DER, in the order the file holds them. */
  certificates: Buffer[];
  /** The private key. Null when the file holds certificates only. */
  key: KeyObject | null;
}

/** Whether these bytes begin the way a PKCS#12 file does: a sequence that opens with the version number 3. */
export function looksLikePkcs12(buffer: Buffer): boolean {
  try {
    const [version, authSafe] = readChildren(readValue(buffer).content);
    return (
      buffer[0] === 0x30 && version?.tag === 0x02 && version.content.length === 1 && version.content[0] === 3 && authSafe?.tag === 0x30
    );
  } catch {
    // An indefinite length (BER) stops the reader; such a file still begins 30 80 02 01 03.
    return buffer.length > 5 && buffer[0] === 0x30 && buffer[1] === 0x80 && buffer.subarray(2, 5).equals(Buffer.from([0x02, 0x01, 0x03]));
  }
}

/** What follows the algorithm's identifier: its parameters, laid out as the algorithm says. */
function algorithm(value: DerValue): { id: string; parameters: DerValue | undefined } {
  const [id, parameters] = readChildren(value.content);
  if (id?.tag !== 0x06) throw new Error("not an algorithm");
  return { id: readOid(id.content), parameters };
}

const wholeNumber = (value: DerValue | undefined): number => {
  if (value?.tag !== 0x02 || value.content.length > 6) throw new Error("not a number");
  return value.content.readUIntBE(0, value.content.length);
};

/** A password as PKCS#12's own key derivation takes it: UTF-16, high byte first, ending in a zero character. */
const asBmp = (password: string): Buffer => Buffer.concat([Buffer.from(password, "utf16le").swap16(), Buffer.alloc(2)]);

/**
 * The key derivation of RFC 7292, appendix B.2, with SHA-1. `purpose` is 1 for a key
 * and 2 for an initialisation vector.
 */
function pkcs12Derive(password: Buffer, salt: Buffer, purpose: 1 | 2, rounds: number, length: number): Buffer {
  const block = 64;
  const fill = (source: Buffer): Buffer => {
    if (source.length === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(block * Math.ceil(source.length / block));
    for (let index = 0; index < out.length; index += 1) out[index] = source[index % source.length] ?? 0;
    return out;
  };
  const diversifier = Buffer.alloc(block, purpose);
  const input = Buffer.concat([fill(salt), fill(password)]);
  const parts: Buffer[] = [];
  for (let made = 0; ; ) {
    let digest = createHash("sha1").update(diversifier).update(input).digest();
    for (let round = 1; round < rounds; round += 1) digest = createHash("sha1").update(digest).digest();
    parts.push(digest);
    made += digest.length;
    if (made >= length) break;
    // Each 64-byte block of the input has the digest (repeated to 64 bytes) and one added to it.
    const addend = fill(digest).subarray(0, block);
    for (let start = 0; start < input.length; start += block) {
      let carry = 1;
      for (let index = block - 1; index >= 0; index -= 1) {
        const sum = (input[start + index] ?? 0) + (addend[index] ?? 0) + carry;
        input[start + index] = sum & 0xff;
        carry = sum >> 8;
      }
    }
  }
  return Buffer.concat(parts).subarray(0, length);
}

function decipher(name: string, key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const cipher = createDecipheriv(name, key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

const UNREADABLE = `This file is encrypted in a way Outpost does not read. ${CONVERT}`;

/**
 * Works out, from how a sealed part says it is encrypted, the function that opens it
 * with this password. Throws here for a method that is not read or a file that is not
 * laid out as it should be; the function it returns throws when the password is wrong.
 */
function opener(method: { id: string; parameters: DerValue | undefined }, password: string): (data: Buffer) => Buffer {
  if (method.id === OID.pbeSha1Rc2With40 || method.id === OID.pbeSha1Rc2With128) {
    throw new Pkcs12Error(`This file's certificates are encrypted with RC2, an old method this server cannot read. ${CONVERT}`);
  }
  if (!method.parameters) throw new Error("no parameters");
  if (method.id === OID.pbeSha1TripleDes) {
    const [salt, rounds] = readChildren(method.parameters.content);
    if (salt?.tag !== 0x04) throw new Error("no salt");
    const count = wholeNumber(rounds);
    if (count > MOST_OLD_ROUNDS) throw new Pkcs12Error(TOO_MUCH_WORK);
    // No password at all is written two ways by different tools: as an empty string, and as nothing.
    const forms = password === "" ? [asBmp(""), Buffer.alloc(0)] : [asBmp(password)];
    return (data) => {
      let failure: unknown;
      for (const form of forms) {
        try {
          return decipher(
            "des-ede3-cbc",
            pkcs12Derive(form, salt.content, 1, count, 24),
            pkcs12Derive(form, salt.content, 2, count, 8),
            data,
          );
        } catch (error) {
          failure = error;
        }
      }
      throw failure;
    };
  }
  if (method.id === OID.pbes2) {
    const [derivation, scheme] = readChildren(method.parameters.content);
    if (!derivation || !scheme) throw new Error("no parameters");
    const kdf = algorithm(derivation);
    const cipher = algorithm(scheme);
    const known = CIPHER[cipher.id];
    const iv = cipher.parameters;
    if (kdf.id !== OID.pbkdf2 || !kdf.parameters || !known || iv?.tag !== 0x04) throw new Pkcs12Error(UNREADABLE);
    const fields = readChildren(kdf.parameters.content);
    const salt = fields[0];
    if (salt?.tag !== 0x04) throw new Error("no salt");
    const count = wholeNumber(fields[1]);
    if (count > MOST_ROUNDS) throw new Pkcs12Error(TOO_MUCH_WORK);
    const named = fields.find((field, index) => index > 1 && field.tag === 0x30);
    const digest = named ? PRF[algorithm(named).id] : "sha1";
    if (!digest) throw new Pkcs12Error(UNREADABLE);
    return (data) =>
      decipher(known.name, pbkdf2Sync(Buffer.from(password, "utf8"), salt.content, count, known.keyLength, digest), iv.content, data);
  }
  throw new Pkcs12Error(UNREADABLE);
}

/**
 * Opens one sealed part and reads what is inside. The file's integrity code is not
 * consulted (see the top of this file), so a wrong password is known by its effect:
 * the part does not decrypt, or decrypts to something that is not what was sealed.
 */
function unseal<T>(method: DerValue, data: Buffer, password: string, read: (plain: Buffer) => T): T {
  const open = opener(algorithm(method), password);
  try {
    return read(open(data));
  } catch (error) {
    if (error instanceof Pkcs12Error) throw error;
    throw new Pkcs12Error(
      password === ""
        ? "This file is protected by a password. Type the password it was exported with."
        : "That is not the password this file was exported with.",
    );
  }
}

/** Takes the certificates and the key out of the bags of one part of the file. */
function readBags(contents: Buffer, password: string, into: { certificates: Buffer[]; keys: KeyObject[] }): void {
  for (const bag of readChildren(readValue(contents).content)) {
    const [id, holder] = readChildren(bag.content);
    if (id?.tag !== 0x06 || holder?.tag !== 0xa0) continue;
    const kind = readOid(id.content);
    const value = readValue(holder.content);
    if (kind === OID.certBag) {
      const [type, wrapped] = readChildren(value.content);
      if (type?.tag !== 0x06 || readOid(type.content) !== OID.x509Certificate || wrapped?.tag !== 0xa0) continue;
      const certificate = readValue(wrapped.content);
      if (certificate.tag === 0x04) into.certificates.push(Buffer.from(certificate.content));
    } else if (kind === OID.keyBag) {
      into.keys.push(createPrivateKey({ key: Buffer.from(value.raw), format: "der", type: "pkcs8" }));
    } else if (kind === OID.shroudedKeyBag) {
      // An encrypted PKCS#8 structure: how it is encrypted, then the encrypted key.
      const [method, sealed] = readChildren(value.content);
      if (!method || sealed?.tag !== 0x04) throw new Error("no key");
      into.keys.push(unseal(method, sealed.content, password, (plain) => createPrivateKey({ key: plain, format: "der", type: "pkcs8" })));
    }
  }
}

/** The contents of an octet string that may be written whole or in pieces. */
function octets(value: DerValue): Buffer {
  if (value.tag === 0x04) return value.content;
  if (value.tag === 0x24) return Buffer.concat(readChildren(value.content).map(octets));
  throw new Error("not an octet string");
}

/**
 * Opens a PKCS#12 file with its password and returns what is inside. Throws a
 * `Pkcs12Error`, worded for a person, for a wrong password or a file it cannot read.
 */
export function readPkcs12(file: Buffer, password: string): Pkcs12Contents {
  const found = { certificates: [] as Buffer[], keys: [] as KeyObject[] };
  try {
    const [, authSafe] = readChildren(readValue(file).content);
    if (!authSafe) throw new Error("empty");
    const [type, holder] = readChildren(authSafe.content);
    if (type?.tag !== 0x06 || readOid(type.content) !== OID.data || holder?.tag !== 0xa0) {
      throw new Pkcs12Error(`This file is protected with a certificate rather than a password, which Outpost does not read. ${CONVERT}`);
    }
    for (const part of readChildren(readValue(octets(readValue(holder.content))).content)) {
      const [partType, partHolder] = readChildren(part.content);
      if (partType?.tag !== 0x06 || partHolder?.tag !== 0xa0) continue;
      const kind = readOid(partType.content);
      if (kind === OID.data) {
        readBags(octets(readValue(partHolder.content)), password, found);
      } else if (kind === OID.encryptedData) {
        // version, then: content type, how it is encrypted, and the encrypted bytes in [0].
        const [, info] = readChildren(readValue(partHolder.content).content);
        const [, method, sealed] = info ? readChildren(info.content) : [];
        if (!method || !sealed) throw new Error("no content");
        const bytes = sealed.tag === 0x80 ? sealed.content : Buffer.concat(readChildren(sealed.content).map(octets));
        unseal(method, bytes, password, (plain) => readBags(plain, password, found));
      }
    }
  } catch (error) {
    if (error instanceof Pkcs12Error) throw error;
    throw new Pkcs12Error(`This file could not be read as PKCS#12 (.pfx, .p12). ${CONVERT}`);
  }
  if (found.keys.length > 1) {
    throw new Pkcs12Error("This file holds more than one private key. Export the server's certificate and its key by themselves.");
  }
  return { certificates: found.certificates, key: found.keys[0] ?? null };
}
