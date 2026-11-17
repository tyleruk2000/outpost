/**
 * The household board (Messages): messages, check-ins and files sent from one device to
 * another, on a real server. Every route and every limit; two devices at once; the trail
 * a removed message leaves; files removed when their days are up, by a timer set for the
 * next one due; hostile files served so that no browser runs them; the way a transport
 * (a radio link, later) joins; and the board counted, cleared and erased with the rest of
 * a person's own data.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  BoardMessage,
  BoardMessagesResponse,
  BoardSummaryResponse,
  CleanupPlan,
  LeftoversResponse,
  UsageResponse,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureContents } from "../src/modules/database/inspect.ts";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

/** Each test speaks from an address of its own, so that the limits per address do not run into each other. */
let nextAddress = 10;
const device = () => ({ remoteAddress: `192.168.1.${nextAddress++}` });

const post = (body: unknown, from = device()) => app.api("POST", "/api/board/messages", body, from);
const checkIn = (body: unknown, from = device()) => app.api("POST", "/api/board/check-ins", body, from);
const summary = async (query = "") => (await app.api<BoardSummaryResponse>("GET", `/api/board/summary${query}`)).body;
const page = async (query = "") => (await app.api<BoardMessagesResponse>("GET", `/api/board/messages${query}`)).body;

function sendFile(name: string, content: Buffer | string, fields: Record<string, string> = { author: "Sam" }, from = device()) {
  // The fields go first, as the web app sends them.
  const { payload, headers } = multipart(fields, [{ name, content: Buffer.isBuffer(content) ? content : Buffer.from(content) }]);
  return app.api("POST", "/api/board/files", undefined, { payload, headers, ...from });
}

function heard(type: string): { events: Array<{ id?: string; data?: unknown }>; stop: () => void } {
  const events: Array<{ id?: string; data?: unknown }> = [];
  const stop = app.ctx.events.subscribe((event) => {
    if (event.type === type) events.push(event);
  });
  return { events, stop };
}

async function clearBoard() {
  await app.ctx.services.board.kept.eraseAll();
}

