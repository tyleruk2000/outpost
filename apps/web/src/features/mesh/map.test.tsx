/** The mesh radios on the map: the "Heard on the radio" group, each radio's own switch, and the marks drawn. */
import type { MeshPosition } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ageOpacity, HeardGroup } from "@/features/heard/heard";
import type { MapEngine } from "@/features/maps/map/engine";
import { meshFeatures, useMeshOnMap } from "./map";

const now = Date.now();
const kitchen: MeshPosition = {
  id: "!a1b2c3d4",
  transport: "meshtastic",
  shortName: "KIT",
  longName: "Kitchen radio",
  onMap: true,
  at: now - 3 * 60 * 60_000,
  position: { lat: 51.5, lon: -0.12, altitude: null },
};
const van: MeshPosition = {
  id: "!0000beef",
  transport: "meshtastic",
  shortName: "VAN",
  longName: null,
  onMap: false,
  at: now - 60_000,
  position: null,
};

function Harness({ engine }: { engine: MapEngine }) {
  const { source } = useMeshOnMap({ engine });
  return <HeardGroup sources={source ? [source] : []} />;
}

function serve(radios: MeshPosition[]) {
  const sent: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      if (init?.method === "PUT") sent.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ radios }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return sent;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("mesh radios on the map", () => {
  it("draws only the radios switched on, faded by age, with the age in words", () => {
    const drawn = meshFeatures([kitchen, van], now);
    expect(drawn.features).toHaveLength(1);
    expect(drawn.features[0]?.properties).toMatchObject({ source: "mesh", fade: 0.7 });
    expect(String(drawn.features[0]?.properties.label)).toMatch(/^Kitchen radio\n3 hours ago$/);
    expect(ageOpacity(10 * 60_000)).toBe(1);
    expect(ageOpacity(24 * 60 * 60_000)).toBe(0.45);
  });

  it("is off by default, in the Heard on the radio group, and switches each radio for every device", async () => {
    const sent = serve([kitchen, van]);
    const engine = { setOverlay: vi.fn() } as unknown as MapEngine;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Harness engine={engine} />
      </QueryClientProvider>,
    );
    const group = await screen.findByRole("region", { name: "Heard on the radio" });
    expect(group).toHaveTextContent("Mesh radios");
    const layer = screen.getByRole("switch", { name: /Mesh radios/ });
    expect(layer).not.toBeChecked();
    expect(screen.getByText("Heard in the last hour")).toBeInTheDocument();
    await userEvent.click(layer);
    await waitFor(() =>
      expect(engine.setOverlay).toHaveBeenLastCalledWith("o-heard", expect.objectContaining({ features: [expect.anything()] })),
    );
    await userEvent.click(screen.getByRole("switch", { name: "Show VAN on the map" }));
    await waitFor(() => expect(sent).toEqual([{ path: "/api/mesh/radios/!0000beef/map", body: { onMap: true } }]));
  });

  it("shows no group where no radio has reported a place", async () => {
    serve([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness engine={{ setOverlay: vi.fn() } as unknown as MapEngine} />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("region", { name: "Heard on the radio" })).not.toBeInTheDocument();
  });
});
