/**
 * Contacts through the API: keeping them, finding them, bringing them in from a file
 * without changing anything unasked, sending them out again, and what backups, a
 * portable drive and "erase everything" do with them. Every person here is made up.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  CleanupPlan,
  CleanupResult,
  ContactDto,
  ContactImportPreview,
  ContactImportResult,
  ContactListResponse,
  JobDto,
} from "@outpost/shared";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareDriveDatabase } from "../src/modules/portable/database.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

const vcf = (...cards: string[][]) => Buffer.from(cards.map((lines) => ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD", ""].join("\r\n")).join(""));

function upload(file: Buffer, name = "contacts.vcf") {
  const boundary = "----outpost-test-boundary";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/vcard\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function preview(target: TestApp, file: Buffer): Promise<ContactImportPreview> {
  const { payload, headers } = upload(file);
  const response = await target.api<ContactImportPreview>("POST", "/api/contacts/import/preview", payload, { headers });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}

const list = async (query = "") => (await app.api<ContactListResponse>("GET", `/api/contacts${query}`)).body;
const create = async (body: Record<string, unknown>) => {
  const response = await app.api<{ contact: ContactDto }>("POST", "/api/contacts", body);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.contact;
};
const named = (given: string, family: string) => ({ name: { prefix: "", given, additional: "", family, suffix: "" } });

describe("keeping contacts", () => {
  it("makes, reads, changes and removes a contact", async () => {
    const made = await create({
      ...named("Maya", "Okafor"),
      phones: [{ value: " 07700  900123 ", label: "mobile" }, { value: "01632 960045" }],
      emails: [{ value: "maya@okafor.example", label: "home" }],
      addresses: [{ label: "home", street: "4 Mill Lane", locality: "Hawes", region: "", postcode: "DL8 9ZZ", country: "" }],
      tags: ["Family", "family", "Has a key"],
      note: "Line one\r\nLine two",
      callsign: "M0XYZ",
      channels: [{ frequency: "145.500 MHz", mode: "FM" }, { frequency: "", mode: "" }],
    });
    expect(made.displayName).toBe("Maya Okafor");
    expect(made.phones).toEqual([
      { value: "07700 900123", label: "mobile" },
      { value: "01632 960045", label: "" },
    ]);
    expect(made.tags).toEqual(["Family", "Has a key"]);
    expect(made.note).toBe("Line one\nLine two");
    expect(made.channels).toEqual([{ frequency: "145.500 MHz", mode: "FM" }]);
    expect(made.source).toBe("manual");

    const changed = await app.api<{ contact: ContactDto }>("PATCH", `/api/contacts/${made.id}`, {
      isEmergency: true,
      emergencyNote: "Has a spare key",
      baseUpdatedAt: made.updatedAt,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.contact).toMatchObject({ isEmergency: true, emergencyNote: "Has a spare key", callsign: "M0XYZ", displayName: "Maya Okafor" });
    // What was not sent is as it was.
    expect(changed.body.contact.phones).toHaveLength(2);

    expect((await app.api("DELETE", `/api/contacts/${made.id}`)).status).toBe(200);
    expect((await app.api("GET", `/api/contacts/${made.id}`)).status).toBe(404);
    expect((await list()).all).toBe(0);
  });

  it("does not save over a change made somewhere else", async () => {
    const made = await create(named("Sam", "Whitlock"));
    await new Promise((resolve) => setTimeout(resolve, 3));
    const first = await app.api<{ contact: ContactDto }>("PATCH", `/api/contacts/${made.id}`, { nickname: "Sammy", baseUpdatedAt: made.updatedAt });
    expect(first.status).toBe(200);
    const stale = await app.api("PATCH", `/api/contacts/${made.id}`, { nickname: "Samuel", baseUpdatedAt: made.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toMatch(/changed somewhere else/);
    expect((await app.api("GET", `/api/contacts/${made.id}`)).body.contact.nickname).toBe("Sammy");
  });

  it("refuses a contact with nothing in it, and fields longer than it keeps", async () => {
    expect((await app.api("POST", "/api/contacts", {})).status).toBe(400);
    const long = await app.api("POST", "/api/contacts", { ...named("A", "B"), note: "x".repeat(20_001) });
    expect(long.status).toBe(400);
    expect(long.body.error.message).toMatch(/A note can be at most 20,000 characters/);
    const many = await app.api("POST", "/api/contacts", { ...named("A", "B"), phones: Array.from({ length: 31 }, (_unused, i) => ({ value: `0${i}` })) });
    expect(many.body.error.message).toMatch(/at most 30 phone numbers/);
  });

  it("lists the marked contacts first, then by family name, and finds by name, number, tag and callsign", async () => {
    await create({ ...named("Zoë", "Łukasiewicz"), phones: [{ value: "+44 7700 900456", label: "mobile" }], tags: ["Neighbours"] });
    await create({ ...named("Adaeze", "Okafor"), organisation: "Fell Road Surgery", title: "GP", emails: [{ value: "ada@fellroad.example" }] });
    await create({ kind: "organisation", organisation: "Borrowdale Mountain Rescue", phones: [{ value: "01632 960999", label: "main" }], isEmergency: true, callsign: "GB3MR" });
    await create({ ...named("Tom", "Abbott"), tags: ["neighbours"], isEmergency: true });

    const all = await list();
    expect(all.contacts.map((contact) => contact.displayName)).toEqual(["Tom Abbott", "Borrowdale Mountain Rescue", "Zoë Łukasiewicz", "Adaeze Okafor"]);
    expect(all.contacts.map((contact) => contact.initial)).toEqual(["A", "B", "L", "O"]);
    expect(all).toMatchObject({ total: 4, all: 4, emergency: 2 });
    expect(all.tags).toEqual([{ name: "Neighbours", count: 2 }]);
    expect(all.contacts[3]!.detail).toBe("GP, Fell Road Surgery");

    const find = async (q: string) => (await list(`?q=${encodeURIComponent(q)}`)).contacts.map((contact) => contact.displayName);
    expect(await find("lukas")).toEqual(["Zoë Łukasiewicz"]);
    expect(await find("zoe")).toEqual(["Zoë Łukasiewicz"]);
    expect(await find("okafor ada")).toEqual(["Adaeze Okafor"]);
    expect(await find("07700 900")).toEqual(["Zoë Łukasiewicz"]);
    expect(await find("7700900456")).toEqual(["Zoë Łukasiewicz"]);
    expect(await find("fellroad.example")).toEqual(["Adaeze Okafor"]);
    expect(await find("gb3mr")).toEqual(["Borrowdale Mountain Rescue"]);
    expect(await find("100%_")).toEqual([]);
    expect((await list("?tag=NEIGHBOURS")).contacts.map((contact) => contact.displayName)).toEqual(["Tom Abbott", "Zoë Łukasiewicz"]);
    expect((await list("?emergency=1")).total).toBe(2);
    expect((await list("?limit=1&offset=1")).contacts.map((contact) => contact.displayName)).toEqual(["Borrowdale Mountain Rescue"]);

    const sheet = (await app.api<{ contacts: ContactDto[] }>("GET", "/api/contacts/emergency")).body.contacts;
    expect(sheet.map((contact) => contact.displayName)).toEqual(["Tom Abbott", "Borrowdale Mountain Rescue"]);
  });

  it("is found by the search across everything, and leaves it when removed", async () => {
    const made = await create({ ...named("Ibrahim", "Al-Sayed"), note: "Keeps the key to the pump house.", phones: [{ value: "01632 960321" }], tags: ["Water"] });
    const search = async (q: string) => (await app.api("GET", `/api/search?q=${encodeURIComponent(q)}`)).body.results as Array<Record<string, unknown>>;
    const byNote = await search("pump house");
    expect(byNote[0]).toMatchObject({ kind: "contact", title: "Ibrahim Al-Sayed", url: `/contacts/${made.id}`, collection: "Contacts", tags: ["Water"] });
    expect((await search("Al-Sayed"))[0]).toMatchObject({ kind: "contact" });
    await app.api("PATCH", `/api/contacts/${made.id}`, { note: "Keeps the key to the boat shed." });
    expect(await search("pump house")).toEqual([]);
    await app.api("DELETE", `/api/contacts/${made.id}`);
    expect(await search("boat shed")).toEqual([]);
  });

  it("links to a saved place and to pages of notes, and says when either has gone", async () => {
    const marker = (await app.api("POST", "/api/maps/markers", { name: "Village hall", lat: 54.3, lon: -2.2 })).body.marker;
    const page = (await app.api("POST", "/api/notes", { title: "Flood plan" })).body.note;
    const other = (await app.api("POST", "/api/notes", { title: "Radio net" })).body.note;
    const made = await create({ ...named("Peggy", "Whitfield"), markerId: marker.id, pageIds: [other.id, page.id] });
    expect(made.place).toEqual({ id: marker.id, name: "Village hall", lat: 54.3, lon: -2.2 });
    expect(made.pages.map((entry) => entry.title)).toEqual(["Radio net", "Flood plan"]);

    expect((await app.api("POST", "/api/contacts", { ...named("A", "B"), markerId: "nope" })).status).toBe(400);
    expect((await app.api("PATCH", `/api/contacts/${made.id}`, { pageIds: ["nope"] })).status).toBe(400);

    await app.api("DELETE", `/api/maps/markers/${marker.id}`);
    await app.api("DELETE", `/api/notes/${page.id}`);
    const after = (await app.api<{ contact: ContactDto }>("GET", `/api/contacts/${made.id}`)).body.contact;
    expect(after.place).toBeNull();
    expect(after.pages.map((entry) => entry.title)).toEqual(["Radio net"]);
    // Unlinking is a change like any other.
    const cleared = await app.api<{ contact: ContactDto }>("PATCH", `/api/contacts/${made.id}`, { markerId: null, pageIds: [] });
    expect(cleared.body.contact.pages).toEqual([]);
  });
});

describe("bringing contacts in from a file", () => {
  const maya = ["UID:card-maya", "N:Okafor;Maya;;;", "FN:Maya Okafor", "TEL;TYPE=CELL:07700 900123", "EMAIL;TYPE=HOME:maya@okafor.example"];
  const sam = ["UID:card-sam", "N:Whitlock;Sam;;;", "FN:Sam Whitlock", "TEL;TYPE=HOME:01632 960777", "NOTE:Plumber"];

  it("reads a file without changing anything, then adds what is new", async () => {
    const first = await preview(app, vcf(maya, sam, sam, ["FN:"], ["N:Big;Note;;;", `NOTE:${"x".repeat(20_500)}`]));
    expect(first).toMatchObject({ cards: 5, alreadyHere: 0, repeated: 1, versions: ["3.0"], photosLeftOut: 0 });
    expect(first.fresh.map((entry) => entry.displayName)).toEqual(["Maya Okafor", "Sam Whitlock"]);
    expect(first.fresh[0]!.detail).toBe("07700 900123");
    expect(first.unreadable).toEqual([
      { position: 4, reason: "It has no name, number or address." },
      { position: 5, reason: "A note can be at most 20,000 characters. It was left out whole, so that nothing is cut short." },
    ]);
    expect((await list()).all).toBe(0);

    const applied = await app.api<ContactImportResult>("POST", "/api/contacts/import/apply", { token: first.token });
    expect(applied.body).toEqual({ added: 2, merged: 0, replaced: 0, kept: 0, alreadyHere: 0, leftOut: 0, overLimit: 0 });
    const after = await list();
    expect(after.contacts.map((contact) => contact.displayName)).toEqual(["Maya Okafor", "Sam Whitlock"]);
    const detail = (await app.api<{ contact: ContactDto }>("GET", `/api/contacts/${after.contacts[0]!.id}`)).body.contact;
    expect(detail.source).toBe("file");

    // A file is carried out once.
    expect((await app.api("POST", "/api/contacts/import/apply", { token: first.token })).status).toBe(409);
  });

  it("finds nothing to do when the same file comes again, or one that says less", async () => {
    await app.api("POST", "/api/contacts/import/apply", { token: (await preview(app, vcf(maya, sam))).token });
    const again = await preview(app, vcf(maya, sam));
    expect(again).toMatchObject({ alreadyHere: 2, fresh: [], duplicates: [] });
    // The same person from another phone, with one of the two things Outpost already has.
    const less = await preview(app, vcf(["UID:other-phone", "N:Okafor;Maya;;;", "FN:Maya Okafor", "TEL:+44 7700 900123"]));
    expect(less).toMatchObject({ alreadyHere: 1, fresh: [], duplicates: [] });
    expect((await app.api<ContactImportResult>("POST", "/api/contacts/import/apply", { token: less.token })).body).toMatchObject({ added: 0, alreadyHere: 1 });
  });

  it("shows a contact that looks like one already here beside it, and changes nothing unless asked", async () => {
    await app.api("POST", "/api/contacts/import/apply", { token: (await preview(app, vcf(maya, sam))).token });
    const before = await list();
    const mayaId = before.contacts[0]!.id;
    await app.api("PATCH", `/api/contacts/${mayaId}`, { isEmergency: true, emergencyNote: "Sister", callsign: "M0MAY", tags: ["Family"] });

    const file = vcf(
      // The same card with a new number and a note: the phone's copy has moved on.
      ["UID:card-maya", "N:Okafor;Maya;;;", "FN:Maya Okafor", "TEL;TYPE=CELL:07700 900123", "TEL;TYPE=WORK:01632 960200", "NOTE:Night shifts", "X-ABDATE:2020-01-01"],
      // Another card for Sam, same name and number, written the other way round.
      ["UID:someone-elses-phone", "N:Whitlock;Sam;;;", "FN:Whitlock, Sam", "TEL:+44 1632 960777", "EMAIL:sam@whitlock.example"],
      // Same name as Sam and nothing else in common.
      ["N:Whitlock;Sam;;;", "FN:Sam Whitlock", "TEL:020 7946 0999"],
      ["N:Ferreira;João;;;", "FN:João Ferreira"],
    );
    const found = await preview(app, file);
    expect(found.fresh.map((entry) => entry.displayName)).toEqual(["João Ferreira"]);
    expect(found.duplicates.map((entry) => [entry.displayName, entry.reason, entry.existing.displayName])).toEqual([
      ["Maya Okafor", "same-card", "Maya Okafor"],
      ["Sam Whitlock", "name-and-number", "Sam Whitlock"],
      ["Sam Whitlock", "name", "Sam Whitlock"],
    ]);
    const mayaLines = found.duplicates[0]!.lines;
    expect(mayaLines.find((line) => line.label === "Phone")).toEqual({
      label: "Phone",
      here: ["07700 900123 (mobile)"],
      incoming: ["07700 900123 (mobile)", "01632 960200 (work)"],
      differs: true,
    });
    expect(mayaLines.find((line) => line.label === "Name")).toMatchObject({ differs: false });
    expect(found.duplicates[0]!.mergeAdds).toEqual(["1 phone number", "a note"]);
    expect(found.duplicates[1]!.mergeAdds).toEqual(["1 email address"]);

    // With no choices made, the duplicates are left exactly as Outpost has them.
    const careful = await app.api<ContactImportResult>("POST", "/api/contacts/import/apply", { token: found.token, leaveOut: [3] });
    expect(careful.body).toMatchObject({ added: 0, merged: 0, replaced: 0, kept: 3, leftOut: 1 });
    expect((await list()).all).toBe(2);
    expect((await app.api("GET", `/api/contacts/${mayaId}`)).body.contact.phones).toHaveLength(1);

    // Chosen one by one: merge the first, replace the second, keep the third as a contact of its own.
    const second = await preview(app, file);
    const chosen = await app.api<ContactImportResult>("POST", "/api/contacts/import/apply", {
      token: second.token,
      choices: { "0": "merge", "1": "replace", "2": "both" },
    });
    expect(chosen.body).toMatchObject({ added: 2, merged: 1, replaced: 1, kept: 0 });

    const merged = (await app.api<{ contact: ContactDto }>("GET", `/api/contacts/${mayaId}`)).body.contact;
    expect(merged.phones).toEqual([
      { value: "07700 900123", label: "mobile" },
      { value: "01632 960200", label: "work" },
    ]);
    expect(merged.emails).toEqual([{ value: "maya@okafor.example", label: "home" }]);
    expect(merged.note).toBe("Night shifts");
    // What only Outpost knew is still there, and what it has no field for was kept.
    expect(merged).toMatchObject({ isEmergency: true, emergencyNote: "Sister", callsign: "M0MAY", tags: ["Family"] });
    expect(merged.otherFields).toEqual(["Date: 2020-01-01"]);

    const after = await list();
    expect(after.contacts.map((contact) => contact.displayName)).toEqual(["Maya Okafor", "João Ferreira", "Sam Whitlock", "Sam Whitlock"]);
    const sams = after.contacts.filter((contact) => contact.displayName === "Sam Whitlock");
    expect(sams.map((contact) => contact.phones.map((phone) => phone.value)).sort()).toEqual([["+44 1632 960777"], ["020 7946 0999"]]);
  });

  it("refuses what is not a vCard file, and a request with no file", async () => {
    const { payload, headers } = upload(Buffer.from("name,phone\nSam,01632 960777\n"), "contacts.csv");
    const response = await app.api("POST", "/api/contacts/import/preview", payload, { headers });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/holds no contacts/);
    expect((await app.api("POST", "/api/contacts/import/preview", {})).status).toBe(400);
  });

  it("takes people chosen in a phone's contact picker through the same steps", async () => {
    await create({ ...named("Sam Whitlock", ""), phones: [{ value: "07700 900321" }] });
    const picked = await app.api<ContactImportPreview>("POST", "/api/contacts/import/preview", {
      picked: [
        { name: ["Sam Whitlock"], tel: ["07700 900321", "01632 960444"] },
        { name: ["Layla Haddad"], email: ["layla@haddad.example"] },
        { name: [], tel: [] },
      ],
    });
    expect(picked.status).toBe(200);
    expect(picked.body.fresh.map((entry) => entry.displayName)).toEqual(["Layla Haddad"]);
    expect(picked.body.duplicates.map((entry) => entry.reason)).toEqual(["name-and-number"]);
    expect(picked.body.unreadable).toEqual([{ position: 3, reason: "It has no name, number or address." }]);
    const applied = await app.api<ContactImportResult>("POST", "/api/contacts/import/apply", { token: picked.body.token, choices: { "0": "merge" } });
    expect(applied.body).toMatchObject({ added: 1, merged: 1 });
    const layla = (await list("?q=layla")).contacts[0]!;
    expect((await app.api("GET", `/api/contacts/${layla.id}`)).body.contact.source).toBe("picker");
  });
});

describe("sending contacts out", () => {
  it("exports what it holds as a vCard file that reads back as the same contacts", async () => {
    await create({
      ...named("Maya", "Okafor"),
      phones: [{ value: "07700 900123", label: "boat shed" }],
      tags: ["Family"],
      isEmergency: true,
      emergencyNote: "Sister; has the keys",
      callsign: "M0MAY",
      channels: [{ frequency: "145.500 MHz", mode: "FM" }],
      note: "Two lines\nof note",
    });
    await create({ kind: "organisation", organisation: "Borrowdale Mountain Rescue", phones: [{ value: "01632 960999", label: "main" }] });

    const response = await app.app.inject({ method: "GET", url: "/api/contacts/export.vcf", headers: { host: "localhost" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/vcard; charset=utf-8");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="outpost-contacts-\d{4}-\d{2}-\d{2}\.vcf"/);
    expect(response.body.match(/BEGIN:VCARD/g)).toHaveLength(2);

    const marked = await app.app.inject({ method: "GET", url: "/api/contacts/export.vcf?emergency=1&version=4.0", headers: { host: "localhost" } });
    expect(marked.body.match(/BEGIN:VCARD/g)).toHaveLength(1);
    expect(marked.body).toContain("VERSION:4.0");
    expect((await app.app.inject({ method: "GET", url: "/api/contacts/export.vcf?tag=nobody", headers: { host: "localhost" } })).statusCode).toBe(404);

    // Into an empty Outpost and out again: nothing gained, nothing lost.
    const other = await createTestApp();
    try {
      const found = await preview(other, response.rawPayload);
      expect(found.fresh).toHaveLength(2);
      await other.api("POST", "/api/contacts/import/apply", { token: found.token });
      const names = (await other.api<ContactListResponse>("GET", "/api/contacts")).body.contacts;
      const maya = (await other.api<{ contact: ContactDto }>("GET", `/api/contacts/${names.find((contact) => contact.displayName === "Maya Okafor")!.id}`)).body.contact;
      expect(maya).toMatchObject({
        phones: [{ value: "07700 900123", label: "boat shed" }],
        tags: ["Family"],
        isEmergency: true,
        emergencyNote: "Sister; has the keys",
        callsign: "M0MAY",
        channels: [{ frequency: "145.500 MHz", mode: "FM" }],
        note: "Two lines\nof note",
      });
      expect(names.find((contact) => contact.kind === "organisation")?.displayName).toBe("Borrowdale Mountain Rescue");
      // And the first Outpost, given its own file back, has nothing to do.
      expect(await preview(app, response.rawPayload)).toMatchObject({ alreadyHere: 2, fresh: [], duplicates: [] });
    } finally {
      await other.close();
    }
  });
});

describe("backups, drives and erasing", () => {
  it("carries contacts in a backup and brings them back on restore", async () => {
    const made = await create({ ...named("Maya", "Okafor"), phones: [{ value: "07700 900123" }], tags: ["Family"], isEmergency: true });
    const backup = (await app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } })).rawPayload;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-restore-"));
    let target = await createTestApp({}, dir);
    try {
      const staged = await target.app.inject({
        method: "POST",
        url: "/api/backup/restore",
        payload: backup,
        headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
      });
      expect(staged.statusCode).toBe(200);
      await target.app.close();
      target = await createTestApp({}, dir);
      const restored = (await target.api<{ contact: ContactDto }>("GET", `/api/contacts/${made.id}`)).body.contact;
      expect(restored).toMatchObject({ displayName: "Maya Okafor", tags: ["Family"], isEmergency: true, phones: [{ value: "07700 900123", label: "" }] });
      expect((await target.api("GET", "/api/search?q=Okafor")).body.results[0]).toMatchObject({ kind: "contact" });
    } finally {
      await target.app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("puts contacts on a portable drive unless they are left off, and never the setting that shares them", async () => {
    await create({ ...named("Maya", "Okafor"), tags: ["Family"] });
    await app.api("PATCH", "/api/settings", { "contacts.carddav": true });
    const drive = async (contacts: boolean) => {
      const file = path.join(app.dir, `drive-${contacts}.db`);
      await app.ctx.sqlite.backup(file);
      prepareDriveDatabase(file, { locationId: "drive-location", locationName: "This drive", locationPath: "/drive/library", collectionIds: [], documentIds: [], madeFrom: "home", contacts });
      const db = new Database(file, { readonly: true });
      try {
        const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
        return {
          contacts: count("SELECT count(*) AS n FROM contacts"),
          tags: count("SELECT count(*) AS n FROM contact_tags"),
          search: count("SELECT count(*) AS n FROM search_entities WHERE kind = 'contact'"),
          setting: count("SELECT count(*) AS n FROM settings WHERE key = 'contacts.carddav'"),
        };
      } finally {
        db.close();
      }
    };
    expect(await drive(true)).toEqual({ contacts: 1, tags: 1, search: 1, setting: 0 });
    expect(await drive(false)).toEqual({ contacts: 0, tags: 0, search: 0, setting: 0 });
  });

  it("counts contacts in what erasing everything would take, and takes them", async () => {
    await create({ ...named("Maya", "Okafor"), note: "Keeps the key to the pump house.", tags: ["Family"] });
    await create({ ...named("Sam", "Whitlock") });
    await app.api("PATCH", "/api/settings", { "contacts.carddav": true });
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal).toMatchObject({ contacts: 2 });

    const started = await app.api<{ job: JobDto }>("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const job = (await app.api<{ job: JobDto }>("GET", `/api/jobs/${started.body.job.id}`)).body.job;
    expect(job.state).toBe("succeeded");
    expect((job.result as CleanupResult).personal).toMatchObject({ contacts: 2 });

    expect((await list()).all).toBe(0);
    const count = (sql: string) => (app.ctx.sqlite.prepare(sql).get() as { n: number }).n;
    expect(count("SELECT count(*) AS n FROM contacts")).toBe(0);
    expect(count("SELECT count(*) AS n FROM contact_tags")).toBe(0);
    expect(count("SELECT count(*) AS n FROM search_entities WHERE kind = 'contact'")).toBe(0);
    expect((await app.api("GET", "/api/search?q=pump")).body.results).toEqual([]);
    // Sharing with phones is a setting, and settings went back to how they start: off.
    expect((await app.api("GET", "/api/contacts/phones")).body.enabled).toBe(false);
  });
});
