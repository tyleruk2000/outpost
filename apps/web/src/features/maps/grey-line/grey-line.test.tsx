import { act, fireEvent, render as renderBare, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClockChoice } from "@/lib/clock";
import { ThemeProvider } from "@/lib/theme";
import type { MapEngine } from "../map/engine";
import { MapControls } from "../map-chrome";
import { SunTimes } from "../panels/sun";
import { graticule } from "../print/graticule";
import { pageGeometry } from "../print/paper";
import { boxAtScale } from "../print/scale";
import { layoutSheet, sheetBottom, sheetWords } from "../print/sheet";
import { CoverageGreyLine, coverageMoment } from "./coverage";
import { greyLineShown, momentText, useGreyLine } from "./grey-line";
import { fieldsOf, mapMoment, momentOf, setMapMoment } from "./time";

const render = (ui: ReactElement) =>
  renderBare(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </ThemeProvider>
    ),
  });

/** A map that only takes overlays, and keeps the last one given for each source. */
function fakeEngine() {
  const overlays = new Map<string, { features: Array<{ properties: Record<string, unknown> }> }>();
  const engine = { setOverlay: vi.fn((id: string, data) => overlays.set(id, data)) } as unknown as MapEngine;
  return { engine, overlays };
}

/** The Maps screen as far as the grey line goes: its button, its legend, and the Sun tab's times for Greenwich. */
function Screen({ engine, sun = false }: { engine: MapEngine; sun?: boolean }) {
  const greyLine = useGreyLine(engine);
  return (
    <Tooltip.Provider>
      <MapControls
        tool="browse"
        onToolChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        rotated={false}
        onResetNorth={() => {}}
        locate={undefined}
        onLocate={() => {}}
        hillshade={undefined}
        onHillshadeChange={() => {}}
        contours={false}
        contourReach="drawn"
        onContoursChange={() => {}}
        locatorGrid={false}
        onLocatorGridChange={() => {}}
        greyLine={greyLine.on}
        onGreyLineChange={greyLine.setOn}
        disabled={false}
      />
      {greyLine.legend}
      {sun ? <SunTimes position={{ lat: 51.48, lon: 0 }} zone="UTC" shared /> : null}
    </Tooltip.Provider>
  );
}

const toggle = () => screen.getByRole("button", { name: "Grey line (day and night)" });
const stated = () => document.querySelector("[data-grey-line-time]")?.textContent;
const shadeCount = (overlays: ReturnType<typeof fakeEngine>["overlays"]) =>
  overlays.get("o-grey-line")?.features.filter((feature) => feature.properties.kind === "shade").length ?? 0;