describe("messages", () => {
  it("are posted with a name and kept as plain text, newest at the bottom", async () => {
    await clearBoard();
    const listen = heard("board.changed");
    const first = await post({ author: "  Sam  ", body: "Back by six.\r\nBread in the oven.  " });
    expect(first.status).toBe(200);
    expect(first.body.message).toMatchObject({
      author: "Sam",
      body: "Back by six.\nBread in the oven.",
      kind: "message",
      channel: "board",
      source: "here",
      edited: null,
      removed: null,
    });
    // Markup is words: it is stored as written and never turned into anything.
    const second = await post({ author: "Alex", body: '<img src=x onerror="alert(1)"> <b>hi</b>' });
    expect(second.body.message.body).toBe('<img src=x onerror="alert(1)"> <b>hi</b>');
    const { messages, older } = await page();
    expect(messages.map((message) => message.author)).toEqual(["Sam", "Alex"]);
    expect(older).toBeNull();
    listen.stop();
    expect(listen.events.map((event) => (event.data as { action: string }).action)).toEqual(["posted", "posted"]);
    expect(listen.events[0]!.data).toMatchObject({ author: "Sam", kind: "message", excerpt: "Back by six.\nBread in the oven." });
  });

  it("refuses a message with no name, no words, or more words than the limit, and an unknown field", async () => {
    expect((await post({ author: "   ", body: "Hello" })).status).toBe(400);
    expect((await post({ author: "Sam", body: " \n " })).status).toBe(400);
    const long = await post({ author: "Sam", body: "a".repeat(10_001) });
    expect(long.status).toBe(400);
    expect(long.body.error.message).toMatch(/longer than 10,000 characters/);
    expect((await post({ author: "Sam", body: "a".repeat(10_000) })).status).toBe(200);
    expect((await post({ author: "Sam", body: "Hi", to: "Alex" })).status).toBe(400);
    expect((await post({ author: "Sam", body: "Hi", channel: "../etc" })).status).toBe(400);
  });

  it("cuts a long name to the limit and takes out control characters", async () => {
    const answer = await post({ author: `Sam\u0000‮${"x".repeat(80)}`, body: "Hi" });
    expect(answer.status).toBe(200);
    expect(answer.body.message.author).toBe(`Sam${"x".repeat(37)}`);
    expect((await post({ author: "y".repeat(161), body: "Hi" })).status).toBe(400);
  });

  it("are refused without the header and origin a page on another site cannot send", async () => {
    const plain = await app.app.inject({
      method: "POST",
      url: "/api/board/messages",
      headers: { host: "localhost", "content-type": "application/json" },
      payload: { author: "Mallory", body: "Hi" },
    });
    expect(plain.statusCode).toBe(403);
    const crossSite = await app.api(
      "POST",
      "/api/board/messages",
      { author: "Mallory", body: "Hi" },
      { headers: { origin: "http://evil.example" } },
    );
    expect(crossSite.status).toBe(403);
    const file = await app.app.inject({ method: "POST", url: "/api/board/files", headers: { host: "localhost" }, payload: "x" });
    expect(file.statusCode).toBe(403);
  });

  it("are limited per address to more than a household would ever send in a minute", async () => {
    const from = device();
    for (let index = 0; index < 30; index += 1) expect((await post({ author: "Sam", body: `Line ${index}` }, from)).status).toBe(200);
    const over = await post({ author: "Sam", body: "One too many" }, from);
    expect(over.status).toBe(429);
    expect(over.body.error.message).toMatch(/a lot of messages from one device in a minute\. Try again in \d+ seconds?\./);
    // Another device on the network is not held up by it.
    expect((await post({ author: "Alex", body: "Still here" })).status).toBe(200);
  });

  it("are paged, fifty at a time, from the newest back", async () => {
    await clearBoard();
    for (let index = 0; index < 120; index += 1) app.ctx.services.board.post({ channel: "board", author: "Sam", body: `Message ${index}` });
    const first = await page();
    expect(first.messages).toHaveLength(50);
    expect(first.messages.at(-1)!.body).toBe("Message 119");
    expect(first.messages[0]!.body).toBe("Message 70");
    const second = await page(`?before=${first.older}`);
    expect(second.messages.map((message) => message.body)).toEqual(Array.from({ length: 50 }, (_, index) => `Message ${20 + index}`));
    const third = await page(`?before=${second.older}`);
    expect(third.messages).toHaveLength(20);
    expect(third.older).toBeNull();
    expect((await app.api("GET", "/api/board/messages?before=nothing")).status).toBe(404);
    expect((await app.api("GET", "/api/board/messages?limit=500")).status).toBe(400);
  });

  it("keeps channels apart", async () => {
    await clearBoard();
    await post({ author: "Sam", body: "Kitchen" });
    await post({ author: "Sam", body: "Over the radio", channel: "meshtastic:longfast" });
    expect((await page()).messages.map((message) => message.body)).toEqual(["Kitchen"]);
    expect((await page("?channel=meshtastic:longfast")).messages.map((message) => message.body)).toEqual(["Over the radio"]);
  });
});

