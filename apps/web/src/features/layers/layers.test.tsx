import type { ReferenceFeatureDetail, ReferenceLayersResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { FeatureCard } from "./feature-card";
import { LayersPanel, populationClasses } from "./layers-panel";
import { layerColours, nearestReference, PROVENANCE_LETTER, populationData, referenceData, shadeOf } from "./symbols";
import type { LayerChoice } from "./use-reference-layers";

const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
);

const query = <T,>(data: T, extra: Partial<UseQueryResult<T>> = {}) =>
  ({ data, isPending: false, isError: false, isSuccess: true, error: null, refetch: vi.fn(), ...extra }) as unknown as UseQueryResult<T>;

const SUMMARY: ReferenceLayersResponse = {
  layers: [
    {
      id: "military",
      count: 10,
      countries: ["LU"],
      providers: [{ id: "osm", name: "OpenStreetMap", count: 10 }],
      kinds: [{ kind: "landuse=military", label: "Military land", count: 10 }],
      provenance: [{ provenance: "public-infrastructure", count: 10 }],
    },
    {
      id: "historical",
      count: 3,
      countries: ["GB"],
      providers: [{ id: "import", name: "A file you import", count: 3 }],
      kinds: [{ kind: "import:Urban", label: "Urban", count: 3 }],
      provenance: [
        { provenance: "historical", count: 2 },
        { provenance: "unverified", count: 1 },
      ],
    },
  ],
  population: [
    {
      id: "p",
      country: "Luxembourg",
      product: "Population counts",
      year: 2020,
      bbox: [5.7, 49.4, 6.5, 50.2],
      available: true,
      citation: "WorldPop",
    },
  ],
  credits: [],
};

const CHOICE: LayerChoice = { layers: ["military"], population: true, country: null, provider: null, kind: null };

describe("the map marks", () => {
  it("tell provenance apart by shape: a filled dot, or a ring with H or ?, never by colour alone", () => {
    expect(PROVENANCE_LETTER).toEqual({ "public-infrastructure": "", historical: "H", user: "", unverified: "?" });
    const colours = layerColours();
    const data = referenceData(
      {
        total: 3,
        points: [
          { id: 1, layer: "military", provenance: "public-infrastructure", name: "Base", kind: "military=base", lat: 50, lon: 6 },
          { id: 2, layer: "historical", provenance: "historical", name: "City", kind: "import:Urban", lat: 51, lon: 0 },
        ],
        cells: [{ layer: "historical", provenance: "unverified", count: 1200, lat: 52, lon: 1 }],
        shapes: [],
      },
      { lat: 50, lon: 6 },
      colours,
    );
    expect(data.features.map((feature) => [feature.properties.kind, feature.properties.letter ?? null])).toEqual([
      ["cell", "?"],
      ["point", ""],
      ["point", "H"],
      ["selected", null],
    ]);
    expect(data.features[0]!.properties.label).toBe("1,200 ?");
  });

  it("finds the record nearest a press, preferring a record to a patch beside it", () => {
    const overlay = {
      total: 2,
      points: [{ id: 7, layer: "military" as const, provenance: "public-infrastructure" as const, name: "A", kind: "", lat: 0, lon: 0 }],
      cells: [{ layer: "military" as const, provenance: "public-infrastructure" as const, count: 9, lat: 0, lon: 0.0001 }],
      shapes: [],
    };
    const project = ({ lat, lon }: { lat: number; lon: number }) => ({ x: lon * 100_000, y: -lat * 100_000 });
    expect(nearestReference(overlay, { x: 5, y: 0 }, project)).toEqual({ kind: "point", id: 7, lat: 0, lon: 0 });
    expect(nearestReference(overlay, { x: 500, y: 500 }, project)).toBeNull();
  });

  it("finds a route pressed on its line, at the place on it nearest the press, and not an area's edge", () => {
    const route = {
      id: 9,
      layer: "routes" as const,
      provenance: "public-infrastructure" as const,
      name: "Pennine Way",
      kind: "route=hiking",
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [0.001, 0],
          ],
        ],
      },
    };
    const area = {
      ...route,
      id: 10,
      layer: "military" as const,
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0.0001],
          [0.001, 0.0001],
        ],
      },
    };
    const overlay = { total: 0, points: [], cells: [], shapes: [area, route] };
    const project = ({ lat, lon }: { lat: number; lon: number }) => ({ x: lon * 100_000, y: -lat * 100_000 });
    const hit = nearestReference(overlay, { x: 50, y: 3 }, project);
    expect(hit).toMatchObject({ kind: "point", id: 9 });
    expect(hit?.lon).toBeCloseTo(0.0005, 6);
    expect(nearestReference(overlay, { x: 50, y: 40 }, project)).toBeNull();
  });

  it("shades population by the server's classes in people per square kilometre", () => {
    const shades = ["a", "b", "c", "d", "e"];
    expect(shadeOf(0.5, [1, 10, 100, 500, 2000], shades)).toBe("a");
    expect(shadeOf(150, [1, 10, 100, 500, 2000], shades)).toBe("c");
    expect(shadeOf(9000, [1, 10, 100, 500, 2000], shades)).toBe("e");
    expect(populationClasses([1, 10, 100])).toEqual(["1 to 10", "10 to 100", "100 or more"]);
    const grid = populationData(
      { cells: [{ west: 0, south: 0, east: 1, north: 1, density: 50 }], classes: [1, 10, 100], sets: [] },
      shades,
    );
    expect(grid.features[0]!.properties.colour).toBe("b");
  });
});

