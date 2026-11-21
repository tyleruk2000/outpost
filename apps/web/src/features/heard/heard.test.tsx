/** Heard on the radio: the marks on the map, the one card, the range view's outline, and the screen. */
import type { HeardReceiversResponse, HeardStation } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeardCard } from "./card";
import HeardPage from "./heard-page";
import { meshItem, stationItem } from "./items";
import { computeRange, type RangeReport } from "./range";
import { stationFeatures } from "./use-heard-on-map";
import { fromHome, pathWords } from "./words";

const now = Date.now();
const home = { lat: 51.5, lon: -0.1, name: "Home" };

const station = (patch: Partial<HeardStation> = {}): HeardStation => ({
  id: "s1",
  source: "aprs",
  key: "M0ABC-9",
  name: "M0ABC-9",
  kindWords: "Car",
  symbol: "/>",
  receiverId: "r1",
  lat: 51.6,
  lon: -0.1,
  altitude: null,
  course: 90,
  speed: 20,
  comment: "Walking test",
  direct: false,
  via: "M0DIG-3",
  firstAt: now - 3_600_000,
  lastAt: now - 120_000,
  positionAt: now - 120_000,
  reports: 3,
  pinned: false,
  pinName: null,
  details: {},
  ...patch,
});

const receivers: HeardReceiversResponse = {
  receivers: [
    {
      id: "r1",
      kind: "aprs",
      name: "Radio at home",
      host: "192.168.1.20",
      port: 8001,
      transport: "tcp",
      enabled: true,
      createdAt: now,
      status: {
        state: "connected",
        since: now,
        lastPacketAt: now - 60_000,
        packets: 12,
        positions: 9,
        malformed: 1,
        refused: 0,
        lastError: null,
        retryAt: null,
      },
    },
  ],
  right: { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_SETTINGS", inContainer: false },
  space: {
    stations: 1,
    reports: 3,
    bytes: 8192,
    bySource: {
      aprs: { stations: 1, reports: 3 },
      adsb: { stations: 0, reports: 0 },
      ais: { stations: 0, reports: 0 },
      mesh: { stations: 0, reports: 0 },
    },
  },
  aircraftHours: 0,
  pi: null,
};

afterEach(() => vi.unstubAllGlobals());

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("marks on the map", () => {
  it("keeps the household's pinned stations apart, under their own name, and leaves out what has no position or was taken off", () => {
    const drawn = stationFeatures(
      [
        station(),
        station({ id: "s2", pinned: true, pinName: "Sam walking" }),
        station({ id: "s3", lat: null, lon: null }),
        station({ id: "s4", details: { killed: true } }),
      ],
      now,
    );
    expect(drawn.marks.features).toHaveLength(1);
    expect(drawn.pinned.features).toHaveLength(1);
    expect(String(drawn.pinned.features[0]!.properties.label)).toMatch(/^Sam walking\n2 minutes ago$/);
    expect(drawn.marks.features[0]!.properties).toMatchObject({ source: "aprs", fade: 1 });
  });

  it("says how a report came, and how far from home", () => {
    expect(pathWords(station())).toBe("Heard through M0DIG-3");
    expect(pathWords(station({ direct: true, via: null }))).toBe("Heard directly");
    expect(pathWords(station({ via: "WIDE1" }))).toMatch(/did not give its callsign/);
    expect(fromHome(home, { lat: 51.6, lon: -0.1 })).toMatch(/^11\.\d km 0° N from home$/);
    expect(fromHome(null, { lat: 51.6, lon: -0.1 })).toBeNull();
  });
});

describe("the one card", () => {
  it("has the same parts, in the same order, for a station and for a mesh radio", () => {
    const tools = { measure: vi.fn(), sight: vi.fn(), range: vi.fn(), sun: vi.fn() };
    const { unmount } = wrap(
      <HeardCard item={stationItem(station(), receivers.receivers, [])} home={home} tools={tools} onClose={() => undefined} />,
    );
    expect(screen.getByText(/Heard by Radio at home/)).toBeInTheDocument();
    expect(screen.getByText("Last heard 2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText(/from home$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Measure from here/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pin as one of ours/ })).toBeInTheDocument();
    screen.getByRole("button", { name: /Sun times/ }).click();
    expect(tools.sun).toHaveBeenCalledWith({ lat: 51.6, lon: -0.1 }, "M0ABC-9");
    unmount();
    wrap(
      <HeardCard
        item={meshItem(
          {
            id: "!a1",
            transport: "meshtastic",
            shortName: "SAM",
            longName: "Sam",
            onMap: true,
            at: now - 60_000,
            position: { lat: 51.55, lon: -0.1, altitude: null },
          },
          "Sam",
        )}
        home={home}
        tools={tools}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/Heard by the mesh radio link/)).toBeInTheDocument();
    expect(screen.getByText("Only its last position is kept.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pin as one of ours/ })).toBeNull();
  });
});

describe("the range view", () => {
  const report = (lat: number, lon: number, patch: Partial<RangeReport> = {}): RangeReport => ({
    at: now,
    lat,
    lon,
    altitude: null,
    receiverId: "r1",
    direct: true,
    via: null,
    snr: null,
    rssi: null,
    hops: null,
    stationId: "s1",
    name: "M0ABC-9",
    source: "aprs",
    ...patch,
  });

  it("joins the furthest direct report in each direction, and keeps digipeated ones apart", () => {
    const result = computeRange(
      [
        report(51.6, -0.1),
        report(51.55, -0.1),
        report(51.5, 0.05),
        report(51.4, -0.1),
        report(51.5, -0.3, { direct: false, via: "M0DIG-3" }),
      ],
      home,
    );
    expect(result.sectorsHeard).toBe(3);
    expect(result.outline).toHaveLength(4);
    expect(result.outline[0]).toEqual(result.outline.at(-1));
    expect(result.furthest?.lat).toBe(51.6);
    expect(result.via.get("M0DIG-3")).toHaveLength(1);
  });

  it("counts a mesh report through other radios apart, and one that does not say as unknown", () => {
    const result = computeRange(
      [report(51.6, -0.1, { source: "mesh", hops: 2 }), report(51.55, -0.1, { source: "mesh", hops: null })],
      home,
    );
    expect(result.direct).toHaveLength(1);
    expect(result.unknownHops).toBe(1);
    expect(result.outline).toEqual([]);
  });
});

describe("the screen", () => {
  it("lists the receivers, what was heard, and marks every command in the guides as tried or untried", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://outpost.test");
        const body =
          url.pathname === "/api/heard/receivers"
            ? receivers
            : url.pathname === "/api/heard/stations"
              ? { stations: url.searchParams.get("source") === "aprs" ? [station()] : [] }
              : url.pathname === "/api/maps/markers"
                ? { markers: [{ id: "h", name: "Home", icon: "home", lat: 51.5, lon: -0.1, createdAt: 1 }] }
                : url.pathname === "/api/heard/reports"
                  ? { reports: [], limited: false }
                  : url.pathname === "/api/heard/range-tests"
                    ? { tests: [] }
                    : url.pathname === "/api/settings"
                      ? { settings: { "heard.aircraftHours": 0 } }
                      : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    wrap(<HeardPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Heard on the radio" })).toBeInTheDocument();
    expect(await screen.findByText("Connected to 192.168.1.20:8001.")).toBeInTheDocument();
    expect(screen.getByText(/1 could not be read and were dropped/)).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "APRS heard" });
    expect(within(list).getByText("M0ABC-9")).toBeInTheDocument();
    expect(within(list).getByText(/from home/)).toBeInTheDocument();
    expect(within(list).getByText(/by Radio at home/)).toBeInTheDocument();
    for (const block of document.querySelectorAll("pre")) {
      const note = block.parentElement?.nextElementSibling?.textContent ?? "";
      expect(note).toMatch(/^(Tried|Untried)/);
    }
    expect(screen.getAllByText(/Listening only\./).length).toBeGreaterThan(0);
  });
});
