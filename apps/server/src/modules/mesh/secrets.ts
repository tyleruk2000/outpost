/**
 * The mesh link's two secrets, kept the way the HTTPS key is (modules/https/store.ts):
 * in a folder of the data directory that only the account running Outpost can read
 * (`mesh/`, 0700), in one file it alone can read (`secrets.json`, 0600), written whole or
 * not at all. Not in the database, so not in a backup and not on a portable drive; never
 * logged, and never sent back by the API, which says only whether one is set.
 *
 *  - The password a radio signs in to Outpost's broker with. Outpost only has to check
 *    it, so it keeps a scrypt hash, and compares in constant time.
 *  - The password Outpost signs in to the household's broker with. That one Outpost has
 *    to present, so it is kept as it is, protected by the file's permissions alone, as
 *    the HTTPS key is. Anyone who can read the data directory as that account can read it.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MESH_FOLDER = "mesh";
const FILE = "secrets.json";
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

interface Stored {
  broker?: { salt: string; hash: string };
  client?: { password: string };
}

export interface MeshSecrets {
  brokerPasswordSet(): boolean;
  setBrokerPassword(password: string | null): void;
  /** Whether a password a radio gave is the one set. False when none is set. */
  checkBrokerPassword(password: Buffer): boolean;
  clientPassword(): string | null;
  setClientPassword(password: string | null): void;
  /** Deletes the file, and the folder if nothing else is in it. */
  erase(): void;
  dir: string;
}

export function createMeshSecrets(dataDir: string): MeshSecrets {
  const dir = path.join(dataDir, MESH_FOLDER);
  const file = path.join(dir, FILE);
  let cache: Stored | null = null;

  function read(): Stored {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Stored;
      cache = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      cache = {};
    }
    return cache;
  }

  function write(next: Stored): void {
    if (!next.broker && !next.client) {
      fs.rmSync(file, { force: true });
      cache = {};
      return;
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: "wx" });
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, file);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
    cache = next;
  }

  const hash = (password: Buffer, salt: Buffer) => scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });

  return {
    dir,
    brokerPasswordSet: () => Boolean(read().broker),
    setBrokerPassword(password) {
      const current = read();
      if (password === null) {
        const { broker: _gone, ...rest } = current;
        write(rest);
        return;
      }
      const salt = randomBytes(16);
      write({ ...current, broker: { salt: salt.toString("base64"), hash: hash(Buffer.from(password, "utf8"), salt).toString("base64") } });
    },
    checkBrokerPassword(password) {
      const broker = read().broker;
      if (!broker) return false;
      const expected = Buffer.from(broker.hash, "base64");
      const given = hash(password, Buffer.from(broker.salt, "base64"));
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
    clientPassword: () => read().client?.password ?? null,
    setClientPassword(password) {
      const current = read();
      if (password === null) {
        const { client: _gone, ...rest } = current;
        write(rest);
      } else write({ ...current, client: { password } });
    },
    erase() {
      fs.rmSync(file, { force: true });
      cache = {};
      try {
        fs.rmdirSync(dir);
      } catch {
        // Not empty, or not there.
      }
    },
  };
}
