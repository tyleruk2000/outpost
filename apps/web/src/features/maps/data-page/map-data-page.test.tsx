/**
 * Offline maps: one row per place with a word for each of Map, Routes, Nearby places; one line for
 * what is downloading and one for what is over a year old; every kind of row built from the same
 * row, state and menu; Add a place (a town found offline, several countries from a link, a
 * country in parts, walking and cycling, satellite pictures); removing and updating by place; and
 * map data elsewhere (Storage's row, Downloads and tasks' titles) in the same parts and words.
 */
import type { JobDto, MapDataResponse, MapDataWhereResponse, MapDataWhereResult } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapTaskTitle } from "@/features/downloads/download-text";
import DownloadsPage from "@/features/downloads/downloads-page";
import { download, fakeServer, installBrowserStubs, location, plan, renderScreen } from "@/features/downloads/test-support";
import { OfflineMapsRows } from "@/features/storage/map-data-section";
import MapDataPage from "./map-data-page";
import { country, item, mapData } from "./test-data";
import { BUNDLE_NAMES } from "./words";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const FRANCE: MapDataWhereResult = {
  type: "country",
  name: "France",
  country: "FR",
  countryName: "France",
  regionId: null,
  part: null,
  bbox: [-5, 41, 10, 51],
  lat: null,
  lon: null,
};
const SWITZERLAND: MapDataWhereResult = {
  ...FRANCE,
  name: "Switzerland",
  country: "CH",
  countryName: "Switzerland",
  bbox: [5.9, 45.8, 10.5, 47.8],
};
const GERMANY: MapDataWhereResult = {
  ...FRANCE,
  name: "Germany",
  country: "DE",
  countryName: "Germany",
  regionId: "germany",
  bbox: [5.8, 47.2, 15, 55],
};

function where(url: URL): MapDataWhereResponse {
  const q = url.searchParams.get("q") ?? "";
  const countries = url.searchParams.get("countries") ?? "";
  if (countries === "FR,CH") return { results: [FRANCE, SWITZERLAND], regionsListed: false };
  if (countries === "DE") return { results: [GERMANY], regionsListed: true };
  if (countries === "FR") return { results: [{ ...FRANCE, regionId: "france" }], regionsListed: true };
  if (/^cham/i.test(q))
    return {
      results: [
        {
          type: "town",
          name: "Chamonix-Mont-Blanc",
          country: "FR",
          countryName: "France",
          regionId: "france",
          part: { regionId: "rhone-alpes", name: "Rhône-Alpes" },
          bbox: [-5, 41, 10, 51],
          lat: 45.92,
          lon: 6.87,
        },
      ],
      regionsListed: true,
    };
  return { results: [], regionsListed: false };
}

function serve(data: MapDataResponse, extra: Record<string, unknown> = {}) {
  installBrowserStubs();
  return fakeServer({
    "GET /api/maps/data": data,
    "GET /api/maps/data/where": ({ url }: { url: URL }) => where(url),
    "GET /api/maps/overview": { regions: [], places: [], counts: { markers: 0, tracks: 0, places: 0 } },
    "GET /api/maps/regions": { groups: [] },
    "GET /api/storage/locations": {
      roots: ["/srv"],
      locations: [location(), location({ id: "nas", name: "NAS", kind: "network", isDefault: false, freeBytes: 1_030_000_000_000 })],
    },
    "GET /api/reference/catalogue": { providers: [], linked: [], countries: [] },
    "GET /api/reference/regions": { held: false, readAt: null, source: "x", regions: [], suggested: [] },
    "POST /api/reference/regions": {
      held: true,
      readAt: 1,
      source: "https://download.geofabrik.de/index-v1-nogeom.json",
      regions: [
        { id: "france", name: "France", country: "FR", parent: null, depth: 0 },
        { id: "switzerland", name: "Switzerland", country: "CH", parent: null, depth: 0 },
      ],
      suggested: [],
    },
    "GET /api/downloads": {
      downloads: [download({ id: "d1", state: "running", receivedBytes: 1_000_000_000, totalBytes: 2_300_000_000, etaSeconds: 19 * 60 })],
    },
    "GET /api/jobs": { jobs: [] },
    "POST /api/reference/estimate": ({ url: _url }: { url: URL }) => ({
      estimateId: "e",
      provider: "osm-extract",
      items: [
        {
          key: "a",
          title: "a",
          layers: [],
          bytes: 4_900_000_000,
          exact: true,
          basis: "",
          records: null,
          host: "download.geofabrik.de",
          replaces: null,
        },
        {
          key: "b",
          title: "b",
          layers: [],
          bytes: 500_000_000,
          exact: true,
          basis: "",
          records: null,
          host: "download.geofabrik.de",
          replaces: null,
        },
      ],
      totalBytes: 5_400_000_000,
      databaseBytes: 0,
      notes: [],
    }),
    "POST /api/maps/data/add": { countryFile: null, downloadIds: ["d2"], taskIds: [] },
    ...extra,
  });
}

const posted = (path: string) =>
  (fetch as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
    .filter(([url, init]) => String(url).includes(path) && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));

const progress = { current: 1_000_000_000, total: 2_300_000_000, unit: "bytes", message: null, step: null };