describe("the grey line on the Maps screen", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("outpost.maps.sun.clock", JSON.stringify("utc"));
    setMapMoment(null);
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-06-21T12:00:20Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    setClockChoice("device");
  });

  it("is off to begin with, and a pressed button draws it and says so", () => {
    const { engine, overlays } = fakeEngine();
    render(<Screen engine={engine} />);
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(shadeCount(overlays)).toBe(0);
    expect(screen.queryByRole("region", { name: "Grey line" })).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(shadeCount(overlays)).toBe(4);
    expect(screen.getByRole("region", { name: "Grey line" })).toBeInTheDocument();
    expect(stated()).toBe("Now, 12:00 UTC on Sunday 21 June 2026");
    // What the shading means, in words beside each sample.
    for (const words of ["Day", "Twilight, deepening", "Night", "Sunrise or sunset"]) expect(screen.getByText(words)).toBeInTheDocument();

    fireEvent.click(toggle());
    expect(shadeCount(overlays)).toBe(0);
    expect(screen.queryByRole("region", { name: "Grey line" })).not.toBeInTheDocument();
  });

  it("is reached from the keyboard", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { engine } = fakeEngine();
    render(<Screen engine={engine} />);
    toggle().focus();
    await user.keyboard("{Enter}");
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("is remembered on this device", () => {
    const first = fakeEngine();
    const { unmount } = render(<Screen engine={first.engine} />);
    fireEvent.click(toggle());
    unmount();
    expect(greyLineShown()).toBe(true);
    const second = fakeEngine();
    render(<Screen engine={second.engine} />);
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(shadeCount(second.overlays)).toBe(4);
  });

  it("keeps itself to the minute while it shows now", () => {
    localStorage.setItem("outpost.maps.greyLine", "true");
    const { engine } = fakeEngine();
    render(<Screen engine={engine} />);
    expect(stated()).toBe("Now, 12:00 UTC on Sunday 21 June 2026");
    const calls = vi.mocked(engine.setOverlay).mock.calls.length;
    act(() => vi.advanceTimersByTime(60_000));
    expect(stated()).toBe("Now, 12:01 UTC on Sunday 21 June 2026");
    expect(vi.mocked(engine.setOverlay).mock.calls.length).toBe(calls + 1);
  });

  it("is drawn for another time when one is chosen, says so, and goes back to now in one press", async () => {
    localStorage.setItem("outpost.maps.greyLine", "true");
    const { engine } = fakeEngine();
    render(<Screen engine={engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose the time it is drawn for" }));
    expect(screen.getByLabelText("Date of the grey line")).toHaveValue("2026-06-21");
    expect(screen.getByLabelText("Time (UTC) of the grey line")).toHaveValue("12:00");

    fireEvent.change(screen.getByLabelText("Time (UTC) of the grey line"), { target: { value: "03:30" } });
    expect(mapMoment()).toBe(Date.UTC(2026, 5, 21, 3, 30));
    expect(stated()).toBe("Not now: drawn for 03:30 UTC on Sunday 21 June 2026");
    fireEvent.change(screen.getByLabelText("Date of the grey line"), { target: { value: "2026-12-21" } });
    expect(stated()).toBe("Not now: drawn for 03:30 UTC on Monday 21 December 2026");
    // A chosen time does not follow the clock.
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(stated()).toBe("Not now: drawn for 03:30 UTC on Monday 21 December 2026");

    fireEvent.click(screen.getByRole("button", { name: "Back to now" }));
    expect(mapMoment()).toBeNull();
    expect(stated()).toBe("Now, 12:05 UTC on Sunday 21 June 2026");
    expect(screen.queryByRole("button", { name: "Back to now" })).not.toBeInTheDocument();
  });

  it("takes the time on this device's clock when that is the clock chosen, and can be switched to UTC", () => {
    localStorage.setItem("outpost.maps.greyLine", "true");
    localStorage.setItem("outpost.maps.sun.clock", JSON.stringify("device"));
    setClockChoice("12");
    const { engine } = fakeEngine();
    render(<Screen engine={engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose the time it is drawn for" }));
    expect(screen.getByLabelText("Time of the grey line")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use UTC" }));
    expect(screen.getByLabelText("Time (UTC) of the grey line")).toHaveValue("12:00");
    // UTC is on the 24-hour clock whatever the app's clock is.
    expect(stated()).toBe("Now, 12:00 UTC on Sunday 21 June 2026");
  });

  it("shares its day with the Sun tab, both ways", () => {
    localStorage.setItem("outpost.maps.greyLine", "true");
    const { engine } = fakeEngine();
    render(<Screen engine={engine} sun />);
    const sunDate = () => screen.getByLabelText("Date");
    expect(sunDate()).toHaveValue("2026-06-21");

    // A day later in the Sun tab: the line moves a day, at the same time of day.
    fireEvent.click(screen.getByRole("button", { name: "The day after" }));
    expect(mapMoment()).toBe(Date.UTC(2026, 5, 22, 12, 0, 20));
    expect(stated()).toBe("Not now: drawn for 12:00 UTC on Monday 22 June 2026");

    // A time chosen on the line past midnight: the Sun tab follows to that day.
    fireEvent.click(screen.getByRole("button", { name: "Choose the time it is drawn for" }));
    fireEvent.change(screen.getByLabelText("Date of the grey line"), { target: { value: "2026-12-21" } });
    expect(sunDate()).toHaveValue("2026-12-21");

    // "Today" in the Sun tab is now, for both.
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(mapMoment()).toBeNull();
    expect(stated()).toMatch(/^Now, /);
  });

  it("goes back to now when the screen is left", () => {
    localStorage.setItem("outpost.maps.greyLine", "true");
    const { engine } = fakeEngine();
    const { unmount } = render(<Screen engine={engine} />);
    act(() => setMapMoment(Date.UTC(2026, 0, 1)));
    unmount();
    expect(mapMoment()).toBeNull();
  });
});

describe("a moment on a clock and back", () => {
  it("reads and writes UTC and a zone with summer time", () => {
    const june = Date.UTC(2026, 5, 21, 3, 30);
    expect(fieldsOf(june, "UTC")).toEqual({ date: "2026-06-21", time: "03:30" });
    expect(fieldsOf(june, "Europe/London")).toEqual({ date: "2026-06-21", time: "04:30" });
    expect(momentOf("2026-06-21", "04:30", "Europe/London")).toBe(june);
    expect(momentOf("2026-12-21", "04:30", "Europe/London")).toBe(Date.UTC(2026, 11, 21, 4, 30));
    // Across the date line: Fiji is twelve hours ahead.
    expect(fieldsOf(Date.UTC(2026, 2, 19, 18, 10), "Pacific/Fiji")).toEqual({ date: "2026-03-20", time: "06:10" });
    expect(momentOf("2026-03-20", "06:10", "Pacific/Fiji")).toBe(Date.UTC(2026, 2, 19, 18, 10));
    expect(momentOf("2026-03-20", "25:10", "UTC")).toBeNaN();
    expect(momentOf("not a date", "06:10", "UTC")).toBeNaN();
  });

  it("is written for a person to read", () => {
    expect(momentText(Date.UTC(2026, 5, 21, 3, 30), "utc", "Europe/London", "12")).toBe("03:30 UTC on Sunday 21 June 2026");
    expect(momentText(Date.UTC(2026, 5, 21, 3, 30), "device", "Europe/London", "12")).toBe("4:30 am on Sunday 21 June 2026");
    expect(momentText(Date.UTC(2026, 5, 21, 23, 30), "device", "Europe/London", "24")).toBe("00:30 on Monday 22 June 2026");
  });
});

describe("the grey line on a printed page", () => {
  it("adds a sentence saying when it is drawn for, which fits on every paper", () => {
    const note =
      "Day and night are drawn for 03:30 UTC on Sunday 21 June 2026. The line is where the Sun rises or sets; the shading deepens at 6°, 12° and 18° below the horizon.";
    for (const paper of ["a4", "a3", "letter"] as const) {
      for (const orientation of ["portrait", "landscape"] as const) {
        const geometry = pageGeometry(paper, orientation);
        const bbox = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, geometry.mapPixels);
        const page = layoutSheet({
          geometry,
          bbox,
          scale: 25_000,
          title: "A title long enough that it has to be cut short before it reaches the scale",
          date: "16 November 2026",
          credits:
            "Protomaps © OpenStreetMap, openstreetmap.org/copyright · © Mapterhorn, mapterhorn.com/attribution · Outlines: Natural Earth, naturalearthdata.com",
          notes: [note],
          graticule: graticule(bbox, geometry.map, "dms"),
          pictures: [{ id: "map", x: 0, y: 0, ...geometry.mapPixels }],
        });
        expect(sheetWords(page).join(" ")).toContain("03:30 UTC on Sunday 21 June 2026");
        expect(sheetBottom(page), `${paper} ${orientation}`).toBeLessThanOrEqual(geometry.height - 12);
      }
    }
  });
});

describe("the grey line on a coverage map", () => {
  it("is drawn for the hour shown on the 15th of the month, and says it is about that day", () => {
    expect(coverageMoment("2026-06-03", 14)).toBe(Date.UTC(2026, 5, 15, 14));
    // Hour 24 is midnight at the end of the 15th.
    expect(coverageMoment("2026-06-30", 24)).toBe(Date.UTC(2026, 5, 16, 0));
    expect(coverageMoment("", 14)).toBeNull();

    const onChange = vi.fn();
    const { rerender } = render(<CoverageGreyLine on={false} onChange={onChange} date="2026-06-03" utcHour={14} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Grey line (day and night)" }));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<CoverageGreyLine on onChange={onChange} date="2026-06-03" utcHour={14} />);
    expect(screen.getByText(/^Drawn for 14:00 UTC on about the 15th of June 2026\./)).toBeInTheDocument();
  });
});
