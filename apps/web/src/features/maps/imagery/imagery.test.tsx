import type { ImageryEstimate, ImageryOverview, ImageryStyleSource, MapSources, SceneSearchResponse } from "@outpost/shared";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer, installBrowserStubs, location, renderScreen } from "@/features/downloads/test-support";
import type { MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import { SatellitePicture } from "./panel";
import { imageryStyle, withImagery } from "./style";
import { imageryCredits, setsInView, useSatellite } from "./use-satellite";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const THEME = { page: "#fbfaf7", land: "#eeeae0", ink: "#1d2a2a" } as MapTheme;

const styleSource = (id: string, maxzoom: number, bounds: [number, number, number, number], date: string): ImageryStyleSource => ({
  id,
  tiles: [`/api/maps/imagery/${id}/{z}/{x}/{y}.webp`],
  minzoom: maxzoom > 8 ? 6 : 0,
  maxzoom,
  bounds,
  attribution: `Imagery ${date}: <a href="https://example.org">Credit ${id}</a>`,
  imageDateText: date,
});
const WORLD = styleSource("world", 6, [-180, -85, 180, 85], "July 2004");
const AREA = styleSource("area", 14, [-3.2, 54.5, -3.0, 54.6], "12 July 2026");

describe("imagery in the map's style", () => {
  it("adds a raster source per set, coarsest first, through Outpost's own tile protocol", () => {
    const { sources, layers } = imageryStyle({ imagery: [WORLD, AREA] } as MapSources, "k1");
    expect(layers.map((layer) => layer.id)).toEqual(["imagery-world", "imagery-area"]);
    expect(sources["imagery-area"]).toMatchObject({ type: "raster", minzoom: 6, maxzoom: 14, bounds: AREA.bounds });
    expect((sources["imagery-area"] as { tiles: string[] }).tiles[0]).toBe(
      "outpost-tiles://local/api/maps/imagery/area/{z}/{x}/{y}.webp?v=k1",
    );
  });

  it("lays the imagery over the map's fills and under its lines and names, and gives names a page-coloured halo", () => {
    const base: LayerSpecification[] = [
      { id: "background", type: "background" },
      { id: "earth", type: "fill", source: "b" },
      { id: "water_stream", type: "line", source: "b" },
      { id: "water", type: "fill", source: "b" },
      { id: "roads", type: "line", source: "b" },
      {
        id: "places",
        type: "symbol",
        source: "b",
        layout: { "text-field": "x" },
        paint: { "text-color": "#000", "text-halo-color": THEME.land },
      },
    ];
    const imagery = imageryStyle({ imagery: [AREA] } as MapSources, "").layers;
    const result = withImagery(base, imagery, THEME);
    expect(result.map((layer) => layer.id)).toEqual(["background", "earth", "water", "imagery-area", "water_stream", "roads", "places"]);
    expect(result.at(-1)!.paint).toMatchObject({ "text-halo-color": THEME.page, "text-halo-width": 2 });
    // Without imagery nothing moves.
    expect(withImagery(base, [], THEME)).toBe(base);
  });
});

describe("the Satellite button", () => {
  it("knows which sets are in view and credits them, the most detailed first, each with the day of its picture", () => {
    const view = { bounds: [-3.15, 54.52, -3.1, 54.58] as [number, number, number, number], zoom: 13 };
    expect(setsInView([WORLD, AREA], view).map((set) => set.id)).toEqual(["world", "area"]);
    expect(setsInView([WORLD, AREA], { ...view, bounds: [10, 10, 11, 11] }).map((set) => set.id)).toEqual(["world"]);
    const credits = imageryCredits([WORLD, AREA]);
    expect(credits.map((credit) => credit.parts.map((part) => part.text).join(""))).toEqual([
      "Imagery 12 July 2026: Credit area",
      "Imagery July 2004: Credit world",
    ]);
  });

  it("with nothing downloaded stays off, says what to get and where, and offers the way there", () => {
    const onGetImagery = vi.fn();
    const { result } = renderHook(() => useSatellite({ engine: null, imagery: [], onGetImagery }));
    expect(result.current.label).toBe("Satellite: none downloaded yet");
    act(() => result.current.setOn(true));
    expect(result.current.on).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/No satellite pictures are downloaded yet/), expect.anything());
    const action = (vi.mocked(toast).mock.calls[0]![1] as unknown as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(onGetImagery).toHaveBeenCalled();
  });

  it("switches on when imagery is installed, and is remembered on this device", () => {
    const { result } = renderHook(() => useSatellite({ engine: null, imagery: [WORLD], onGetImagery: () => {} }));
    expect(result.current.label).toBe("Satellite imagery");
    act(() => result.current.setOn(true));
    expect(result.current.on).toBe(true);
    expect(localStorage.getItem("outpost.maps.satellite")).toBe("true");
    expect(result.current.credits).toHaveLength(1);
  });
});