function ukAndMore(): MapDataResponse {
  return mapData({
    summary: {
      totalBytes: 3_100_000_000,
      locations: [{ locationId: "loc1", name: "Internal storage", bytes: 3_100_000_000, available: true }],
      active: 1,
    },
    countries: [
      country("GB", "United Kingdom", {
        map: [item()],
        names: [item({ key: "n", kind: "names", collectionId: "n", sizeBytes: 100_000_000 })],
        // One download, read for routes and kept as the source file: said once.
        roads: [item({ key: "download:d1:roads", kind: "roads", state: "downloading", downloadId: "d1", collectionId: null, progress })],
        extract: [
          item({ key: "download:d1:extract", kind: "extract", state: "downloading", downloadId: "d1", collectionId: null, progress }),
        ],
      }),
      country("FR", "France", {
        map: [
          item({
            key: "fr",
            collectionId: "fr",
            title: "France",
            dataDate: "2025-06-01",
            update: { how: "download", hosts: ["build.protomaps.com"], note: null },
          }),
        ],
      }),
    ],
    world: [
      item({
        key: "ne",
        kind: "places",
        title: "Country boundaries (Natural Earth)",
        collectionId: null,
        packId: "ne",
        dataDate: "2022-05-13",
        ageless: true,
      }),
    ],
    other: [item({ key: "lake", kind: "imagery", title: "Lake shore", collectionId: "lake", sizeBytes: 200_000_000 })],
    streetsInstalled: false,
  });
}

