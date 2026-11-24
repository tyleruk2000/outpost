/**
 * Maps' Nearest: only the kinds held are offered; a hospital is any record of the Hospitals
 * layer; each row has its distance, bearing and Directions; and with nothing held it says
 * where such places come from.
 */
import type { NearestResponse, ReferenceLayersResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { heldKinds, NearestDialog } from "./nearest";

const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const layer = (id: string, count: number, kinds: Array<[string, number]> = []) => ({
  id,
  count,
  countries: ["GB"],
  providers: [],
  kinds: kinds.map(([kind, n]) => ({ kind, label: kind, count: n })),
  provenance: [],
});

const SUMMARY = {
  layers: [
    layer("hospitals", 3, [["amenity=hospital", 3]]),
    layer("food", 9, [
      ["food:pharmacy", 2],
      ["food:supermarket", 7],
    ]),
    layer("shelters", 0),
  ],
  population: [],
  credits: [],
} as unknown as ReferenceLayersResponse;

const HOSPITALS: NearestResponse = {
  kind: null,
  withinMeters: 100_000,
  hits: [
    {
      id: 7,
      name: "St Helier Hospital",
      kind: "amenity=hospital",
      kindLabel: "Hospital",
      provider: "osm",
      lat: 51.38,
      lon: -0.18,
      distanceMeters: 2_400,
      bearingDegrees: 45,
    },
  ],
};

describe("Maps' Nearest", () => {
  it("offers only the kinds held", () => {
    expect(heldKinds(SUMMARY)).toEqual(["hospital", "pharmacy"]);
    expect(heldKinds(undefined)).toEqual([]);
  });

  it("lists the nearest hospitals from home, any kind of hospital, with Directions", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(async (path: string) => (path.startsWith("/api/reference/layers") ? SUMMARY : HOSPITALS) as never);
    const onDirections = vi.fn();
    const onShow = vi.fn();
    render(
      wrap(
        <NearestDialog
          open
          onOpenChange={vi.fn()}
          kind="hospital"
          onKind={vi.fn()}
          home={{ name: "Home", lat: 51.36, lon: -0.2, at: null }}
          centre={{ lat: 50, lon: 0 }}
          onDirections={onDirections}
          onShow={onShow}
        />,
      ),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nearest" });
    const kinds = await within(dialog).findByRole("group", { name: "What to find" });
    expect(
      within(kinds)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Hospital", "Pharmacy"]);
    expect(within(kinds).getByRole("button", { name: "Hospital" })).toHaveAttribute("aria-pressed", "true");
    const list = await within(dialog).findByRole("list", { name: "Nearest to Home" });
    expect(within(list).getByText("St Helier Hospital")).toBeInTheDocument();
    expect(list).toHaveTextContent(/2\.40 km \(1\.49 mi\) · 45° NE/);
    expect(get).toHaveBeenCalledWith("/api/reference/nearest?lat=51.3600&lon=-0.2000&layer=hospitals&limit=5&any=1");
    await userEvent.click(within(list).getByRole("button", { name: /Directions to St Helier Hospital/ }));
    expect(onDirections).toHaveBeenCalledWith(HOSPITALS.hits[0]);
    await userEvent.click(within(list).getByRole("button", { name: /St Helier Hospital.*Show on the map/ }));
    expect(onShow).toHaveBeenCalledWith(HOSPITALS.hits[0], "hospitals");
  });

  it("says where such places come from when none is held", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ layers: [], population: [], credits: [] } as never);
    render(
      wrap(
        <NearestDialog
          open
          onOpenChange={vi.fn()}
          kind="pharmacy"
          onKind={vi.fn()}
          home={null}
          centre={{ lat: 50, lon: 0 }}
          onDirections={vi.fn()}
          onShow={vi.fn()}
        />,
      ),
    );
    expect(await screen.findByText(/No hospitals, pharmacies, shelters, drinking water or fuel are held/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add nearby places" })).toHaveAttribute("href", "/maps/data?get=places");
  });
});
