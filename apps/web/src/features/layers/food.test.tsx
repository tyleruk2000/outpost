import type { FoodFactsDto, NearestResponse, ReferenceLayerSummary, ReferenceSourceInfo } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { FoodFacts } from "./food-facts";
import { FoodSection } from "./food-panel";
import { FOOD_GLYPHS, foodImageId, parseFoodImageId } from "./food-symbols";
import { layerColours, referenceData } from "./symbols";

const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const SUMMARY: ReferenceLayerSummary = {
  id: "food",
  count: 14,
  countries: ["GB"],
  providers: [{ id: "osm", name: "OpenStreetMap", count: 14 }],
  kinds: [
    { kind: "food:water", label: "Drinking water", count: 2 },
    { kind: "food:supermarket", label: "Supermarket", count: 2 },
    { kind: "food:baker", label: "Baker", count: 4 },
  ],
  provenance: [{ provenance: "public-infrastructure", count: 14 }],
};

const NEAREST: NearestResponse = {
  kind: null,
  withinMeters: 100_000,
  hits: [
    {
      id: 1,
      name: "Booths",
      kind: "food:supermarket",
      kindLabel: "Supermarket",
      provider: "osm",
      lat: 54.6,
      lon: -3.14,
      distanceMeters: 420,
      bearingDegrees: 284,
    },
    {
      id: 2,
      name: "",
      kind: "food:water",
      kindLabel: "Drinking water",
      provider: "osm",
      lat: 54.6,
      lon: -3.13,
      distanceMeters: 3420,
      bearingDegrees: 90,
    },
  ],
};

describe("the marks", () => {
  it("has a drawing for every kind, and names its pictures so the map can ask for them", () => {
    expect(Object.keys(FOOD_GLYPHS)).toHaveLength(12);
    const id = foodImageId("food:farm-shop", "#00919F", "#ffffff");
    expect(id).toBe("food-farm-shop-00919f-ffffff");
    expect(parseFoodImageId(id)).toEqual({ kind: "food:farm-shop", colour: "#00919f", page: "#ffffff" });
    expect(parseFoodImageId("place-tent-teal-ffffff")).toBeNull();
    expect(parseFoodImageId("food-cake-00919f-ffffff")).toBeNull();
  });

  it("draws a food record as its kind's square, and other layers' records as dots", () => {
    const data = referenceData(
      {
        total: 2,
        points: [
          { id: 1, layer: "food", provenance: "public-infrastructure", name: "Booths", kind: "food:supermarket", lat: 54.6, lon: -3.14 },
          {
            id: 2,
            layer: "hospitals",
            provenance: "public-infrastructure",
            name: "A hospital",
            kind: "amenity=hospital",
            lat: 54.6,
            lon: -3.1,
          },
        ],
        cells: [],
        shapes: [],
      },
      null,
      layerColours(),
    );
    expect(data.features.map((feature) => feature.properties.glyph ?? null)).toEqual(["supermarket", null]);
  });
});

