/**
 * Offline maps: one row per place with a word for each of Map, Routes, Nearby places; one line for
 * what is downloading and one for what is over a year old; every kind of row built from the same
 * row, state and menu; Add a place (a town found offline, several countries from a link, a
 * country in parts); removing and updating by place.
 */
import type { MapDataResponse, MapDataWhereResponse, MapDataWhereResult } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, fakeServer, installBrowserStubs, location, renderScreen } from "@/features/downloads/test-support";
import { MapDataSection } from "@/features/storage/map-data-section";
import MapDataPage from "./map-data-page";
import { country, item, mapData } from "./test-data";

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
      "Lake shore · drawn",
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
    expect(within(dialog).getByText(/1 are ticked\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Check size" }));
    await user.click(await within(dialog).findByRole("button", { name: /^Download · / }));
    await waitFor(() => expect(posted("/api/maps/data/add")).toEqual([{ regionId: "bayern", kinds: ["roads"], keep: false }]));
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

  it("lists updates by place, each said with what is old, and never a set made once", async () => {
    const user = userEvent.setup();
    serve(ukAndMore());
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: "Check for updates" }));
    const dialog = await screen.findByRole("dialog", { name: "Check for updates" });
    expect(within(dialog).getByRole("heading", { name: "France · Map from 1 Jun 2025" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("Natural Earth");
  });
});

describe("Storage", () => {
  it("lists offline maps by place, each leading to Offline maps", async () => {
    serve(ukAndMore());
    renderScreen(<MapDataSection />, "/storage");
    const table = await screen.findByRole("table", { name: "Offline maps by place" });
    expect(within(table).getByRole("link", { name: "United Kingdom" })).toHaveAttribute("href", "/maps/data");
    expect(screen.getByText(/1 place is over a year old\./)).toBeInTheDocument();
  });
});
