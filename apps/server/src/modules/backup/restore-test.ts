/**
 * "Test a restore": a stored backup is opened into a scratch copy in the data directory,
 * checked, counted against what is here now, and the copy removed. Nothing live is
 * touched: the database here, its folders and the staging folder a real restore uses are
 * never opened for writing, and the backup itself is only read.
 *
 * The check is the read-back every backup gets (every file against its checksum, the
 * database through SQLite's integrity check), and then what a restore would bring back:
 * the migrations the backup's database has had against this version's, and how many
 * pages, saved places, tracks, documents and contacts it holds against how many are here.
 *
 * A protected backup needs its passphrase. That is held in memory for the one job and
 * never written: a job's payload is kept in the database. If the server stops before the
 * job runs, the job fails and says to start the test again.
 */
import fs from "node:fs";
import path from "node:path";
import type { RestoreTestResult } from "@outpost/shared";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, messageOf } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { type JobRow, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { migrationCount, verifyBackupFile } from "./archive.ts";
import { assertPassphraseRight, passphraseField } from "./protection.ts";
import { parseBackupName } from "./stored.ts";

export const RESTORE_TEST_JOB = "backup.test-restore";
const SUBJECT = "backup-test";
/** The last test's result: a fact about this library, kept with the others. */
const RESULT_KEY = "backup.restoreTest";
/** The scratch folder, inside the data directory (a local disk), removed whole after each test. */
export const SCRATCH = "restore-test";

const body = z.object({ passphrase: passphraseField.optional() }).strict();

/** What is counted, in the order the screen lists it. A table an older backup does not have counts as none. */
const COUNTED: Array<{ what: string; table: string; where?: string }> = [
  { what: "Pages", table: "notes", where: "trashed_at IS NULL" },
  { what: "Saved places", table: "markers" },
  { what: "Tracks and routes", table: "tracks" },
  { what: "Documents", table: "documents" },
  { what: "Contacts", table: "contacts" },
];

function countIn(db: Database.Database): number[] {
  return COUNTED.map(({ table, where }) => {
    try {
      return (db.prepare(`SELECT count(*) AS n FROM "${table}"${where ? ` WHERE ${where}` : ""}`).get() as { n: number }).n;
    } catch {
      return 0;
    }
  });
}

export interface RestoreTests {
  last(): RestoreTestResult | null;
  active(): JobRow | undefined;
}

export function registerRestoreTest(
  app: FastifyInstance,
  ctx: AppContext,
  storedFile: (name: string) => Promise<{ file: string; stat: fs.Stats }>,
  changed: () => void,
): RestoreTests {
  const { dataDir } = ctx.config;
  /** Passphrases for jobs not yet run, by a token in the job's payload. Never written anywhere. */
  const passphrases = new Map<string, string>();

  function last(): RestoreTestResult | null {
    const row = ctx.sqlite.prepare("SELECT value FROM library_meta WHERE key = ?").get(RESULT_KEY) as { value: string } | undefined;
    try {
      const value = JSON.parse(row?.value ?? "null") as RestoreTestResult | null;
      return value && typeof value.at === "number" && typeof value.ok === "boolean" ? value : null;
    } catch {
      return null;
    }
  }

  function record(result: RestoreTestResult): void {
    ctx.sqlite
      .prepare("INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(RESULT_KEY, JSON.stringify(result));
    changed();
  }

  const active = () =>
    ctx.jobs
      .findBySubject(SUBJECT)
      .filter((job) => job.state === "queued" || job.state === "running" || job.state === "paused")
      .at(-1);

  ctx.jobs.register<{ name: string; protected: boolean; token: string }>(RESTORE_TEST_JOB, {
    queue: "backup",
    async run(run) {
      const started = Date.now();
      const { name } = run.payload;
      const passphrase = passphrases.get(run.payload.token);
      passphrases.delete(run.payload.token);
      const createdAt = parseBackupName(name)?.createdAt ?? 0;
      const base = { at: 0, name, backupCreatedAt: createdAt, entries: null, migrations: null, counts: [] };
      if (run.payload.protected && passphrase === undefined) {
        throw new PermanentJobError("The passphrase for this backup is not held any more (Outpost was restarted). Start the test again.");
      }
      const scratch = path.join(dataDir, SCRATCH);
      await fs.promises.rm(scratch, { recursive: true, force: true });
      await fs.promises.mkdir(scratch);
      try {
        run.progress({ message: "Reading the backup into a scratch copy" });
        const { file } = await storedFile(name);
        let found: { migrations: number; counts: number[] } | undefined;
        const check = await verifyBackupFile(
          file,
          scratch,
          run.signal,
          passphrase === undefined ? undefined : { passphrase },
          (database) => {
            const copy = new Database(database, { readonly: true });
            try {
              found = { migrations: migrationCount(database), counts: countIn(copy) };
            } finally {
              copy.close();
            }
          },
        );
        const now = countIn(ctx.sqlite);
        const current = migrationCount(path.join(dataDir, "outpost.db"));
        const migrations = { backup: found?.migrations ?? 0, current };
        // A backup from a newer Outpost cannot be restored here: its database has changes this version does not know.
        const newer = migrations.backup > current;
        const result: RestoreTestResult = {
          ...base,
          at: Date.now(),
          ok: !newer,
          problem: newer
            ? `It was made by a newer version of Outpost (${check.manifest.appVersion}). Update Outpost before restoring it.`
            : null,
          appVersion: check.manifest.appVersion,
          entries: check.entries,
          migrations,
          counts: COUNTED.map((entry, index) => ({ what: entry.what, inBackup: found?.counts[index] ?? 0, now: now[index] ?? 0 })),
          durationMs: Date.now() - started,
        };
        record(result);
        return { ok: result.ok, entries: check.entries };
      } catch (error) {
        if (run.signal.aborted) throw error;
        const problem = messageOf(error);
        record({ ...base, at: Date.now(), ok: false, problem, appVersion: null, durationMs: Date.now() - started });
        throw new PermanentJobError(`The test restore found a problem: ${problem}`);
      } finally {
        await fs.promises.rm(scratch, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  });

  /** Starts a test of one stored backup. Reading changes nothing, so any device may; a passphrase is held to its own rule. */
  app.post<{ Params: { name: string } }>("/api/backup/stored/:name/test", async (request) => {
    const { passphrase } = body.parse(request.body ?? {});
    const sealed = request.params.name.endsWith(".enc");
    if (sealed && passphrase === undefined) throw badRequest("Type the passphrase this backup was made under.");
    if (passphrase !== undefined) assertPassphraseRight(request, ctx, "Testing a protected backup");
    await storedFile(request.params.name);
    if (active()) throw conflict("A restore is already being tested.");
    const token = newId();
    if (passphrase !== undefined) passphrases.set(token, passphrase);
    const job = ctx.jobs.enqueue(
      RESTORE_TEST_JOB,
      { name: request.params.name, protected: sealed, token },
      { title: "Test a restore", subject: SUBJECT },
    );
    return { job: toJobDto(job) };
  });

  return { last, active };
}
