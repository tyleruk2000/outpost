/**
 * Regression tests for defects found by security review. Each one describes the
 * attack it guards against.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const raw = (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  app!.app.inject({ method: method as "GET", url, headers: { host: "localhost", ...headers }, payload: payload as never });

describe("sign-in cannot be sidestepped by disguising the address", () => {
  const disguises = ["/%61pi", "/a%70i", "/ap%69", "/%61%70%69", "/API", "//api", "/./api", "/api/../api"];
  const targets = ["/documents", "/search?q=secret", "/settings", "/storage/locations", "/collections", "/downloads", "/jobs", "/events", "/catalog", "/system", "/notes/tree", "/retrieval/overview"];

  it("requires a session for every API route however the path is written", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    await app.api("POST", "/api/auth/setup", { username: "keeper", password: "lantern on the north shelf" });
    app.ctx.services.search.upsert({ kind: "note", entityId: "n", title: "Private", url: "/notes/n", sections: [{ text: "the secret passphrase" }] });

    for (const target of targets) {
      const plain = await raw("GET", `/api${target}`);
      expect(plain.statusCode, `/api${target}`).toBe(401);
      for (const disguise of disguises) {
        const response = await raw("GET", `${disguise}${target}`);
        // Either the router does not take it for an API route at all (and answers with the
        // web app's page or an error), or it does and sign-in is enforced. It never answers with data.
        const servedData = response.statusCode === 200 && String(response.headers["content-type"]).includes("json");
        expect(servedData, `${disguise}${target} -> ${response.statusCode}`).toBe(false);
        expect(response.body).not.toContain("secret passphrase");
      }
    }
  });

  it("applies the cross-site checks to disguised addresses too", async () => {
    app = await createTestApp();
    for (const prefix of ["/%61pi", "/a%70i"]) {
      const forged = await raw("PATCH", `${prefix}/settings`, { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" }, { "downloads.concurrency": 7 });
      expect(forged.statusCode).toBe(403);
      const noHeader = await raw("PATCH", `${prefix}/settings`, { "content-type": "application/json" }, { "downloads.concurrency": 7 });
      expect(noHeader.statusCode).toBe(403);
    }
    expect((await app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(2);
  });

  it("still serves the few routes that must work before signing in", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    expect((await raw("GET", "/api/health")).statusCode).toBe(200);
    expect((await raw("GET", "/api/auth/session")).statusCode).toBe(200);
    expect((await raw("GET", "/%61pi/health")).statusCode).toBe(200);
  });
});
