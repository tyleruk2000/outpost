/**
 * Where the certificates and their keys are kept: the `tls` folder of the data directory.
 *
 * The folder is readable by the account that runs Outpost and nobody else, and so is
 * each key. No route serves anything from it except the authority's public certificate,
 * and it is not one of the folders a backup or a portable drive copies: a key that
 * devices trust should exist in one place.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TLS_FOLDER = "tls";

export const TLS_FILES = {
  authorityCertificate: "ca.crt",
  authorityKey: "ca.key",
  serverCertificate: "server.crt",
  serverKey: "server.key",
} as const;

export type TlsFile = keyof typeof TLS_FILES;

const PRIVATE: ReadonlySet<TlsFile> = new Set<TlsFile>(["authorityKey", "serverKey"]);

export interface TlsStore {
  dir: string;
  read(file: TlsFile): string | null;
  /** Writes a file whole or not at all: to a temporary name first, then renamed into place. */
  write(file: TlsFile, text: string): void;
  /** Deletes the folder and everything in it. */
  clear(): void;
}

export function createTlsStore(dataDir: string): TlsStore {
  const dir = path.join(dataDir, TLS_FOLDER);
  const fileOf = (file: TlsFile) => path.join(dir, TLS_FILES[file]);

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
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      // The folder may be older than this rule, or made under a permissive umask.
      fs.chmodSync(dir, 0o700);
      const mode = PRIVATE.has(file) ? 0o600 : 0o644;
      const temporary = `${fileOf(file)}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        fs.writeFileSync(temporary, text, { mode, flag: "wx" });
        fs.chmodSync(temporary, mode);
        fs.renameSync(temporary, fileOf(file));
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        throw error;
      }
    },
    clear() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
