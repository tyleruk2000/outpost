/**
 * The allotment's screen with the server stubbed: a plot shaped skeleton while loading,
 * the first visit's invitation, a bed sown from its panel and named aloud, a sowing out
 * of its months explained before the press, each state of a bed said in one sentence, a
 * ripe bed harvested in one tap, a refusal said in the server's words, this month on the
 * plot, the almanac's cards and where they come from, the line after a long absence, the
 * hemisphere switch, and the two kinds of failure to load.
 */
import {
  type AllotmentAction,
  type AllotmentResponse,
  type AllotmentState,
  advance,
  applyAction,
  DAY,
  HOUR,
  newAllotment,
  seasonAt,
  WATER_LASTS_MS,
  wetDay,
} from "@outpost/shared/games/allotment";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import AllotmentPage from "./allotment-page";
import { untilNextChange, useServerNow } from "./queries";
import { awayWords, bedLabel, bedSentence, chip, growWords, monthsWords, shortWords, sowNote } from "./words";

/** The first noon on or after `from` with that day and the two before it dry, so no rain is soaking any bed. */
function dryNoon(from: number): number {
  for (let day = Math.ceil(from / DAY); ; day++)
    if (!wetDay(day, "north") && !wetDay(day - 1, "north") && !wetDay(day - 2, "north")) return day * DAY + 12 * HOUR;
}
/** A dry January day in 2026: winter in the north, when only the hardy crops grow outside. */
const NOW = dryNoon(Date.UTC(2026, 0, 10));
/** A dry day in May 2026, when most things grow. */
const MAY = dryNoon(Date.UTC(2026, 4, 10));

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
    // In January radishes would wait for March: the free crop that grows now is onions.
    expect(await screen.findByText("Sow onions in a bed and water them: onion sets are free and grow in every month.")).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) expect(screen.getByRole("button", { name: `Bed ${n}, empty, dry` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bed 5/ })).toBeNull();
    expect(screen.getByText(/You have/)).toHaveTextContent("You have 10 coins.");
  });

  it("sows a bed from its panel, waters it, and says what was done", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newAllotment(NOW), { started: false });
    show();
    await user.click(await screen.findByRole("button", { name: "Bed 1, empty, dry" }));
    const panel = screen.getByRole("region", { name: "Bed 1" });
    expect(within(panel).getByText("Empty, and the soil is dry.")).toBeInTheDocument();
    // Squash seed is 60 coins: more than the 10 there are.
    expect(within(panel).getByRole("button", { name: /^Sow squash: 60 coins, 3 days\..* 50 more coins needed/ })).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: /^Sow onions: free, 1 hour\./ }));
    expect(posted).toEqual([{ type: "sow", bed: 0, crop: "onions" }]);
    expect(await screen.findByRole("button", { name: "Bed 1, onions, just sown, waiting for rain, dry" })).toBeInTheDocument();
    expect(screen.getByText("Sowed onions in bed 1.")).toBeInTheDocument();
    const again = screen.getByRole("region", { name: "Bed 1" });
    expect(within(again).getByText(/Waiting for rain: the soil is dry\. Water it to grow now; rain is due in about/)).toBeInTheDocument();
    await user.click(within(again).getByRole("button", { name: "Water" }));
    expect(posted.at(-1)).toEqual({ type: "water", bed: 0 });
    expect(await screen.findByRole("button", { name: "Bed 1, onions, just sown, ready in about 1 hour, moist" })).toBeInTheDocument();
    expect(screen.getByText("Watered bed 1: moist for 12 hours.")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Bed 1" })).getByText(/Growing: the soil is moist from the can, for about 12 hours more\./),
    ).toBeInTheDocument();
  });

  it("explains a sowing out of its months before the press, and never refuses it", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newAllotment(NOW), { started: false });
    show();
    await user.click(await screen.findByRole("button", { name: "Bed 2, empty, dry" }));
    const panel = screen.getByRole("region", { name: "Bed 2" });
    const carrots = within(panel).getByRole("button", { name: /^Sow carrots:/ });
    expect(carrots).toHaveTextContent("Sown now, they wait in the ground until February.");
    expect(within(panel).getByRole("button", { name: /^Sow garlic:/ })).toHaveTextContent(
      "Not the usual time (sown February to March and October to December), but it would grow now, until the end of August.",
    );
    await user.click(within(panel).getByRole("button", { name: /^Sow radishes:/ }));
    expect(posted).toEqual([{ type: "sow", bed: 1, crop: "radishes" }]);
    expect(await screen.findByText("Sowed radishes in bed 2. They wait in the ground until March.")).toBeInTheDocument();
    const bed = screen.getByRole("button", { name: "Bed 2, radishes, just sown, waiting for March, dry" });
    expect(bed).toHaveTextContent("Till Mar");
    expect(
      within(screen.getByRole("region", { name: "Bed 2" })).getByText(/Waiting for March: radishes grow March to October/),
    ).toBeInTheDocument();
  });

  it("harvests a ripe bed in one tap, and everything ripe with one button", async () => {
    const user = userEvent.setup();
    let plot = applyAction(newAllotment(MAY - HOUR), { type: "sow", bed: 0, crop: "radishes" }, MAY - HOUR, "north");
    plot = applyAction(plot, { type: "sow", bed: 2, crop: "radishes" }, MAY - HOUR, "north");
    plot = applyAction(plot, { type: "water", bed: 0 }, MAY - HOUR, "north");
    plot = applyAction(plot, { type: "water", bed: 2 }, MAY - HOUR, "north");
    const { posted } = serve(advance(plot, MAY, "north"));
    show();
    expect(await screen.findByText("2 beds ripe.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bed 1, radishes, ripe" }));
    expect(posted).toEqual([{ type: "harvest", bed: 0 }]);
    expect(await screen.findByText("Harvested 3 radishes from bed 1.")).toBeInTheDocument();
    // The soil keeps the can's water after the harvest.
    expect(screen.getByRole("button", { name: "Bed 1, empty, moist" })).toBeInTheDocument();
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
    expect(
      screen.getByText(
        "Marked out for the water butt. Fills when it rains, and keeps the open beds watered for 2 days after each wet day. 40 coins at the stall.",
      ),
    ).toBeInTheDocument();
    await user.click(butt);
    expect(screen.queryByText(/Marked out for the water butt/)).toBeNull();
  });

  it("says what to sow this month and what each bed waits for", async () => {
    let plot = applyAction({ ...newAllotment(NOW), coins: 100 }, { type: "sow", bed: 0, crop: "squash" }, NOW, "north");
    plot = applyAction(plot, { type: "sow", bed: 1, crop: "onions" }, NOW, "north");
    serve(plot);
    show();
    const month = await screen.findByRole("region", { name: "This month on the plot" });
    expect(within(month).getByText(/^January, winter\./)).toBeInTheDocument();
    expect(within(month).getByText("To sow now:").parentElement).toHaveTextContent("To sow now: onions.");
    expect(within(month).getByText("Growing in the open:").parentElement).toHaveTextContent(
      "Growing in the open: onions, kale, broad beans, leeks and garlic.",
    );
    expect(within(month).getByText(/^Bed 1$/).parentElement).toHaveTextContent("Bed 1: squash, waiting for April.");
    expect(within(month).getByText(/^Bed 2$/).parentElement).toHaveTextContent("Bed 2: onions, waiting for rain or the can.");
    expect(screen.getByText(/2 beds are waiting for water or their months\./)).toBeInTheDocument();
  });

  it("gives each crop a card in the almanac, its facts once it has been grown, and says where they come from", async () => {
    const user = userEvent.setup();
    const plot = newAllotment(NOW);
    plot.almanac.crops.peas = { harvests: 2, produce: 10, firstAt: NOW - DAY };
    serve(plot);
    show();
    const almanac = await screen.findByRole("region", { name: "Almanac" });
    expect(within(almanac).getByText(/1 of 12 crops grown/)).toBeInTheDocument();
    await user.click(within(almanac).getByText("Peas", { selector: "summary *" }));
    const peas = within(almanac).getByText("Peas", { selector: "summary *" }).closest("details")!;
    expect(peas).toHaveAttribute("open");
    expect(peas).toHaveTextContent("SownFebruary to June");
    expect(peas).toHaveTextContent("HarvestedJune to October");
    expect(peas).toHaveTextContent(/their roots fix nitrogen from the air/);
    expect(peas).toHaveTextContent("Legumes, the pea and bean family");
    await user.click(within(almanac).getByText("Potatoes", { selector: "summary *" }));
    const potatoes = within(almanac).getByText("Potatoes", { selector: "summary *" }).closest("details")!;
    expect(potatoes).toHaveTextContent("ColdTender: frost harms the young shoots.");
    expect(potatoes).not.toHaveTextContent(/earthing up/);
    expect(potatoes).toHaveTextContent("Its family and a few things worth knowing are written here once it has been grown.");
    await user.click(within(almanac).getByText("Where this comes from"));
    expect(within(almanac).getByRole("link", { name: "Garlic" })).toHaveAttribute(
      "href",
      "https://www.rhs.org.uk/vegetables/garlic/grow-your-own",
    );
    expect(
      within(almanac).getByText(/How fast things grow .* are made up for the game|Made up for the game: how fast things grow/),
    ).toBeInTheDocument();
  });

  it("says a refusal in the server's own words", async () => {
    const user = userEvent.setup();
    serve(newAllotment(NOW), { refuse: "The next bed costs 25 coins; you have 10." });
    show();
    await user.click(await screen.findByRole("button", { name: "Bed 2, empty, dry" }));
    await user.click(screen.getByRole("button", { name: /^Sow radishes: free, 4 minutes/ }));
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
  it("is when the next bed ripens or dries, the hens lay, or in a minute at most", () => {
    const empty = newAllotment(MAY);
    expect(untilNextChange(empty, "north")).toBe(60_050);
    const sown = applyAction(
      applyAction(empty, { type: "sow", bed: 0, crop: "radishes" }, MAY, "north"),
      { type: "water", bed: 0 },
      MAY,
      "north",
    );
    expect(untilNextChange(advance(sown, MAY + 3.5 * 60_000, "north"), "north")).toBe(30_050);
    // Ripe, and the can's water running out in under a minute: drawn again when the bed dries.
    const drying = advance(sown, MAY + WATER_LASTS_MS - 20_000, "north");
    expect(untilNextChange(drying, "north")).toBe(20_050);
    const hens = applyAction({ ...newAllotment(MAY), coins: 200 }, { type: "buy", thing: "hens" }, MAY, "north");
    expect(untilNextChange(advance(hens, MAY + 3 * 3_600_000 - 5_000, "north"), "north")).toBe(5_050);
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

  it("name a bed with what is in it, what it is doing and why", () => {
    let plot = applyAction({ ...newAllotment(MAY), coins: 100 }, { type: "sow", bed: 3, crop: "peas" }, MAY, "north");
    expect(bedLabel(plot, 3, "north")).toBe("Bed 4, peas, just sown, waiting for rain, dry");
    expect(chip(plot, 3, "north")).toEqual({ mark: "water", text: "Dry" });
    plot = applyAction(plot, { type: "water", bed: 3 }, MAY, "north");
    expect(bedLabel(plot, 3, "north")).toBe("Bed 4, peas, just sown, ready in about 2 hours, moist");
    expect(chip(plot, 3, "north")).toEqual({ mark: "time", text: "2 hr" });
    expect(bedSentence(plot, 3, "north")).toBe("Growing: the soil is moist from the can, for about 12 hours more.");
    expect(bedLabel(plot, 0, "north")).toBe("Bed 1, empty, dry");
    // Squash in January waits for April, with every bit of its growth.
    const winter = applyAction({ ...newAllotment(NOW), coins: 100 }, { type: "sow", bed: 0, crop: "squash" }, NOW, "north");
    expect(bedLabel(winter, 0, "north")).toBe("Bed 1, squash, just sown, waiting for April, dry");
    expect(chip(winter, 0, "north")).toEqual({ mark: "season", text: "Till Apr" });
    expect(bedSentence(winter, 0, "north")).toBe(
      "Waiting for April: squash grow April to October, so they rest in the ground with all their growth until then.",
    );
    // Under glass: in season, but only the can waters it.
    let glass = applyAction({ ...newAllotment(NOW), coins: 600 }, { type: "buy", thing: "greenhouse" }, NOW, "north");
    glass = applyAction(glass, { type: "sow", bed: 12, crop: "kale" }, NOW, "north");
    expect(bedLabel(glass, 12, "north")).toBe("Greenhouse bed 1, under glass, kale, just sown, waiting for water, dry");
    expect(bedSentence(glass, 12, "north")).toBe("Waiting for water: no rain falls under glass. Water it and it grows for 12 hours.");
  });

  it("say the months as the household's calendar has them, in runs", () => {
    expect(monthsWords([2, 3, 4, 5, 6, 7], "north")).toBe("February to July");
    expect(monthsWords([2, 3, 10, 11, 12], "north")).toBe("February to March and October to December");
    expect(monthsWords([1, 2, 3, 8, 9, 10, 11, 12], "north")).toBe("August to March");
    expect(monthsWords([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "north")).toBe("all year");
    // In the south a British February to July is August to January.
    expect(monthsWords([2, 3, 4, 5, 6, 7], "south")).toBe("August to January");
    expect(sowNote("carrots", 12, false, "north")).toBe("Sown now, they wait in the ground until February.");
    expect(sowNote("carrots", 4, false, "north")).toBe("Sown February to July: a good time now.");
    expect(sowNote("kale", 12, true, "north")).toBe("Sown March to July outdoors; under glass it grows now.");
    expect(sowNote("carrots", 12, false, "south")).toBe("Sown now, they wait in the ground until August.");
  });
});
