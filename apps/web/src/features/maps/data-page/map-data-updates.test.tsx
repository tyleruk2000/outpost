/**
 * Map data's ages, updates and removals, and its section on the Storage screen: what each says
 * before anything happens, and that nothing is checked, fetched or deleted without a press.
 */
import type { MapDataResponse } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer, installBrowserStubs, location, renderScreen } from "@/features/downloads/test-support";
import { MapDataSection } from "@/features/storage/map-data-section";
import MapDataPage from "./map-data-page";
import { country, item, mapData } from "./test-data";
import { olderFiles, staleItems, staleLine, storageRows } from "./words";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const OLD = "2025-06-01";
const NOW = Date.parse("2026-11-23T12:00:00Z");

const ukMap = item({
  key: "collection:m",
  collectionId: "m",
  title: "United Kingdom",
  dataDate: OLD,
  update: { how: "download", hosts: ["build.protomaps.com"], note: null },
});
const ukRoads = item({
  key: "road-network:r",
  kind: "roads",
  title: "United Kingdom",
  collectionId: null,
  networkId: "r",
  regionId: "united-kingdom",
  sizeBytes: 30_000_000,
  locationId: null,
  locationName: null,
  dataDate: OLD,
  update: { how: "country-file", hosts: ["download.geofabrik.de"], note: null },
});
const keptFile = (over: Parameters<typeof item>[0] = {}) =>
  item({
    key: "collection:f",
    kind: "extract",
    title: "United Kingdom",
    collectionId: "f",
    regionId: "united-kingdom",
    sizeBytes: 2_200_000_000,
    locationId: "nas",
    locationName: "NAS",
    dataDate: "2026-11-16",
    update: { how: "download", hosts: ["download.geofabrik.de"], note: null },
    ...over,
  });

function serve(data: MapDataResponse, extra: Record<string, unknown> = {}) {
  installBrowserStubs();
  return fakeServer({
    "GET /api/maps/data": data,
    "GET /api/maps/overview": { regions: [], places: [], counts: { markers: 0, tracks: 0, places: 0 } },
    "GET /api/storage/locations": { roots: ["/srv"], locations: [location(), location({ id: "nas", name: "NAS", isDefault: false })] },
    "GET /api/reference/catalogue": { providers: [], linked: [], countries: [] },
    "GET /api/downloads": { downloads: [] },
    "GET /api/jobs": { jobs: [] },
    "GET /api/reference/packs": { packs: [] },
    ...extra,
  });
}

