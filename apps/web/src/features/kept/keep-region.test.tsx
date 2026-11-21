/**
 * Keeping a whole installed region on the phone: chosen by name, measured by the server
 * for exactly the region's box before anything is fetched.
 */
import type { MapAreaSize, MapOverview, MapSources } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { installFakeCaches } from "./fake-caches";
import { KeepAreaSection } from "./keep-controls";

const sources = {
  hasTiles: true,
  hasTerrain: true,
  sources: { basemap: { minzoom: 0, maxzoom: 15, bounds: [-180, -85, 180, 85] }, terrain: { minzoom: 0, maxzoom: 12, bounds: [-4, 54, -2, 55] } },
  attributions: [],
} as unknown as MapSources;
const overview = {
  regions: [
    { id: "r1", regionId: "lake-district", name: "Lake District", tileType: "vector", bounds: [-3.6, 54.2, -2.6, 54.8], minZoom: 0, maxZoom: 15 },
    { id: "r2", regionId: null, name: "Lake District terrain", tileType: "terrain", bounds: [-3.6, 54.2, -2.6, 54.8], minZoom: 0, maxZoom: 12 },
  ],
  places: [],
  counts: { markers: 0, tracks: 0, places: 0 },
} as unknown as MapOverview;
const size: MapAreaSize = {
  map: { tiles: 4000, bytes: 80e6, minZoom: 0, maxZoom: 14 },
  terrain: { tiles: 900, bytes: 60e6, minZoom: 0, maxZoom: 12 },
  totalBytes: 140e6,
} as unknown as MapAreaSize;

let restore: () => void;
beforeEach(() => {
  restore = installFakeCaches().restore;
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { estimate: async () => ({ quota: 4e9, usage: 1e8 }), persisted: async () => false, persist: async () => true },
  });
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe("keeping a whole region", () => {
  it("offers each installed map region, and measures exactly its box", async () => {
    const asked: Array<{ path: string; query: unknown }> = [];
    vi.spyOn(api, "get").mockImplementation(async (path: string, query?: unknown) => {
      asked.push({ path, query });
      if (path === "/api/maps/sources") return sources as never;
      if (path === "/api/maps/overview") return overview as never;
      if (path === "/api/maps/area-size") return size as never;
      throw new Error(`not expected: ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <KeepAreaSection engine={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("combobox", { name: "What to keep" }));
    await userEvent.click(await screen.findByRole("option", { name: "All of Lake District" }));
    expect(screen.queryByRole("option", { name: /terrain/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Measure all of Lake District" }));
    expect(await screen.findByText(/about 140/)).toBeTruthy();
    const measured = asked.find((entry) => entry.path === "/api/maps/area-size")!;
    expect((measured.query as { bbox: string }).bbox).toBe("-3.60000,54.20000,-2.60000,54.80000");
  });
});
