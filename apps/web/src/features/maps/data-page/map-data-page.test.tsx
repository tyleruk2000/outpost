import type { MapDataResponse } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, fakeServer, installBrowserStubs, location, renderScreen } from "@/features/downloads/test-support";
import MapDataPage from "./map-data-page";
import { country, item, mapData } from "./test-data";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const UK_PRESET = {
  id: "united-kingdom",
  name: "United Kingdom",
  group: "Britain and Ireland",
  bbox: [-8.65, 49.85, 1.77, 60.86],
  recommendedMaxZoom: 12,
  installed: false,
  collectionIds: [],
  downloadId: null,
};

function serve(data: MapDataResponse, extra: Record<string, unknown> = {}) {
  installBrowserStubs();
  const added: unknown[] = [];
  const server = fakeServer({
    "GET /api/maps/data": data,
    "GET /api/maps/overview": { regions: [], places: [], counts: { markers: 0, tracks: 0, places: 0 } },
    "GET /api/maps/regions": { groups: [{ name: "Britain and Ireland", regions: [UK_PRESET] }] },
    "GET /api/storage/locations": {
      roots: ["/srv"],
      locations: [location(), location({ id: "nas", name: "NAS", kind: "network", isDefault: false, freeBytes: 1_030_000_000_000 })],
    },
    "GET /api/reference/catalogue": {
      providers: [],
      linked: [],
      countries: [{ code: "GB", name: "United Kingdom", bbox: [-8, 50, 2, 61] }],
    },
    "GET /api/reference/regions": { held: true, readAt: 1, source: "x", regions: [] },
    "GET /api/downloads": {
      downloads: [
        download({
          id: "d1",
          state: "running",
          receivedBytes: 1_100_000_000,
          totalBytes: 2_290_000_000,
          title: "United Kingdom (country file)",
        }),
      ],
    },
    "GET /api/jobs": { jobs: [] },
    "POST /api/maps/estimate": {
      sizeBytes: 2_990_000_000,
      tileCount: 1,
      requests: 1,
      sourceBuild: null,
      sourceUrl: "https://build.protomaps.com/x.pmtiles",
      minZoom: 0,
      maxZoom: 12,
      attribution: "",
    },
    "POST /api/reference/estimate": {
      estimateId: "e",
      provider: "osm-extract",
      items: [
        {
          key: "k",
          title: "t",
          layers: [],
          bytes: 2_290_000_000,
          exact: true,
          basis: "",
          records: null,
          host: "download.geofabrik.de",
          replaces: null,
        },
      ],
      totalBytes: 2_290_000_000,
      databaseBytes: 0,
      notes: [],
    },
    "POST /api/maps/data/add": ({ url }: { url: URL }) => {
      added.push(url.pathname);
      return { countryFile: null, downloadIds: ["d2"], taskIds: [] };
    },
    ...extra,
  });
  return { server, added };
}

const bodies = () =>
  (fetch as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
    .filter(([url, init]) => String(url).includes("/api/maps/data/add") && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));

