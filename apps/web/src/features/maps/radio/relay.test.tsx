/**
 * The relay planner in the line-of-sight panel: asked only when pressed, the places listed highest first or nearest
 * first, and the one chosen drawn with its lines of sight to A and B. Every figure is made up.
 */
import type { RelayPlan } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rangeFixture } from "@/features/repeaters/map/range-fixture";
import { api } from "@/lib/api";
import type { MapEngine } from "../map/engine";
import { orderCandidates, RelaySection, relayData } from "./relay";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() }, errorMessage: (error: unknown) => String(error), ApiError: class extends Error {} }));
const asked = vi.mocked(api.get);

const A = { lat: 54.4, lon: -3.2 };
const B = { lat: 54.5, lon: -3 };
const candidates = [
  { at: { lat: 54.45, lon: -3.1 }, groundMeters: 612, fromAMeters: 9_000, fromBMeters: 8_000 },
  { at: { lat: 54.42, lon: -3.05 }, groundMeters: 840, fromAMeters: 11_000, fromBMeters: 12_500 },
  { at: { lat: 54.47, lon: -3.15 }, groundMeters: 455, fromAMeters: 7_000, fromBMeters: 6_500 },
];
const plan: RelayPlan = {
  a: A,
  b: B,
  aMeters: 1.5,
  bMeters: 1.5,
  relayMeters: 1.5,
  distanceMeters: 16_000,
  coverage: "terrain",
  both: rangeFixture("terrain", { seen: (_bearing, meters) => meters > 6_000 && meters < 12_000 }, A),
  candidates,
};

const engine = { setOverlay: vi.fn(), setShades: vi.fn() };
const overlay = () => engine.setOverlay.mock.calls.filter(([source]) => source === "o-relay").at(-1)?.[1];

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RelaySection engine={engine as unknown as MapEngine} from={A} to={B} heightA={1.5} heightB={1.5} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  asked.mockReset();
  engine.setOverlay.mockClear();
  asked.mockResolvedValue(plan as never);
});

describe("the order of the places", () => {
  it("is the highest first, or the one with the shorter longer leg first", () => {
    expect(orderCandidates(candidates, "height").map((cell) => cell.groundMeters)).toEqual([840, 612, 455]);
    expect(orderCandidates(candidates, "distance").map((cell) => cell.groundMeters)).toEqual([455, 612, 840]);
  });

  it("draws the places numbered, and the lines of sight from the one chosen to each end", () => {
    const listed = orderCandidates(candidates, "height");
    expect(relayData(plan, listed, null).features.map((feature) => feature.properties.label)).toEqual(["1", "2", "3"]);
    const legs = relayData(plan, listed, 0).features.filter((feature) => feature.properties.kind === "leg");
    expect(legs.map((leg) => leg.geometry.coordinates)).toEqual([
      [
        [A.lon, A.lat],
        [-3.05, 54.42],
      ],
      [
        [B.lon, B.lat],
        [-3.05, 54.42],
      ],
    ]);
  });
});

describe("the relay planner", () => {
  it("asks only when pressed, with the heights at each end and at the relay, then lists the places", async () => {
    show();
    expect(asked).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find high ground in sight of both" }));
    await waitFor(() =>
      expect(asked).toHaveBeenCalledWith(
        "/api/maps/relay",
        { a: "54.40000,-3.20000", b: "54.50000,-3.00000", aHeight: "1.5", bHeight: "1.5", relay: "1.5" },
        expect.anything(),
      ),
    );
    expect(await screen.findByText(/^3 places in sight of both/)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1Ground 840 m above sea level11.0 km from A, 12.5 km from B");

    // Nearest first, then one chosen: drawn with its lines of sight.
    fireEvent.click(screen.getByRole("radio", { name: "Nearest first" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Ground 455 m");
    fireEvent.click(screen.getByRole("button", { name: /^Ground 455 m/ }));
    expect(screen.getByRole("button", { name: /^Ground 455 m/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(overlay().features.filter((feature: { properties: { kind: string } }) => feature.properties.kind === "leg")).toHaveLength(2),
    );
  });

  it("says when no ground is in sight of both, and what might find some", async () => {
    asked.mockResolvedValue({ ...plan, candidates: [] } as never);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Find high ground in sight of both" }));
    expect(await screen.findByText(/^No ground within reach is in sight of both with these heights\./)).toBeInTheDocument();
  });
});
