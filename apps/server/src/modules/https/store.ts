/**
 * Where the certificates and their keys are kept: the `tls` folder of the data directory.
 *
 * The folder is readable by the account that runs Outpost and nobody else, and so is
 * each key. No route serves anything from it except public certificates, and it is not
 * one of the folders a backup or a portable drive copies: a key that devices trust
 * should exist in one place.
 *
 * Two sets of files live here. The four at the top are Outpost's own: its certificate
 * authority and the server certificate that authority signed. The `own` folder inside
 * holds a certificate the person brought, as two files they may also put there
 * themselves, or have a renewal script put there. Outpost writes those two only when a
 * person hands it a certificate in Settings, and deletes them only when asked to.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MOST_FILE_BYTES } from "./own.ts";

export const TLS_FOLDER = "tls";

export const TLS_FILES = {
  authorityCertificate: "ca.crt",
  authorityKey: "ca.key",
  serverCertificate: "server.crt",
  serverKey: "server.key",
} as const;

export type TlsFile = keyof typeof TLS_FILES;

const PRIVATE: ReadonlySet<TlsFile> = new Set<TlsFile>(["authorityKey", "serverKey"]);

/** The folder, inside `tls`, for a certificate of the person's own. */
export const OWN_FOLDER = "own";
/**
 * The two files in it, under the names Certbot gives the same two things: the server's
 * certificate followed by its chain, and the key. Both PEM.
 */
export const OWN_FILES = { certificate: "fullchain.pem", key: "privkey.pem" } as const;

export interface OwnFiles {
  /** Null for a file that is not there. */
  certificate: Buffer | null;
  key: Buffer | null;
  /** Changes whenever either file is replaced or rewritten. */
  stamp: string;
  /** When the newer of the two was last written. */
  newest: number;
  /** Set when other accounts on this computer can read the key file: its permissions, such as "644". */
  keyOpenTo: string | null;
}

export interface TlsStore {
  dir: string;
  read(file: TlsFile): string | null;
  /** Writes a file whole or not at all: to a temporary name first, then renamed into place. */
  write(file: TlsFile, text: string): void;
  /** Deletes Outpost's own authority and server certificate, and the folder if nothing else is in it. */
  clear(): void;
  own: {
    dir: string;
    present(): { certificate: boolean; key: boolean };
    /** Reads both files as they are now. Throws, in words for a person, when one is there and cannot be read. */
    read(): OwnFiles;
    write(certificatePem: string, keyPem: string): void;
    /** Deletes the two files, and the folder if nothing else is in it. */
    remove(): void;
  };
}

function writeWhole(file: string, text: string, mode: number): void {
  const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, text, { mode, flag: "wx" });
    fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/** Removes a folder only if it is empty. */
function removeIfEmpty(dir: string): void {
  try {
    fs.rmdirSync(dir);
  } catch {
    // Not empty, or not there: either way there is nothing to do.
  }
}

export function createTlsStore(dataDir: string): TlsStore {
  const dir = path.join(dataDir, TLS_FOLDER);
  const fileOf = (file: TlsFile) => path.join(dir, TLS_FILES[file]);
  const ownDir = path.join(dir, OWN_FOLDER);
  const ownFile = (file: keyof typeof OWN_FILES) => path.join(ownDir, OWN_FILES[file]);

  /** The folder may be older than this rule, or made under a permissive umask. */
  function privateFolder(folder: string): void {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    fs.chmodSync(folder, 0o700);
  }

  function readOwn(file: keyof typeof OWN_FILES): { bytes: Buffer | null; stat: fs.Stats | null } {
    try {
      // Looked at before it is read: the folder is the person's to fill, and what is put there may not be a small file.
      const stat = fs.statSync(ownFile(file));
      if (!stat.isFile()) throw new Error(`${ownFile(file)} is not a file.`);
      if (stat.size > MOST_FILE_BYTES) throw new Error(`${ownFile(file)} is too large to be a certificate or a key.`);
      return { bytes: fs.readFileSync(ownFile(file)), stat };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return { bytes: null, stat: null };
      if (code === "EACCES" || code === "EPERM") {
        throw new Error(
          `Outpost is not allowed to read ${ownFile(file)}. Make it readable by the account Outpost runs as, and by no other.`,
        );
      }
      if (!code && error instanceof Error) throw error;
      throw new Error(`${ownFile(file)} could not be read (${code ?? "unknown error"}).`);
    }
  }

  /** Whether any account but the owner can get at the key: through the file's own permissions and both folders above it. */
  function keyOpenTo(stat: fs.Stats | null): string | null {
    if (!stat || process.platform === "win32" || (stat.mode & 0o077) === 0) return null;
    try {
      if ((fs.statSync(dir).mode & 0o077) === 0 || (fs.statSync(ownDir).mode & 0o077) === 0) return null;
    } catch {
      return null;
    }
    return (stat.mode & 0o777).toString(8);
  }

  return {
    dir,
    read(file) {
      try {
        return fs.readFileSync(fileOf(file), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    write(file, text) {
      privateFolder(dir);
      writeWhole(fileOf(file), text, PRIVATE.has(file) ? 0o600 : 0o644);
    },
    clear() {
      const mine = new Set<string>(Object.values(TLS_FILES));
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        // The four files, and anything a write of one of them was interrupted on.
        const base = entry.replace(/\.[0-9a-f]{12}\.tmp$/, "");
        if (mine.has(base)) fs.rmSync(path.join(dir, entry), { force: true });
      }
      removeIfEmpty(dir);
    },
    own: {
      dir: ownDir,
      present: () => ({ certificate: fs.existsSync(ownFile("certificate")), key: fs.existsSync(ownFile("key")) }),
      read() {
        const certificate = readOwn("certificate");
        const key = readOwn("key");
        const mark = (stat: fs.Stats | null) => (stat ? `${stat.mtimeMs}:${stat.size}:${stat.ino}` : "none");
        return {
          certificate: certificate.bytes,
          key: key.bytes,
          stamp: `${mark(certificate.stat)}|${mark(key.stat)}`,
          newest: Math.max(certificate.stat?.mtimeMs ?? 0, key.stat?.mtimeMs ?? 0),
          keyOpenTo: keyOpenTo(key.stat),
        };
      },
      write(certificatePem, keyPem) {
        // A link here points at files kept by something else (a renewal tool's own folder); those are not Outpost's to replace.
        const link = [ownDir, ownFile("certificate"), ownFile("key")].find((entry) => {
          try {
            return fs.lstatSync(entry).isSymbolicLink();
          } catch {
            return false;
          }
        });
        if (link) {
          throw new Error(
            `${link} is a link to somewhere else, and Outpost does not write through links. Replace the files where they are kept; Outpost takes them up from there.`,
          );
        }
        privateFolder(dir);
        privateFolder(ownDir);
        // The key first, as with the authority: a certificate without its key says "unfinished".
        writeWhole(ownFile("key"), keyPem, 0o600);
        writeWhole(ownFile("certificate"), certificatePem, 0o644);
      },
      remove() {
        fs.rmSync(ownFile("certificate"), { force: true });
        fs.rmSync(ownFile("key"), { force: true });
        removeIfEmpty(ownDir);
        removeIfEmpty(dir);
      },
    },
  };
}
