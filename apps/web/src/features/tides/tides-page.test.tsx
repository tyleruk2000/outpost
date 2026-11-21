/** Tide times against a stand-in server: its states, and what it says. The places and tides are made up. */
import type { TidePredictionResponse, TideStationsResponse } from "@outpost/shared";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { toolScreens } from "../tools/screens";
import TidesPage from "./tides-page";
import { formatHeight, formatKm, midnightOn } from "./words";

const home = {
  id: "m1",
  name: "Harbour cottage",
  note: "",
  lat: 40.7,
  lon: -74.02,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
};

const source = {
  name: "NOAA CO-OPS",
  url: "https://example.test/noaa",
  licence: "Public domain (US Government work); please credit",
  read: "2026-11-21",
  count: 1370,
};
const station = (over: Partial<TideStationsResponse["stations"][number]> = {}) => ({
  id: "8518750",
  name: "The Battery",
  state: "NY",
  lat: 40.7,
  lon: -74.01,
  distanceKm: 1.2,
  datum: "MLLW" as const,
  ...over,
});

function prediction(over: Partial<TidePredictionResponse> = {}): TidePredictionResponse {
  const from = Date.UTC(2027, 0, 15);
  const curve = Array.from({ length: 145 }, (_, i) => ({ t: from + i * 600_000, h: 0.75 + 0.6 * Math.cos((i / 74.5) * 2 * Math.PI) }));
  return {
    station: station(),
    from,
    to: from + 86_400_000,
    turns: [
      { kind: "high", t: from + 5 * 3_600_000 + 34 * 60_000, h: 1.263 },
      { kind: "low", t: from + 12 * 3_600_000 + 4 * 60_000, h: 0.217 },
    ],
    curve,
    constituents: 37,
    source,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("outpost.tools.solar-clock.zone", "fixed:0");
});

describe("the Tools registry", () => {
  it("lists tide times", () => {
    expect(toolScreens.find((each) => each.to === "/tools/tides")?.label).toBe("Tide times");
  });
});

describe("tide times", () => {
  it("says it is not for navigation, and asks for a place when none is saved", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [] } });
    renderScreen(<TidesPage />, "/tools/tides");
    expect(screen.getByRole("heading", { level: 1, name: "Tide times" })).toBeInTheDocument();
    expect(screen.getByText("Not for navigation")).toBeInTheDocument();
    expect(screen.getByText(/storm surge/)).toBeInTheDocument();
    expect(await screen.findByText(/Choose a place above, or type its coordinates/)).toBeInTheDocument();
  });

  it("shows the nearest station, the highs and lows, the chart and the source", async () => {
    fakeApi({
      "GET /api/maps/markers": { markers: [home] },
      "GET /api/tides/stations": { stations: [station(), station({ id: "8519483", name: "Bergen Point", distanceKm: 9 })], source },
      "GET /api/tides/stations/8518750/predictions": prediction(),
    });
    renderScreen(<TidesPage />, "/tools/tides");
    expect(await screen.findByText("05:34")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tide station" })).toHaveTextContent("The Battery, NY, 1.2 km away");
    expect(screen.getAllByText("High water").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.26 m").length).toBeGreaterThan(0);
    expect(screen.getByText("12:04")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Height of the tide at The Battery/ })).toBeInTheDocument();
    expect(screen.getByText(/above mean lower low water/)).toBeInTheDocument();
    expect(screen.getByText(/1,370 stations/)).toBeInTheDocument();
    expect(screen.queryByText(/The tide where you are may come earlier/)).not.toBeInTheDocument();
  });

  it("warns when the nearest station is far away", async () => {
    fakeApi({
      "GET /api/maps/markers": { markers: [{ ...home, lat: 51.5, lon: -0.1 }] },
      "GET /api/tides/stations": { stations: [station({ name: "Bermuda", state: "", distanceKm: 5600 })], source },
      "GET /api/tides/stations/8518750/predictions": prediction(),
    });
    renderScreen(<TidesPage />, "/tools/tides");
    expect(await screen.findByText(/The station is 5,600 km from Harbour cottage/)).toBeInTheDocument();
    expect(screen.getByText(/Outpost holds NOAA's stations/)).toBeInTheDocument();
  });

  it("says when the stations cannot be read, and offers to try again", async () => {
    fakeApi({
      "GET /api/maps/markers": { markers: [home] },
      "GET /api/tides/stations": { status: 503, error: { code: "unavailable", message: "The server is busy." } },
    });
    renderScreen(<TidesPage />, "/tools/tides");
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows skeletons while the stations are found", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        String(input).includes("/api/maps/markers")
          ? new Response(JSON.stringify({ markers: [home] }), { headers: { "content-type": "application/json" } })
          : new Promise(() => undefined),
      ),
    );
    renderScreen(<TidesPage />, "/tools/tides");
    expect(await screen.findByLabelText("Finding the nearest tide stations")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe("the words", () => {
  it("writes heights to the centimetre with a true minus, and distances", () => {
    expect(formatHeight(1.263)).toBe("1.26 m");
    expect(formatHeight(-0.432)).toBe("−0.43 m");
    expect(formatHeight(-0.001)).toBe("0.00 m");
    expect(formatKm(0.42)).toBe("0.4 km");
    expect(formatKm(5600)).toBe("5,600 km");
  });

  it("finds midnight on a fixed clock", () => {
    expect(midnightOn("2027-01-15", { kind: "fixed", minutes: 60 })).toBe(Date.UTC(2027, 0, 14, 23));
    expect(midnightOn("2027-01-15", { kind: "fixed", minutes: -300 })).toBe(Date.UTC(2027, 0, 15, 5));
  });
});
