/** The current household's home as the place users take it: one household, several, and a portable one. */
import { type HouseholdsResponse, homeAsOf, homeLabel } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { suggestionsFor } from "@/features/explore/suggestions";
import { HomeAsOf, NoHome, useHome } from "./home";
import { householdFeatures } from "./map";
import { hereHome, household, households, oneHouseholdOf, placeHome } from "./test-support";

const HOUR = 3_600_000;
const cottage = { id: "m1", name: "Cottage", lat: 51.5, lon: -0.12, icon: "home", createdAt: 1 };
const flat = { id: "m2", name: "Flat", lat: 48.85, lon: 2.35, icon: "pin", createdAt: 2 };

function wrapperWith(answer: HouseholdsResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
  client.setQueryData(["households", "list"], answer);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const several = (currentId: string) =>
  households(
    [
      household({ home: placeHome(cottage) }),
      household({ id: "h2", name: "Paris flat", position: 1, homePlaceId: "m2", home: placeHome(flat) }),
      household({ id: "h3", name: "Gran's", position: 2 }),
    ],
    currentId,
  );

describe("useHome", () => {
  it("with one household is the saved place with the home icon, as before", () => {
    const { result } = renderHook(() => useHome(), { wrapper: wrapperWith(oneHouseholdOf([cottage, flat])) });
    expect(result.current).toMatchObject({ home: { kind: "place", id: "m1", name: "Cottage" }, country: "GB", several: false });
  });

  it("with several is the current household's", () => {
    const { result } = renderHook(() => useHome(), { wrapper: wrapperWith(several("h2")) });
    expect(result.current).toMatchObject({ home: { id: "m2", name: "Flat" }, country: "FR", several: true });
    expect(result.current.household?.name).toBe("Paris flat");
  });

  it("is a portable household's position, with when it was set", () => {
    const at = Date.now() - 3 * HOUR;
    const answer = households([household({ kind: "portable", name: "Caravan", home: hereHome("Where Caravan is now", 54.5, -3.1, at) })]);
    const { result } = renderHook(() => useHome(), { wrapper: wrapperWith(answer) });
    expect(result.current.home).toMatchObject({ kind: "here", at });
    expect(homeLabel(result.current.home!, at + 3 * HOUR)).toBe("Where Caravan is now, as of 3 hours ago");
  });
});

describe("when there is no home", () => {
  it("tells the first household about the home icon and the Households page", () => {
    render(<NoHome />, { wrapper: wrapperWith(oneHouseholdOf([flat])) });
    expect(screen.getByText(/No saved place has the home icon/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Maps" })).toHaveAttribute("href", "/maps");
    expect(screen.getByRole("link", { name: /Households page/ })).toHaveAttribute("href", "/prepare/households");
  });

  it("says another household has no home place, with a link to choose one", () => {
    render(<NoHome />, { wrapper: wrapperWith(several("h3")) });
    expect(screen.getByText(/Gran's has no home place\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose one on the Households page" })).toHaveAttribute("href", "/prepare/households");
  });

  it("asks a portable household to say where it is", () => {
    render(<NoHome />, { wrapper: wrapperWith(households([household({ kind: "portable", name: "Caravan" })])) });
    expect(screen.getByText(/Where Caravan is now has not been set\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set it on the Households page" })).toHaveAttribute("href", "/prepare/households");
  });
});

describe("a moving home's age", () => {
  it("is said for a position and not for a saved place", () => {
    const now = Date.UTC(2026, 10, 22, 12);
    expect(homeAsOf({ at: now - 20_000 }, now)).toBe("as of just now");
    expect(homeAsOf({ at: now - 5 * 60_000 }, now)).toBe("as of 5 minutes ago");
    expect(homeAsOf({ at: now - 3 * 86_400_000 }, now)).toBe("as of 3 days ago");
    expect(homeAsOf({ at: null }, now)).toBeNull();
    render(<HomeAsOf home={hereHome("Camp", 54, -3, now - 2 * HOUR)} now={now} />, { wrapper: wrapperWith(oneHouseholdOf([])) });
    expect(screen.getByText("Camp, as of 2 hours ago.")).toBeInTheDocument();
  });
});

describe("the map", () => {
  it("adds nothing for one household whose home is a saved place", () => {
    expect(householdFeatures(oneHouseholdOf([cottage]).households, "household", 0).features).toEqual([]);
  });

  it("labels every household's home with its name, and marks a portable one's position apart, with its age", () => {
    const now = Date.UTC(2026, 10, 22, 12);
    const list = [
      ...several("h2").households,
      household({ id: "h4", name: "Caravan", position: 3, kind: "portable", home: hereHome("Lakes", 54.5, -3.1, now - HOUR) }),
    ];
    const features = householdFeatures(list, "h2", now).features;
    expect(features.map((feature) => feature.properties)).toEqual([
      { kind: "place", current: false, label: "Home" },
      { kind: "place", current: true, label: "Paris flat" },
      { kind: "here", current: false, label: "Caravan\nas of 1 hour ago" },
    ]);
    expect(features[2]!.geometry).toEqual({ type: "Point", coordinates: [-3.1, 54.5] });
  });
});

describe("Explore's suggestions", () => {
  const countries = [
    { code: "GB", name: "United Kingdom", bbox: [-8.65, 49.86, 1.77, 60.86] as [number, number, number, number] },
    { code: "FR", name: "France", bbox: [-5.14, 41.33, 9.56, 51.09] as [number, number, number, number] },
  ];
  it("are for the current household's home, and its chosen country", () => {
    const base = { countries, presets: [], overview: undefined, entries: [] };
    expect(suggestionsFor({ ...base, home: null })).toEqual({ state: "no-home" });
    const paris = suggestionsFor({ ...base, home: { lat: 48.85, lon: 2.35 } });
    expect(paris.state === "ready" && paris.country.code).toBe("FR");
    const chosen = suggestionsFor({ ...base, home: { lat: 48.85, lon: 2.35 }, country: "GB" });
    expect(chosen.state === "ready" && chosen.country.code).toBe("GB");
  });
});