const overview = (over: Partial<ImageryOverview> = {}): ImageryOverview => ({
  sets: [],
  world: [
    {
      id: "blue-marble-2km",
      name: "The world, 2 km a pixel",
      description: "NASA's Blue Marble.",
      resolutionMeters: 2000,
      maxZoom: 6,
      transferBytes: 255_799_706,
      estimatedSizeBytes: 15_800_000,
      workingBytes: 271_599_706,
      installed: false,
      downloadId: null,
    },
  ],
  sources: [],
  limits: { noticeKm2: 400, warnKm2: 2500, maxKm2: 10000 },
  aerialLimits: { noticeBytes: 50e6, warnBytes: 400e6, maxBytes: 2e9, warnTiles: 15000, maxTiles: 60000 },
  ...over,
});

const search: SceneSearchResponse = {
  bbox: [-3.264, 54.524, -3.036, 54.676],
  areaKm2: 245,
  from: "2025-11-16",
  to: "2026-11-16",
  searchedAt: 1,
  notes: [],
  options: [
    {
      key: "A",
      source: "sentinel-2",
      resolutionMeters: 10,
      date: "2026-07-12",
      dateText: "12 July 2026",
      platform: "sentinel-2b",
      sceneIds: ["A"],
      sceneCloudPercent: 0.4,
      coveragePercent: 100,
    },
    {
      key: "B",
      source: "sentinel-2",
      resolutionMeters: 10,
      date: "2026-10-17",
      dateText: "17 October 2026",
      platform: "sentinel-2a",
      sceneIds: ["B"],
      sceneCloudPercent: 12,
      coveragePercent: 80,
    },
  ],
};

const estimate = (over: Partial<ImageryEstimate> = {}): ImageryEstimate => ({
  bbox: search.bbox,
  areaKm2: 245,
  source: {
    id: "sentinel-2",
    name: "Sentinel-2",
    publisher: "Copernicus",
    resolutionMeters: 10,
    licence: "free",
    licenceUrl: "https://sentinels.copernicus.eu/x",
    credit: "Contains modified Copernicus Sentinel data [Year]",
    cost: "Free.",
  },
  scene: search.options[0]!,
  minZoom: 6,
  maxZoom: 14,
  transferBytes: 16_227_447,
  requests: 15,
  estimatedSizeBytes: 666_000,
  tileCount: 111,
  estimatedSeconds: { low: 4, high: 20 },
  areaCloudPercent: 0,
  warning: { level: "none", message: null },
  freeBytes: 30_000_000_000,
  locationId: "loc1",
  locationName: "Internal storage",
  ...over,
});

