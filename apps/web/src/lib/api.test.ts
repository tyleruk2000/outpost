import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, GET_TIMEOUT_MS } from "./api";

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

// With the browser's own timeout (AbortSignal.timeout and .any, Safari 17.4 and later) and without it (older Safari).
describe.each([["with", true] as const, ["without", false] as const])(
  "a GET that has no answer, %s the browser's own timeout",
  (_, own) => {
    beforeEach(() => {
      if (own) {
        // Made to run on the test's clock.
        vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
          const controller = new AbortController();
          setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
          return controller.signal;
        });
      } else {
        Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined, writable: true });
      }
    });
    const any = AbortSignal.any;
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      Object.defineProperty(AbortSignal, "any", { configurable: true, value: any, writable: true });
    });

    /** A fetch that never answers, as when every connection the browser allows the server is taken. */
    function hang() {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            }),
        ),
      );
    }

    it("is given up after 15 s, in words that say what to do", async () => {
      vi.useFakeTimers();
      hang();
      let settled = false;
      const caught = api
        .get("/api/maps/places", { q: "Olney" })
        .catch((error: unknown) => error)
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await caught;
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "timeout", isTimeout: true, isUnreachable: false });
      expect((error as ApiError).message).toMatch(/took too long to answer/);
    });

    it("still ends as an abort when the screen stops wanting it", async () => {
      hang();
      const controller = new AbortController();
      const caught = api.get("/api/maps/places", { q: "Olney" }, controller.signal).catch((error: unknown) => error);
      controller.abort();
      expect(await caught).toMatchObject({ name: "AbortError" });
    });

    it("waits longer when the call says so, and a change is never timed out", async () => {
      vi.useFakeTimers();
      hang();
      let done = 0;
      const slow = api
        .get("/api/maps/area-size", {}, undefined, { timeoutMs: 60_000 })
        .catch((error: unknown) => error)
        .finally(() => {
          done += 1;
        });
      void api
        .post("/api/roads/plan", {})
        .catch(() => undefined)
        .finally(() => {
          done += 1;
        });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(done).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(await slow).toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(600_000);
      expect(done).toBe(1);
    });
  },
);
