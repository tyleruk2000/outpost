import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api keepalive", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks a save made as the page closes to outlive the page", async () => {
    const fetchMock = answer(200, { note: { id: "n1" } });
    expect(await api.patch("/api/notes/n1", { title: "Kit" }, { keepalive: true })).toEqual({ note: { id: "n1" } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/notes/n1");
    expect(init).toMatchObject({ method: "PATCH", keepalive: true, body: JSON.stringify({ title: "Kit" }) });
    expect(init.headers).toMatchObject({ "X-Outpost-Request": "1", "Content-Type": "application/json" });
  });

  it("sends a body too large for keepalive the ordinary way", async () => {
    const fetchMock = answer(200, {});
    await api.put("/api/power/plans/p1", { notes: "x".repeat(70_000) }, { keepalive: true });
    expect(fetchMock.mock.calls[0]![1].keepalive).toBeUndefined();
  });

  it("does not ask for it unless told to", async () => {
    const fetchMock = answer(200, {});
    await api.put("/api/power/plans/p1", { name: "Shack" });
    expect(fetchMock.mock.calls[0]![1].keepalive).toBeUndefined();
  });

  it("throws the server's refusal as for any other request", async () => {
    answer(409, { error: { code: "conflict", message: "Saved elsewhere.", details: { current: { updatedAt: 2 } } } });
    const error = await api.patch("/api/notes/n1", {}, { keepalive: true }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "conflict", details: { current: { updatedAt: 2 } } });
  });
});
