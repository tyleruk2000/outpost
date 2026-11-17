/**
 * The allotment's screen with the server stubbed: a plot shaped skeleton while loading,
 * the first visit's invitation, a bed sown from its panel and named aloud, a ripe bed
 * harvested in one tap, a refusal said in the server's words, the line after a long
 * absence, the hemisphere switch, and the two kinds of failure to load.
 */
import {
  type AllotmentAction,
  type AllotmentResponse,
  type AllotmentState,
  advance,
  applyAction,
  DAY,
  newAllotment,
  seasonAt,
} from "@outpost/shared/games/allotment";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import AllotmentPage from "./allotment-page";
import { untilNextChange, useServerNow } from "./queries";
import { awayWords, bedLabel, growWords, shortWords } from "./words";

/** 10 January 2026: winter in the north, so nothing is in season. */
const NOW = Date.UTC(2026, 0, 10, 12);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function answer(plot: AllotmentState, extra: Partial<AllotmentResponse> = {}): AllotmentResponse {
  return {
    plot,
    now: plot.clock,
    hemisphere: "north",
    hemisphereFrom: "default",
    season: seasonAt(plot.clock, "north"),
    awayMs: 0,
    started: true,
    ...extra,
  };
}

/** A server that holds one plot and applies actions to it with the engine, as the real one does. */
function serve(start: AllotmentState, { started = true, refuse }: { started?: boolean; refuse?: string } = {}) {
  let plot = start;
  let kept = started;
  const posted: AllotmentAction[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/games") return json({ tallies: {}, allotmentStarted: kept });
    if (url === "/api/games/allotment" && (!init?.method || init.method === "GET")) return json(answer(plot, { started: kept }));
    if (url === "/api/games/allotment/actions") {
      const action = JSON.parse(String(init?.body)) as AllotmentAction;
      posted.push(action);
      if (refuse) return json({ error: { code: "conflict", message: refuse } }, 409);
      plot = applyAction(plot, action, plot.clock, "north");
      kept = true;
      return json(answer(plot));
    }
    return json({ error: { code: "not_found", message: "Not here." } }, 404);
  });
  vi.stubGlobal("fetch", fetch);
  return { posted };
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AllotmentPage />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the allotment screen", () => {
  it("shows a skeleton shaped like the plot, then invites the first sowing on a new plot", async () => {
    serve(newAllotment(NOW), { started: false });
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Allotment" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading the allotment" })).toBeInTheDocument();
    expect(await screen.findByText("Sow radishes in a bed: they are free and grow in a few minutes.")).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) expect(screen.getByRole("button", { name: `Bed ${n}, empty` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bed 5/ })).toBeNull();
    expect(screen.getByText(/You have/)).toHaveTextContent("You have 10 coins.");
  });

  it("sows a bed from its panel, and says what was done", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newAllotment(NOW), { started: false });
    show();
    await user.click(await screen.findByRole("button", { name: "Bed 1, empty" }));
    const panel = screen.getByRole("region", { name: "Bed 1" });
    // Squash seed is 60 coins: more than the 10 there are.
    expect(within(panel).getByRole("button", { name: /^Sow squash: 60 coins, 3 days, 50 more coins needed/ })).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: "Sow radishes: free, 4 minutes" }));
    expect(posted).toEqual([{ type: "sow", bed: 0, crop: "radishes" }]);
    expect(await screen.findByRole("button", { name: "Bed 1, radishes, just sown, ready in about 4 minutes" })).toBeInTheDocument();
    expect(screen.getByText("Sowed radishes in bed 1.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Bed 1" })).getByRole("button", { name: "Water" })).toBeEnabled();
  });

  it("harvests a ripe bed in one tap, and everything ripe with one button", async () => {
    const user = userEvent.setup();
    let plot = applyAction(newAllotment(NOW - DAY), { type: "sow", bed: 0, crop: "radishes" }, NOW - DAY, "north");
    plot = applyAction(plot, { type: "sow", bed: 2, crop: "radishes" }, NOW - DAY, "north");
    const { posted } = serve(advance(plot, NOW, "north"));
    show();
    expect(await screen.findByText("2 beds ripe.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bed 1, radishes, ripe" }));
    expect(posted).toEqual([{ type: "harvest", bed: 0 }]);
    expect(await screen.findByText("Harvested 3 radishes from bed 1.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bed 1, empty" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Harvest everything ripe" }));
    expect(posted.at(-1)).toEqual({ type: "harvestAll" });
    expect(await screen.findByRole("button", { name: "Sell 6 radishes for 6 coins" })).toBeInTheDocument();
  });

  it("says what each pegged-out place is waiting for", async () => {
    const user = userEvent.setup();
    serve(newAllotment(NOW), { started: false });
    show();
    const butt = await screen.findByRole("button", { name: "Water butt, not bought yet: 40 coins at the stall" });
    expect(screen.getByRole("button", { name: "Ground for bed 5, not dug yet: 25 coins at the stall" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Greenhouse, not bought yet: 500 coins at the stall" })).toBeInTheDocument();
    await user.click(butt);
    expect(butt).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Marked out for the water butt. Every new sowing starts watered. 40 coins at the stall.")).toBeInTheDocument();
    await user.click(butt);
    expect(screen.queryByText(/Marked out for the water butt/)).toBeNull();
  });

  it("says a refusal in the server's own words", async () => {
    const user = userEvent.setup();
    serve(newAllotment(NOW), { refuse: "The next bed costs 25 coins; you have 10." });
    show();
    await user.click(await screen.findByRole("button", { name: "Bed 2, empty" }));
    await user.click(screen.getByRole("button", { name: "Sow radishes: free, 4 minutes" }));
    expect(await screen.findByText("The next bed costs 25 coins; you have 10.")).toBeInTheDocument();
  });

  it("says how long the household was away, and that everything waited", async () => {
    serve(newAllotment(NOW), { started: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/games/allotment"
          ? json(answer(newAllotment(NOW), { awayMs: 400 * DAY + 3_600_000 }))
          : json({ tallies: {}, allotmentStarted: true }),
      ),
    );
    show();
    expect(await screen.findByText("You were away 1 year and 35 days. Everything waited for you.")).toBeInTheDocument();
  });

  it("switches the hemisphere, saying which is in use and why", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newAllotment(NOW));
    show();
    expect(
      await screen.findByText(/Winter on the plot, by the calendar in the northern hemisphere, as no saved place/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Southern" }));
    expect(posted).toEqual([{ type: "setHemisphere", hemisphere: "south" }]);
  });

  it("says the plot needs the server when it cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    show();
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
    expect(screen.getByText(/kept on this Outpost for the whole household, so it needs the server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps Start again in plain view under the plot, and resets the plot once it has been confirmed", async () => {
    const user = userEvent.setup();
    let plot = { ...newAllotment(NOW), coins: 75 };
    const deleted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/games") return json({ tallies: {}, allotmentStarted: true });
        if (url === "/api/games/allotment" && init?.method === "DELETE") {
          deleted.push(url);
          plot = newAllotment(NOW);
          return json({ removed: true });
        }
        if (url === "/api/games/allotment") return json(answer(plot));
        return json({ error: { code: "not_found", message: "Not here." } }, 404);
      }),
    );
    show();
    const start = await screen.findByRole("button", { name: "Start again" });
    // Not folded away inside "About this game", where it could not be found.
    expect(start.closest("details")).toBeNull();
    expect(screen.getByText(/resets the whole allotment/)).toBeInTheDocument();
    await user.click(start);
    const dialog = await screen.findByRole("alertdialog", { name: "Start the allotment again?" });
    expect(deleted).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Start again" }));
    await vi.waitFor(() => expect(deleted).toEqual(["/api/games/allotment"]));
  });

  it("offers to start again when the kept plot cannot be read, naming what goes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          { error: { code: "conflict", message: "The allotment kept on this Outpost could not be read.", details: { damaged: true } } },
          409,
        ),
      ),
    );
    show();
    expect(await screen.findByText("The plot could not be read")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByRole("alertdialog", { name: "Start the allotment again?" })).toHaveTextContent(
      /every bed and what is growing in it/,
    );
  });
});

