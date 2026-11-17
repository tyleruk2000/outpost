/**
 * Choosing a state or region by name for food and supplies: Geofabrik's list is read only
 * on a press; typing finds a region in any country; the home place's region comes first;
 * the size and what is kept are shown before anything is downloaded, and keeping the file
 * is the person's choice.
 */
import type {
  ReferenceCatalogueResponse,
  ReferenceEstimate,
  ReferenceEstimateRequest,
  ReferenceProviderDto,
  ReferenceRegionsResponse,
  ReferenceStartRequest,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GetDialog } from "./dataset-manager";

const extract: ReferenceProviderDto = {
  id: "osm-extract",
  name: "OpenStreetMap, from a Geofabrik extract",
  publisher: "OpenStreetMap contributors",
  url: "https://download.geofabrik.de/",
  license: "ODbL 1.0",
  licenseUrl: null,
  termsUrl: "https://download.geofabrik.de/",
  termsQuote: "License: ODbL 1.0",
  termsRead: "2026-11-17",
  verdict: "fetch",
  why: "One file per country or region.",
  layers: ["military", "nuclear", "hospitals", "emergency", "shelters", "food"],
  scopes: ["country", "region"],
  importFormats: [],
  caution: null,
  incremental: "No.",
};

const CATALOGUE = { providers: [extract], linked: [], countries: [{ code: "US", name: "United States", bbox: [-125, 24, -66, 49] }] } as unknown as ReferenceCatalogueResponse;

const REGIONS: ReferenceRegionsResponse = {
  held: true,
  readAt: Date.UTC(2026, 10, 17),
  source: "https://download.geofabrik.de/index-v1-nogeom.json",
  regions: [
    { id: "germany", name: "Germany", country: "DE", parent: null, depth: 0 },
    { id: "bayern", name: "Bayern", country: "DE", parent: "germany", depth: 1 },
    { id: "oberbayern", name: "Oberbayern", country: "DE", parent: "bayern", depth: 2 },
    { id: "berlin", name: "Berlin", country: "DE", parent: "germany", depth: 1 },
    { id: "united-kingdom", name: "United Kingdom", country: "GB", parent: null, depth: 0 },
    { id: "england", name: "England", country: "GB", parent: "united-kingdom", depth: 1 },
    { id: "us", name: "United States of America", country: "US", parent: null, depth: 0 },
    { id: "us/indiana", name: "Indiana", country: "US", parent: "us", depth: 1 },
    { id: "us/ohio", name: "Ohio", country: "US", parent: "us", depth: 1 },
  ],
  suggested: [{ id: "us/ohio", why: "Holds the home place" }],
};

const ESTIMATE: ReferenceEstimate = {
  estimateId: "e1",
  provider: "osm-extract",
  items: [
    {
      key: "geofabrik:us/ohio:US",
      title: "OpenStreetMap: Ohio, United States of America (Geofabrik)",
      layers: ["food"],
      bytes: 327_771_006,
      exact: true,
      basis: "The size Geofabrik's server gives for today's file. Read from it: food and supplies. OpenStreetMap only: likely to be fuller in towns than in the country.",
      records: null,
      host: "download.geofabrik.de",
      replaces: null,
      databaseBytes: 26_000_000,
      fileKeptByDefault: false,
    },
  ],
  totalBytes: 327_771_006,
  databaseBytes: 26_000_000,
  notes: ["Geofabrik asks that its files be downloaded responsibly."],
};