describe("Offline maps", () => {
  it("lists one row per place, says what is downloading once, and what is over a year old", async () => {
    serve(ukAndMore());
    renderScreen(<MapDataPage />, "/maps/data");
    expect(screen.getByRole("heading", { name: "Offline maps", level: 1 })).toBeInTheDocument();
    const rows = await screen.findByRole("list", { name: "Places" });
    const names = within(rows)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual([
      expect.stringMatching(/^United Kingdom/),
      "France",
      "Lake shore · Drawn on the map",
      expect.stringMatching(/^World basics/),
    ]);
    // The download feeding the routes and the source file is one line, not two.
    expect(screen.getAllByText(/United Kingdom routes: 1\.0 of 2\.3 GB, 19 min left/)).toHaveLength(1);
    // France's map is old; Natural Earth's 2022 borders are made once and never count.
    expect(screen.getByText("1 place is over a year old.")).toBeInTheDocument();
    expect(screen.getByText(/Walking and cycling: not set up/)).toBeInTheDocument();
    const uk = rows.querySelector('[data-place="country:GB"]') as HTMLElement;
    expect(within(uk).getByText("43%")).toBeInTheDocument();
    expect(within(uk).getByRole("button", { name: "Add nearby places for United Kingdom" })).toBeInTheDocument();
  });

  it("builds every kind's row from the one row, state and menu, with the actions in one order", async () => {
    const user = userEvent.setup();
    serve(ukAndMore());
    renderScreen(<MapDataPage />, "/maps/data");
    const rows = await screen.findByRole("list", { name: "Places" });
    const each = [...rows.querySelectorAll<HTMLElement>('[data-pattern="row"]')];
    expect(each.map((row) => row.dataset.place)).toEqual(["country:GB", "country:FR", expect.stringMatching(/^area:/), "world"]);
    const order = ["Update", "Move…", "Remove…", "Details", "Hide details"];
    for (const row of each) {
      expect(row.querySelectorAll('[data-pattern="state"]').length).toBeGreaterThan(0);
      const menu = row.querySelector<HTMLElement>('[data-pattern="menu"]')!;
      expect(menu).not.toBeNull();
      await user.click(menu);
      const items = (await screen.findAllByRole("menuitem")).map((entry) => entry.textContent?.trim() ?? "");
      const positions = items.map((name) => order.indexOf(name));
      expect(positions.every((at) => at >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      await user.keyboard("{Escape}");
    }
  });

  it("opens a row to its dates, where it is kept and its source file", async () => {
    const user = userEvent.setup();
    serve(ukAndMore());
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: /^France/ }));
    const details = screen.getByRole("region", { name: "France in detail" });
    expect(details).toHaveTextContent(/Over a year old, from 1 Jun 2025/);
    expect(details).toHaveTextContent(/Kept on Internal storage/);
    expect(details).toHaveTextContent(/Source file/);
  });

  it("offers a drawn area its nearby places, opening Add a place for the same box with Nearby places ticked", async () => {
    const user = userEvent.setup();
    serve(
      mapData({
        other: [
          item({
            key: "lake",
            kind: "imagery",
            title: "Lake shore",
            collectionId: "lake",
            sizeBytes: 200_000_000,
            bbox: [6.8, 45.9, 7, 46],
          }),
        ],
      }),
    );
    renderScreen(<MapDataPage />, "/maps/data");
    const row = (await screen.findAllByRole("listitem")).find((each) => each.getAttribute("data-place")?.startsWith("area:"))!;
    expect(within(row).getByText("Drawn on the map")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: /Add nearby places for Lake shore/i }));
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Lake shore?" });
    expect(within(dialog).getByRole("checkbox", { name: /^Nearby places/ })).toBeChecked();
    expect(
      within(dialog).getByRole("list", { name: "Kinds from OpenStreetMap, asked of an Overpass server for the area" }),
    ).toBeInTheDocument();
  });

  it("with nothing yet, offers one button: Add a place", async () => {
    serve(mapData({ summary: { totalBytes: 0, locations: [], active: 0 } }));
    renderScreen(<MapDataPage />, "/maps/data");
    expect(await screen.findByRole("heading", { name: "No offline maps yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add a place/ }).length).toBeGreaterThan(0);
  });
});

describe("Add a place", () => {
  it("finds a town offline and offers its part or all of its country", async () => {
    const user = userEvent.setup();
    const server = serve(mapData());
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click((await screen.findAllByRole("button", { name: /Add a place/ }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    expect(within(dialog).getByRole("heading", { name: "Where?" })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Country, region or town"), "Chamonix");
    expect(await within(dialog).findByText(/is in France: Rhône-Alpes \(smaller\) or all of France\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Rhône-Alpes" }));
    expect(await within(dialog).findByRole("heading", { name: "What for Rhône-Alpes?" })).toBeInTheDocument();
    expect(within(dialog).getByText("Part of France")).toBeInTheDocument();
    // Found here: nothing was asked of anyone else.
    expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  });

  it("finds a part of a country once Geofabrik's list is read from the Where step, on a press", async () => {
    const user = userEvent.setup();
    let listed = false;
    const server = serve(mapData({ regionsListed: false }), {
      "GET /api/maps/data/where": ({ url }: { url: URL }) =>
        /^rh/i.test(url.searchParams.get("q") ?? "") && listed
          ? {
              results: [
                {
                  ...FRANCE,
                  type: "part",
                  name: "Rhône-Alpes",
                  regionId: "france",
                  part: { regionId: "rhone-alpes", name: "Rhône-Alpes" },
                },
              ],
              regionsListed: true,
            }
          : { results: [], regionsListed: listed },
      "POST /api/reference/regions": () => {
        listed = true;
        return { held: true, readAt: 1, source: "https://download.geofabrik.de/index-v1-nogeom.json", regions: [], suggested: [] };
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await user.type(within(dialog).getByRole("searchbox", { name: "Country, region or town" }), "Rhône");
    expect(await within(dialog).findByText(/Nothing is called that/)).toBeInTheDocument();
    // Nothing is asked of Geofabrik until the press.
    expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
    expect(within(dialog).getByText(/A part of a country .* is found once Geofabrik's list of its files is read/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Read the list of parts" }));
    expect(await within(dialog).findByRole("button", { name: /Rhône-Alpes/ })).toBeInTheDocument();
    expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual(["POST /api/reference/regions"]);
    expect(within(dialog).queryByRole("button", { name: "Read the list of parts" })).not.toBeInTheDocument();
  });

  it("builds routes from the person's own .osm.pbf already in storage, downloading nothing and leaving the file", async () => {
    const user = userEvent.setup();
    const server = serve(mapData(), { "POST /api/roads/networks": { downloadId: null, jobId: "j1" } });
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click((await screen.findAllByRole("button", { name: /Add a place/ }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await user.click(within(dialog).getByRole("button", { name: /Routes from your own file/ }));
    expect(await within(dialog).findByRole("heading", { name: "Routes from your own file" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing is downloaded\. Your file stays where it is, untouched/)).toBeInTheDocument();
    // Not a source file: said, and nothing sent.
    await user.type(within(dialog).getByLabelText(/Path in that location/), "maps/notes.txt");
    await user.click(within(dialog).getByRole("button", { name: "Build routes" }));
    expect(within(dialog).getByText("Give an OpenStreetMap source file, ending .osm.pbf.")).toBeInTheDocument();
    expect(posted("/api/roads/networks")).toEqual([]);
    await user.clear(within(dialog).getByLabelText(/Path in that location/));
    await user.type(within(dialog).getByLabelText(/Path in that location/), "maps/kent-latest.osm.pbf");
    expect(within(dialog).getByLabelText(/^Name/)).toHaveAttribute("placeholder", "Kent");
    await user.type(within(dialog).getByLabelText(/^Country/), "gb");
    await user.click(within(dialog).getByRole("button", { name: "Build routes" }));
    await waitFor(() =>
      expect(posted("/api/roads/networks")).toEqual([
        { locationId: "loc1", relPath: "maps/kent-latest.osm.pbf", name: "Kent", country: "GB" },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a place" })).toBeNull());
    expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual(["POST /api/roads/networks"]);
  });

  it("starts the own-file form at a storage location that is connected", async () => {
    const user = userEvent.setup();
    serve(mapData(), {
      "POST /api/roads/networks": { downloadId: null, jobId: "j1" },
      "GET /api/storage/locations": {
        roots: ["/srv"],
        locations: [
          location({ status: "missing" }),
          location({ id: "nas", name: "NAS", kind: "network", isDefault: false, freeBytes: 1_030_000_000_000 }),
        ],
      },
    });
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click((await screen.findAllByRole("button", { name: /Add a place/ }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await user.click(within(dialog).getByRole("button", { name: /Routes from your own file/ }));
    await user.type(await within(dialog).findByLabelText(/Path in that location/), "kent.osm.pbf");
    await user.click(within(dialog).getByRole("button", { name: "Build routes" }));
    await waitFor(() => expect(posted("/api/roads/networks")).toMatchObject([{ locationId: "nas" }]));
  });

  it("arrives with several countries from a route, Routes ticked, reads the list of regions on Check size, and adds each", async () => {
    const user = userEvent.setup();
    const server = serve(mapData());
    renderScreen(<MapDataPage />, "/maps/data?add=1&countries=FR,CH");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    expect(await within(dialog).findByRole("heading", { name: "What for France and Switzerland?" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /Routes/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /^Map/ })).not.toBeChecked();
    expect(within(dialog).getByText(/Asks the map sources how large it is\. Nothing is downloaded yet\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    await within(dialog).findByRole("button", { name: /^Download · / });
    expect(server.calls.filter((call) => call.startsWith("POST"))).toEqual(["POST /api/reference/regions", "POST /api/reference/estimate"]);
    // Asked the first time Routes are added: keep the source file, or delete it once read.
    await user.click(within(dialog).getByRole("radio", { name: /Delete it after reading/ }));
    await user.click(within(dialog).getByRole("button", { name: /^Download · 5\.40 GB$/ }));
    await waitFor(() => expect(posted("/api/maps/data/add")).toHaveLength(2));
    expect(posted("/api/maps/data/add")).toEqual([
      { regionId: "france", kinds: ["roads"], keep: false },
      { regionId: "switzerland", kinds: ["roads"], keep: false },
    ]);
  });

  it("adds walking and cycling as a tick, keeping the source file, saying what the build takes and where it works", async () => {
    const user = userEvent.setup();
    serve(mapData({ streetsInstalled: true, countryFileChoice: { keep: false, locationId: null } }), {
      "GET /api/reference/regions": {
        held: true,
        readAt: 1,
        source: "x",
        regions: [{ id: "france", name: "France", country: "FR", parent: null, depth: 0 }],
        suggested: [],
      },
      "POST /api/streets/tiles/estimate": {
        regions: [{ regionId: "france", name: "France", country: "FR", dataDate: null }],
        inputBytes: 4_900_000_000,
        joined: false,
        minutes: 130,
        memoryBytes: 5e9,
        writtenBytes: 110e9,
        freeSpaceBytes: 14.7e9,
        resultBytes: 6e9,
        measured: false,
        warnings: ["This takes about 2 hours on a Raspberry Pi 5.", "It writes about 110 GB to the disk it works on."],
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=FR&kinds=streets");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for France?" });
    const walk = within(dialog).getByRole("checkbox", { name: /Walking and cycling/ });
    expect(walk).toBeChecked();
    expect(within(dialog).getByText(/Needs France's source file: downloaded and kept first/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    await within(dialog).findByRole("button", { name: /^Download · / });
    // The build's own figures, inside the flow: the time on a Raspberry Pi and the writes to the disk.
    expect(await within(dialog).findByText("It writes about 110 GB to the disk it works on.")).toBeInTheDocument();
    expect(posted("/api/streets/tiles/estimate")).toEqual([
      { regions: [], coming: [{ regionId: "france", name: "France", country: "FR", bytes: 4_900_000_000 }] },
    ]);
    expect(within(dialog).queryByRole("radio", { name: /Delete it after reading/ })).not.toBeInTheDocument();
    // Said on the main view, and the same as the tick says: kept, because it is built from it.
    expect(within(dialog).getByRole("region", { name: "The source file" })).toHaveTextContent(
      /^Source file \(\d\.\d+ GB\): kept on .+\. Walking and cycling is built from it, so it is kept\./,
    );
    expect(within(dialog).queryByText(/keep working without it/)).not.toBeInTheDocument();
    await user.click(within(within(dialog).getByRole("radiogroup", { name: "Where it works" })).getByRole("radio", { name: /^NAS/ }));
    await user.click(within(dialog).getByRole("button", { name: /^Download · / }));
    await waitFor(() =>
      expect(posted("/api/maps/data/add")).toEqual([
        { regionId: "france", kinds: ["extract"], keep: true, streets: { workLocationId: "nas" }, locationId: expect.any(String) },
      ]),
    );
  });

  it("says before the press when walking and cycling must wait for a build under way", async () => {
    serve(mapData({ streetsInstalled: true, countryFileChoice: { keep: true, locationId: null } }), {
      "GET /api/streets/status": {
        state: "building",
        installed: true,
        message: null,
        tileset: null,
        build: {
          jobId: "j1",
          name: "Kent",
          state: "building",
          stage: "tiles",
          stageLabel: null,
          step: null,
          message: null,
          startedAt: 1,
          expectedMs: null,
        },
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=FR&kinds=streets");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for France?" });
    expect(await within(dialog).findByText("Another build is under way")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Walking and cycling for Kent are being built now.*starts by itself once that has finished/),
    ).toBeInTheDocument();
  });

  it("says the remembered source-file choice in one line on the main view, with Change, and in the total", async () => {
    const user = userEvent.setup();
    serve(mapData({ countryFileChoice: { keep: true, locationId: "nas" } }), {
      "GET /api/reference/regions": {
        held: true,
        readAt: 1,
        source: "x",
        regions: [{ id: "france", name: "France", country: "FR", parent: null, depth: 0 }],
        suggested: [],
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=FR&kinds=roads");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for France?" });
    // Not folded into More choices, and nothing silently applied: the choice is said, with Change beside it.
    const line = within(dialog).getByRole("region", { name: "The source file" });
    expect(line).toHaveTextContent(
      /^Source file: kept on NAS\. Needed to add walking and cycling or update without downloading again · Change/,
    );
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    await within(dialog).findByRole("button", { name: /^Download · / });
    const total = () =>
      within(dialog)
        .getByText(/ to download$/)
        .closest("p");
    expect(total()).toHaveTextContent(/to download, the source file \(\d\.\d+ GB\) kept on NAS\./);
    // Change opens both choices, each with its reason.
    await user.click(within(line).getByRole("button", { name: /Change/ }));
    expect(within(dialog).getByRole("radio", { name: /Keep it on NAS/ })).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: /Delete it after reading.*Routes and nearby places keep working/ }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(within(dialog).getByRole("region", { name: "The source file" })).toHaveTextContent(
      /^Source file \(\d\.\d+ GB\): deleted after reading\. Routes and nearby places keep working · Change/,
    );
    expect(total()).toHaveTextContent(/the source file \(\d\.\d+ GB\) deleted once read\./);
    await user.click(within(dialog).getByRole("button", { name: /^Download · / }));
    await waitFor(() => expect(posted("/api/maps/data/add")).toEqual([{ regionId: "france", kinds: ["roads"], keep: false }]));
  });

  it("asks which kinds of nearby places, reads those ticked from the source file, and makes the whole row the target", async () => {
    const user = userEvent.setup();
    serve(mapData({ countryFileChoice: { keep: false, locationId: null } }), {
      "GET /api/reference/regions": {
        held: true,
        readAt: 1,
        source: "x",
        regions: [{ id: "france", name: "France", country: "FR", parent: null, depth: 0 }],
        suggested: [],
      },
    });
    // From the Layers tab: "Add shelters for France".
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=FR&kinds=places&layers=shelters");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for France?" });
    expect(within(dialog).getByRole("checkbox", { name: /^Nearby places/ })).toBeChecked();
    const fromFile = within(dialog).getByRole("list", { name: "Kinds from OpenStreetMap, read from the source file" });
    expect(within(fromFile).getByRole("checkbox", { name: "Shelters and assembly points" })).toBeChecked();
    expect(within(fromFile).getByRole("checkbox", { name: "Hospitals" })).not.toBeChecked();
    // A press anywhere on the row ticks it: the label covers the row.
    await user.click(within(fromFile).getByText("Hospitals"));
    expect(within(fromFile).getByRole("checkbox", { name: "Hospitals" })).toBeChecked();
    expect(within(fromFile).getByText("Hospitals").closest("label")).toHaveClass("before:absolute", "before:inset-0");
    // No separate dialog and no other source's question for what the source file holds.
    expect(within(dialog).queryByText(/Nearby places from other sources/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    const download = await within(dialog).findByRole("button", { name: /^Download · / });
    // Each kind ticked says what its places take, from the source file's size (5.4 GB here); one left unticked says nothing.
    expect(within(fromFile).getByRole("checkbox", { name: "Hospitals" })).toHaveAccessibleDescription(/up to 25\.\d MB/);
    expect(within(fromFile).getByRole("checkbox", { name: "Food and supplies" })).not.toHaveAccessibleDescription(/up to/);
    expect(within(dialog).getByText(/Nothing more is downloaded for these: each size is the most its places take/)).toBeInTheDocument();
    await user.click(download);
    await waitFor(() =>
      expect(posted("/api/maps/data/add")).toEqual([
        { regionId: "france", kinds: ["places"], keep: false, layers: ["hospitals", "shelters"] },
      ]),
    );
  });

  it("adds World basics' borders from their own source, the size shown first, and asks before telling a source Outpost's name", async () => {
    const user = userEvent.setup();
    const estimate = (provider: string, layers: string[], bytes: number) => ({
      estimateId: `e-${provider}`,
      provider,
      items: [
        {
          key: provider,
          title: provider,
          layers,
          bytes,
          exact: true,
          basis: "",
          records: null,
          host: `${provider}.example.org`,
          replaces: null,
        },
      ],
      totalBytes: bytes,
      databaseBytes: bytes,
      notes: [],
    });
    serve(mapData(), {
      "GET /api/reference/catalogue": {
        providers: [{ id: "wikidata", name: "Wikidata", clientName: "Outpost/0.1 (+https://example.org/outpost)", scopes: ["world"] }],
        linked: [],
        countries: [],
      },
      "POST /api/reference/estimate": ({ url: _url }: { url: URL }) => {
        const body = posted("/api/reference/estimate").at(-1) as { provider: string; layers: string[] };
        return estimate(body.provider, body.layers ?? [], body.provider === "wikidata" ? 40_000 : 2_000_000);
      },
      "POST /api/reference/downloads": { downloads: [] },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&world=1&kinds=places&layers=boundaries");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for The whole world?" });
    expect(within(dialog).getByRole("checkbox", { name: "Country boundaries" })).toBeChecked();
    expect(within(dialog).getByText("From Natural Earth, public domain")).toBeInTheDocument();
    // Wikidata asks to be told what is asking: nothing is asked of it until that is ticked.
    await user.click(within(dialog).getByRole("checkbox", { name: "Nuclear power stations and research reactors" }));
    expect(within(dialog).getByRole("button", { name: "Check size" })).toBeDisabled();
    expect(within(dialog).getByText(/Tick to send Outpost's name to Wikidata, or leave its kinds out\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: /Send Outpost's name to Wikidata/ }));
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    const download = await within(dialog).findByRole("button", { name: /^Download · 2\.04 MB$/ });
    expect(posted("/api/reference/estimate")).toEqual([
      { provider: "natural-earth", scope: {}, layers: ["boundaries"] },
      { provider: "wikidata", scope: {}, layers: ["nuclear"], clientNameAgreed: true },
    ]);
    // Each kind's own size, once asked.
    expect(within(dialog).getByRole("checkbox", { name: "Country boundaries" }).closest("li")).toHaveTextContent("2.00 MB");
    await user.click(download);
    await waitFor(() =>
      expect(posted("/api/reference/downloads")).toEqual([
        { estimateId: "e-natural-earth", keys: ["natural-earth"], locationId: expect.any(String) },
        { estimateId: "e-wikidata", keys: ["wikidata"], locationId: expect.any(String) },
      ]),
    );
    expect(posted("/api/maps/data/add")).toEqual([]);
  });

  it("adds satellite pictures of an area as a tick, then chooses the day of the picture in the same dialog", async () => {
    const user = userEvent.setup();
    serve(mapData(), {
      "GET /api/maps/imagery": { sets: [], world: [], sources: [], limits: { noticeKm2: 400, warnKm2: 2500, maxKm2: 10000 } },
      "POST /api/maps/imagery/scenes": {
        bbox: [6.8, 45.9, 7.0, 46.0],
        areaKm2: 170,
        from: "2025-11-23",
        to: "2026-11-23",
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
        ],
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&bbox=6.8,45.9,7.0,46.0&name=Chamonix%20valley");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Chamonix valley?" });
    await user.click(within(dialog).getByRole("checkbox", { name: /^Map/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Satellite pictures/ }));
    expect(within(dialog).getByText(/Free, from Sentinel-2 \(10 m\) or a government's aerial photographs/)).toBeInTheDocument();
    expect(posted("/api/maps/imagery/scenes")).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Choose the picture" }));
    expect(await within(dialog).findByRole("heading", { name: "Satellite pictures of Chamonix valley" })).toBeInTheDocument();
    expect(await within(dialog).findByRole("radio", { name: /12 July 2026/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/cloud over the scene 0\.4%/)).toBeInTheDocument();
    expect(posted("/api/maps/imagery/scenes")).toEqual([{ bbox: [6.8, 45.9, 7, 46] }]);
  });

  it("leaves Map unticked for an area a held map already covers, so its satellite pictures are one tick away", async () => {
    const region = (over: Record<string, unknown>) => ({
      id: "fr",
      regionId: null,
      name: "France",
      tileType: "vector",
      bounds: [-5, 41, 10, 51],
      minZoom: 0,
      maxZoom: 15,
      sizeBytes: 1,
      sourceBuild: null,
      installedAt: 1,
      locationId: "loc1",
      locationName: "Internal storage",
      available: true,
      status: "installed",
      ...over,
    });
    serve(mapData(), { "GET /api/maps/overview": { regions: [region({})], places: [], counts: { markers: 0, tracks: 0, places: 0 } } });
    renderScreen(<MapDataPage />, "/maps/data?add=1&bbox=6.8,45.9,7.0,46.0&name=Chamonix%20valley");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Chamonix valley?" });
    expect(within(dialog).getByRole("checkbox", { name: /^Map/ })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Satellite pictures/ })).not.toBeChecked();
  });

  it("ticks Map for an area no held map covers in detail", async () => {
    serve(mapData(), {
      "GET /api/maps/overview": {
        regions: [{ id: "w", tileType: "vector", bounds: [-180, -85, 180, 85], maxZoom: 6, status: "installed", available: true }],
        places: [],
        counts: { markers: 0, tracks: 0, places: 0 },
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&bbox=6.8,45.9,7.0,46.0&name=Chamonix%20valley");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Chamonix valley?" });
    expect(within(dialog).getByRole("checkbox", { name: /^Map/ })).toBeChecked();
  });

  it("offers a country in parts, all ticked, and reads only the parts left ticked", async () => {
    const user = userEvent.setup();
    serve(mapData({ countryFileChoice: { keep: false, locationId: null } }), {
      "GET /api/reference/regions": {
        held: true,
        readAt: 1,
        source: "x",
        regions: [
          { id: "germany", name: "Germany", country: "DE", parent: null, depth: 0 },
          { id: "bayern", name: "Bayern", country: "DE", parent: "germany", depth: 1 },
          { id: "berlin", name: "Berlin", country: "DE", parent: "germany", depth: 1 },
        ],
        suggested: [],
      },
    });
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=DE&kinds=roads");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Germany?" });
    expect(within(dialog).getByText(/Germany comes in 2 parts\. All are ticked\./)).toBeInTheDocument();
    await user.click(within(dialog).getByText("Choose parts"));
    await user.click(within(dialog).getByRole("checkbox", { name: "Berlin" }));
    expect(within(dialog).getByText(/1 of them are ticked\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    await user.click(await within(dialog).findByRole("button", { name: /^Download · / }));
    await waitFor(() => expect(posted("/api/maps/data/add")).toEqual([{ regionId: "bayern", kinds: ["roads"], keep: false }]));
  });

  it("fetches a country's parts when Geofabrik sends its whole file from a mirror, and says so where the button is", async () => {
    const user = userEvent.setup();
    let asked = 0;
    const scrolled = vi.fn();
    serve(mapData({ countryFileChoice: { keep: false, locationId: null } }), {
      "GET /api/reference/regions": {
        held: true,
        readAt: 1,
        source: "x",
        regions: [
          { id: "germany", name: "Germany", country: "DE", parent: null, depth: 0 },
          { id: "bayern", name: "Bayern", country: "DE", parent: "germany", depth: 1 },
          { id: "berlin", name: "Berlin", country: "DE", parent: "germany", depth: 1 },
        ],
        suggested: [],
      },
      "POST /api/reference/estimate": () =>
        ++asked === 1
          ? {
              status: 400,
              error: {
                code: "bad_request",
                message:
                  "Geofabrik sends Germany's file from another server (a mirror), which Outpost does not download from. Choose its parts instead: each is its own, smaller file.",
              },
            }
          : {
              estimateId: "e",
              provider: "osm-extract",
              items: ["bayern", "berlin"].map((key) => ({
                key,
                title: key,
                layers: [],
                bytes: 800_000_000,
                exact: true,
                basis: "",
                records: null,
                host: "download.geofabrik.de",
                replaces: null,
              })),
            },
    });
    Element.prototype.scrollIntoView = scrolled;
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=DE&kinds=roads");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Germany?" });
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    expect(await within(dialog).findByRole("button", { name: /^Download · 1\.60 GB/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/each part is fetched as its own file instead/)).toBeInTheDocument();
    expect(asked).toBe(2);
    expect(scrolled).toHaveBeenCalled();
  });

  it("shows why Check size failed and brings it into view", async () => {
    const user = userEvent.setup();
    const scrolled = vi.fn();
    serve(mapData({ countryFileChoice: { keep: false, locationId: null } }), {
      "GET /api/reference/regions": {
        held: true,
        readAt: 1,
        source: "x",
        regions: [{ id: "germany", name: "Germany", country: "DE", parent: null, depth: 0 }],
        suggested: [],
      },
      "POST /api/reference/estimate": { status: 502, error: { code: "upstream", message: "Outpost could not reach the map source." } },
    });
    Element.prototype.scrollIntoView = scrolled;
    renderScreen(<MapDataPage />, "/maps/data?add=1&country=DE&kinds=roads");
    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await within(dialog).findByRole("heading", { name: "What for Germany?" });
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    expect(await within(dialog).findByText("Could not check the size")).toBeInTheDocument();
    expect(within(dialog).getByText("Outpost could not reach the map source.")).toBeInTheDocument();
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
  });
});

describe("removing and updating by place", () => {
  it("removes a place with ticks, the source file left unless ticked, saying what it frees", async () => {
    const user = userEvent.setup();
    serve(
      mapData({
        countries: [
          country("MC", "Monaco", {
            map: [item({ key: "m", collectionId: "m", title: "Monaco", sizeBytes: 3_000_000_000 })],
            roads: [item({ key: "r", kind: "roads", collectionId: null, networkId: "n1", sizeBytes: 90_000_000, locationName: null })],
            extract: [item({ key: "x", kind: "extract", collectionId: "x", sizeBytes: 4_900_000_000 })],
          }),
        ],
      }),
      { "DELETE /api/collections/m": { ok: true }, "DELETE /api/roads/networks/n1": { ok: true } },
    );
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: "Actions for Monaco" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove…" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Monaco?" });
    expect(within(dialog).getByRole("checkbox", { name: /Map/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Routes/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Source file/ })).not.toBeChecked();
    expect(dialog).toHaveTextContent("Saved routes keep their directions.");
    await user.click(within(dialog).getByRole("button", { name: "Remove · frees 3.09 GB" }));
    await waitFor(() =>
      expect(
        (fetch as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
          .filter(([, init]) => init?.method === "DELETE")
          .map(([url]) => new URL(String(url), "http://x").pathname),
      ).toEqual(["/api/collections/m", "/api/roads/networks/n1"]),
    );
  });

  it("offers to repair a damaged source file by fetching only the damaged part, saying from where", async () => {
    const user = userEvent.setup();
    serve(
      mapData({
        countries: [
          country("MC", "Monaco", {
            extract: [
              item({
                key: "x",
                kind: "extract",
                title: "Monaco: source file",
                collectionId: "x",
                state: "damaged",
                reason: "Its file no longer matches its checksum. Download it again.",
                update: { how: "download", hosts: ["download.geofabrik.de"], note: null },
              }),
            ],
          }),
        ],
      }),
      { "POST /api/maps/data/repair": { taskId: "t1" } },
    );
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: /^Monaco/ }));
    expect(
      await screen.findByText("Fetches only the damaged part again, from download.geofabrik.de, not the whole file."),
    ).toBeInTheDocument();
    expect(posted("/api/maps/data/repair")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Repair the damaged part" }));
    await waitFor(() => expect(posted("/api/maps/data/repair")).toEqual([{ collectionId: "x" }]));
    expect(await screen.findByText("Repairing: follow it in Downloads and tasks.")).toBeInTheDocument();
  });

  it("says in the danger colour when a repair could not be started", async () => {
    const user = userEvent.setup();
    serve(
      mapData({
        countries: [
          country("MC", "Monaco", {
            extract: [item({ key: "x", kind: "extract", title: "Monaco: source file", collectionId: "x", state: "damaged" })],
          }),
        ],
      }),
      { "POST /api/maps/data/repair": { status: 400, error: { code: "bad_request", message: "Check it under Storage first." } } },
    );
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: /^Monaco/ }));
    await user.click(await screen.findByRole("button", { name: "Repair the damaged part" }));
    expect(await screen.findByText("Check it under Storage first.")).toHaveClass("text-danger");
  });

  it("lists updates by place, each said with what is old, and never a set made once", async () => {
    const user = userEvent.setup();
    serve(ukAndMore());
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: "Check for updates" }));
    const dialog = await screen.findByRole("dialog", { name: "Check for updates" });
    expect(within(dialog).getByRole("heading", { name: "France · Map from 1 Jun 2025" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("Natural Earth");
  });

  it("says hills and heights have no date to compare, before and after Check, rather than a date they do not have", async () => {
    const user = userEvent.setup();
    const undated = "Mapterhorn gives no date for its heights";
    serve(
      mapData({
        countries: [
          country("FR", "France", {
            terrain: [
              item({
                key: "t",
                kind: "terrain",
                title: "France (terrain)",
                collectionId: "t",
                dataDate: null,
                undated,
                update: { how: "download", hosts: ["download.mapterhorn.com"], note: null },
              }),
            ],
          }),
        ],
      }),
      {
        "POST /api/maps/data/check": { hosts: ["download.mapterhorn.com"], sizeBytes: 1_200_000_000, dataDate: null, newer: null },
      },
    );
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: "Actions for France" }));
    await user.click(await screen.findByRole("menuitem", { name: /Update/ }));
    const dialog = await screen.findByRole("dialog", { name: /Update/ });
    expect(dialog).toHaveTextContent(`France (terrain) · Hills and heights · ${undated}`);
    expect(dialog).toHaveTextContent(`${undated}, so Outpost cannot tell whether it is newer than yours`);
    await user.click(within(dialog).getByRole("button", { name: /Check for a newer copy/ }));
    expect(await within(dialog).findByText(new RegExp(`^${undated} to compare with yours: 1\\.20 GB to download`))).toBeInTheDocument();
  });
});

describe("Storage", () => {
  it("is one row, Offline maps · size · where › Manage, that opens by place with the same marks", async () => {
    const user = userEvent.setup();
    serve(ukAndMore());
    renderScreen(
      <table>
        <tbody>
          <OfflineMapsRows color="green" bytes={1} />
        </tbody>
      </table>,
      "/storage",
    );
    const row = await screen.findByRole("row", { name: /Offline maps/ });
    await waitFor(() => expect(row).toHaveTextContent("3.10 GB"));
    expect(row).toHaveTextContent("Internal storage");
    expect(row).toHaveTextContent("4 places");
    expect(within(row).getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/maps/data");
    expect(screen.queryByRole("list", { name: "Offline maps by place" })).not.toBeInTheDocument();

    const toggle = within(row).getByRole("button", { name: "Offline maps" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Offline maps by place" });
    expect(within(list).getByRole("link", { name: "United Kingdom" })).toHaveAttribute("href", "/maps/data");
    // Built from the pattern: a row each, with the marks and words Offline maps uses.
    const places = [...list.querySelectorAll<HTMLElement>('[data-pattern="row"]')];
    expect(places).toHaveLength(4);
    const uk = places[0]!;
    expect([...uk.querySelectorAll<HTMLElement>('[data-pattern="state"]')].map((mark) => mark.dataset.state)).toEqual([
      "ready",
      "downloading",
    ]);
    expect(uk).toHaveTextContent("Map");
    expect(uk).toHaveTextContent("Routes");
    expect(uk).toHaveTextContent("43%");
    expect(screen.getByText(/1 place is over a year old\./)).toBeInTheDocument();
    // Nothing in Outpost's own data here: the location's bar and this figure are the same, and nothing more is said.
    expect(screen.queryByTestId("maps-own-data")).not.toBeInTheDocument();
  });

  it("says what of its figure is in Outpost's own data, which the locations' bars do not show", async () => {
    serve(
      mapData({
        summary: {
          totalBytes: 3_500_000_000,
          locations: [
            { locationId: "loc1", name: "Internal storage", bytes: 3_000_000_000, available: true },
            { locationId: null, name: "Outpost's own data", bytes: 500_000_000, available: true },
          ],
          active: 0,
        },
        countries: [country("GB", "United Kingdom", { map: [item()] })],
      }),
    );
    renderScreen(
      <table>
        <tbody>
          <OfflineMapsRows color="green" bytes={1} />
        </tbody>
      </table>,
      "/storage",
    );
    const row = await screen.findByRole("row", { name: /Offline maps/ });
    await waitFor(() => expect(row).toHaveTextContent("3.50 GB"));
    expect(screen.getByTestId("maps-own-data")).toHaveTextContent(
      "3.00 GB on Internal storage, as in its bar above; 500 MB of routes and nearby places in Outpost's own data, which the bars above do not show.",
    );
  });
});

describe("Downloads and tasks", () => {
  it("titles map downloads and builds in Offline maps' words: the place, then the bundle", async () => {
    installBrowserStubs();
    const job: JobDto = {
      id: "j1",
      type: "roads.build",
      queue: "import",
      state: "running",
      title: "Building the road network: France",
      subject: "roads:fr",
      progress: { current: 1, total: 4, message: null, unit: null, ratePerSecond: null },
      error: null,
      errorKind: null,
      attempts: 1,
      maxAttempts: 1,
      result: null,
      createdAt: 1,
      startedAt: 2,
      finishedAt: null,
      updatedAt: 3,
    } as JobDto;
    fakeServer({
      "GET /api/downloads": {
        downloads: [
          // An older row, stored with the retired words, and a new one.
          download({ id: "d1", kind: "extract", title: "Country file: United Kingdom (Geofabrik)", state: "running" }),
          download({ id: "d2", kind: "extract", title: "Switzerland: routes and nearby places", state: "queued" }),
        ],
      },
      "GET /api/downloads/plan": plan(),
      "GET /api/jobs": { jobs: [job] },
      "GET /api/collections": { collections: [] },
    });
    renderScreen(<DownloadsPage />, "/downloads");
    const bundles = Object.values(BUNDLE_NAMES).map((name) => name.toLowerCase());
    const words = new RegExp(`^(.+): (${[...bundles, "source file"].join("|")})( and (${bundles.join("|")}))?$`);
    const titles = await waitFor(() => {
      const found = screen.getAllByRole("link", { name: /^Details of / }).map((each) => each.getAttribute("aria-label")!.slice(11));
      expect(found).toEqual(
        expect.arrayContaining(["United Kingdom: source file", "Switzerland: routes and nearby places", "France: routes"]),
      );
      return found;
    });
    for (const title of titles) expect(title).toMatch(words);
    expect(mapTaskTitle("OpenStreetMap: Bavaria, Germany (Geofabrik)")).toBe("Bavaria, Germany: nearby places");
    expect(document.body.textContent?.match(/.{0,80}(country file|road network|Geofabrik).{0,40}/i)?.[0] ?? null).toBeNull();
  });
});
