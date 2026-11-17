/**
 * What the games keep is the household's own data: one row of `game_saves` per game, a
 * tally for each game of cards, numbers or pieces, bounded and checked as it is sent,
 * counted where Outpost says what is stored, in the database a backup copies, cleared on
 * request, and erased with everything else.
 */
import fs from "node:fs";
import path from "node:path";
import type { CleanupPlan, CleanupResult, GamesResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureContents } from "../src/modules/database/inspect.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

const get = async () => (await app.api<GamesResponse>("GET", "/api/games")).body;

async function waitForJob(id: string) {
  let job = app.ctx.jobs.get(id);
  for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    job = app.ctx.jobs.get(id);
  }
  return job;
}

describe("a game's tally", () => {
  it("starts empty for every game", async () => {
    expect(await get()).toEqual({ tallies: { patience: {}, sudoku: {}, draughts: {}, pairs: {} }, allotmentStarted: false });
    expect(app.ctx.services.games.kept.count()).toEqual({ saves: 0 });
  });

  it("counts games played and won for each way of playing, keeping the best time and fewest moves of a win", async () => {
    expect((await app.api("POST", "/api/games/patience/results", { variant: "draw-1", won: false, seconds: 30, moves: 10 })).status).toBe(
      200,
    );
    await app.api("POST", "/api/games/patience/results", { variant: "draw-1", won: true, seconds: 300, moves: 120 });
    await app.api("POST", "/api/games/patience/results", { variant: "draw-1", won: true, seconds: 400, moves: 100 });
    const answer = await app.api("POST", "/api/games/patience/results", { variant: "draw-3", won: true });
    expect(answer.body.tally["draw-3"]).toMatchObject({ played: 1, won: 1, bestSeconds: null, fewestMoves: null });
    const { tallies } = await get();
    // A lost game's quick time is not a best.
    expect(tallies.patience["draw-1"]).toMatchObject({ played: 3, won: 2, bestSeconds: 300, fewestMoves: 100 });
    expect(tallies.patience["draw-1"]?.lastAt).toBeGreaterThan(0);
    expect(tallies.sudoku).toEqual({});
  });

  it("refuses a game, a way of playing or a figure that is not one, saying why", async () => {
    expect((await app.api("POST", "/api/games/chess/results", { variant: "x", won: true })).status).toBe(400);
    expect((await app.api("POST", "/api/games/allotment/results", { variant: "x", won: true })).status).toBe(400);
    expect((await app.api("POST", "/api/games/sudoku/results", { variant: "draw-1", won: true })).status).toBe(400);
    expect((await app.api("POST", "/api/games/sudoku/results", { variant: "gentle", won: true, seconds: -1 })).status).toBe(400);
    expect((await app.api("POST", "/api/games/sudoku/results", { variant: "gentle", won: true, seconds: 1e9 })).status).toBe(400);
    expect((await app.api("POST", "/api/games/pairs/results", { variant: "small", won: true, board: [1, 2, 3] })).status).toBe(400);
    expect((await get()).tallies.sudoku).toEqual({});
  });

  it("is cleared on request, one game at a time", async () => {
    await app.api("POST", "/api/games/pairs/results", { variant: "small", won: true, seconds: 40, moves: 9 });
    const cleared = await app.api("DELETE", "/api/games/patience");
    expect(cleared.body).toEqual({ removed: true });
    const after = await get();
    expect(after.tallies.patience).toEqual({});
    expect(after.tallies.pairs.small).toMatchObject({ played: 1, fewestMoves: 9 });
    expect((await app.api("DELETE", "/api/games/patience")).body).toEqual({ removed: false });
  });

  it("reads a damaged tally as nothing rather than failing", async () => {
    app.ctx.sqlite
      .prepare("INSERT INTO game_saves (id, state, version, created_at, updated_at) VALUES ('draughts', ?, 1, 1, 1)")
      .run(JSON.stringify({ computer: { played: "many", won: -5 }, junk: 3 }));
    const { tallies } = await get();
    expect(tallies.draughts).toEqual({ computer: { played: 0, won: 0, bestSeconds: null, fewestMoves: null, lastAt: null } });
    await app.api("POST", "/api/games/draughts/results", { variant: "computer", won: true });
    expect((await get()).tallies.draughts.computer).toMatchObject({ played: 1, won: 1 });
  });
});

describe("a person's own data", () => {
  it("is counted on the Storage screen and in the plan for erasing everything, and in the backup's snapshot", async () => {
    const saves = app.ctx.services.games.kept.count().saves;
    expect(saves).toBe(2);
    const snapshot = path.join(app.dir, "snapshot-games.db");
    await app.ctx.sqlite.backup(snapshot);
    try {
      expect(measureContents(snapshot).counts.find((entry) => entry.id === "gameSaves")?.count).toBe(2);
    } finally {
      fs.rmSync(snapshot, { force: true });
    }
    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.games).toEqual({ saves: 2 });
  });

  it("is erased with everything else", async () => {
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    const job = await waitForJob(started.body.job.id);
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.games).toEqual({ saves: 2 });
    expect(await get()).toEqual({ tallies: { patience: {}, sudoku: {}, draughts: {}, pairs: {} }, allotmentStarted: false });
  });
});
