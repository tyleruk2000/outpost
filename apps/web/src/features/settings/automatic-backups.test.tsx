import type { BackupSchedule, BackupStatus, StoredBackup, StoredBackupsResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/utils";
import { BackupSection } from "./backup-section";
import { backupSummary, scheduleText, waitingTitle } from "./backup-text";

const HOUR = 60 * 60 * 1000;
const local = { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" } as const;
const remote = { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" } as const;

const schedule = (change: Partial<BackupSchedule> = {}): BackupSchedule => ({
  settings: { locationId: "nas", frequency: "daily", time: "03:00", weekday: 0, keep: 7 },
  folder: "outpost-backups",
  location: { id: "nas", name: "NAS", connected: true },
  lastBackupAt: Date.now() - 2 * HOUR,
  nextRunAt: new Date(2026, 10, 17, 3, 0).getTime(),
  waiting: null,
  lastFailure: null,
  active: null,
  right: local,
  away: null,
  kept: null,
  restoreTest: null,
  restoreTestActive: null,
  ...change,
});

const off = (change: Partial<BackupSchedule> = {}) =>
  schedule({
    settings: { locationId: null, frequency: "daily", time: "03:00", weekday: 0, keep: 7 },
    location: null,
    lastBackupAt: null,
    nextRunAt: null,
    ...change,
  });

const NEWER = new Date(2026, 10, 16, 3, 0).getTime();
const OLDER = new Date(2026, 10, 15, 3, 0).getTime();
const backup = (change: Partial<StoredBackup> = {}): StoredBackup => ({
  name: "outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip",
  kind: "scheduled",
  createdAt: NEWER,
  sizeBytes: 12_400_000,
  appVersion: "0.1.0",
  check: "verified",
  checkedAt: NEWER + 60_000,
  protected: false,
  currentPassphrase: null,
  ...change,
});

const locations = [
  { id: "internal", name: "Internal storage", status: "available" },
  { id: "nas", name: "NAS", status: "available" },
  { id: "usb", name: "USB drive", status: "unavailable" },
];

let requests: Array<{ call: string; body?: unknown }> = [];

function serve(options: {
  schedule: BackupSchedule;
  after?: BackupSchedule;
  backups?: StoredBackup[];
  stored?: StoredBackupsResponse;
  status?: Partial<BackupStatus>;
}) {
  requests = [];
  let current = options.schedule;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") {
        requests.push({ call: `${method} ${url.pathname}`, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        current = options.after ?? current;
      }
      if (url.pathname === "/api/backup/status") {
        return json({
          restorePending: false,
          previousData: [],
          supervised: false,
          right: current.right,
          protection: {
            on: false,
            setAt: null,
            right: { allowed: current.right.allowed, reason: current.right.allowed ? "local" : "remote" },
          },
          ...options.status,
        });
      }
      if (url.pathname === "/api/backup/schedule") return json(current);
      if (url.pathname === "/api/backup/stored")
        return json(options.stored ?? { available: true, reason: null, backups: options.backups ?? [] });
      if (url.pathname === "/api/storage/locations") return json({ roots: [], locations });
      if (url.pathname === "/api/backup/run") return json({ job: { id: "j1" } });
      if (url.pathname.endsWith("/restore"))
        return json({ staged: true, createdAt: "2026-11-16T03:00:00.000Z", appVersion: "0.1.0", supervised: false });
      if (url.pathname.startsWith("/api/backup/stored/")) return json({ ok: true });
      return json({}, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BackupSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return () => screen.findByRole("region", { name: "Automatic backups" });
}

afterEach(() => vi.unstubAllGlobals());

describe("the words for a schedule", () => {
  it("says when the last backup was and when the next is due", () => {
    expect(backupSummary(off())).toBe("Automatic backups are off.");
    expect(backupSummary(schedule({ lastBackupAt: null }))).toBe(
      `No backup has been made yet. Next one ${formatDateTime(schedule().nextRunAt!)}.`,
    );
    expect(backupSummary(schedule())).toBe(`Last backup 2 hours ago. Next one ${formatDateTime(schedule().nextRunAt!)}.`);
    expect(scheduleText(schedule().settings)).toBe("Every day at 03:00");
    expect(scheduleText({ ...schedule().settings, frequency: "weekly", weekday: 3, time: "21:30" })).toBe("Every Wednesday at 21:30");
  });

  it("does not promise a next one while one is owed", () => {
    const waiting = { dueAt: NEWER, reason: "not_connected", message: "…" } as const;
    expect(backupSummary(schedule({ lastBackupAt: Date.now() - 72 * HOUR, waiting }))).toBe("Last backup 3 days ago.");
    expect(waitingTitle(waiting)).toBe(`The backup due ${formatDateTime(NEWER)} has not been made`);
    expect(waitingTitle({ ...waiting, reason: "failed" })).toBe(`The backup due ${formatDateTime(NEWER)} failed`);
  });
});

describe("automatic backups in Settings", () => {
  it("is off until a location is chosen, and says there that a backup is not encrypted", async () => {
    serve({ schedule: off(), after: schedule({ lastBackupAt: null }) });
    const section = await show()();

    expect(await within(section).findByRole("combobox", { name: "Keep backups on" })).toHaveTextContent("Off");
    expect(within(section).getAllByText(/as they are, not encrypted: anyone who can open that folder can read them/)).toHaveLength(1);
    expect(within(section).getByText("outpost-backups")).toBeVisible();
    // Nothing about a schedule is offered until there is somewhere to keep them.
    expect(within(section).queryByRole("button", { name: "Back up now" })).not.toBeInTheDocument();
    expect(within(section).queryByText("How many to keep")).not.toBeInTheDocument();

    await userEvent.click(within(section).getByRole("combobox", { name: "Keep backups on" }));
    // A location that is not connected cannot be chosen.
    const away = await screen.findByRole("option", { name: /USB drive/ });
    expect(away).toHaveAttribute("aria-disabled", "true");
    expect(away).toHaveTextContent("Not connected");
    await userEvent.click(screen.getByRole("option", { name: "NAS" }));
    expect(requests).toEqual([{ call: "PATCH /api/backup/schedule", body: { locationId: "nas" } }]);
    expect(await within(section).findByRole("button", { name: "Back up now" })).toBeEnabled();
    expect(within(section).getByText(/^No backup has been made yet\. Next one/)).toBeVisible();
    expect(await within(section).findByText(/None yet\. The first is made at the next scheduled time/)).toBeVisible();
  });

  it("says in plain words why a backup that was due has not been made", async () => {
    const message =
      '"NAS" is not connected. The backup will be made when it is connected again, and nothing is written anywhere else in the meantime.';
    serve({
      schedule: schedule({
        lastBackupAt: Date.now() - 72 * HOUR,
        location: { id: "nas", name: "NAS", connected: false },
        waiting: { dueAt: NEWER, reason: "not_connected", message },
      }),
      stored: { available: false, reason: '"NAS" is not connected. Reconnect it and try again.', backups: [] },
    });
    const section = await show()();

    expect(await within(section).findByText("Last backup 3 days ago.")).toBeVisible();
    const notice = within(section).getByRole("status");
    expect(within(notice).getByText(`The backup due ${formatDateTime(NEWER)} has not been made`)).toBeVisible();
    expect(within(notice).getByText(message)).toBeVisible();
    expect(within(section).getByRole("button", { name: "Back up now" })).toBeDisabled();
    expect(await within(section).findByText(/They cannot be listed now\. "NAS" is not connected/)).toBeVisible();
  });

  it("reports a backup that failed its check", async () => {
    const message =
      'The backup was written to "NAS" but did not read back correctly. It is kept, shown as not verified, and is not counted as a backup.';
    const retryAt = NEWER + 4 * HOUR;
    serve({ schedule: schedule({ waiting: { dueAt: NEWER, reason: "failed", message, retryAt }, lastFailure: { at: NEWER, message } }) });
    const section = await show()();
    const alert = await within(section).findByRole("alert");
    expect(within(alert).getByText(`The backup due ${formatDateTime(NEWER)} failed`)).toBeVisible();
    // The wait grows with each failure, so the screen gives the time and does not promise "within the hour".
    expect(alert).toHaveTextContent(`${message} It will be tried again ${formatDateTime(retryAt)}, and less often each time it fails.`);
  });

  it("lists what is stored, and restores or deletes one only after asking", async () => {
    serve({
      schedule: schedule(),
      backups: [
        backup(),
        backup({
          name: "outpost-backup-2026-11-15T03-00-00-000Z-manual.zip",
          kind: "manual",
          createdAt: OLDER,
          check: "unverified",
          checkedAt: null,
        }),
      ],
    });
    const section = await show()();

    const rows = await within(section).findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(formatDateTime(NEWER));
    expect(rows[0]).toHaveTextContent("Scheduled · 12.4 MB · made by Outpost 0.1.0");
    expect(within(rows[0]!).getByText("Verified")).toBeVisible();
    expect(rows[1]).toHaveTextContent("Started by hand");
    expect(within(rows[1]!).getByText("Not verified")).toBeVisible();
    expect(rows[1]).toHaveTextContent("It is not counted as a backup.");

    await userEvent.click(within(rows[0]!).getByRole("button", { name: `Actions for the backup of ${formatDateTime(NEWER)}` }));
    expect(await screen.findByRole("menuitem", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/backup/stored/outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip/download",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Restore this one" }));
    const asking = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    // What a worried person needs, one line each: what goes, what stays, when, and how to change their mind.
    const what = within(asking).getByRole("list", { name: "What restoring does" });
    expect(
      within(what)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.split(":")[0]),
    ).toEqual(["Replaced", "Not touched", "When", "To cancel"]);
    expect(what).toHaveTextContent("Not touched: the files of collections, maps and documents on your storage.");
    expect(requests).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    expect(requests).toEqual([{ call: "POST /api/backup/stored/outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip/restore", body: {} }]);

    await userEvent.click(await within(rows[1]!).findByRole("button", { name: `Actions for the backup of ${formatDateTime(OLDER)}` }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const deleting = await screen.findByRole("alertdialog", { name: "Delete this backup?" });
    expect(deleting).toHaveTextContent(`The backup of ${formatDateTime(OLDER)} (12.4 MB) will be deleted from NAS. This cannot be undone.`);
    expect(requests).toHaveLength(1);
    await userEvent.click(within(deleting).getByRole("button", { name: "Delete backup" }));
    expect(requests[1]).toEqual({ call: "DELETE /api/backup/stored/outpost-backup-2026-11-15T03-00-00-000Z-manual.zip", body: undefined });
  });

  it("tests a restore of a stored backup from its menu, and shows what the last test found", async () => {
    const tested = schedule({
      restoreTest: {
        at: NEWER + HOUR,
        name: backup().name,
        backupCreatedAt: NEWER,
        ok: true,
        problem: null,
        appVersion: "0.1.0",
        entries: 12,
        migrations: { backup: 30, current: 30 },
        counts: [
          { what: "Pages", inBackup: 412, now: 415 },
          { what: "Saved places", inBackup: 37, now: 37 },
        ],
        durationMs: 2_000,
      },
    });
    serve({ schedule: schedule(), after: tested, backups: [backup()] });
    const section = await show()();
    expect(await within(section).findByText(/Not tested yet/)).toBeVisible();

    const [row] = await within(section).findAllByRole("listitem");
    await userEvent.click(within(row!).getByRole("button", { name: `Actions for the backup of ${formatDateTime(NEWER)}` }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Test a restore" }));
    expect(requests).toEqual([{ call: "POST /api/backup/stored/outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip/test", body: {} }]);

    expect(
      await within(section).findByText(`The backup of ${formatDateTime(NEWER)} opened, and its database is sound.`, { exact: false }),
    ).toBeVisible();
    const table = within(section).getByRole("table", { name: "What the backup holds, against what is here now" });
    expect(within(table).getByRole("row", { name: "Pages 412 415" })).toBeVisible();
  });

  it("starts a backup when asked, and shows one that is under way", async () => {
    const active = {
      id: "j1",
      type: "backup.run",
      queue: "backup",
      state: "running",
      title: "Back up to NAS",
      subject: "backup",
      progress: { current: 0, total: null, message: "Reading the backup back to check it" },
      error: null,
      errorKind: null,
      attempts: 1,
      maxAttempts: 1,
      result: null,
      createdAt: 1,
      startedAt: 1,
      finishedAt: null,
      updatedAt: 1,
    } as const;
    serve({ schedule: schedule(), after: schedule({ active }) });
    const section = await show()();
    await userEvent.click(await within(section).findByRole("button", { name: "Back up now" }));
    expect(requests).toEqual([{ call: "POST /api/backup/run", body: {} }]);
    expect(await within(section).findByText("Reading the backup back to check it")).toBeVisible();
    expect(within(section).getByText(/One is being made now\./)).toBeVisible();
    expect(within(section).getByRole("button", { name: "Back up now" })).toBeDisabled();
  });

  it("on another device offers neither restoring nor deleting, and says why and what to do", async () => {
    serve({ schedule: schedule({ right: remote }), backups: [backup()] });
    const section = await show()();

    const upload = screen.getByRole("region", { name: "Backup" });
    const notice = await within(upload).findByRole("status");
    expect(within(notice).getByText("Restoring is not offered on this device")).toBeVisible();
    expect(notice).toHaveTextContent("can only be done at the computer Outpost runs on. Open Outpost there to do it.");
    expect(within(notice).getByText("OUTPOST_ALLOW_REMOTE_ERASE=true")).toBeVisible();
    expect(within(upload).queryByRole("button", { name: "Choose backup" })).not.toBeInTheDocument();
    // Saving a backup is still there: it takes nothing away.
    expect(within(upload).getByRole("link", { name: "Download backup" })).toBeVisible();

    const row = await within(section).findByRole("listitem");
    await userEvent.click(within(row).getByRole("button", { name: /Actions for the backup/ }));
    expect(await screen.findByRole("menuitem", { name: "Download" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Restore this one" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(within(section).getByText("Restoring and deleting are offered at the computer Outpost runs on.")).toBeVisible();
    expect(within(section).getByText(/Keeping fewer can only be set at the computer Outpost runs on\./)).toBeVisible();
    expect(within(section).getByRole("button", { name: "Back up now" })).toBeEnabled();
  });

  it("offers the restart that applies a restore at the computer Outpost runs on, and nowhere else", async () => {
    serve({ schedule: schedule(), status: { restorePending: true, supervised: true } });
    await show()();
    const here = screen.getByRole("region", { name: "Backup" });
    expect(await within(here).findByText("The backup has been checked. Restart Outpost to switch to it.")).toBeVisible();
    await userEvent.click(within(here).getByRole("button", { name: "Restart now" }));
    expect(requests.map((request) => request.call)).toContain("POST /api/system/restart");
  });

  it("on another device says where to restart instead of offering it", async () => {
    serve({ schedule: schedule({ right: remote }), status: { restorePending: true, supervised: true } });
    await show()();
    const there = screen.getByRole("region", { name: "Backup" });
    expect(
      await within(there).findByText(
        /Restarting stops Outpost for everyone using it, so it can only be done at the computer Outpost runs on\./,
      ),
    ).toBeVisible();
    expect(within(there).queryByRole("button", { name: "Restart now" })).not.toBeInTheDocument();
    // Cancelling keeps what is here, so it is offered everywhere.
    expect(within(there).getByRole("button", { name: "Cancel restore" })).toBeVisible();
  });
});
