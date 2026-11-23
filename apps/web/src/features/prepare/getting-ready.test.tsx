/** Getting ready on the Preparedness page: the five steps in order, ticked from what is held, the first not done marked Next. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { household, households, placeHome } from "@/features/households/test-support";
import { GettingReady, readySteps } from "./getting-ready";

const base = { householdId: "household", householdName: "Home", people: 0, home: null, items: 0, plans: 0, bookMade: false };

describe("readySteps", () => {
  it("is people, home, supplies, a plan and the book, in that order, none done for a new Outpost", () => {
    const steps = readySteps(base);
    expect(steps.map((step) => step.id)).toEqual(["people", "home", "supplies", "plan", "book"]);
    expect(steps.every((step) => !step.done)).toBe(true);
    // The first two go straight to the part of the household's page where each is done.
    expect(steps[0]!.to).toBe("/prepare/households/household#people");
    expect(steps[1]!.to).toBe("/prepare/households/household#place");
  });

  it("ticks each from what is held, and says what there is", () => {
    const steps = readySteps({ ...base, people: 3, home: "Cottage", items: 12, plans: 1, bookMade: true });
    expect(steps.every((step) => step.done)).toBe(true);
    expect(steps[0]!.text).toBe("3 people and pets in Home.");
    expect(steps[1]!.text).toBe("Marked as Cottage.");
    expect(steps[2]!.text).toBe("12 things kept.");
  });
});

function renderWith(data: { people: number; home: boolean; items: number; plans: number; made: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
  const cottage = { id: "m1", name: "Cottage", lat: 51.5, lon: -0.12 };
  client.setQueryData(
    ["households", "list"],
    households([
      household({
        personIds: Array.from({ length: data.people }, (_, index) => `p${index}`),
        homePlaceId: data.home ? "m1" : null,
        home: data.home ? placeHome(cottage) : null,
      }),
    ]),
  );
  client.setQueryData(["supplies", "stock"], {
    items: Array.from({ length: data.items }, (_, index) => ({ id: `i${index}` })),
    locations: [],
  });
  client.setQueryData(["emergency-plans", "list"], { plans: Array.from({ length: data.plans }, (_, index) => ({ id: `plan${index}` })) });
  client.setQueryData(["household-book", "answers"], { made: data.made ? { madeAt: 1 } : null, stale: [] });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GettingReady />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GettingReady", () => {
  it("marks the first step not done as Next, and links each step to where it is done", () => {
    renderWith({ people: 2, home: false, items: 0, plans: 0, made: false });
    const list = screen.getByRole("list", { name: "Steps to get ready" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveTextContent(/Who lives here, done/);
    expect(links[1]).toHaveAttribute("aria-current", "step");
    expect(links[1]).toHaveTextContent(/Where home is\s*Next/);
    expect(links[1]).toHaveAttribute("href", "/prepare/households/household#place");
    expect(screen.getByText("1 of 5 done")).toBeInTheDocument();
  });

  it("says the household is ready once all five are done", () => {
    renderWith({ people: 1, home: true, items: 4, plans: 1, made: true });
    expect(screen.getByText("5 of 5 done")).toBeInTheDocument();
    expect(screen.getByText(/Your household is ready/)).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });
});
