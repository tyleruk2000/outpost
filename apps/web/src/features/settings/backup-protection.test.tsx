import type { BackupProtection, BackupRight, BackupSchedule, StoredBackup } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/utils";
import { passphraseHeader, startsAsProtected } from "./backup-protection";
import { BackupSection } from "./backup-section";

const local: BackupRight = { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" };
const remote: BackupRight = { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" };
const byOption: BackupRight = { allowed: true, reason: "option", option: "OUTPOST_ALLOW_REMOTE_ERASE" };
const SET_AT = new Date(2026, 10, 10, 9, 30).getTime();
const NEWER = new Date(2026, 10, 16, 3, 0).getTime();
const OLDER = new Date(2026, 10, 9, 3, 0).getTime();

const off: BackupProtection = { on: false, setAt: null, right: { allowed: true, reason: "local" } };
const on: BackupProtection = { on: true, setAt: SET_AT, right: { allowed: true, reason: "local" } };

const schedule = (right: BackupRight, chosen: boolean): BackupSchedule => ({
  settings: { locationId: chosen ? "nas" : null, frequency: "daily", time: "03:00", weekday: 0, keep: 7 },
  folder: "outpost-backups",
  location: chosen ? { id: "nas", name: "NAS", connected: true } : null,
  lastBackupAt: null,
  nextRunAt: chosen ? NEWER + 24 * 60 * 60 * 1000 : null,
  waiting: null,
  lastFailure: null,
  active: null,
  right,
  away: null,
  kept: null,
  restoreTest: null,
  restoreTestActive: null,
});

const backup = (change: Partial<StoredBackup> = {}): StoredBackup => ({
  name: "outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip.enc",
  kind: "scheduled",
  createdAt: NEWER,
  sizeBytes: 12_400_000,
  appVersion: "0.1.0",
  check: "verified",
  checkedAt: NEWER + 60_000,
  protected: true,
  currentPassphrase: true,
  ...change,
});

interface Sent {
  call: string;
  body?: unknown;
  headers: Record<string, string>;
}
let requests: Sent[] = [];

interface Answer {
  status: number;
  body: unknown;
}

function serve(options: {
  protection: BackupProtection;
  /** What the server says once the passphrase has been set, changed or removed. */
  after?: BackupProtection;
  right?: BackupRight;
  backups?: StoredBackup[];
  statusFails?: boolean;
  statusHangs?: boolean;
  /** Answers to restores and to setting the passphrase, in the order they are asked for. The last is repeated. */
  answers?: Answer[];
}) {
  requests = [];
  let protection = options.protection;
  const right = options.right ?? local;
  const answers = [...(options.answers ?? [])];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
        requests.push({ call: `${method} ${url.pathname}`, body, headers: (init?.headers ?? {}) as Record<string, string> });
      }
      if (url.pathname === "/api/backup/status") {
        if (options.statusHangs) return new Promise<Response>(() => {});
        if (options.statusFails) return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ restorePending: false, previousData: [], supervised: false, right, protection });
      }
      if (url.pathname === "/api/backup/schedule") return json(schedule(right, options.backups !== undefined));
      if (url.pathname === "/api/backup/stored") return json({ available: true, reason: null, backups: options.backups ?? [] });
      if (url.pathname === "/api/storage/locations")
        return json({ roots: [], locations: [{ id: "nas", name: "NAS", status: "available" }] });
      if (url.pathname === "/api/backup/protection" || url.pathname.endsWith("/restore")) {
        const answer = answers.length > 1 ? answers.shift() : answers[0];
        if (answer && answer.status !== 200) return json(answer.body, answer.status);
        if (url.pathname === "/api/backup/protection") {
          protection = options.after ?? protection;
          return json(protection);
        }
        return json({ staged: true, createdAt: "2026-11-16T03:00:00.000Z", appVersion: "0.1.0", supervised: false });
      }
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
  return screen.findByRole("region", { name: "Backup" });
}

const wrong = {
  status: 400,
  body: {
    error: {
      code: "bad_request",
      message: "That passphrase does not open this backup. Backups open with the passphrase that was set when they were made.",
      details: { reason: "wrong_passphrase" },
    },
  },
};

/** A file that starts the way a protected backup does, and one that starts as a zip. */
const protectedFile = () => new File([new TextEncoder().encode("OPBACKUP"), new Uint8Array([1, 0, 0, 0, 240])], "outpost-backup.zip.enc");
const plainFile = () =>
  new File([new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 8, 0])], "outpost-backup.zip", { type: "application/zip" });

afterEach(() => vi.unstubAllGlobals());

