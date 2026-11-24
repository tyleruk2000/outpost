import { analyseSight, sightSamples, type TerrainProfile } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_SIGHT_SETTINGS, readSight, type SightSettings } from "./sight";
import { SightCard } from "./sight-card";
import { SightPanel } from "./sight-panel";
import type { Sight } from "./use-sight";

beforeAll(() => {
  // jsdom has no ResizeObserver; the chart only uses it to learn its width.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

const A = { position: { lat: 57.02, lon: -3.6 } };
const B = { position: { lat: 57.02, lon: -3.4 }, name: "Repeater site" };

/** 12 km sampled every 10 m: level ground at 100 m with a 400 m ridge midway, or with part of it unknown. */
function profile(shape: "ridge" | "level" | "holed" | "none"): TerrainProfile {
  const heights: Array<number | null> =
    shape === "none"
      ? [null, null]
      : Array.from({ length: 1201 }, (_, index) => {
          if (shape === "holed" && index > 500 && index < 700) return null;
          return 100 + (shape === "ridge" ? 400 * Math.exp(-(((index - 600) / 100) ** 2)) : 0);
        });
  const known = heights.filter((height) => height !== null).length;
  return {
    from: A.position,
    to: B.position,
    distanceMeters: 12_000,
    stepMeters: 10,
    heights,
    coverage: known === 0 ? "none" : known === heights.length ? "terrain" : "partial",
    gaps: shape === "holed" ? [{ startMeters: 5010, endMeters: 6990 }] : shape === "none" ? [{ startMeters: 0, endMeters: 12_000 }] : [],
    terrain: known === 0 ? null : { finestCellMeters: 10.4, coarsestCellMeters: 10.4, installedMaxZoom: 12 },
  };
}

type Query = Sight["profile"];

function sight(overrides: Partial<Sight> & { data?: TerrainProfile; settings?: SightSettings } = {}): Sight {
  const settings = overrides.settings ?? DEFAULT_SIGHT_SETTINGS;
  const data = overrides.data;
  const input = data
    ? {
        distanceMeters: data.distanceMeters,
        heights: data.heights,
        antennaFromMeters: settings.antennaFrom,
        antennaToMeters: settings.antennaTo,
        frequencyMHz: 145,
      }
    : null;
  const result = input ? analyseSight(input) : null;
  return {
    from: A,
    to: B,
    picking: null,
    pick: vi.fn(),
    place: vi.fn(),
    swap: vi.fn(),
    restart: vi.fn(),
    settings,
    setSettings: vi.fn(),
    frequencyMHz: 145,
    profile: { data, isPending: !data, isError: false, error: null, refetch: vi.fn() } as unknown as Query,
    result,
    samples: input ? sightSamples(input) : null,
    reading: data && result ? readSight(data, result) : null,
    setScrub: vi.fn(),
    ...overrides,
  };
}

const show = (value: Sight, props: Partial<Parameters<typeof SightPanel>[0]> = {}) => {
  const onDone = vi.fn();
  const onOpenOffline = vi.fn();
  render(<SightPanel sight={value} format="decimal" mapReady onDone={onDone} onOpenOffline={onOpenOffline} {...props} />);
  return { onDone, onOpenOffline };
};

describe("the line-of-sight panel", () => {
  it("says what to press while an end is being chosen, and has nothing to work out yet", () => {
    show(sight({ from: null, to: null, picking: "from" }));
    expect(screen.getByText(/Click or tap the map where the first antenna is: point A\./)).toBeInTheDocument();
    expect(screen.getByText("Being chosen on the map")).toBeInTheDocument();
    expect(screen.getByText("Not chosen yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swap A and B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start again" })).toBeDisabled();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("gives each end with its locator and position, the distance and the bearing each way", () => {
    show(sight({ data: profile("ridge") }));
    const ends = screen.getAllByRole("term").map((term) => term.textContent);
    expect(ends.slice(0, 2)).toEqual(["Point A", "Point B"]);
    expect(screen.getByText("IO87EA")).toBeInTheDocument();
    expect(screen.getByText("57.02000, -3.60000")).toBeInTheDocument();
    expect(screen.getByText("Repeater site")).toBeInTheDocument();
    expect(screen.getByText("IO87HA")).toBeInTheDocument();
    expect(screen.getByText(/^12\.1 km \(7\.5\d mi\)$/)).toBeInTheDocument();
    expect(screen.getByText("A to B 90° E")).toBeInTheDocument();
    expect(screen.getByText("B to A 270° W")).toBeInTheDocument();
  });

  it("gives the answer in words, the path from the side, and what the answer rests on", () => {
    show(sight({ data: profile("ridge") }));
    const answer = screen.getByRole("alert");
    expect(within(answer).getByText("Blocked")).toBeInTheDocument();
    expect(within(answer).getByText(/At its worst, 6\.00 km from A, it is 392 m above the straight line/)).toBeInTheDocument();
    // The chart: a title, a line that says how it is drawn, a legend, and the same numbers as a table.
    expect(screen.getByText("The path from A to B, seen from the side")).toBeInTheDocument();
    expect(screen.getByText(/The Earth's curve is drawn into the ground \(2\.1 m at the middle\).*4\/3 radius/)).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "What is drawn" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Ray", "First Fresnel zone", "Ground, with the curve"]);
    expect(screen.getByRole("slider", { name: /Position along the path from A to B/ })).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(12);
    expect(rows[6]).toHaveTextContent("6.00 km500 m2.1 m110 mGround 392 m above the ray");
    // What it is, and is not.
    expect(screen.getByText(/A check of geometry against terrain alone, at 145 MHz\./)).toBeInTheDocument();
    expect(screen.getByText(/The terrain knows nothing of buildings, trees or masts\./)).toBeInTheDocument();
    expect(screen.getByText("Ground read every 10 m from installed terrain whose cells are about 10 m wide here.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing here predicts signal strength or coverage\./)).toBeInTheDocument();
  });

  it("reads one place on the path out when the chart is moved along from the keyboard, and tells the map", async () => {
    const value = sight({ data: profile("ridge") });
    show(value);
    const chart = screen.getByRole("slider", { name: /Position along the path from A to B/ });
    chart.focus();
    await userEvent.keyboard("{End}");
    expect(chart).toHaveAttribute("aria-valuetext", "12.0 km from A: ground 100 m, ray 10 m above it");
    expect(value.setScrub).toHaveBeenLastCalledWith(1);
    await userEvent.keyboard("{Home}");
    expect(value.setScrub).toHaveBeenLastCalledWith(0);
  });

  it("names the stretch with no terrain, calls the path not known, and offers where terrain is downloaded", async () => {
    const { onOpenOffline } = show(sight({ data: profile("holed") }));
    const answer = screen.getByRole("status");
    expect(within(answer).getByText("Not known")).toBeInTheDocument();
    expect(within(answer).getByText(/No terrain is installed from 5\.01 km to 6\.99 km from A\./)).toBeInTheDocument();
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "What is drawn" })).getByText("No terrain")).toBeInTheDocument();
    await userEvent.click(within(answer).getByRole("button", { name: "Offline maps" }));
    expect(onOpenOffline).toHaveBeenCalledTimes(1);
  });

  it("says so when no terrain is installed, and draws nothing", () => {
    show(sight({ data: profile("none") }));
    expect(screen.getByText("No terrain here")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    // Distance and bearings need no terrain.
    expect(screen.getByText("A to B 90° E")).toBeInTheDocument();
  });

  it("shows that the ground is being read, and says when it could not be", async () => {
    const { unmount } = render(<SightPanel sight={sight()} format="decimal" mapReady onDone={() => {}} onOpenOffline={() => {}} />);
    expect(screen.getByText("Reading the ground between the two points")).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    const failed = sight({
      profile: {
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("The server is not responding."),
        refetch,
      } as unknown as Query,
    });
    show(failed);
    expect(screen.getByText("The ground between these points could not be read")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("takes heights and a band, refuses a height that cannot be, and lets either end be chosen again", async () => {
    const value = sight({ data: profile("level") });
    show(value);
    const height = screen.getByRole("textbox", { name: "Antenna at A" });
    await userEvent.clear(height);
    expect(screen.getByText("From 0 to 1,000 m.")).toBeInTheDocument();
    await userEvent.type(height, "2.5");
    expect(screen.queryByText("From 0 to 1,000 m.")).not.toBeInTheDocument();
    const setSettings = vi.mocked(value.setSettings);
    expect(setSettings.mock.calls.at(-1)![0](DEFAULT_SIGHT_SETTINGS)).toMatchObject({ antennaFrom: 2.5 });
    expect(screen.getByRole("combobox", { name: "Band" })).toHaveTextContent("2 m (145 MHz)");
    await userEvent.click(screen.getByRole("button", { name: "Move point B" }));
    expect(value.pick).toHaveBeenCalledWith("to");
    await userEvent.click(screen.getByRole("button", { name: "Swap A and B" }));
    expect(value.swap).toHaveBeenCalledTimes(1);
  });

  it("asks for a frequency when the band is another one", () => {
    show(sight({ data: profile("level"), settings: { ...DEFAULT_SIGHT_SETTINGS, band: "other", otherMHz: 222.1 } }));
    expect(screen.getByRole("textbox", { name: "Frequency" })).toHaveValue("222.1");
  });
});

describe("the line-of-sight card over the map", () => {
  it("says which end a press sets, and can set it at the middle of the map", async () => {
    const onUseCentre = vi.fn();
    render(<SightCard sight={sight({ to: null, picking: "to" })} onUseCentre={onUseCentre} onShowDetails={() => {}} onDone={() => {}} />);
    expect(screen.getByText(/Now click or tap where the other antenna is: point B\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use the centre of the map" }));
    expect(onUseCentre).toHaveBeenCalledTimes(1);
  });

  it("gives the answer in a line and leads to the rest", async () => {
    const onShowDetails = vi.fn();
    render(<SightCard sight={sight({ data: profile("ridge") })} onShowDetails={onShowDetails} onDone={() => {}} />);
    expect(screen.getByText("Blocked.")).toBeInTheDocument();
    expect(screen.getByText(/Ground stands in the way\. At its worst, 6\.00 km from A/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the path and the details" }));
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });
});

describe("both antennas at once", () => {
  it("sets both to a handheld held at head height in one press", async () => {
    const value = sight({ data: profile("level") });
    show(value);
    await userEvent.click(screen.getByRole("button", { name: "Handhelds, 1.5 m" }));
    const update = (value.setSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as (current: SightSettings) => SightSettings;
    expect(update(DEFAULT_SIGHT_SETTINGS)).toMatchObject({ antennaFrom: 1.5, antennaTo: 1.5 });
    expect(screen.getByRole("button", { name: "Masts, 10 m" })).toHaveAttribute("aria-pressed", "true");
  });
});