describe("under the food and supplies switch", () => {
  const section = (props: Partial<Parameters<typeof FoodSection>[0]> = {}) =>
    wrap(
      <FoodSection
        summary={SUMMARY}
        colour="#00919f"
        kind={null}
        onKind={vi.fn()}
        centre={{ lat: 54.6, lon: -3.135 }}
        onOpen={vi.fn()}
        {...props}
      />,
    );

  it("lists the kinds in the household's order, and a press shows one alone", async () => {
    vi.spyOn(api, "get").mockImplementation(
      async (path: string) => (path.startsWith("/api/maps/markers") ? { markers: [] } : NEAREST) as never,
    );
    const onKind = vi.fn();
    render(section({ onKind }));
    const kinds = screen.getByRole("list", { name: "Kinds of place" });
    expect(
      within(kinds)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Supermarket2", "Baker4", "Drinking water2"]);
    await userEvent.click(within(kinds).getByRole("button", { name: /Drinking water/ }));
    expect(onKind).toHaveBeenCalledWith("food:water");
  });

  it("shows the kind alone as pressed, and offers every kind again", async () => {
    vi.spyOn(api, "get").mockImplementation(
      async (path: string) =>
        (path.startsWith("/api/maps/markers") ? { markers: [] } : { ...NEAREST, kind: "food:water", hits: [NEAREST.hits[1]] }) as never,
    );
    const onKind = vi.fn();
    render(section({ kind: "food:water", onKind }));
    expect(screen.getByRole("button", { name: /Drinking water/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Nearest drinking water" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show every kind" }));
    expect(onKind).toHaveBeenCalledWith(null);
  });

  it("lists the nearest with distance and bearing from the middle of the map, and opens one", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(async (path: string) => (path.startsWith("/api/maps/markers") ? { markers: [] } : NEAREST) as never);
    const onOpen = vi.fn();
    render(section({ onOpen }));
    const list = await screen.findByRole("list", { name: "Nearest to the middle of the map" });
    const rows = within(list).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Booths");
    expect(rows[0]).toHaveTextContent("420 m");
    expect(rows[0]).toHaveTextContent("284° WNW");
    // A tap with no name is called by its kind.
    expect(rows[1]).toHaveTextContent("Drinking water");
    expect(rows[1]).toHaveTextContent("3.42 km");
    await userEvent.click(rows[0]!);
    expect(onOpen).toHaveBeenCalledWith(1, { lat: 54.6, lon: -3.14 });
    expect(get).toHaveBeenCalledWith("/api/reference/nearest?lat=54.6000&lon=-3.1350&layer=food&limit=5");
  });

  it("measures from the home place when there is one", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(
        async (path: string) =>
          (path.startsWith("/api/maps/markers")
            ? { markers: [{ id: "h", name: "Home", icon: "home", lat: 54.59, lon: -3.12, createdAt: 1 }] }
            : NEAREST) as never,
      );
    render(section());
    await screen.findByRole("list", { name: "Nearest to Home" });
    expect(get).toHaveBeenCalledWith("/api/reference/nearest?lat=54.5900&lon=-3.1200&layer=food&limit=5");
  });

  it("says when nothing is held near, when it could not be worked out, and while it is", async () => {
    vi.spyOn(api, "get").mockImplementation(
      async (path: string) => (path.startsWith("/api/maps/markers") ? { markers: [] } : { ...NEAREST, hits: [] }) as never,
    );
    const empty = render(section());
    expect(await screen.findByText(/Nothing is held within 100 km of the middle of the map/)).toBeInTheDocument();
    empty.unmount();

    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/maps/markers")) return { markers: [] } as never;
      throw new Error("no");
    });
    const failed = render(section());
    expect(await screen.findByText(/The nearest could not be worked out/)).toBeInTheDocument();
    failed.unmount();

    vi.spyOn(api, "get").mockImplementation((path: string) =>
      path.startsWith("/api/maps/markers") ? Promise.resolve({ markers: [] } as never) : new Promise(() => {}),
    );
    render(section());
    expect(screen.getByText("Finding the nearest")).toBeInTheDocument();
  });

  it("says plainly how complete the layer is likely to be and that a mark is not a promise", () => {
    vi.spyOn(api, "get").mockImplementation(async () => ({ markers: [] }) as never);
    render(section({ centre: null }));
    expect(screen.getByText(/patchy in the countryside and in many other countries/)).toBeInTheDocument();
    expect(screen.getByText(/Neither says a place is open, stocked or still there/)).toBeInTheDocument();
    expect(screen.getByText(/no middle to measure from/)).toBeInTheDocument();
  });
});

describe("a record's card", () => {
  const SOURCE = { retrievedAt: Date.UTC(2026, 10, 17, 12) } as ReferenceSourceInfo;
  const facts = (extra: Partial<FoodFactsDto>): FoodFactsDto => ({
    alsoKinds: [],
    address: null,
    openingHours: null,
    brand: null,
    businessType: null,
    water: null,
    caution: "What OpenStreetMap volunteers had mapped when it was fetched. It does not say a place is open.",
    ...extra,
  });

  it("gives opening hours as mapped, with the day they were fetched, and the caution", () => {
    render(
      <FoodFacts
        food={facts({ address: "Tithebarn Street, CA12 5EA", openingHours: "Mo-Sa 08:00-22:00; Su 09:30-16:00", brand: "Booths" })}
        source={SOURCE}
      />,
    );
    expect(screen.getByText("Mo-Sa 08:00-22:00")).toBeInTheDocument();
    expect(screen.getByText("Su 09:30-16:00")).toBeInTheDocument();
    expect(screen.getByText(/Opening hours as mapped, fetched 17 Nov(ember)? 2026/)).toBeInTheDocument();
    expect(screen.getByText("Booths")).toBeInTheDocument();
    expect(screen.getByText(/shops may be shut or empty/)).toBeInTheDocument();
  });

  it("says whether water is marked drinkable or seasonal", () => {
    render(
      <FoodFacts
        food={facts({ water: { drinkable: "Marked as drinking water", seasonal: "Marked as seasonal (summer)" } })}
        source={SOURCE}
      />,
    );
    expect(screen.getByText("Marked as drinking water")).toBeInTheDocument();
    expect(screen.getByText("Marked as seasonal (summer)")).toBeInTheDocument();
  });

  it("gives an Agency record's type, and says when there is nothing to give", () => {
    const { unmount } = render(
      <FoodFacts food={facts({ businessType: "Retailers - other", address: "35 MAIN STREET" })} source={SOURCE} />,
    );
    expect(screen.getByText("Retailers - other")).toBeInTheDocument();
    expect(screen.queryByText(/Opening hours as mapped/)).toBeNull();
    unmount();
    render(<FoodFacts food={facts({})} source={SOURCE} />);
    expect(screen.getByText("Its source gives no address or opening hours.")).toBeInTheDocument();
  });
});