describe("what is sent with a protected backup", () => {
  it("tells a protected backup from a zip by how the file starts, whatever it is called", async () => {
    expect(await startsAsProtected(protectedFile())).toBe(true);
    expect(await startsAsProtected(plainFile())).toBe(false);
    expect(await startsAsProtected(new File(["OPBACK"], "short.zip.enc"))).toBe(false);
    expect(await startsAsProtected(new File([], "empty.zip.enc"))).toBe(false);
  });

  it("sends the passphrase as the base64 of its UTF-8 bytes, so that any passphrase fits in a header", () => {
    expect(passphraseHeader("abc")).toEqual({ "X-Outpost-Backup-Passphrase": "YWJj" });
    // "夜 🌒 é": not one of these characters could be put in a header as it is.
    expect(passphraseHeader("夜 🌒 é")).toEqual({ "X-Outpost-Backup-Passphrase": "5aScIPCfjJIgw6k=" });
  });
});

describe("protecting backups with a passphrase, in Settings", () => {
  it("waits for the server before saying anything, and says so when it cannot be asked", async () => {
    serve({ protection: off, statusHangs: true });
    const waiting = await show();
    expect(within(waiting).getByText("Protect backups with a passphrase")).toBeVisible();
    expect(within(waiting).queryByRole("button", { name: /passphrase/ })).not.toBeInTheDocument();
    expect(within(waiting).queryByText(/^Off\./)).not.toBeInTheDocument();
  });

  it("says that it could not find out, and offers to try again", async () => {
    serve({ protection: off, statusFails: true });
    const section = await show();
    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent("This could not be loaded");
    expect(alert).toHaveTextContent("The database is busy.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(within(section).queryByRole("button", { name: "Set a passphrase" })).not.toBeInTheDocument();
  });

  it("is off to begin with, and before a passphrase is set says that Outpost cannot recover it", async () => {
    serve({ protection: off, after: on });
    const section = await show();
    expect(await within(section).findByText(/^Off\. A backup is a zip file that anyone who has it can read\./)).toBeVisible();
    expect(within(section).getByText("One .zip file. Keep it somewhere other than this device.")).toBeVisible();
    expect(within(section).queryByRole("button", { name: "Stop protecting" })).not.toBeInTheDocument();

    await userEvent.click(within(section).getByRole("button", { name: "Set a passphrase" }));
    const dialog = await screen.findByRole("dialog", { name: "Set a passphrase for backups" });
    // One sentence, before anything is typed.
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      /^A protected backup cannot be opened without this passphrase, and Outpost cannot recover it for you\.$/,
    );
    const submit = within(dialog).getByRole("button", { name: "Protect backups" });
    expect(submit).toBeDisabled();

    // Asked for twice; the two must match.
    const first = within(dialog).getByLabelText("Passphrase");
    const second = within(dialog).getByLabelText("Passphrase, again");
    expect(first).toHaveAttribute("type", "password");
    expect(first).toHaveAttribute("autocomplete", "off");
    await userEvent.type(first, "seven tall ships at anchor");
    expect(submit).toBeDisabled();
    await userEvent.type(second, "seven tall ships at anchos");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The two do not match.");
    expect(submit).toBeDisabled();
    await userEvent.clear(second);
    await userEvent.type(second, "seven tall ships at anchor");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    // Long enough that nothing is said about its length.
    expect(within(dialog).queryByText(/is short/)).not.toBeInTheDocument();
    expect(requests).toEqual([]);

    await userEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ call: "PUT /api/backup/protection", body: { passphrase: "seven tall ships at anchor" } });
    // The screen now says so, with the date, and what a download will be.
    expect(await within(section).findByText(new RegExp(`^On since ${formatDateTime(SET_AT)}\\.`))).toBeVisible();
    expect(within(section).getByText(/Outpost keeps no copy of it and cannot recover it\./)).toBeVisible();
    expect(within(section).getByText(/^One file, encrypted with your passphrase \(\.zip\.enc\)\./)).toBeVisible();
  });

  it("accepts a short passphrase and says honestly what that means; refuses none for what it is made of", async () => {
    serve({ protection: off, after: on });
    const section = await show();
    await userEvent.click(await within(section).findByRole("button", { name: "Set a passphrase" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Passphrase"), "tide");
    expect(within(dialog).getByText(/^4 characters is short\. Anyone who gets a backup file can try passphrases against it/)).toBeVisible();
    expect(within(dialog).getByText(/It will be accepted if you keep it\.$/)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText("Passphrase, again"), "tide");
    const submit = within(dialog).getByRole("button", { name: "Protect backups" });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.body).toEqual({ passphrase: "tide" });
  });

  it("suggests one made at random, shown so that it can be written down", async () => {
    serve({ protection: off, after: on });
    const section = await show();
    await userEvent.click(await within(section).findByRole("button", { name: "Set a passphrase" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest one" }));
    const first = within(dialog).getByLabelText("Passphrase") as HTMLInputElement;
    expect(first.value).toMatch(/^[a-z]{5}(-[a-z]{5}){4}$/);
    expect(first).toHaveAttribute("type", "text");
    expect((within(dialog).getByLabelText("Passphrase, again") as HTMLInputElement).value).toBe(first.value);
    expect(within(dialog).getByText(/^Made by this browser at random\. Write it down now/)).toBeVisible();
    const made = first.value;
    await userEvent.click(within(dialog).getByRole("button", { name: "Protect backups" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.body).toEqual({ passphrase: made });
  });

  it("shows what the server said when the passphrase was not set, and keeps what was typed", async () => {
    serve({
      protection: off,
      answers: [
        {
          status: 403,
          body: {
            error: { code: "forbidden", message: "Setting the passphrase for backups can only be done on the computer Outpost runs on." },
          },
        },
      ],
    });
    const section = await show();
    await userEvent.click(await within(section).findByRole("button", { name: "Set a passphrase" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Passphrase"), "seven tall ships");
    await userEvent.type(within(dialog).getByLabelText("Passphrase, again"), "seven tall ships{Enter}");
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("The passphrase was not set");
    expect(alert).toHaveTextContent("can only be done on the computer Outpost runs on.");
    expect((within(dialog).getByLabelText("Passphrase") as HTMLInputElement).value).toBe("seven tall ships");
    expect(within(section).getByText(/^Off\./)).toBeVisible();
  });

  it("when it is on, changes the passphrase saying what happens to older backups, and stops only after asking", async () => {
    serve({ protection: on, after: off });
    const section = await show();
    expect(
      await within(section).findByText(
        /Backups made before the passphrase was last changed still open with the one they were made under\./,
      ),
    ).toBeVisible();

    await userEvent.click(within(section).getByRole("button", { name: "Change passphrase" }));
    const dialog = await screen.findByRole("dialog", { name: "Change the passphrase for backups" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("cannot be opened without this passphrase, and Outpost cannot recover it");
    expect(
      within(dialog).getByText(
        /The new passphrase is for backups made from now on\. The ones already made still open with the passphrase they were made under/,
      ),
    ).toBeVisible();
    // The old passphrase is not asked for: nothing made under it is touched.
    expect(within(dialog).getAllByLabelText(/^Passphrase/)).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toEqual([]);

    await userEvent.click(within(section).getByRole("button", { name: "Stop protecting" }));
    const asking = await screen.findByRole("alertdialog", { name: "Stop protecting backups?" });
    expect(asking).toHaveTextContent(
      "The protected backups already made are not changed: they stay encrypted and still need the passphrase",
    );
    expect(requests).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: "Stop protecting" }));
    await waitFor(() => expect(requests.map((request) => request.call)).toEqual(["DELETE /api/backup/protection"]));
    expect(await within(section).findByText(/^Off\./)).toBeVisible();
  });

  it("on another device says whether backups are protected and offers no way to change it", async () => {
    serve({ protection: { ...on, right: { allowed: false, reason: "remote" } }, right: remote });
    const section = await show();
    expect(await within(section).findByText(new RegExp(`^On since ${formatDateTime(SET_AT)}\\.`))).toBeVisible();
    expect(within(section).getByText("This can only be done at the computer Outpost runs on.")).toBeVisible();
    expect(within(section).queryByRole("button", { name: /passphrase/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Stop protecting" })).not.toBeInTheDocument();
  });

  it("over plain http from another device, never asks for a passphrase, even where restoring is allowed", async () => {
    serve({ protection: { ...on, right: { allowed: false, reason: "insecure" } }, right: byOption, backups: [backup()] });
    const section = await show();
    expect(
      await within(section).findByText(
        /^This page is open over plain http, so a passphrase typed here would cross your network unencrypted\./,
      ),
    ).toBeVisible();
    expect(within(section).queryByRole("button", { name: "Change passphrase" })).not.toBeInTheDocument();

    // An uploaded protected backup: the dialog says where to do it, has no field, and sends nothing.
    await userEvent.upload(within(section).getByLabelText("Backup file"), protectedFile());
    const asking = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    expect(await within(asking).findByText("This backup is protected")).toBeVisible();
    expect(within(asking).queryByLabelText("Passphrase of this backup")).not.toBeInTheDocument();
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    expect(requests).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: "Cancel" }));

    // The same for one in the list.
    const stored = await screen.findByRole("region", { name: "Automatic backups" });
    await userEvent.click(await within(stored).findByRole("button", { name: /^Actions for the backup of/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore this one" }));
    const again = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    expect(within(again).getByText("This backup is protected")).toBeVisible();
    expect(within(again).queryByLabelText("Passphrase of this backup")).not.toBeInTheDocument();
    await userEvent.click(within(again).getByRole("button", { name: "Restore after restart" }));
    expect(requests).toEqual([]);
  });
});

describe("restoring a protected backup", () => {
  it("asks for the passphrase of an uploaded protected backup, and for none when the file is a plain zip", async () => {
    serve({ protection: off, answers: [wrong, { status: 200, body: null }] });
    const section = await show();
    const input = await within(section).findByLabelText("Backup file");

    await userEvent.upload(input, plainFile());
    const plain = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    expect(within(plain).queryByLabelText("Passphrase of this backup")).not.toBeInTheDocument();
    await userEvent.click(within(plain).getByRole("button", { name: "Cancel" }));

    await userEvent.upload(input, protectedFile());
    const asking = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    const field = await within(asking).findByLabelText("Passphrase of this backup");
    expect(within(asking).getByText(/It is used once, to open the backup, and is not kept\./)).toBeVisible();
    // Nothing is sent without one.
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    expect(within(asking).getByRole("alert")).toHaveTextContent("Type the passphrase this backup was made under.");
    expect(requests).toEqual([]);

    // A wrong one is said beside the field, in the server's words, and the file stays chosen.
    await userEvent.type(field, "not it");
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    expect(await within(asking).findByRole("alert")).toHaveTextContent(/^That passphrase does not open this backup\./);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      call: "POST /api/backup/restore",
      headers: { "Content-Type": "application/vnd.outpost.backup", "X-Outpost-Backup-Passphrase": btoa("not it") },
    });
    expect(requests[0]!.body).toBeInstanceOf(File);

    await userEvent.clear(field);
    await userEvent.type(field, "seven tall ships");
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests[1]!.headers["X-Outpost-Backup-Passphrase"]).toBe(btoa("seven tall ships"));
  });

  it("shows for each stored backup whether it is protected, and which passphrase opens an older one", async () => {
    serve({
      protection: on,
      backups: [
        backup(),
        backup({ name: "outpost-backup-2026-11-09T03-00-00-000Z-scheduled.zip.enc", createdAt: OLDER, currentPassphrase: false }),
        backup({
          name: "outpost-backup-2026-11-08T03-00-00-000Z-manual.zip",
          kind: "manual",
          createdAt: OLDER - 1,
          protected: false,
          currentPassphrase: null,
        }),
      ],
      answers: [wrong, { status: 200, body: null }],
    });
    await show();
    const stored = await screen.findByRole("region", { name: "Automatic backups" });
    // Said where the folder is chosen: what someone who can open it can and cannot do.
    expect(
      await within(stored).findByText(/Backups are encrypted with your passphrase: anyone who can open that folder can copy them/),
    ).toBeVisible();
    expect(within(stored).queryByText(/not encrypted/)).not.toBeInTheDocument();

    const rows = await within(stored).findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Protected")).toBeVisible();
    expect(rows[0]).not.toHaveTextContent("not the one in use now");
    expect(within(rows[1]!).getByText("Protected")).toBeVisible();
    expect(rows[1]).toHaveTextContent("Opens with the passphrase that was in use when it was made, not the one in use now.");
    expect(within(rows[2]!).getByText("Not protected")).toBeVisible();

    // The older one: asked for the passphrase it was made under.
    await userEvent.click(within(rows[1]!).getByRole("button", { name: `Actions for the backup of ${formatDateTime(OLDER)}` }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore this one" }));
    const asking = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    const field = within(asking).getByLabelText("Passphrase of this backup");
    expect(within(asking).getByText(/It was made under an earlier passphrase, not the one in use now\./)).toBeVisible();
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    expect(within(asking).getByRole("alert")).toHaveTextContent("Type the passphrase this backup was made under.");
    expect(requests).toEqual([]);
    await userEvent.type(field, "the new one");
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    expect(await within(asking).findByRole("alert")).toHaveTextContent(/^That passphrase does not open this backup\./);
    await userEvent.clear(field);
    await userEvent.type(field, "the old one");
    await userEvent.click(within(asking).getByRole("button", { name: "Restore after restart" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.map((request) => [request.call, request.body])).toEqual([
      ["POST /api/backup/stored/outpost-backup-2026-11-09T03-00-00-000Z-scheduled.zip.enc/restore", { passphrase: "the new one" }],
      ["POST /api/backup/stored/outpost-backup-2026-11-09T03-00-00-000Z-scheduled.zip.enc/restore", { passphrase: "the old one" }],
    ]);

    // One that is not protected is restored as before, with no field and no passphrase sent.
    await userEvent.click(within(rows[2]!).getByRole("button", { name: /^Actions for the backup of/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore this one" }));
    const plain = await screen.findByRole("alertdialog", { name: "Restore from this backup?" });
    expect(within(plain).queryByLabelText("Passphrase of this backup")).not.toBeInTheDocument();
    await userEvent.click(within(plain).getByRole("button", { name: "Restore after restart" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]!.body).toEqual({});
  });
});
