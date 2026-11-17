/**
 * River and sea levels on the Weather and hazards screen, in each state: never fetched,
 * fetching, held and fresh, held and old, failed, none near; and a station's own view
 * with its last days, fetched on a press. The server is a stub; nothing is fetched from
 * the Agency.
 */
import type { KeptCopy, RiverLevelStation, StationReadings, WeatherPlace, WeatherResponse, WeatherSourceInfo } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trendText } from "./rivers-view";
import WeatherPage from "./weather-page";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = Date.now();

const home: WeatherPlace = { id: "p1", name: "Home", lat: 52.75, lon: 0.4, markerId: "m1", isHome: true, region: "ee", createdAt: 1 };
const levels: WeatherSourceInfo = {
  id: "ea-levels",
  kind: "rivers",
  publisher: "Environment Agency",
  name: "River and sea levels",
  covers: "England only.",
  host: "environment.data.gov.uk",
  sends: "",
  licence: "Open Government Licence v3.0",
  licenceUrl: "https://example.org",
  attribution: "This uses Environment Agency flood and river level data from the real-time data API (Beta)",
  liveUrl: "https://check-for-flooding.service.gov.uk/river-and-sea-levels",
  termsUrl: "https://example.org/terms",
  termsRead: "2026-11-17",
};

/** Readings every 15 minutes for three hours, ending `measuredAgo` before NOW, rising by `rise` metres. */
const readings = (measuredAgo: number, from: number, rise: number) =>
  Array.from({ length: 13 }, (_, i) => ({
    t: NOW - measuredAgo - (12 - i) * 15 * MIN,
    v: Math.round((from + (rise * i) / 12) * 1000) / 1000,
  }));

const kilhams = (measuredAgo: number): RiverLevelStation => ({
  id: "E21183",
  rloiId: "6269",
  label: "Kilham's Bridge",
  river: "River Wallington",
  town: "North Wootton",
  lat: 52.79,
  lon: 0.4,
  distanceKm: 5.3,
  qualifier: "Stage",
  tidal: false,
  measureId: "E21183-level-stage-i-15_min-mAOD",
  unit: "mAOD",
  periodS: 900,
  status: "active",
  statusReason: null,
  typicalLow: 0.028,
  typicalHigh: 3.448,
  highestRecent: { value: 2.172, at: Date.UTC(2012, 3, 23, 7, 15) },
  maxOnRecord: { value: 2.172, at: Date.UTC(2012, 3, 23, 7, 15) },
  recent: readings(measuredAgo, 1.0, 0.05),
  readingsNote: null,
});
const lynn = (measuredAgo: number): RiverLevelStation => ({
  ...kilhams(measuredAgo),
  id: "E47901",
  rloiId: "7065",
  label: "King's Lynn",
  river: "River Great Ouse",
  distanceKm: 0.5,
  qualifier: "Tidal Level",
  tidal: true,
  measureId: "E47901-level-tidal_level-i-15_min-mAOD",
  typicalLow: null,
  typicalHigh: null,
  recent: readings(measuredAgo, 3.0, -0.4),
});
const stopped: RiverLevelStation = {
  ...kilhams(0),
  id: "E21050",
  rloiId: null,
  label: "Castle Rising",
  river: "Babingley River",
  unit: "m",
  distanceKm: 8.1,
  recent: readings(10 * 24 * HOUR, 0.2, 0),
};

function rivers(fetchedAt: number, stations: RiverLevelStation[], withinKm = 8): KeptCopy {
  return {
    id: "r1",
    kind: "rivers",
    source: "ea-levels",
    placeId: "p1",
    fetchedAt,
    validFrom: null,
    validUntil: null,
    bytes: 20_000,
    sent: "environment.data.gov.uk: latitude 52.75, longitude 0.40, within 8 km",
    data: { withinKm, listed: stations.length, stations },
  };
}
function history(entry: StationReadings): KeptCopy {
  return {
    id: "h1",
    kind: "river-readings",
    source: "ea-levels",
    placeId: "p1",
    fetchedAt: entry.fetchedAt,
    validFrom: null,
    validUntil: null,
    bytes: entry.bytes,
    sent: "environment.data.gov.uk: the level measure of station E21183; no position",
    data: { stations: [entry] },
  };
}