describe("the Layers panel", () => {
  it("says what can be had when nothing is installed, and leads to getting it", async () => {
    const onManage = vi.fn();
    render(
      wrap(
        <LayersPanel
          summary={query<ReferenceLayersResponse>({ layers: [], population: [], credits: [] })}
          choice={CHOICE}
          onChoice={vi.fn()}
          colours={layerColours()}
          shades={["a", "b", "c", "d", "e"]}
          onManage={onManage}
          onOpen={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole("heading", { name: "No reference data on this device yet" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Get reference data" }));
    expect(onManage).toHaveBeenCalled();
  });

  it("shows loading and failure", () => {
    const { rerender } = render(
      wrap(
        <LayersPanel
          summary={query<ReferenceLayersResponse>(undefined as never, { isPending: true, isSuccess: false })}
          choice={CHOICE}
          onChoice={vi.fn()}
          colours={layerColours()}
          shades={[]}
          onManage={vi.fn()}
          onOpen={vi.fn()}
        />,
      ),
    );
    expect(document.querySelector("[aria-busy]")).not.toBeNull();
    rerender(
      wrap(
        <LayersPanel
          summary={query<ReferenceLayersResponse>(undefined as never, {
            isError: true,
            isSuccess: false,
            error: new Error("The server did not answer."),
          })}
          choice={CHOICE}
          onChoice={vi.fn()}
          colours={layerColours()}
          shades={[]}
          onManage={vi.fn()}
          onOpen={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText(/The server did not answer/)).toBeVisible();
  });

  it("lists each installed layer with a switch, the population scale, filters, and the legend of where things come from", async () => {
    const onChoice = vi.fn();
    render(
      wrap(
        <LayersPanel
          summary={query(SUMMARY)}
          choice={CHOICE}
          onChoice={onChoice}
          colours={layerColours()}
          shades={["a", "b", "c", "d", "e"]}
          onManage={vi.fn()}
          onOpen={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole("switch", { name: "Military sites" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Historical records" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: "Historical records" }));
    const update = onChoice.mock.calls[0]![0] as (current: LayerChoice) => LayerChoice;
    expect(update(CHOICE).layers).toEqual(["military", "historical"]);
    expect(
      within(screen.getByRole("list", { name: "Population scale" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["1 to 10", "10 to 100", "100 to 500", "500 to 2,000", "2,000 or more"]);
    expect(screen.getByText("People per square kilometre")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Country" })).toBeVisible();
    const legend = screen.getByRole("region", { name: "Where things come from" });
    expect(within(legend).getByText("Published public record: a filled dot")).toBeVisible();
    expect(within(legend).getByText("Historical document: a ring marked H")).toBeVisible();
    expect(within(legend).getByText("Unverified or speculative: a ring marked ?")).toBeVisible();
    expect(within(legend).getByText(/Nothing here marks a place as a likely target or ranks places/)).toBeVisible();
  });
});

const historical: ReferenceFeatureDetail = {
  id: 9,
  layer: "historical",
  kind: "import:Urban-industrial",
  kindLabel: "Urban-industrial",
  name: "Test city",
  altNames: [],
  country: "GB",
  lat: 51,
  lon: 0.1,
  bbox: null,
  props: {},
  provenance: "historical",
  source: {
    provider: "import",
    providerName: "A file you import",
    sourceId: "T-1",
    publisher: "A person transcribing",
    license: "Public domain (US Government work)",
    licenseUrl: null,
    sourceUrl: "https://example.org/doc.pdf",
    publishedAt: "1956-06",
    retrievedAt: Date.UTC(2026, 10, 16),
    accuracy: "To the city centre",
    accuracyMeters: null,
    provenance: "historical",
    packId: "p1",
    packTitle: "Historical test records",
  },
  alsoFrom: [],
  historical: {
    recordType: "target-list",
    period: "1959",
    locationText: "",
    documentTitle: "A declassified list (test)",
    documentPublisher: "Test archive",
    documentDate: "1956-06",
    archiveRef: "EBB test",
    classification: "Top Secret (declassified)",
    targetCategory: "Urban-industrial",
    evidenceQuality: "Listed in the document",
    geographicPrecision: "To the city centre",
    citations: ["p. 12"],
    documentUrl: "https://example.org/doc.pdf",
    libraryDocument: { id: "doc1", title: "The scanned list" },
    notes: "",
  },
  hasGeometry: false,
};

describe("the record's card", () => {
  it("says a historical record is history, which kind of record it is, and opens its source document", () => {
    render(wrap(<FeatureCard query={query(historical)} alsoHere={[]} onOpen={vi.fn()} onClose={vi.fn()} />));
    expect(screen.getByText("Historical document")).toBeVisible();
    expect(screen.getByText("An actual historical target list")).toBeVisible();
    expect(screen.getByText(/It says nothing about this place today/)).toBeVisible();
    expect(screen.getByRole("link", { name: /Open The scanned list/ })).toHaveAttribute("href", "/library/documents/doc1");
    expect(screen.getByRole("link", { name: /The document at its archive/ })).toHaveAttribute("href", "https://example.org/doc.pdf");
    expect(screen.getByText("Source, dates, licence and accuracy")).toBeVisible();
  });

  it("shows loading, and a record that is gone", () => {
    const { rerender } = render(
      wrap(
        <FeatureCard
          query={query<ReferenceFeatureDetail>(undefined as never, { isPending: true })}
          alsoHere={[]}
          onOpen={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText("Loading the record")).toBeInTheDocument();
    rerender(
      wrap(
        <FeatureCard
          query={query<ReferenceFeatureDetail>(undefined as never, {
            isError: true,
            isSuccess: false,
            error: new Error("That record is no longer held."),
          })}
          alsoHere={[]}
          onOpen={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText("That record is no longer held.")).toBeVisible();
  });
});

describe("flood zones", () => {
  const flood: ReferenceLayersResponse = {
    layers: [
      {
        id: "flood-zones",
        count: 2,
        countries: ["GB"],
        providers: [{ id: "ea-flood-zones", name: "Flood zones, England (Environment Agency)", count: 2 }],
        kinds: [{ kind: "ea:flood-zone-3", label: "Flood Zone 3 (Environment Agency)", count: 1 }],
        provenance: [{ provenance: "public-infrastructure", count: 2 }],
      },
    ] as ReferenceLayersResponse["layers"],
    population: [],
    credits: [],
  };

  it("gives each zone in the Agency's words, its caveat, that a zone is not a forecast, and why nothing is drawn far out", () => {
    render(
      wrap(
        <LayersPanel
          summary={query(flood)}
          choice={{ ...CHOICE, layers: ["flood-zones"] }}
          onChoice={vi.fn()}
          colours={layerColours()}
          shades={["a", "b", "c", "d", "e"]}
          onManage={vi.fn()}
          onOpen={vi.fn()}
          floodZones="zoom-in"
        />,
      ),
    );
    const legend = screen.getByRole("region", { name: "Flood zones legend" });
    expect(legend).toHaveTextContent("Zoom in to see the flood zones");
    expect(legend).toHaveTextContent(
      "Deeper tone, solid edge. Flood Zone 3 – Areas shown to be at a 1% (1 in 100) or greater annual probability",
    );
    expect(legend).toHaveTextContent("Lighter tone, broken edge. Flood Zone 2 – Land having between 0.1% - 1%");
    expect(legend).toHaveTextContent("not suitable for showing whether an individual property is at risk of flooding");
    expect(legend).toHaveTextContent("England only");
    expect(legend).toHaveTextContent("It is not a forecast that a place will flood");
  });

  it("draws zone 3 and zone 2 apart by their kind, not by colour alone", () => {
    const square = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    const data = referenceData(
      {
        total: 0,
        points: [],
        cells: [],
        shapes: [
          {
            id: 1,
            layer: "flood-zones",
            provenance: "public-infrastructure",
            name: "Flood Zone 3",
            kind: "ea:flood-zone-3",
            geometry: square,
          },
          {
            id: 2,
            layer: "flood-zones",
            provenance: "public-infrastructure",
            name: "Flood Zone 2",
            kind: "ea:flood-zone-2",
            geometry: square,
          },
        ],
      },
      null,
      layerColours(),
    );
    expect(data.features.map((feature) => feature.properties?.zone)).toEqual([3, 2]);
    expect(data.features[0]!.properties?.colour).toBe(data.features[1]!.properties?.colour);
  });
});
