/**
 * The Steading's screen with the server stubbed: a skeleton shaped like the land, the
 * rule that leaving it is safe, choosing the land and seed to found a settlement, the
 * first visit's invitation, a square chosen by its spoken name, a woodcutter built and its
 * route laid from the panel, a belt laid square by square, what holds a building back
 * said in words, the ledger, the households' real figures and the power, a refusal in the
 * server's words, and a kept settlement that cannot be read.
 */
import { applyAction, newSteading, type SteadingAction, type SteadingResponse, type SteadingState } from "@outpost/shared/games/steading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import SteadingPage, { LEAVE_IT_WORDS } from "./steading-page";
import { startView } from "./valley";

const NOW = Date.UTC(2027, 2, 1, 9);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A server that holds one settlement and applies actions to it with the engine, as the real one does. */
function serve(start: SteadingState, { started = true, refuse, damaged }: { started?: boolean; refuse?: string; damaged?: boolean } = {}) {
  let settlement = start;
  let kept = started;
  const posted: SteadingAction[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/games/steading" && (!init?.method || init.method === "GET")) {
      if (damaged)
        return json(
          { error: { code: "conflict", message: "The settlement kept on this Outpost could not be read.", details: { damaged: true } } },
          409,
        );
      return json({ settlement, now: settlement.clock, started: kept } satisfies SteadingResponse);
    }
    if (url === "/api/games/steading/actions") {
      const action = JSON.parse(String(init?.body)) as SteadingAction;
      posted.push(action);
      if (refuse) return json({ error: { code: "conflict", message: refuse } }, 409);
      settlement = applyAction(settlement, action, settlement.clock);
      kept = true;
      return json({ settlement, now: settlement.clock, started: true } satisfies SteadingResponse);
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
        <SteadingPage />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the Steading screen", () => {
  it("asks for the land and the seed, and founds the settlement there", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newSteading(NOW), { started: false });
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Steading" })).toBeInTheDocument();
    expect(screen.getByText(LEAVE_IT_WORDS)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading the settlement" })).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: /Desert/ }));
    expect(screen.getByText("Ouarzazate, Morocco")).toBeInTheDocument();
    expect(screen.getByText(/only within 2 squares of water/)).toBeInTheDocument();
    const seed = screen.getByRole("textbox", { name: "Seed" });
    await user.clear(seed);
    await user.type(seed, "Tarn Oak 417");
    await user.click(screen.getByRole("button", { name: "Found the settlement" }));
    expect(posted).toEqual([{ type: "found", land: "desert", seed: "tarn-oak-417" }]);
    expect(await screen.findByText(/build a woodcutter, then send its logs to the storehouse/)).toBeInTheDocument();
    expect(screen.getByText("tarn-oak-417")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
  });

  it("shows Ashgill whole, with every square named", async () => {
    serve(newSteading(NOW));
    show();
    expect(await screen.findByText(/build a woodcutter, then send its logs to the storehouse/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 5, row 8, Storehouse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 4, row 9, House, a household of four" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 1, row 1, woods" })).toBeInTheDocument();
    expect(screen.getByText(/^8 people ·/)).toBeInTheDocument();
  });

  it("builds a woodcutter beside the woods, lays its route, and says what holds it back", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newSteading(NOW));
    show();
    await user.click(await screen.findByRole("button", { name: "Column 2, row 9, meadow" }));
    const panel = screen.getByRole("region", { name: "Meadow" });
    // A quarry needs rock beside it, so it is not offered here.
    expect(within(panel).queryByText("Quarry")).toBeNull();
    const row = within(panel).getByText("Woodcutter").closest("li") as HTMLElement;
    expect(within(row).getByText(/24 logs a day/)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Build" }));
    expect(posted).toEqual([{ type: "build", kind: "woodcutter", x: 1, y: 8 }]);
    expect(await screen.findByText("Built a woodcutter.")).toBeInTheDocument();
    const built = screen.getByRole("region", { name: "Woodcutter" });
    expect(within(built).getByText("Working at full pace.")).toBeInTheDocument();
    expect(within(built).getByText(/None yet: what it makes waits in its yard/)).toBeInTheDocument();
    await user.click(within(built).getByRole("button", { name: "Lay the route" }));
    expect(posted.at(-1)).toEqual({ type: "route", from: 5, to: 1, good: "logs", mode: "hand" });
    const routed = screen.getByRole("region", { name: "Woodcutter" });
    expect(await within(routed).findByText(/carries 12 of 12 a day/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ledger" })).toBeInTheDocument();
  });

  it("lays a belt square by square, from a woodcutter into the storehouse", async () => {
    const user = userEvent.setup();
    const state = applyAction(newSteading(NOW), { type: "build", kind: "woodcutter", x: 1, y: 6 }, NOW);
    const { posted } = serve(state);
    show();
    await user.click(await screen.findByRole("button", { name: "Column 3, row 7, meadow" }));
    await user.click(within(screen.getByRole("region", { name: "Meadow" })).getByRole("button", { name: "Lay a belt from here" }));
    const tool = screen.getByRole("region", { name: "Laying a belt" });
    expect(within(tool).getByText(/1 square, the last heading east/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Column 5, row 7, meadow" }));
    await user.click(screen.getByRole("button", { name: "Column 5, row 8, Storehouse" }));
    expect(within(tool).getByText(/3 squares, the last heading south\. From the woodcutter into the storehouse\./)).toBeInTheDocument();
    expect(within(tool).getByText("Costs 3 planks.")).toBeInTheDocument();
    await user.click(within(tool).getByRole("button", { name: "Lay 3 squares" }));
    expect(posted.at(-1)).toEqual({
      type: "belts",
      tier: "roller",
      squares: [
        { x: 2, y: 6, dir: "e" },
        { x: 3, y: 6, dir: "e" },
        { x: 4, y: 6, dir: "s" },
      ],
    });
    expect(await screen.findByText("Laid 3 squares of roller belt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 4, row 7, roller belt heading east, carrying 24 a day" })).toBeInTheDocument();
  });

  it("shows the power: what is made, the batteries in amp-hours and watt-hours, and the tank", async () => {
    let state = newSteading(Date.UTC(2027, 5, 1));
    state = { ...state, stock: Object.fromEntries(Object.keys(state.stock).map((g) => [g, 300])) as typeof state.stock };
    for (const [x, y] of [
      [6, 8],
      [7, 8],
      [6, 9],
      [7, 9],
    ] as const)
      state = {
        ...state,
        nextId: state.nextId + 1,
        buildings: [...state.buildings, { id: state.nextId, kind: "house", x, y, paused: false, yard: {}, occupied: true }],
      };
    state = applyAction(state, { type: "build", kind: "solar", x: 6, y: 6 }, state.clock);
    state = applyAction(state, { type: "build", kind: "lithiumbank", x: 7, y: 6 }, state.clock);
    state = applyAction(state, { type: "build", kind: "generator", x: 7, y: 7 }, state.clock);
    serve(state);
    show();
    const section = (await screen.findByRole("heading", { name: "Power" })).closest("section") as HTMLElement;
    expect(within(section).getByText(/^Daylight in Jun/)).toBeInTheDocument();
    expect(within(section).getByText(/280 Ah in all, 14\.3 kWh, of which 11\.5 kWh is used/)).toBeInTheDocument();
    expect(within(section).getByText(/16 cells of 3\.2 V in series, 51\.2 V and 280 Ah/)).toBeInTheDocument();
    expect(within(section).getByText(/0 of 200 litres/)).toBeInTheDocument();
    expect(within(section).getByText("Keswick, Cumbria, England", { exact: false })).toBeInTheDocument();
  });

  it("says a bakery with no flour is waiting for it", async () => {
    const user = userEvent.setup();
    let state = newSteading(NOW);
    state = applyAction(state, { type: "build", kind: "bakery", x: 5, y: 6 }, NOW);
    serve(state);
    show();
    await user.click(await screen.findByRole("button", { name: "Column 6, row 7, Bakery, waiting for flour" }));
    expect(
      within(screen.getByRole("region", { name: "Bakery" })).getByText("Waiting for flour: send more to it along a route."),
    ).toBeInTheDocument();
  });

  it("gives the households' real figures and where they come from", async () => {
    serve(newSteading(NOW));
    show();
    const section = (await screen.findByRole("heading", { name: "Households" })).closest("section") as HTMLElement;
    expect(within(section).getByText("8 people in 2 houses.")).toBeInTheDocument();
    expect(within(section).getByText(/A household of four uses in a day 60 litres of water, 9,000 kcal of food/)).toBeInTheDocument();
    expect(within(section).getByText(/Ofgem, Review of typical domestic consumption values/)).toBeInTheDocument();
  });

  it("says a refusal in the server's words", async () => {
    const user = userEvent.setup();
    serve(newSteading(NOW), { refuse: "There is not enough stone in the store: it needs 6." });
    show();
    await user.click(await screen.findByRole("button", { name: "Column 7, row 7, meadow" }));
    const panel = screen.getByRole("region", { name: "Meadow" });
    const row = within(panel).getByText("Well").closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Build" }));
    expect((await screen.findAllByText("There is not enough stone in the store: it needs 6.")).length).toBeGreaterThan(0);
  });

  it("moves between squares with the arrow keys", async () => {
    const user = userEvent.setup();
    serve(newSteading(NOW));
    show();
    const store = await screen.findByRole("button", { name: "Column 5, row 8, Storehouse" });
    store.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Column 5, row 9, meadow" }));
  });

  it("opens a generated map close enough in on a phone for every square to take a finger, and at 14 across where there is room", () => {
    const state = newSteading(NOW, { land: "valley", seed: "outpost-tests-1" });
    // A phone 390 px wide leaves a window of about 358 px: 8 squares of 44 px or more.
    const phone = startView(state, 358);
    expect(phone.across).toBe(8);
    expect(358 / phone.across).toBeGreaterThanOrEqual(44);
    // The smallest phone still shows the least the zoom allows.
    expect(startView(state, 288).across).toBe(6);
    expect(startView(state, 900).across).toBe(14);
    expect(startView(state).across).toBe(14);
  });

  it("zoomed out past a press, the map is one button that zooms back in to squares", async () => {
    const user = userEvent.setup();
    // A window 700 px wide: squares of 24 px or more are buttons, so at most 29 across.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 700, 700));
    try {
      serve(newSteading(NOW, { land: "valley", seed: "outpost-tests-1" }));
      show();
      const land = await screen.findByRole("group", { name: /^The land, 48 squares by 48/ });
      expect(within(land).getAllByRole("button").length).toBeGreaterThan(100);
      const out = screen.getByRole("button", { name: "Zoom out" });
      while (!out.hasAttribute("disabled")) await user.click(out);
      // The whole map: one stop, not 2,304.
      const whole = screen.getByRole("button", { name: /^The land, 48 squares by 48, zoomed out too far to choose a square: woods \d+%/ });
      expect(screen.queryAllByRole("button", { name: /^Column \d+, row \d+/ })).toHaveLength(0);
      whole.focus();
      await user.keyboard("{Enter}");
      expect(screen.queryByRole("button", { name: /zoomed out too far/ })).toBeNull();
      const squares = screen.getAllByRole("button", { name: /^Column \d+, row \d+/ });
      expect(squares.length).toBeGreaterThan(100);
      expect(squares.length).toBeLessThanOrEqual(31 * 31);
      expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Column \d+, row \d+/);
    } finally {
      rect.mockRestore();
    }
  });

  it("offers Start again when the kept settlement cannot be read", async () => {
    serve(newSteading(NOW), { damaged: true });
    show();
    expect(await screen.findByText("The settlement could not be read")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeInTheDocument();
  });
});