const sent = (path: string, method = "POST") =>
  (fetch as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
    .filter(([url, init]) => String(url).includes(path) && (init?.method ?? "GET") === method)
    .map(([url, init]) => ({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null }));

describe("the words", () => {
  it("finds what is over a year old, once each, and the older of two kept country files", () => {
    const newer = keptFile({ key: "collection:g", collectionId: "g", dataDate: "2026-11-21" });
    const data = mapData({
      countries: [country("GB", "United Kingdom", { map: [ukMap], roads: [ukRoads], extract: [keptFile()] })],
      countryFiles: [keptFile(), newer],
    });
    expect(staleItems(data, NOW).map((each) => each.key)).toEqual(["collection:m", "road-network:r"]);
    expect(staleLine(2)).toBe("2 things are over a year old.");
    expect(staleLine(1)).toBe("1 thing is over a year old.");
    expect([...olderFiles(data.countryFiles).entries()].map(([key, value]) => [key, value.key])).toEqual([
      ["collection:f", "collection:g"],
    ]);
    const rows = storageRows(data);
    expect(rows.map((row) => row.name)).toEqual([
      "Maps to look at",
      "Hills and heights",
      "Place names",
      "Places to find",
      "Roads for routes",
      "Country files",
      "Satellite pictures",
    ]);
    expect(rows.find((row) => row.name === "Country files")).toMatchObject({ count: 2, bytes: 4_400_000_000, where: ["NAS"] });
    expect(rows.find((row) => row.name === "Roads for routes")).toMatchObject({ count: 1, where: ["Outpost's own data"] });
  });

  it("lists a kind it does not name yet under its own name", () => {
    const streets = item({ key: "s", kind: "streets" as never, title: "Streets", sizeBytes: 10 });
    const rows = storageRows(mapData({ other: [streets] }));
    expect(rows.at(-1)).toMatchObject({ name: "Streets", count: 1, bytes: 10 });
  });
});

describe("Storage › Map data", () => {
  it("lists each kind with where it is, how many and how large, each leading to Map data", async () => {
    serve(mapData({ countries: [country("GB", "United Kingdom", { map: [ukMap], roads: [ukRoads] })], countryFiles: [keptFile()] }));
    renderScreen(<MapDataSection />, "/storage");
    const table = await screen.findByRole("table", { name: "Map data by kind" });
    const row = (name: string) => within(table).getByRole("link", { name }).closest("tr")!;
    expect(row("Maps to look at")).toHaveTextContent(/Internal storage.*1 item.*3\.00 GB/);
    expect(row("Roads for routes")).toHaveTextContent(/Outpost's own data.*1 item.*30\.0 MB/);
    expect(row("Country files")).toHaveTextContent(/NAS.*1 item.*2\.20 GB/);
    expect(row("Hills and heights")).toHaveTextContent(/None yet/);
    expect(within(table).getByRole("link", { name: "Country files" })).toHaveAttribute("href", "/maps/data#country-files");
    expect(screen.getByRole("link", { name: "Manage map data" })).toHaveAttribute("href", "/maps/data");
    expect(screen.getByText(/2 things are over a year old\./)).toBeInTheDocument();
  });
});

describe("removing", () => {
  it("removing roads says what stops and what is freed, and asks, unticked, whether to delete the kept country file too", async () => {
    const user = userEvent.setup();
    serve(
      mapData({ countries: [country("GB", "United Kingdom", { roads: [ukRoads], extract: [keptFile()] })], countryFiles: [keptFile()] }),
      { "DELETE /api/roads/networks/r": { ok: true }, "DELETE /api/collections/f": { ok: true } },
    );
    renderScreen(<MapDataPage />, "/maps/data");
    const uk = await screen.findByRole("list", { name: "Map data for United Kingdom" });
    await user.click(within(uk).getByRole("button", { name: "Actions for United Kingdom: roads for routes" }));
    expect(screen.queryByRole("menuitem", { name: /Move/ })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: /Remove/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove “United Kingdom”?" });
    expect(dialog).toHaveTextContent("Routes can no longer be planned through it. Saved routes keep their directions.");
    expect(dialog).toHaveTextContent("Frees 30.0 MB in Outpost's own data.");
    const also = within(dialog).getByRole("checkbox", { name: "Also delete the kept country file (2.20 GB on NAS)?" });
    expect(also).not.toBeChecked();
    await user.click(also);
    await user.click(within(dialog).getByRole("button", { name: "Remove roads and the country file" }));
    await waitFor(() => expect(sent("/api/collections/f", "DELETE")).toHaveLength(1));
    expect(sent("/api/roads/networks/r", "DELETE")).toHaveLength(1);
    expect(sent("/api/collections/f", "DELETE")[0]!.url).toContain("deleteFiles=true");
  });

  it("leaves the country file alone unless asked", async () => {
    const user = userEvent.setup();
    serve(mapData({ countries: [country("GB", "United Kingdom", { roads: [ukRoads] })], countryFiles: [keptFile()] }), {
      "DELETE /api/roads/networks/r": { ok: true },
    });
    renderScreen(<MapDataPage />, "/maps/data");
    const uk = await screen.findByRole("list", { name: "Map data for United Kingdom" });
    await user.click(within(uk).getByRole("button", { name: "Actions for United Kingdom: roads for routes" }));
    await user.click(screen.getByRole("menuitem", { name: /Remove/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove roads" }));
    await waitFor(() => expect(sent("/api/roads/networks/r", "DELETE")).toHaveLength(1));
    expect(sent("/api/collections/", "DELETE")).toHaveLength(0);
  });

  it("offers Move for a map, and a kept country file with a newer one is offered for removal, not removed", async () => {
    const user = userEvent.setup();
    const newer = keptFile({ key: "collection:g", collectionId: "g", dataDate: "2026-11-21" });
    serve(mapData({ countries: [country("GB", "United Kingdom", { map: [ukMap] })], countryFiles: [keptFile(), newer] }));
    renderScreen(<MapDataPage />, "/maps/data");
    const files = await screen.findByRole("list", { name: "Kept country files" });
    expect(files).toHaveTextContent(/A newer file is kept, from 21 Nov 2026\. This one is from 16 Nov 2026 and takes 2\.20 GB on NAS\./);
    expect(within(files).getAllByRole("button", { name: "Remove the older file" })).toHaveLength(1);
    expect(sent("/api/collections/", "DELETE")).toHaveLength(0);
    await user.click(within(files).getByRole("button", { name: "Remove the older file" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Frees 2.20 GB on NAS");

    await user.keyboard("{Escape}");
    const uk = screen.getByRole("list", { name: "Map data for United Kingdom" });
    await user.click(within(uk).getByRole("button", { name: "Actions for United Kingdom: map to look at" }));
    await user.click(screen.getByRole("menuitem", { name: /Move/ }));
    expect(await screen.findByRole("dialog", { name: "Move “United Kingdom”" })).toBeInTheDocument();
  });
});

describe("age and updates", () => {
  it("marks what is over a year old, and Review updates says what each costs, asking the named host only on a press", async () => {
    const user = userEvent.setup();
    const { calls } = serve(
      mapData({
        countries: [country("GB", "United Kingdom", { map: [ukMap], roads: [ukRoads], extract: [keptFile()] })],
        countryFiles: [keptFile()],
      }),
      {
        "POST /api/maps/data/check": { hosts: ["build.protomaps.com"], sizeBytes: 3_100_000_000, dataDate: "2026-11-22", newer: true },
        "POST /api/maps/data/update": { downloadIds: ["d9"] },
        "POST /api/maps/data/add": {
          countryFile: { source: "kept", collectionId: "f", dataDate: "2026-11-16", fileName: "x" },
          downloadIds: [],
          taskIds: ["t"],
        },
      },
    );
    renderScreen(<MapDataPage />, "/maps/data");
    const uk = await screen.findByRole("list", { name: "Map data for United Kingdom" });
    const row = (name: string) => within(uk).getByRole("heading", { name }).closest("li")!;
    expect(row("Map to look at")).toHaveTextContent(/from 1 Jun 2025/);
    expect(within(row("Map to look at")).getByText("Over a year old")).toBeInTheDocument();
    expect(within(row("Country file")).queryByText("Over a year old")).toBeNull();
    expect(screen.getByText("2 things are over a year old.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review updates" }));
    const dialog = await screen.findByRole("dialog", { name: "Review updates" });
    const list = within(dialog).getByRole("list", { name: "What is over a year old" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("Check asks build.protomaps.com how large and how new the newest copy is.");
    expect(list).toHaveTextContent("No download: read from the kept file (16 Nov 2026).");
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([]);

    await user.click(within(list).getByRole("button", { name: "Check for a newer copy: United Kingdom" }));
    expect(
      await within(list).findByText(/A newer one is there, from 22 Nov 2026: 3\.10 GB to download from build\.protomaps\.com/),
    ).toBeInTheDocument();
    expect(sent("/api/maps/data/check")[0]!.body).toEqual({ collectionId: "m" });
    expect(sent("/api/maps/data/update")).toHaveLength(0);
    await user.click(within(list).getByRole("button", { name: "Update: United Kingdom" }));
    expect(
      await within(list).findByText(/The one you have stays, and is used, until the new one is in place and checked/),
    ).toBeInTheDocument();
    expect(sent("/api/maps/data/update")[0]!.body).toEqual({ collectionId: "m" });

    await user.click(within(list).getByRole("button", { name: "Read the kept file: United Kingdom, roads for routes" }));
    await waitFor(() => expect(sent("/api/maps/data/add")).toHaveLength(1));
    expect(sent("/api/maps/data/add")[0]!.body).toEqual({ regionId: "united-kingdom", kinds: ["roads"], keep: true, locationId: "nas" });
  });

  it("a newer country file for roads is one more press, asked as newer than the kept one", async () => {
    const user = userEvent.setup();
    serve(mapData({ countries: [country("GB", "United Kingdom", { roads: [ukRoads] })], countryFiles: [keptFile()] }), {
      "POST /api/maps/data/add": { countryFile: null, downloadIds: ["d"], taskIds: [] },
    });
    renderScreen(<MapDataPage />, "/maps/data");
    const uk = await screen.findByRole("list", { name: "Map data for United Kingdom" });
    await user.click(within(uk).getByRole("button", { name: "Actions for United Kingdom: roads for routes" }));
    await user.click(screen.getByRole("menuitem", { name: /Update/ }));
    const dialog = await screen.findByRole("dialog", { name: "Update “United Kingdom”" });
    await user.click(within(dialog).getByRole("button", { name: "Download a newer file" }));
    await waitFor(() => expect(sent("/api/maps/data/add")).toHaveLength(1));
    expect(sent("/api/maps/data/add")[0]!.body).toEqual({
      regionId: "united-kingdom",
      kinds: ["roads"],
      keep: true,
      locationId: "nas",
      newerThan: "2026-11-17",
    });
  });

  it("says when the newest is the one kept, and offers no download", async () => {
    const user = userEvent.setup();
    serve(mapData({ countries: [country("GB", "United Kingdom", { map: [ukMap] })] }), {
      "POST /api/maps/data/check": { hosts: ["build.protomaps.com"], sizeBytes: 3_000_000_000, dataDate: "2025-06-01", newer: false },
    });
    renderScreen(<MapDataPage />, "/maps/data");
    await user.click(await screen.findByRole("button", { name: "Review updates" }));
    const dialog = await screen.findByRole("dialog", { name: "Review updates" });
    await user.click(within(dialog).getByRole("button", { name: /Check for a newer copy/ }));
    expect(await within(dialog).findByText("This is the newest already (1 Jun 2025).")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Update/ })).toBeNull();
  });
});