type Answer = { status: number; body: unknown } | "never";
function show(response: Partial<WeatherResponse>, view: string, answers: { update?: Answer; readings?: Answer } = {}) {
  const posted: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const answer = (given: Answer | undefined, fallback: unknown) => {
        if (given === "never") return new Promise<Response>(() => {});
        return given ? json(given.body, given.status) : json(fallback);
      };
      if (init?.method && init.method !== "GET") {
        posted.push({ path: `${init.method} ${pathname}`, body: init.body ? JSON.parse(String(init.body)) : null });
        if (pathname === "/api/weather/update") return answer(answers.update, { outcomes: [] });
        if (pathname === "/api/weather/river-readings") return answer(answers.readings, {});
        return json({ ok: true });
      }
      if (pathname === "/api/weather")
        return json({ places: [home], kept: [], sources: [levels], updateOnOpen: false, riversKm: 8, now: NOW, ...response });
      return json({});
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/prepare/weather${view}`]}>
        <WeatherPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return posted;
}

describe("River and sea levels", () => {
  it("says they have never been fetched, fetches nothing on opening, and fetches for this place on a press", async () => {
    const posted = show({}, "?view=rivers");
    expect(await screen.findByText(/River and sea levels have not been fetched for Home yet/)).toBeInTheDocument();
    expect(screen.getByText(/England only/)).toBeInTheDocument();
    expect(screen.getByText(/not a forecast/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Flood" })).toHaveAttribute("href", "/prepare/weather?view=flood");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(posted).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Fetch river and sea levels" }));
    await waitFor(() => expect(posted).toEqual([{ path: "POST /api/weather/update", body: { kinds: ["rivers"], placeIds: ["p1"] } }]));
  });

  it("says it is fetching while the Agency is asked", async () => {
    show({}, "?view=rivers", { update: "never" });
    await userEvent.click(await screen.findByRole("button", { name: "Fetch river and sea levels" }));
    expect(await screen.findByText(/Asking the Environment Agency for the stations near Home/)).toBeInTheDocument();
  });

  it("shows fresh levels nearest first, each with its datum, when it was measured, its range and its trend", async () => {
    show({ kept: [rivers(NOW - 5 * MIN, [lynn(20 * MIN), kilhams(20 * MIN)])] }, "?view=rivers");
    expect(await screen.findByText("Fetched 5 minutes ago.")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").filter((item) => item.hasAttribute("data-station"));
    expect(rows.map((row) => row.getAttribute("data-station"))).toEqual(["E47901", "E21183"]);
    const tidal = within(rows[0]!);
    expect(tidal.getByText("Tidal")).toBeInTheDocument();
    expect(tidal.getByText(/A tidal level: it rises and falls with the tide/)).toBeInTheDocument();
    expect(tidal.getByText(/Falling 0\.40 m over the 3 hours/)).toBeInTheDocument();
    const river = within(rows[1]!);
    expect(river.getByText(/^1\.05 m above Ordnance Datum, measured .* \(20 minutes ago\)\.$/)).toBeInTheDocument();
    expect(river.getByText("Within the typical range the Agency gives for this station (0.03 to 3.45 m).")).toBeInTheDocument();
    expect(river.getByText(/Rising 0\.05 m over the 3 hours/)).toBeInTheDocument();
    expect(screen.getByText(/This uses Environment Agency flood and river level data/)).toBeInTheDocument();
  });

  it("marks a copy fetched long ago as old, says how long ago each was measured, and marks a station that stopped", async () => {
    show({ kept: [rivers(NOW - 14 * HOUR, [kilhams(14 * HOUR + 30 * MIN), stopped])] }, "?view=rivers");
    const age = await screen.findByText(
      /Fetched 14 hours ago: this set of river and sea levels is old, and levels may have changed since\./,
    );
    expect(age.closest("[data-freshness]")).toHaveAttribute("data-freshness", "old");
    expect(screen.getByText(/measured .* \(14 hours ago\)\./)).toBeInTheDocument();
    expect(screen.getByText("Not reporting")).toBeInTheDocument();
    expect(screen.getByText(/Its latest reading is \d+ days older than the moment this was fetched/)).toBeInTheDocument();
    // A station that names no datum says so.
    expect(screen.getByText(/^0\.20 m, measured/)).toBeInTheDocument();
  });

  it("keeps what was held, and says what failed, when the Agency cannot be reached", async () => {
    show({ kept: [rivers(NOW - 2 * HOUR, [kilhams(2 * HOUR)])] }, "?view=rivers", {
      update: {
        status: 200,
        body: {
          outcomes: [
            {
              kind: "rivers",
              placeId: "p1",
              placeName: "Home",
              source: "ea-levels",
              ok: false,
              message: "Environment Agency answered 503.",
              bytes: 0,
            },
          ],
        },
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Fetch again" }));
    expect(await screen.findByText("River and sea levels for Home: Environment Agency answered 503.")).toBeInTheDocument();
    expect(screen.getByText(/Kilham's Bridge/)).toBeInTheDocument();
  });

  it("says there is none near, and offers a wider distance without fetching", async () => {
    const posted = show({ kept: [rivers(NOW - 5 * MIN, [], 3)], riversKm: 3 }, "?view=rivers");
    expect(await screen.findByText(/listed no level station within 3 km of Home/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "Stations within" }));
    await userEvent.click(await screen.findByRole("option", { name: "15 km (9 miles)" }));
    await waitFor(() => expect(posted).toEqual([{ path: "PUT /api/weather/options", body: { riversKm: 15 } }]));
  });
});

describe("a station's own view", () => {
  it("offers its last days on a press, saying how much that is, and keeps the press from the list", async () => {
    const entry: StationReadings = {
      stationId: "E21183",
      measureId: "E21183-level-stage-i-15_min-mAOD",
      unit: "mAOD",
      fetchedAt: NOW,
      since: NOW - 3 * 24 * HOUR,
      bytes: 70_000,
      readings: readings(0, 1, 0.05),
    };
    const posted = show({ kept: [rivers(NOW - 5 * MIN, [kilhams(20 * MIN)])] }, "?view=rivers&station=E21183", {
      readings: { status: 200, body: { readings: entry } },
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Kilham's Bridge" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All river and sea levels" })).toHaveAttribute("href", "/prepare/weather?view=rivers");
    expect(
      screen.getByText(/metres above Ordnance Datum, the level heights on Ordnance Survey maps are measured from \(mAOD\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Highest on record: 2\.17 m/)).toBeInTheDocument();
    expect(screen.getByText(/About 288 readings, about 69 kB/)).toBeInTheDocument();
    expect(screen.getByText("The last 3 days have not been fetched for this station.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "check-for-flooding.service.gov.uk/station/6269" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fetch the last 3 days" }));
    await waitFor(() =>
      expect(posted).toEqual([{ path: "POST /api/weather/river-readings", body: { placeId: "p1", stationId: "E21183" } }]),
    );
  });

  it("draws held readings with the typical range and highest on record, as a table too, and marks them old", async () => {
    const entry: StationReadings = {
      stationId: "E21183",
      measureId: "E21183-level-stage-i-15_min-mAOD",
      unit: "mAOD",
      fetchedAt: NOW - 30 * HOUR,
      since: NOW - 4 * 24 * HOUR,
      bytes: 70_000,
      readings: readings(30 * HOUR, 1, 0.05),
    };
    show({ kept: [rivers(NOW - 30 * HOUR, [kilhams(30 * HOUR)]), history(entry)] }, "?view=rivers&station=E21183");
    expect(await screen.findByText(/Fetched 30 hours ago: these readings are old/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Level at Kilham's Bridge, m above Ordnance Datum/ })).toBeInTheDocument();
    expect(document.querySelector("[data-band]")).not.toBeNull();
    expect(document.querySelector("[data-rule]")).toHaveTextContent("Highest on record 2.17 m");
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("Typical range, the Agency's");
    await userEvent.click(screen.getByText("The readings as a table"));
    expect(screen.getByRole("columnheader", { name: "Level, mAOD" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "1.05" }).length).toBeGreaterThan(0);
  });

  it("says a press failed and keeps nothing new", async () => {
    show({ kept: [rivers(NOW - 5 * MIN, [kilhams(20 * MIN)])] }, "?view=rivers&station=E21183", {
      readings: { status: 502, body: { error: { code: "upstream", message: "Environment Agency answered 503." } } },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Fetch the last 3 days" }));
    expect(await screen.findByText("The readings could not be fetched")).toBeInTheDocument();
    expect(screen.getByText(/Environment Agency answered 503\./)).toBeInTheDocument();
  });

  it("says when the station is not among those kept", async () => {
    show({ kept: [rivers(NOW - 5 * MIN, [kilhams(20 * MIN)])] }, "?view=rivers&station=GONE");
    expect(await screen.findByText(/That station is not among the river and sea levels kept for Home/)).toBeInTheDocument();
  });
});

describe("the trend in words", () => {
  it("says it is Outpost's reading of the readings held, or why there is none", () => {
    expect(trendText({ ok: false, reason: "Too few readings." })).toBe("Too few readings.");
    expect(trendText({ ok: true, direction: "steady", change: 0.004, from: { t: 0, v: 1 }, to: { t: 3 * HOUR, v: 1.004 } })).toBe(
      "Steady, less than 2 cm of change, over the 3 hours to the latest reading held.",
    );
  });
});
