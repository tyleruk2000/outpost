/**
 * Every tool a language model may call only reads. For the whole registry (a tool added
 * to TOOLS is held to this with no change here), on a server with something in every
 * area, each tool is called along its main path while:
 *
 *  - anything that would reach the network fails the test: `fetch`, `http.request`,
 *    `https.request` and their `get`, undici's Agent (which the server's own HTTP client
 *    uses), and a socket connecting at all;
 *  - queuing a job, starting a download or publishing a live event fails the test;
 *  - SQLite's count of changed rows (`total_changes()`) is the same before and after.
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { TOOL_AREAS } from "@outpost/shared";
import { Agent } from "undici";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TOOLS } from "../src/modules/tools/registry.ts";
import { type Filled, filledServer } from "./fixtures/tools/filled.ts";

let filled: Filled;
beforeAll(async () => {
  filled = await filledServer();
}, 120_000);
afterAll(async () => {
  await filled?.close();
});

/** Arguments that reach each tool's main path. A tool not named here is called with none. */
const MAIN_PATH: Record<string, Record<string, unknown>> = {
  search_library: { query: "boil water" },
  find_places: { kind: "supermarket", near: "Northampton" },
  nearest_place: { kind: "hospital", near: "home" },
  supplies: {},
  emergency_plans: { plan: "power cut" },
  weather: { what: "all" },
  sun_and_compass: { near: "home", date: "2026-11-17 12:00" },
  radio_frequencies: { kind: "emergency", near: "GB" },
  repeaters_near: { near: "Northampton" },
  saved_predictions: {},
  search_catalogue: { subject: "first aid" },
  board_messages: {},
};

const changes = () => (filled.app.ctx.sqlite.prepare("SELECT total_changes() AS n").get() as { n: number }).n;

/** Replaces everything that could reach out or change something with a function that fails the test. Returns the undo. */
function forbidOutsideEffects(): { failures: string[]; restore(): void } {
  const failures: string[] = [];
  const refuse = (what: string) => () => {
    failures.push(what);
    throw new Error(`A tool tried to use ${what}.`);
  };
  const { ctx } = filled.app;
  const spies = [
    vi.spyOn(globalThis, "fetch").mockImplementation(refuse("fetch")),
    vi.spyOn(http, "request").mockImplementation(refuse("http.request")),
    vi.spyOn(http, "get").mockImplementation(refuse("http.get")),
    vi.spyOn(https, "request").mockImplementation(refuse("https.request")),
    vi.spyOn(https, "get").mockImplementation(refuse("https.get")),
    vi.spyOn(Agent.prototype, "dispatch").mockImplementation(refuse("undici")),
    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(refuse("a network socket")),
    vi.spyOn(ctx.jobs, "enqueue").mockImplementation(refuse("ctx.jobs.enqueue")),
    vi.spyOn(ctx.services.downloads, "start").mockImplementation(refuse("ctx.services.downloads.start")),
    vi.spyOn(ctx.events, "publish").mockImplementation(refuse("ctx.events.publish")),
  ];
  return {
    failures,
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

describe("the registry", () => {
  it("gives every tool a valid name, a title and an area that has a switch", () => {
    const areas = new Set(TOOL_AREAS.map((entry) => entry.area));
    const names = new Set<string>();
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(names.has(tool.name), `${tool.name} is in the registry twice`).toBe(false);
      names.add(tool.name);
      expect(tool.title.trim().length, `${tool.name} has no title`).toBeGreaterThan(0);
      expect(areas.has(tool.area), `${tool.name}'s area ${tool.area}`).toBe(true);
      expect(tool.description.trim().length, `${tool.name} has no description`).toBeGreaterThan(0);
    }
  });

  it("is what the tools service offers", () => {
    expect(filled.app.ctx.services.tools.all).toEqual(TOOLS);
  });
});

describe("every tool only reads", () => {
  for (const tool of TOOLS) {
    it(`${tool.name} reaches nothing outside and changes nothing`, async () => {
      const { ctx } = filled.app;
      await ctx.jobs.whenIdle();
      let args = MAIN_PATH[tool.name] ?? {};
      if (tool.name === "read_passage") {
        // A passage number found the way a model finds one.
        const found = await ctx.services.tools.call("search_library", { query: "boil water" }, { signal: new AbortController().signal });
        args = { passage: Number(/Passage (\d+)/.exec(found.text)?.[1]) };
      }
      const before = changes();
      const guard = forbidOutsideEffects();
      let result: Awaited<ReturnType<typeof ctx.services.tools.call>>;
      try {
        result = await ctx.services.tools.call(tool.name, args, { signal: new AbortController().signal });
      } finally {
        guard.restore();
      }
      expect(guard.failures).toEqual([]);
      expect(changes(), "rows changed in SQLite").toBe(before);
      expect(result.ok, `${tool.name}: ${result.text}`).toBe(true);
      expect(result.held, `${tool.name} should find what the filled server holds: ${result.text}`).toBe(true);
      expect(result.text.length).toBeGreaterThan(0);
    });
  }
});
