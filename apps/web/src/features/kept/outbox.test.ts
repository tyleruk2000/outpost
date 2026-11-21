/** Check-ins and pages written on a phone out of reach: kept as written, sent once the server is back, kept when refused. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeCaches } from "./fake-caches";
import { addCheckIn, addPage, editFor, forgetOutboxSnapshot, keepEdit, listOutbox, sendOutbox, textDoc } from "./outbox";
import { sentWords } from "./outbox-list";

const T = Date.UTC(2026, 10, 21, 14);

let restore: () => void;
let server: {
  down: boolean;
  refuse: boolean;
  locked?: boolean;
  /** When set, the page was saved on Outpost at this time, after the phone's copy. */
  conflictAt?: number;
  posts: Array<{ path: string; body: Record<string, unknown> }>;
};

beforeEach(() => {
  ({ restore } = installFakeCaches());
  forgetOutboxSnapshot();
  server = { down: false, refuse: false, posts: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (server.down) throw new TypeError("Failed to fetch");
      const path = new URL(String(input), window.location.origin).pathname;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
      if (server.refuse) return json({ error: { code: "bad_request", message: "Write a name first." } }, 400);
      if (server.locked) return json({ error: { code: "locked", message: "This device can read but not change anything." } }, 403);
      server.posts.push({ path, body });
      if (path.startsWith("/api/notes/") && server.conflictAt) {
        return json(
          {
            error: {
              code: "conflict",
              message: "Changed elsewhere.",
              details: { current: { updatedAt: server.conflictAt, title: "Plan" } },
            },
          },
          409,
        );
      }
      if (path.startsWith("/api/notes/")) return json({ note: { id: "plan", updatedAt: T + 9000 } });
      if (path === "/api/notes") return json({ note: { id: "n1", title: body.title } });
      return json({ message: { id: "m1" } });
    }),
  );
});

afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

describe("writing out of reach", () => {
  it("keeps what was written and sends it, oldest first, with the time it was written", async () => {
    await addCheckIn({ author: "Sam", status: "safe", body: "", place: "At work" }, T);
    await addPage({ title: "River", text: "At the step.\n\nRising." }, T + 1000);
    expect((await listOutbox()).map((item) => item.kind)).toEqual(["checkin", "page"]);

    const sent = await sendOutbox();
    expect(sent.checkIns).toBe(1);
    expect(sent.pages).toEqual([{ id: "n1", title: "River" }]);
    expect(server.posts[0]!.path).toBe("/api/board/check-ins");
    expect(server.posts[0]!.body).toMatchObject({ author: "Sam", status: "safe", place: "At work", writtenAt: T });
    expect(String(server.posts[0]!.body.clientId)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(server.posts[1]!.body.content).toEqual(textDoc("At the step.\n\nRising."));
    expect(await listOutbox()).toEqual([]);
    expect(sentWords(sent)).toMatch(/^Sent 1 check-in and 1 page written on this \w+ while Outpost was out of reach\.$/);
  });

  it("leaves everything on the phone while the server cannot be reached", async () => {
    await addCheckIn({ author: "Sam", status: "help", body: "Car stuck", place: null }, T);
    server.down = true;
    const sent = await sendOutbox();
    expect(sent.checkIns).toBe(0);
    expect(await listOutbox()).toHaveLength(1);
  });

  it("keeps a refused one with the server's words, and does not send it again by itself", async () => {
    await addCheckIn({ author: "Sam", status: "safe", body: "", place: null }, T);
    server.refuse = true;
    expect((await sendOutbox()).refused).toBe(1);
    const [item] = await listOutbox();
    expect(item?.refused).toBe("Write a name first.");
    server.refuse = false;
    expect((await sendOutbox()).checkIns).toBe(0);
  });

  it("sends a new page with the phone's id for it, so that sending it again makes no second page", async () => {
    const page = await addPage({ title: "River", text: "Rising." }, T);
    await sendOutbox();
    expect(server.posts[0]!.body.clientId).toBe(page.id);
  });

  it("sends changes to a kept page on top of the copy they were made on", async () => {
    await keepEdit({ noteId: "plan", title: "Plan", content: textDoc("Meet at the bridge."), base: T });
    await keepEdit({ noteId: "plan", title: "Plan", content: textDoc("Meet at the church."), base: T });
    expect(await listOutbox()).toHaveLength(1);
    const sent = await sendOutbox();
    expect(sent.edits).toBe(1);
    expect(server.posts[0]).toMatchObject({ path: "/api/notes/plan", body: { baseUpdatedAt: T, content: textDoc("Meet at the church.") } });
    expect(await listOutbox()).toEqual([]);
    expect(sentWords(sent)).toMatch(/^Sent changes to 1 page written on this/);
  });

  it("keeps changes to a page saved on Outpost since, for its screen to settle, and sends them no more", async () => {
    await keepEdit({ noteId: "plan", title: "Plan", content: textDoc("Meet at the church."), base: T });
    server.conflictAt = T + 5000;
    const sent = await sendOutbox();
    expect(sent.conflicts).toEqual([{ id: "plan", title: "Plan" }]);
    expect(sentWords(sent)).toMatch(/^1 page changed on Outpost too: open it to choose which version to keep\.$/);
    const [held] = await listOutbox();
    expect(held).toMatchObject({ kind: "edit", conflict: { updatedAt: T + 5000 } });
    expect((await editFor("plan"))?.conflict?.updatedAt).toBe(T + 5000);
    server.posts = [];
    await sendOutbox();
    expect(server.posts).toEqual([]);
  });

  it("waits, without marking anything refused, while this device needs the household PIN", async () => {
    await addCheckIn({ author: "Sam", status: "safe", body: "", place: null }, T);
    server.locked = true;
    const sent = await sendOutbox();
    expect(sent.locked).toBe(true);
    expect((await listOutbox())[0]?.refused).toBeUndefined();
    expect(sentWords(sent)).toMatch(/needs the household PIN/);
  });

  it("makes plain text a page of paragraphs, with line breaks kept", () => {
    expect(textDoc("One\ntwo\n\nThree")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "One" }, { type: "hardBreak" }, { type: "text", text: "two" }] },
        { type: "paragraph", content: [{ type: "text", text: "Three" }] },
      ],
    });
  });
});