describe("editing and removing", () => {
  it("is open to anyone, says who did it, and refuses an edit based on an old copy", async () => {
    await clearBoard();
    const { message } = (await post({ author: "Sam", body: "Back by six" })).body;
    const edited = await app.api(
      "PATCH",
      `/api/board/messages/${message.id}`,
      { by: "Alex", body: "Back by seven", baseUpdatedAt: message.updatedAt },
      device(),
    );
    expect(edited.status).toBe(200);
    expect(edited.body.message).toMatchObject({ author: "Sam", body: "Back by seven", edited: { by: "Alex" } });
    expect(edited.body.message.updatedAt).toBeGreaterThan(message.updatedAt);
    const stale = await app.api(
      "PATCH",
      `/api/board/messages/${message.id}`,
      { by: "Jo", body: "Back by eight", baseUpdatedAt: message.updatedAt },
      device(),
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toMatch(/changed on another device/);
    expect((await app.api("GET", `/api/board/messages/${message.id}`)).body.message.body).toBe("Back by seven");
    expect(
      (
        await app.api(
          "PATCH",
          `/api/board/messages/${message.id}`,
          { by: "Jo", body: "", baseUpdatedAt: edited.body.message.updatedAt },
          device(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.api("PATCH", `/api/board/messages/${message.id}`, {
          by: "Jo",
          status: "safe",
          baseUpdatedAt: edited.body.message.updatedAt,
        })
      ).status,
    ).toBe(400);
  });

  it("leaves a trail when a message is removed: who wrote it, who removed it and when, and none of its words", async () => {
    await clearBoard();
    const { message } = (
      await checkIn({
        author: "Sam",
        status: "safe",
        body: "At the shop",
        place: "Tesco",
        position: { lat: 51.5, lon: -0.1, accuracyM: 20 },
      })
    ).body;
    const listen = heard("board.changed");
    const removed = await app.api("POST", `/api/board/messages/${message.id}/remove`, { by: "Alex" }, device());
    listen.stop();
    expect(removed.status).toBe(200);
    expect(removed.body.message).toMatchObject({
      id: message.id,
      author: "Sam",
      kind: "checkin",
      body: "",
      place: null,
      position: null,
      removed: { by: "Alex" },
    });
    expect(removed.body.message.removed.at).toBeGreaterThanOrEqual(message.createdAt);
    expect(listen.events[0]!.data).toMatchObject({ action: "removed", author: "Alex" });
    // Still in the history, in its place.
    expect((await page()).messages.map((entry) => entry.removed?.by)).toEqual(["Alex"]);
    // Its words are not left in the row either.
    const row = app.ctx.sqlite.prepare("SELECT body, place, lat, lon FROM board_messages WHERE id = ?").get(message.id);
    expect(row).toEqual({ body: "", place: null, lat: null, lon: null });
    // A removed check-in no longer counts as the latest.
    expect((await summary()).checkIns.find((line) => line.name === "Sam")).toBeUndefined();
    // It cannot be edited back, and removing it again changes nothing.
    expect(
      (await app.api("PATCH", `/api/board/messages/${message.id}`, { by: "Jo", body: "x", baseUpdatedAt: removed.body.message.updatedAt }))
        .status,
    ).toBe(409);
    expect((await app.api("POST", `/api/board/messages/${message.id}/remove`, { by: "Jo" })).body.message.removed.by).toBe("Alex");
    expect((await app.api("POST", "/api/board/messages/nothing/remove", { by: "Jo" })).status).toBe(404);
    expect((await app.api("POST", `/api/board/messages/${message.id}/remove`, {})).status).toBe(400);
  });
});

describe("check-ins", () => {
  it("are messages with a status, a place in words and, if chosen, a position, and the latest of each person is listed", async () => {
    await clearBoard();
    const safe = await checkIn({ author: "Sam", status: "safe", place: "gone to Mum's" });
    expect(safe.status).toBe(200);
    expect(safe.body.message).toMatchObject({ kind: "checkin", status: "safe", body: "", place: "gone to Mum's", position: null });
    await checkIn({ author: "Alex", status: "help", body: "Car won't start", position: { lat: 54.5, lon: -3.2, accuracyM: null } });
    await checkIn({ author: "sam", status: "other", body: "On the train" });
    const { checkIns } = await summary();
    expect(checkIns.map((line) => [line.name, line.latest?.status, line.latest?.body])).toEqual([
      ["Alex", "help", "Car won't start"],
      ["sam", "other", "On the train"],
    ]);
    expect(checkIns[0]!.latest!.hasPosition).toBe(true);
    // A check-in is also in the history.
    expect((await page()).messages.map((message) => message.kind)).toEqual(["checkin", "checkin", "checkin"]);
  });

  it("refuses words of your own with no words, a status it does not know, and a position off the globe", async () => {
    expect((await checkIn({ author: "Sam", status: "other" })).status).toBe(400);
    expect((await checkIn({ author: "Sam", status: "fine" })).status).toBe(400);
    expect((await checkIn({ author: "Sam", status: "safe", position: { lat: 91, lon: 0, accuracyM: null } })).status).toBe(400);
    expect((await checkIn({ author: "Sam", status: "safe", position: { lat: 1, lon: 0 } })).status).toBe(400);
    expect((await checkIn({ author: "Sam", status: "safe", place: "p".repeat(241) })).status).toBe(400);
    const cut = await checkIn({ author: "Sam", status: "safe", place: "p".repeat(200) });
    expect(cut.body.message.place).toHaveLength(120);
  });

  it("lists the household's people first, with no check-in for those who have not, and offers their names", async () => {
    await clearBoard();
    const { supplies } = app.ctx.services;
    const member = { band: null, sex: null, kcalPerDay: null, drinkingLitres: null, allUsesLitres: null, note: "" };
    const { updatedAt: _, ...household } = supplies.household();
    supplies.setHousehold({
      ...household,
      members: [
        { ...member, kind: "person", name: "Alex" },
        { ...member, kind: "pet", name: "Rex", kcalPerDay: 900 },
      ],
    });
    await checkIn({ author: "Jo", status: "safe" });
    const result = await summary();
    expect(result.people).toContain("Alex");
    expect(result.people).not.toContain("Rex");
    expect(result.checkIns.map((line) => [line.name, line.latest?.status ?? null])).toEqual([
      ["Alex", null],
      ["Jo", "safe"],
    ]);
  });

  it("says how many messages are newer than a time a device last looked", async () => {
    await clearBoard();
    expect((await summary("?since=0")).newSince).toBe(0);
    expect((await summary()).newestAt).toBeNull();
    const { message } = (await post({ author: "Sam", body: "One" })).body;
    await post({ author: "Sam", body: "Two" });
    const result = await summary(`?since=${message.createdAt - 1}`);
    expect(result.newSince).toBe(2);
    expect(result.newestAt).toBeGreaterThanOrEqual(message.createdAt);
    expect(result.fileDays).toBe(7);
    expect(result.limits.fileBytes).toBe(200_000_000);
  });
});

describe("two devices at once", () => {
  it("both post, both hear of each other, and only one of two edits made from the same copy is kept", async () => {
    await clearBoard();
    const listen = heard("board.changed");
    const [kitchen, phone] = [device(), device()];
    const posted = await Promise.all([
      post({ author: "Sam", body: "From the kitchen" }, kitchen),
      checkIn({ author: "Alex", status: "safe", place: "at work" }, phone),
      post({ author: "Sam", body: "Again from the kitchen" }, kitchen),
    ]);
    expect(posted.map((answer) => answer.status)).toEqual([200, 200, 200]);
    expect((await page()).messages).toHaveLength(3);
    expect(listen.events).toHaveLength(3);
    const message = posted[0]!.body.message;
    const edits = await Promise.all([
      app.api(
        "PATCH",
        `/api/board/messages/${message.id}`,
        { by: "Sam", body: "Kitchen, edited", baseUpdatedAt: message.updatedAt },
        kitchen,
      ),
      app.api("PATCH", `/api/board/messages/${message.id}`, { by: "Alex", body: "Phone, edited", baseUpdatedAt: message.updatedAt }, phone),
    ]);
    expect(edits.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const kept = edits.find((answer) => answer.status === 200)!.body.message.body;
    expect((await app.api("GET", `/api/board/messages/${message.id}`)).body.message.body).toBe(kept);
    listen.stop();
  });
});

describe("files sent on the board", () => {
  it("are kept in Outpost's data folder and saved by anyone, with their name, size and who sent them", async () => {
    await clearBoard();
    const sent = await sendFile("Shopping list.txt", "Milk\nBread\n", { author: "Sam", body: "For whoever goes" });
    expect(sent.status).toBe(200);
    const { message } = sent.body;
    expect(message).toMatchObject({
      author: "Sam",
      body: "For whoever goes",
      file: { name: "Shopping list.txt", sizeBytes: 11, picture: false, gone: null },
    });
    expect(message.file!.expiresAt).toBe(message.createdAt + 7 * 24 * 60 * 60 * 1000);
    const download = await app.app.inject({ method: "GET", url: message.file!.url!, headers: { host: "localhost" } });
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe("Milk\nBread\n");
    expect(download.headers["content-type"]).toBe("application/octet-stream");
    expect(download.headers["content-disposition"]).toMatch(/^attachment; filename="Shopping list.txt"/);
    const stored = app.ctx.services.board.files.get(message.file!.id);
    expect(app.ctx.services.board.files.filePath(stored).startsWith(path.join(app.ctx.config.dataDir, "board"))).toBe(true);
  });

  it("serve a hostile file so that no browser runs it: an HTML page, an SVG with a script, a name with path separators", async () => {
    const html = (await sendFile("page.html", "<html><script>fetch('/api/notes')</script></html>")).body.message;
    const svg = (await sendFile("logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).body.message;
    const sneaky = (await sendFile("../../..\\outpost.db/evil.html", "<script>1</script>")).body.message;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const picture = (await sendFile("photo.png", png)).body.message;
    // A picture by name only is not a picture.
    const pretend = (await sendFile("photo.jpg", "<html><script>alert(1)</script></html>")).body.message;

    for (const message of [html, svg, sneaky, pretend]) {
      expect(message.file!.picture, message.file!.name).toBe(false);
      const answer = await app.app.inject({ method: "GET", url: message.file!.url!, headers: { host: "localhost" } });
      expect(answer.statusCode).toBe(200);
      expect(answer.headers["content-type"]).toBe("application/octet-stream");
      expect(answer.headers["content-disposition"]).toMatch(/^attachment;/);
      expect(answer.headers["x-content-type-options"]).toBe("nosniff");
      expect(answer.headers["content-security-policy"]).toMatch(/^sandbox; default-src 'none'/);
    }
    // The name keeps no path: it is one name, inside the board's own folder.
    expect(sneaky.file!.name).not.toMatch(/[/\\]/);
    expect(sneaky.file!.name).not.toMatch(/^\./);
    const where = app.ctx.services.board.files.filePath(app.ctx.services.board.files.get(sneaky.file!.id));
    expect(where.startsWith(path.join(app.ctx.config.dataDir, "board") + path.sep)).toBe(true);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "evil.html"))).toBe(false);

    expect(picture.file!.picture).toBe(true);
    const shown = await app.app.inject({ method: "GET", url: picture.file!.url!, headers: { host: "localhost" } });
    expect(shown.headers["content-type"]).toBe("image/png");
    expect(shown.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(shown.headers["content-security-policy"]).toMatch(/^sandbox/);
  });

  it("refuses a file over the size limit, an empty one, more than the board keeps, and too many from one device", async () => {
    const { limits } = app.ctx.services.board.files;
    const saved = { ...limits };
    try {
      limits.fileBytes = 1000;
      const big = await sendFile("big.bin", Buffer.alloc(1001, 1));
      expect(big.status).toBe(413);
      expect(big.body.error.message).toMatch(/larger than 1000 B|larger than 1 kB|larger than 1,000 B|larger than/);
      expect((await sendFile("exact.bin", Buffer.alloc(1000, 1))).status).toBe(200);
      expect((await sendFile("empty.txt", "")).status).toBe(400);
      expect((await sendFile("a.txt", "a", {})).status).toBe(400);

      await clearBoard();
      limits.filesKept = 2;
      expect((await sendFile("one.txt", "1")).status).toBe(200);
      expect((await sendFile("two.txt", "2")).status).toBe(200);
      const third = await sendFile("three.txt", "3");
      expect(third.status).toBe(507);
      expect(third.body.error.message).toMatch(/already holds 2 files/);
      // Nothing of the refused file is left behind.
      expect(app.ctx.services.board.files.kept().count).toBe(2);
      expect(fs.readdirSync(path.join(app.ctx.config.dataDir, "board", ".incoming"))).toEqual([]);
    } finally {
      Object.assign(limits, saved);
    }
    const from = device();
    for (let index = 0; index < 30; index += 1) await sendFile(`n${index}.txt`, "n", { author: "Sam" }, from);
    const over = await sendFile("over.txt", "n", { author: "Sam" }, from);
    expect(over.status).toBe(429);
    expect(over.body.error.message).toMatch(/a lot of files from one device in an hour/);
    await clearBoard();
  });

  it("go when their days are up, by a timer set for the next one due, and their message says so", async () => {
    await clearBoard();
    const { board } = app.ctx.services;
    expect(board.nextExpiryAt()).toBeNull();
    const first = (await sendFile("first.txt", "1")).body.message;
    const second = (await sendFile("second.txt", "2")).body.message;
    // The timer is for the first file due, a week away: not a tick.
    expect(board.nextExpiryAt()).toBe(first.file!.expiresAt);
    const soon = Date.now() + 150;
    app.ctx.sqlite.prepare("UPDATE board_files SET expires_at = ? WHERE id = ?").run(soon, second.file!.id);
    board.schedule();
    expect(board.nextExpiryAt()).toBe(soon);
    const listen = heard("board.changed");
    await new Promise((resolve) => setTimeout(resolve, 500));
    listen.stop();
    const after = (await app.api("GET", `/api/board/messages/${second.id}`)).body.message as BoardMessage;
    expect(after.file).toMatchObject({ name: "second.txt", gone: { reason: "expired" }, url: null });
    expect(
      (await app.app.inject({ method: "GET", url: `/api/board/files/${second.file!.id}`, headers: { host: "localhost" } })).statusCode,
    ).toBe(404);
    expect(listen.events.map((event) => (event.data as { action: string }).action)).toEqual(["expired"]);
    // The timer moved on to the next one due.
    expect(board.nextExpiryAt()).toBe(first.file!.expiresAt);
    expect(fs.existsSync(path.join(board.files.root, second.file!.id.slice(-2), second.file!.id))).toBe(false);
  });

  it("are kept until removed when the setting says 0 days, for files already sent too", async () => {
    await clearBoard();
    const sent = (await sendFile("keep.txt", "k")).body.message;
    expect(sent.file!.expiresAt).not.toBeNull();
    expect((await app.api("PATCH", "/api/settings", { "board.fileDays": 0 })).status).toBe(200);
    expect((await app.api("GET", `/api/board/messages/${sent.id}`)).body.message.file.expiresAt).toBeNull();
    expect(app.ctx.services.board.nextExpiryAt()).toBeNull();
    expect((await app.api("PATCH", "/api/settings", { "board.fileDays": 3 })).status).toBe(200);
    expect((await app.api("GET", `/api/board/messages/${sent.id}`)).body.message.file.expiresAt).toBe(
      sent.createdAt + 3 * 24 * 60 * 60 * 1000,
    );
    expect((await app.api("PATCH", "/api/settings", { "board.fileDays": 366 })).status).toBe(400);
    await app.api("PATCH", "/api/settings", { "board.fileDays": 7 });
  });

  it("go with the message when it is removed", async () => {
    await clearBoard();
    const sent = (await sendFile("photo.txt", "p")).body.message;
    const removed = (await app.api("POST", `/api/board/messages/${sent.id}/remove`, { by: "Jo" })).body.message as BoardMessage;
    expect(removed.file).toMatchObject({ gone: { reason: "removed" }, url: null });
    expect(app.ctx.services.board.files.kept().count).toBe(0);
  });

  it("can be added to the library, which takes a copy and leaves the board's file as it is", async () => {
    await clearBoard();
    const sent = (await sendFile("Recipe.txt", "Two eggs, a cup of flour.", { author: "Alex" })).body.message;
    const added = await app.api("POST", `/api/board/files/${sent.file!.id}/library`, {});
    expect(added.status).toBe(200);
    expect(added.body.status).toBe("created");
    expect(added.body.document.source).toMatch(/^Sent on the household board by Alex on \d{4}-\d{2}-\d{2}$/);
    const again = await app.api("POST", `/api/board/files/${sent.file!.id}/library`, {});
    expect(again.body.status).toBe("duplicate");
    expect((await app.app.inject({ method: "GET", url: sent.file!.url!, headers: { host: "localhost" } })).statusCode).toBe(200);
    await app.api("POST", `/api/board/messages/${sent.id}/remove`, { by: "Alex" });
    expect((await app.api("POST", `/api/board/files/${sent.file!.id}/library`, {})).status).toBe(404);
  });
});

describe("a transport", () => {
  it("is handed what is posted on a channel it carries, and what it hears is kept once and not handed back", async () => {
    await clearBoard();
    const { board } = app.ctx.services;
    const sent: BoardMessage[] = [];
    const told: string[] = [];
    const remove = board.addTransport({
      name: "test-radio",
      carries: (channel) => channel === "radio:test",
      send: (message) => void sent.push(message),
    });
    const stop = board.onMessage((message, how) => told.push(`${how}:${message.body}`));
    try {
      await post({ author: "Sam", body: "Over the air", channel: "radio:test" });
      await post({ author: "Sam", body: "Kitchen only" });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sent.map((message) => message.body)).toEqual(["Over the air"]);

      const incoming = {
        channel: "radio:test",
        source: "test-radio",
        externalId: "abc123",
        author: "Node 7",
        body: "Heard you",
        meta: { snr: 4.5 },
      };
      const kept = board.receive(incoming);
      expect(kept).toMatchObject({ source: "test-radio", author: "Node 7", body: "Heard you", channel: "radio:test" });
      expect(board.receive(incoming)).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sent).toHaveLength(1);
      expect(told).toEqual(["posted:Over the air", "posted:Kitchen only", "received:Heard you"]);
      board.setMeta(kept!.id, { delivered: true });
      expect(app.ctx.sqlite.prepare("SELECT meta FROM board_messages WHERE id = ?").get(kept!.id)).toEqual({ meta: '{"delivered":true}' });
      expect(() => board.receive({ ...incoming, source: "here", externalId: "x" })).toThrow();
    } finally {
      remove();
      stop();
    }
  });
});

describe("the board as a person's own data", () => {
  it("is counted under Storage, Database, in what is taking the space, and in what erasing everything takes", async () => {
    await clearBoard();
    await post({ author: "Sam", body: "Hello" });
    await sendFile("note.txt", "12345");
    const contents = measureContents(path.join(app.ctx.config.dataDir, "outpost.db"));
    expect(contents.counts.find((count) => count.id === "boardMessages")?.count).toBe(2);
    const usage = (await app.api<UsageResponse>("GET", "/api/manage/usage")).body;
    expect(usage.rows.find((row) => row.id === "board")).toMatchObject({ count: 1 });
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.board).toEqual({ messages: 2, files: 1, fileBytes: 5 });
  });

  it("is listed under Manage and clean up and emptied from there, files and all", async () => {
    const listed = (await app.api<LeftoversResponse>("GET", "/api/manage/leftovers")).body;
    const item = listed.items.find((entry) => entry.id === "board:all");
    expect(item).toMatchObject({ kind: "board", title: "Messages and files on the board", count: 2, bytes: 5, href: "/messages" });
    const cleared = await app.api("POST", "/api/manage/leftovers/clear", { ids: ["board:all"] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.cleared).toEqual({ count: 2, bytes: 5 });
    expect(app.ctx.services.board.kept.count()).toEqual({ messages: 0, files: 0, fileBytes: 0 });
    expect(fs.existsSync(app.ctx.services.board.files.root)).toBe(false);
  });
});