describe("the Map data screen", () => {
  it("says how much there is and where, and each row where it stands", async () => {
    serve(
      mapData({
        countries: [
          country("GB", "United Kingdom", {
            map: [item()],
            terrain: [
              item({ key: "t", kind: "terrain", title: "United Kingdom (terrain)", state: "location-offline", locationName: "NAS" }),
            ],
            roads: [
              item({
                key: "download:d1:roads",
                kind: "roads",
                state: "downloading",
                downloadId: "d1",
                collectionId: null,
                title: "United Kingdom (country file)",
              }),
            ],
            places: [
              item({
                key: "task:j1:places",
                kind: "places",
                state: "processing",
                collectionId: null,
                taskId: "j1",
                progress: { current: 5, total: 10, unit: null, message: "Reading the places", step: { at: 2, of: 2 } },
              }),
            ],
            names: [
              item({ key: "n", kind: "names", state: "failed", reason: "The file could not be read: it ends early.", collectionId: null }),
            ],
          }),
        ],
      }),
    );
    renderScreen(<MapDataPage />, "/maps/data");
    expect(await screen.findByText(/3\.00 GB of map data, all on Internal storage\. Nothing is downloading\./)).toBeInTheDocument();
    const uk = screen.getByRole("list", { name: "Map data for United Kingdom" });
    const row = (name: string) => within(uk).getByRole("heading", { name }).closest("li")!;
    expect(row("Map to look at")).toHaveTextContent(/3\.00 GB.*Internal storage.*from/);
    expect(row("Hills and heights")).toHaveTextContent("NAS is not connected");
    expect(row("Hills and heights")).toHaveTextContent("Hill shading and heights wait until it is back.");
    expect(within(row("Roads for routes")).getByRole("button", { name: /Pause/ })).toBeInTheDocument();
    expect(row("Places to find")).toHaveTextContent("Reading the places (step 2 of 2). You can leave this screen.");
    expect(row("Place names")).toHaveTextContent("The file could not be read: it ends early.");
    expect(row("Country file")).toHaveTextContent("Not kept. Roads and places to find are read from it.");
    expect(within(row("Country file")).getByRole("button", { name: /Keep one/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Parts of this screen" })).toHaveTextContent(/Your places.*Whole world.*Country files/);
  });

  it("with nothing yet, says what each kind is for and offers to add it", async () => {
    serve(mapData({ summary: { totalBytes: 0, locations: [], active: 0 } }));
    renderScreen(<MapDataPage />, "/maps/data");
    expect(await screen.findByText(/No map data yet\./)).toBeInTheDocument();
    expect(screen.getByText(/Nothing for a country yet/)).toBeInTheDocument();
    expect(screen.getByText("No country file is kept.")).toBeInTheDocument();
    const world = screen.getByRole("list", { name: "Map data for the whole world" });
    expect(within(world).getByRole("button", { name: /Add: world overview/ })).toBeInTheDocument();
  });

  it("adds roads and places for a country: sizes on one press, the country file choice asked with nothing chosen, then kept where chosen", async () => {
    const user = userEvent.setup();
    serve(mapData({ countries: [country("GB", "United Kingdom")] }));
    renderScreen(<MapDataPage />, "/maps/data");
    const uk = await screen.findByRole("list", { name: "Map data for United Kingdom" });
    await user.click(within(uk).getByRole("button", { name: "Add: roads for routes" }));
    const dialog = await screen.findByRole("dialog", { name: "Add map data" });
    expect(await within(dialog).findByRole("heading", { name: "What do you want for United Kingdom?" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /Roads for routes/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Map to look at/ })).not.toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: /Places to find/ }));
    // Nothing is asked of anyone before the press, and the screen says who will be.
    expect(within(dialog).getByText(/Geofabrik \(download\.geofabrik\.de\) is asked how large it is/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Check sizes" }));
    expect(await within(dialog).findByText(/About 2\.29 GB to download/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Sizes from download\.geofabrik\.de/)).toBeInTheDocument();

    // The first time, why there is a second file, and nothing chosen for the person.
    expect(within(dialog).getByText(/The map you look at is a drawing/)).toBeInTheDocument();
    const choice = within(dialog).getByRole("radiogroup", { name: "The country file afterwards" });
    expect(within(choice).getByRole("radio", { name: /Read it, then delete it\./ })).not.toBeChecked();
    expect(within(choice).getByRole("radio", { name: /Keep it\./ })).not.toBeChecked();
    expect(within(choice).getByText(/Every update, and anything else made from it, downloads 2\.29 GB again/)).toBeInTheDocument();
    expect(within(dialog).getByText("Choose what happens to the country file.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download" })).toBeDisabled();

    await user.click(within(choice).getByRole("radio", { name: /Keep it\./ }));
    // The location with the most room is suggested for a kept file, and what happens when it is off is said.
    const where = within(dialog).getByRole("radiogroup", { name: "Where to keep the file" });
    await waitFor(() => expect(within(where).getByRole("radio", { name: /NAS/ })).toBeChecked());
    expect(within(dialog).getByText("Roads keep working when this is off; rebuilding waits.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(bodies()).toHaveLength(1));
    expect(bodies()[0]).toEqual({ regionId: "united-kingdom", kinds: ["roads", "places"], keep: true, locationId: "nas" });
  });

  it("chooses the last answer the next time, and reads a kept file with no download and no question", async () => {
    const user = userEvent.setup();
    serve(
      mapData({
        countries: [
          country("GB", "United Kingdom", { extract: [item({ kind: "extract", regionId: "united-kingdom", dataDate: "2026-11-16" })] }),
        ],
        countryFiles: [item({ key: "f", kind: "extract", regionId: "united-kingdom", dataDate: "2026-11-16" })],
        countryFileChoice: { keep: true, locationId: "loc1" },
      }),
    );
    renderScreen(<MapDataPage />, "/maps/data");
    const uk = await screen.findByRole("list", { name: "Map data for United Kingdom" });
    await user.click(within(uk).getByRole("button", { name: "Add: roads for routes" }));
    const dialog = await screen.findByRole("dialog", { name: "Add map data" });
    expect(await within(dialog).findByText(/^Read from the kept file \(.+\)\. No download\.$/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup", { name: "The country file afterwards" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Check sizes" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Build roads" }));
    await waitFor(() => expect(bodies()).toEqual([{ regionId: "united-kingdom", kinds: ["roads"], keep: true }]));
  });

  it("asks the map source and Geofabrik for sizes in one press, and starts the roads and the map as two requests", async () => {
    const user = userEvent.setup();
    const { server } = serve(
      mapData({ countries: [country("GB", "United Kingdom")], countryFileChoice: { keep: false, locationId: null } }),
    );
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=GB");
    const dialog = await screen.findByRole("dialog", { name: "Add map data" });
    await within(dialog).findByRole("heading", { name: "What do you want for United Kingdom?" });
    // The map, its hills and the place names are ticked; roads and places are not.
    expect(within(dialog).getByRole("checkbox", { name: /Map to look at/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Hills and heights/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Place names/ })).toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: /Roads for routes/ }));
    // Remembered from last time.
    expect(within(dialog).getByRole("radio", { name: /Read it, then delete it\./ })).toBeChecked();
    expect(within(dialog).getByText("Why a separate file?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Check sizes" }));
    await within(dialog).findByText(/to download/);
    expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual([
      "POST /api/reference/estimate",
      "POST /api/maps/estimate",
      "POST /api/maps/estimate",
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(bodies()).toHaveLength(2));
    expect(bodies()[0]).toEqual({ regionId: "united-kingdom", kinds: ["roads"], keep: false });
    expect(bodies()[1]).toMatchObject({
      kinds: ["map", "terrain", "names"],
      country: "GB",
      map: { name: "United Kingdom", regionId: "united-kingdom", maxZoom: 12 },
    });
  });
});
