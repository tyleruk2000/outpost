/**
 * The Steading's screen with the server stubbed: a skeleton shaped like the valley, the
 * rule that leaving it is safe, the first visit's invitation, a square chosen by its
 * spoken name, a woodcutter built and its route laid from the panel, what holds a
 * building back said in words, the ledger and the households' real figures, a refusal in
 * the server's words, and a kept settlement that cannot be read.
 */
import { applyAction, newSteading, type SteadingAction, type SteadingResponse, type SteadingState } from "@outpost/shared/games/steading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import SteadingPage, { LEAVE_IT_WORDS } from "./steading-page";

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
  it("shows a skeleton, says leaving it is safe, and invites the first building", async () => {
    serve(newSteading(NOW), { started: false });
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Steading" })).toBeInTheDocument();
    expect(screen.getByText(LEAVE_IT_WORDS)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading the settlement" })).toBeInTheDocument();
    expect(await screen.findByText(/build a woodcutter, then send its logs to the storehouse/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 5, row 8, Storehouse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 4, row 9, House, a household of four" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column 1, row 1, woods" })).toBeInTheDocument();
    expect(screen.getByText(/^8 people ·/)).toBeInTheDocument();
  });

  it("builds a woodcutter beside the woods, lays its route, and says what holds it back", async () => {
    const user = userEvent.setup();
    const { posted } = serve(newSteading(NOW), { started: false });
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

  it("offers Start again when the kept settlement cannot be read", async () => {
    serve(newSteading(NOW), { damaged: true });
    show();
    expect(await screen.findByText("The settlement could not be read")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeInTheDocument();
  });
});