describe("when the plot is drawn again", () => {
  it("is when the next bed ripens or the hens lay, or in a minute at most", () => {
    const empty = newAllotment(NOW);
    expect(untilNextChange(empty, "north")).toBe(60_050);
    const sown = advance(applyAction(empty, { type: "sow", bed: 0, crop: "radishes" }, NOW, "north"), NOW + 3.5 * 60_000, "north");
    expect(untilNextChange(sown, "north")).toBe(30_050);
    const ripe = advance(sown, NOW + DAY, "north");
    expect(untilNextChange(ripe, "north")).toBe(60_050);
    const hens = applyAction({ ...newAllotment(NOW), coins: 200 }, { type: "buy", thing: "hens" }, NOW, "north");
    expect(untilNextChange(advance(hens, NOW + 3 * 3_600_000 - 5_000, "north"), "north")).toBe(5_050);
  });

  it("is set once, for that moment, and not at all while the page is hidden", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"], now: NOW });
    const visibility = vi.spyOn(document, "visibilityState", "get");
    try {
      const { result } = renderHook(() => useServerNow(0, () => 30_000));
      expect(result.current).toBe(NOW);
      expect(vi.getTimerCount()).toBe(1);
      act(() => vi.advanceTimersByTime(30_000));
      expect(result.current).toBe(NOW + 30_000);
      act(() => {
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(vi.getTimerCount()).toBe(0);
      act(() => vi.advanceTimersByTime(3_600_000));
      act(() => {
        visibility.mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // Shown again, the time is read afresh.
      expect(result.current).toBe(NOW + 3_630_000);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("the words", () => {
  it("say times plainly", () => {
    expect(growWords(4 * 60_000)).toBe("4 minutes");
    expect(growWords(DAY)).toBe("1 day");
    expect(shortWords(90_000)).toBe("2 min");
    expect(shortWords(5 * 3_600_000)).toBe("5 hr");
    expect(awayWords(400 * DAY)).toBe("1 year and 35 days");
    expect(awayWords(365 * DAY)).toBe("1 year");
    expect(awayWords(3 * DAY + 4 * 3_600_000)).toBe("3 days and 4 hours");
    expect(awayWords(7 * 3_600_000)).toBe("7 hours");
  });

  it("name a bed with what is in it and its state", () => {
    let plot = applyAction({ ...newAllotment(NOW), coins: 100 }, { type: "sow", bed: 4 - 1, crop: "peas" }, NOW, "north");
    plot = applyAction(plot, { type: "water", bed: 3 }, NOW, "north");
    expect(bedLabel(plot, 3, "north")).toBe("Bed 4, peas, just sown, ready in about 1 hour, watered");
    expect(bedLabel(plot, 0, "north")).toBe("Bed 1, empty");
  });
});