function show(options: { held: boolean; home?: boolean }) {
  const calls = { read: 0, regionsAsked: [] as string[], estimates: [] as ReferenceEstimateRequest[], starts: [] as ReferenceStartRequest[] };
  let held = options.held;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/reference/catalogue") return json(CATALOGUE);
      if (url.pathname === "/api/reference/regions" && init?.method === "POST") {
        calls.read += 1;
        held = true;
        return json(REGIONS);
      }
      if (url.pathname === "/api/reference/regions") {
        calls.regionsAsked.push(url.search);
        return json(held ? REGIONS : { held: false, readAt: null, source: REGIONS.source, regions: [], suggested: [] });
      }
      if (url.pathname === "/api/maps/markers")
        return json({
          markers: options.home ? [{ id: "m1", name: "Home", icon: "home", lat: 39.96, lon: -82.99, createdAt: 1 }] : [],
        });
      if (url.pathname === "/api/reference/estimate" && init?.method === "POST") {
        calls.estimates.push(JSON.parse(String(init.body)) as ReferenceEstimateRequest);
        return json(ESTIMATE);
      }
      if (url.pathname === "/api/reference/downloads" && init?.method === "POST") {
        calls.starts.push(JSON.parse(String(init.body)) as ReferenceStartRequest);
        return json({ downloads: [] });
      }
      if (url.pathname.startsWith("/api/storage")) return json({ locations: [{ id: "loc1", name: "This computer", isDefault: true, status: "available", freeBytes: 50e9, totalBytes: 100e9 }] });
      return json({});
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <GetDialog
          open
          onOpenChange={() => {}}
          engine={null}
          initial={null}
          preset={{ provider: "osm-extract", scope: { regions: [] }, layers: ["food"] }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("choosing a region", () => {
  it("asks nothing of Geofabrik until the list is read on a press", async () => {
    const calls = show({ held: false });
    const read = await screen.findByRole("button", { name: "Read the list of regions" });
    expect(screen.getByText(/one file of about 500 kB/)).toBeVisible();
    expect(calls.read).toBe(0);
    fireEvent.click(read);
    await screen.findByRole("searchbox", { name: "Find a country, state or region" });
    expect(calls.read).toBe(1);
    expect(screen.getByText(/Geofabrik's list as read on 17 Nov 2026/)).toBeVisible();
  });

  it("offers the home place's region first, finds a state by typing, and opens a country onto its parts", async () => {
    const calls = show({ held: true, home: true });
    const offered = await screen.findByRole("region", { name: "For the home place" });
    expect(within(offered).getByRole("checkbox", { name: /Ohio/ })).toBeVisible();
    expect(within(offered).getByText(/Holds the home place/)).toBeVisible();
    await waitFor(() => expect(calls.regionsAsked).toContain("?lat=39.960&lon=-82.990"));

    const find = screen.getByRole("searchbox", { name: "Find a country, state or region" });
    fireEvent.change(find, { target: { value: "bay" } });
    const found = await screen.findByRole("list", { name: "Regions found" });
    // Names that begin with what was typed first; where each sits is said.
    expect(within(found).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual([
      "BayernGermany",
      "OberbayernBayern, Germany",
    ]);
    fireEvent.change(find, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /^Germany/ }));
    const germany = await screen.findByRole("list", { name: "Germany and its parts" });
    expect(within(germany).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual([
      "The whole of Germany",
      "Bayern",
      "Oberbayern",
      "Berlin",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "All countries" }));
    expect(await screen.findByRole("list", { name: "Countries" })).toBeVisible();
  });

  it("says what the layer is made from, shows the size and what stays, and keeps only the places unless asked", async () => {
    const calls = show({ held: true });
    const find = await screen.findByRole("searchbox", { name: "Find a country, state or region" });
    const size = screen.getByRole("button", { name: "Show the size" });
    expect(size).toBeDisabled();
    fireEvent.change(find, { target: { value: "ohio" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: /Ohio/ }));
    const chosen = screen.getByRole("list", { name: "Chosen" });
    expect(chosen).toHaveTextContent("Ohio: OpenStreetMap only: likely to be fuller in towns than in the country.");
    // One download serves every layer: said, with the others to tick.
    expect(screen.getByText(/One download serves every layer/)).toBeVisible();

    fireEvent.click(size);
    await waitFor(() => expect(calls.estimates).toHaveLength(1));
    expect(calls.estimates[0]).toEqual({ provider: "osm-extract", scope: { regions: ["us/ohio"] }, layers: ["food"] });
    expect(await screen.findByText(/1 file to download, 328 MB, and at most 26.0 MB in Outpost's database/)).toBeVisible();
    expect(screen.getByText(/Afterwards on this device: only the places read, at most 26.0 MB\. The 328 MB file is deleted once read/)).toBeVisible();
    const keep = screen.getByRole("checkbox", { name: "Keep the downloaded file too" });
    expect(keep).not.toBeChecked();
    fireEvent.click(keep);
    expect(screen.getByText(/Afterwards on this device: the 328 MB file and the places read from it/)).toBeVisible();
    fireEvent.click(keep);
    const download = screen.getByRole("button", { name: "Download" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(calls.starts).toHaveLength(1));
    expect(calls.starts[0]).toMatchObject({ estimateId: "e1", keys: ["geofabrik:us/ohio:US"], keepFile: false });
  });
});
