import type { EmergencyPlanSummary, SupplyOutlook } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreparedLines } from "./prepared-lines";

afterEach(() => vi.unstubAllGlobals());

const plan = (id: string, name: string, over: Partial<EmergencyPlanSummary> = {}): EmergencyPlanSummary => ({
  id,
  name,
  kind: "power-cut",
  kindText: "",
  templateId: null,
  scenarios: [],
  steps: 3,
  ticked: 0,
  startedAt: null,
  reviewedAt: 1,
  reviewEveryDays: null,
  openedAt: null,
  missing: 0,
  updatedAt: 1,
  ...over,
});

const stretch = (items: number, days: number | null) => ({ perDay: 1, counted: items, items, days, lost: 0, leftOut: [] });

const outlook = (food: number, foodDays: number | null, water: number, waterDays: number | null) =>
  ({
    food: stretch(food, foodDays),
    water: {
      ...stretch(water, waterDays),
      basis: "drinking",
      drinkingPerDay: 1,
      allUsesPerDay: 1,
      daysDrinking: waterDays,
      daysAllUses: null,
    },
  }) as unknown as SupplyOutlook;

/** Serves the two lists Home reads, and counts what was asked. One outlook: one household; a list: several, the first current. */
function serve(plans: EmergencyPlanSummary[], held: SupplyOutlook | Array<{ name: string; outlook: SupplyOutlook }>) {
  const asked: string[] = [];
  const households = (Array.isArray(held) ? held : [{ name: "Home", outlook: held }]).map((entry, index) => ({
    householdId: index === 0 ? "household" : `h${index}`,
    name: entry.name,
    current: index === 0,
    outlook: entry.outlook,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://outpost.test");
      asked.push(url.pathname);
      const body = url.pathname === "/api/emergency-plans" ? { plans } : { households };
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    }),
  );
  return asked;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PreparedLines />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Home's lines on plans and supplies", () => {
  it("names the plan with the way into it, and says how many days the food and water last", async () => {
    const asked = serve([plan("p1", "Flood"), plan("p2", "Power cut", { openedAt: 50 }), plan("p3", "Storm")], outlook(4, 3.81, 1, 5.33));
    show();
    expect(await screen.findByRole("link", { name: "Use now: Power cut" })).toHaveAttribute("href", "/prepare/plans/p2/use");
    expect(screen.getByRole("link", { name: "Power cut" })).toHaveAttribute("href", "/prepare/plans/p2");
    expect(screen.getByRole("link", { name: "2 more plans" })).toHaveAttribute("href", "/prepare/plans");
    expect(await screen.findByRole("link", { name: "food for about 3.8 days, water for about 5.3 days" })).toHaveAttribute(
      "href",
      "/prepare/supplies",
    );
    // Read once each; nothing is asked again on a timer.
    expect(asked.sort()).toEqual(["/api/emergency-plans", "/api/supplies/outlooks"]);
    // One household: not named.
    expect(screen.getByText(/^Supplies:/)).toBeInTheDocument();
  });

  it("offers a plan in use before any other", async () => {
    serve([plan("p1", "Flood", { openedAt: 90 }), plan("p2", "Power cut", { startedAt: 10 })], outlook(0, null, 0, null));
    show();
    expect(await screen.findByRole("link", { name: "Use now: Power cut" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1 more plan" })).toBeInTheDocument();
  });

  it("says nothing where there is no plan and nothing stored", async () => {
    const asked = serve([], outlook(0, null, 0, null));
    const { container } = show();
    await waitFor(() => expect(asked).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("says what is missing when supplies are kept but there is no household to count days for", async () => {
    serve([], outlook(3, null, 0, null));
    show();
    expect(await screen.findByRole("link", { name: "add the household to see how long they last" })).toBeInTheDocument();
    expect(screen.queryByText(/Emergency plan/)).not.toBeInTheDocument();
  });

  it("with several households, heads the current one's line with its name and gives each other a short line", async () => {
    serve(
      [],
      [
        { name: "Home", outlook: outlook(4, 3.81, 1, 5.33) },
        { name: "Caravan", outlook: outlook(2, 2, 0, null) },
        { name: "Grandma's", outlook: outlook(0, null, 0, null) },
        { name: "Hiking group", outlook: outlook(1, null, 0, null) },
      ],
    );
    show();
    expect(await screen.findByText("Supplies for Home:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "food for about 3.8 days, water for about 5.3 days" })).toHaveAttribute(
      "href",
      "/prepare/supplies",
    );
    expect(screen.getByText("Caravan: food for about 2 days")).toBeInTheDocument();
    expect(screen.getByText("Hiking group: nobody in it yet to count days for")).toBeInTheDocument();
    // Nothing stored there: nothing said.
    expect(screen.queryByText(/Grandma/)).not.toBeInTheDocument();
  });

  it("gives the other households' lines when the current one keeps nothing", async () => {
    serve(
      [],
      [
        { name: "Home", outlook: outlook(0, null, 0, null) },
        { name: "Caravan", outlook: outlook(2, 2, 0, null) },
      ],
    );
    show();
    expect(await screen.findByText("Caravan: food for about 2 days")).toBeInTheDocument();
    expect(screen.queryByText(/Supplies/)).not.toBeInTheDocument();
  });
});