async function walkToConfirmation(answer: ImageryEstimate) {
  installBrowserStubs();
  const server = fakeServer({
    "GET /api/maps/imagery": overview(),
    "GET /api/storage/locations": { roots: ["/srv"], locations: [location()] },
    "POST /api/maps/imagery/scenes": search,
    "POST /api/maps/imagery/estimate": answer,
    "POST /api/maps/imagery/areas": { download: {} },
  });
  const onClose = vi.fn();
  // Reached from Add a place, for an area chosen there: the press that came here asks for the pictures.
  renderScreen(<SatellitePicture area={{ bbox: [-3.3, 54.5, -3.0, 54.7], name: "Borrowdale" }} onBack={() => {}} onDone={onClose} />);
  expect(screen.getByRole("heading", { name: "Satellite pictures of Borrowdale" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("radio", { name: /17 October 2026/ }));
  expect(screen.getByText(/cloud over the scene 12%; covers 80% of the area/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: /12 July 2026/ }));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("To fetch");
  return { server, onClose };
}

describe("choosing an area", () => {
  it("shows what it will be, what it takes and what it costs before anything is fetched, then fetches it", async () => {
    const { server, onClose } = await walkToConfirmation(estimate());
    const figures = screen.getByLabelText("What it will be");
    expect(figures).toHaveTextContent("Sentinel-2, Level-2A, 12 July 2026");
    expect(figures).toHaveTextContent("10 m a pixel");
    expect(figures).not.toHaveTextContent("zoom");
    expect(figures).toHaveTextContent("16.2 MB15 requests");
    expect(figures).toHaveTextContent("About 666 kB");
    expect(figures).toHaveTextContent("About 4 seconds to 20 seconds");
    expect(figures).toHaveTextContent("One, so no seams");
    expect(figures).toHaveTextContent("30.0 GB on Internal storage");
    expect(figures).toHaveTextContent("FreeNo account and no bill");
    expect(screen.getByText(/one moment's picture, not a seamless mosaic/)).toBeInTheDocument();
    expect(server.calls.filter((call) => call.startsWith("POST /api/maps/imagery/areas"))).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Download · 16.2 MB" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.calls).toContain("POST /api/maps/imagery/areas");
  });

  it("for a large area names the better way and fetches only once the person has said so", async () => {
    await walkToConfirmation(
      estimate({
        warning: {
          level: "warn",
          message: "This is a large area: 3,000 km². Several smaller areas of the places that matter are usually better.",
        },
      }),
    );
    expect(screen.getByText(/Several smaller areas/)).toBeInTheDocument();
    const fetch = screen.getByRole("button", { name: "Download · 16.2 MB" });
    expect(fetch).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "I have read this and want the whole area" }));
    expect(fetch).toBeEnabled();
  });

  it("refuses an area past the ceiling, with the reason", async () => {
    await walkToConfirmation(estimate({ warning: { level: "refuse", message: "20,000 km² is more than one area can be (10,000 km²)." } }));
    expect(screen.getByText("Too large for one area")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download · 16.2 MB" })).toBeDisabled();
  });
});

describe("an aerial photograph of an area", () => {
  const photo = {
    key: "linz:christchurch",
    source: "linz-aerial" as const,
    resolutionMeters: 0.075,
    title: "Christchurch 0.075m Urban Aerial Photos (2023)",
    licensor: "Environment Canterbury",
    date: "2023-01-15",
    dateText: "January to April 2023",
    platform: "aerial",
    sceneIds: [],
    sceneCloudPercent: 0,
    coveragePercent: 100,
  };
  const aerialEstimate = estimate({
    source: {
      id: "linz-aerial",
      name: "New Zealand aerial photographs",
      publisher: "Toitū Te Whenua Land Information New Zealand (LINZ)",
      resolutionMeters: 0.075,
      licence: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      credit: "Licensed by [the licensor] for re-use under CC-BY-4.0",
      cost: "Free. The files are in a public AWS bucket that needs no account and is not requester-pays: nobody is billed.",
    },
    scene: photo,
    areaKm2: 0.6,
    maxZoom: 19,
    minZoom: 10,
    transferBytes: 7_200_000,
    requests: 40,
    estimatedSizeBytes: 9_000_000,
    tileCount: 1_230,
    areaCloudPercent: null,
    aerial: { readMeters: 0.15, files: 4, credit: "Licensed by Environment Canterbury for re-use under CC-BY-4.0" },
  });

  it("is offered beside the satellite's days, and its confirmation says how fine, how much, whose and on what terms", async () => {
    installBrowserStubs();
    const server = fakeServer({
      "GET /api/maps/imagery": overview(),
      "GET /api/storage/locations": { roots: ["/srv"], locations: [location()] },
      "POST /api/maps/imagery/scenes": { ...search, options: [photo, ...search.options], notes: ["Nothing else to say."] },
      "POST /api/maps/imagery/estimate": aerialEstimate,
      "POST /api/maps/imagery/areas": { download: {} },
    });
    renderScreen(
      <SatellitePicture area={{ bbox: [172.6, -43.54, 172.65, -43.52], name: "Cathedral Square" }} onBack={() => {}} onDone={() => {}} />,
    );
    const choice = await screen.findByRole("radio", { name: /Aerial photograph, 7.5 cm/ });
    expect(screen.getByText("Christchurch 0.075m Urban Aerial Photos (2023), flown January to April 2023")).toBeInTheDocument();
    expect(screen.getByText("Nothing else to say.")).toBeInTheDocument();
    await userEvent.click(choice);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const figures = await screen.findByLabelText("What it will be");
    expect(figures).toHaveTextContent("Christchurch 0.075m Urban Aerial Photos (2023)");
    expect(figures).toHaveTextContent("7.5 cm a pixel");
    expect(figures).toHaveTextContent("reduced copy at 15 cm");
    expect(figures).toHaveTextContent("from 4 of the publisher's files");
    expect(figures).toHaveTextContent("1,230 map tiles");
    expect(figures).toHaveTextContent("Credited on the map as “Licensed by Environment Canterbury for re-use under CC-BY-4.0”");
    expect(figures).not.toHaveTextContent("Cloud");
    expect(screen.getByText(/not of today/)).toBeInTheDocument();
    expect(server.calls.filter((call) => call.startsWith("POST /api/maps/imagery/areas"))).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Download · 7.20 MB" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/maps/imagery/areas"));
  });
});
