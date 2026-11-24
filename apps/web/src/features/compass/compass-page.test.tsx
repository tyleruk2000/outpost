/** The Compass screen against a stand-in server: the place, the three norths, the live compass's states and the converter. */
import { compassRule, northsAt } from "@outpost/shared";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findPlaces, placeName } from "@/components/find-places";
import { fakeApi, renderScreen } from "../manage/test-support";
import type { MapEngine } from "../maps/map/engine";
import { toolScreens } from "../tools/screens";
import CompassPage from "./compass-page";
import { FIRST_HEADING_MS, headingFrom } from "./live-heading";
import { CentreLines, magneticShort } from "./magnetic-glance";
import { declinationSentence, lengthOfTime, outOfDateSentence, ruleLines } from "./words";

const NOW = Date.UTC(2026, 10, 17, 12);
const home = {
  id: "m1",
  name: "Cottage",
  note: "",
  lat: 54.4542,
  lon: -3.2116,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
};

function setSecure(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  setSecure(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const region = (name: string) => screen.getByRole("region", { name });

describe("the Tools registry", () => {
  it("lists the compass with the words a person would look for it by", () => {
    const entry = toolScreens.find((each) => each.to === "/tools/compass");
    expect(entry?.label).toBe("Compass");
    // Found first by its own name, and by the everyday words; its keywords need not repeat the name.
    expect(placeName(findPlaces("compass")[0]!)).toBe("Tools: Compass");
    for (const word of ["bearing", "north", "declination", "magnetic"]) {
      expect(entry?.keywords).toContain(word);
      expect(findPlaces(word).map(placeName)).toContain("Tools: Compass");
    }
  });
});

describe("north here", () => {
  it("starts from the home place and gives the rule for an Ordnance Survey map there, both ways", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    expect(screen.getByRole("heading", { level: 1, name: "Compass" })).toBeInTheDocument();
    const norths = northsAt(home.lat, home.lon, NOW);
    const rule = compassRule(norths.gridMagneticAngle!);
    const section = region("North here");
    expect(await within(section).findByText("With an Ordnance Survey map here")).toBeInTheDocument();
    for (const line of ruleLines(rule)) expect(within(section).getByText(line)).toBeInTheDocument();
    expect(within(section).getByText(declinationSentence(norths.declination, norths.field.declinationPerYear, NOW))).toBeInTheDocument();
    expect(within(section).getByText(/^Grid north is [\d.]+° west of true north here\.$/)).toBeInTheDocument();
    expect(within(section).getByText(/in November 2026/)).toBeInTheDocument();
    expect(within(section).getByText(/good to about ±0\.4° here/)).toBeInTheDocument();
    expect(screen.queryByText(/out of date/)).toBeNull();
  });

  it("asks for a place when there is no home place", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [] } });
    renderScreen(<CompassPage />, "/tools/compass");
    expect(
      await screen.findByText(/Choose a place above: where you are, a saved place, or a town, grid reference or locator/),
    ).toBeInTheDocument();
    expect(within(region("Convert a bearing")).getByText(/Choose a place above: the norths are different/)).toBeInTheDocument();
  });

  it("takes the place the map hands it, and outside Great Britain works to the UTM grid of its zone", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass?lat=48.8566&lon=2.3522");
    const section = region("North here");
    expect(await within(section).findByText("With a UTM map here, zone 31U")).toBeInTheDocument();
    const norths = northsAt(48.8566, 2.3522, NOW, 0, "utm");
    // Paris is 0.65° west of zone 31's central meridian, 3° E: grid north is a little west of true north.
    expect(norths.convergence!).toBeCloseTo(-0.65 * Math.sin((48.8566 * Math.PI) / 180), 2);
    expect(within(section).getByText(/Grid north is 0\.5° west of true north here/)).toBeInTheDocument();
    expect(screen.getByText(/A point on the map · 48\.8566, 2\.3522 · MGRS 31U DQ \d{5} \d{5}/)).toBeInTheDocument();
  });

  it("gives true and magnetic only when the National Grid is asked for outside Great Britain, or no grid", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    localStorage.setItem("outpost.tools.choice.compass.grid", "osgb");
    const first = renderScreen(<CompassPage />, "/tools/compass?lat=48.8566&lon=2.3522");
    expect(await within(region("North here")).findByText("With a map drawn to true north here")).toBeInTheDocument();
    expect(within(region("North here")).getByText(/There is no Ordnance Survey grid here/)).toBeInTheDocument();
    expect(within(region("North here")).queryByText(/Grid north is/)).toBeNull();
    first.unmount();
    localStorage.setItem("outpost.tools.choice.compass.grid", "none");
    renderScreen(<CompassPage />, "/tools/compass?lat=48.8566&lon=2.3522");
    expect(await within(region("North here")).findByText("With a map drawn to true north here")).toBeInTheDocument();
    expect(within(region("North here")).queryByText(/There is no Ordnance Survey grid here/)).toBeNull();
  });

  it("finds a place from a typed grid reference", async () => {
    fakeApi({
      "GET /api/maps/markers": { markers: [] },
      "GET /api/maps/places": {
        query: "NY 21548 07214",
        coordinate: { lat: 54.4508, lon: -3.2195, format: "osgb", precisionMeters: 1 },
        places: [],
      },
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderScreen(<CompassPage />, "/tools/compass");
    await user.click(await screen.findByRole("combobox", { name: "Place" }));
    await user.click(await screen.findByRole("option", { name: "Search for a place…" }));
    await user.type(screen.getByLabelText("Place to measure from"), "NY 21548 07214");
    await user.click(await screen.findByRole("button", { name: /NY 21548 07214/ }));
    expect(await within(region("North here")).findByText("With an Ordnance Survey map here")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Place" })).toHaveTextContent("NY 21548 07214");
  });

  it("still answers after the model's years, and says it is out of date and by how long", async () => {
    vi.setSystemTime(Date.UTC(2031, 2, 1));
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    expect(await screen.findByText("The magnetic model is out of date for this date")).toBeInTheDocument();
    expect(screen.getByText(/WMM2025 is for 2025 to 2029, and today is 1 year and 2 months past its end/)).toBeInTheDocument();
    expect(within(region("North here")).getByText(/^Map to compass: /)).toBeInTheDocument();
  });
});

describe("the live compass", () => {
  it("on a page that is not secure, says it needs HTTPS and a phone and where to set that up, and asks nothing of the device", async () => {
    setSecure(false);
    const listen = vi.spyOn(window, "addEventListener");
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    const card = region("Live compass");
    expect(within(card).getByText("A live compass needs HTTPS and a phone")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Settings, “HTTPS on your network”" })).toHaveAttribute("href", "/settings#https");
    expect(within(card).queryByRole("button", { name: "Start the compass" })).toBeNull();
    expect(listen.mock.calls.some(([type]) => String(type).startsWith("deviceorientation"))).toBe(false);
    // Everything else still works.
    expect(await within(region("North here")).findByText("With an Ordnance Survey map here")).toBeInTheDocument();
  });

  it("says plainly when the device gives no heading, as a computer does", async () => {
    vi.stubGlobal("DeviceOrientationEvent", class {});
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    const card = region("Live compass");
    fireEvent.click(within(card).getByRole("button", { name: "Start the compass" }));
    expect(await within(card).findByText("Waiting for the phone's compass.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(FIRST_HEADING_MS + 100);
    });
    expect(within(card).getByText("This device gives no compass heading")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Settings, “HTTPS on your network”" })).toBeInTheDocument();
  });

  it("asks for the sensor only on a press, shows the heading from each north, and lets go when stopped or hidden", async () => {
    const ask = vi.fn(async () => "granted");
    vi.stubGlobal("DeviceOrientationEvent", Object.assign(class {}, { requestPermission: ask }));
    const listen = vi.spyOn(window, "addEventListener");
    const release = vi.spyOn(window, "removeEventListener");
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    await within(region("North here")).findByText("With an Ordnance Survey map here");
    expect(ask).not.toHaveBeenCalled();
    expect(listen.mock.calls.some(([type]) => String(type).startsWith("deviceorientation"))).toBe(false);

    const card = region("Live compass");
    fireEvent.click(within(card).getByRole("button", { name: "Start the compass" }));
    expect(ask).toHaveBeenCalledTimes(1);
    await within(card).findByText("Waiting for the phone's compass.");
    // An iPhone's event: 90° from magnetic north.
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("deviceorientation"), {
          alpha: 10,
          beta: 0,
          gamma: 0,
          webkitCompassHeading: 90,
          webkitCompassAccuracy: 10,
        }),
      );
    });
    expect(within(card).getByText("Magnetic bearing of the top of the phone")).toBeInTheDocument();
    expect(within(card).getByText("090°")).toBeInTheDocument();
    expect(within(card).getByText("E")).toBeInTheDocument();
    const norths = northsAt(home.lat, home.lon, NOW);
    const asTrue = Math.round(90 + norths.declination);
    expect(within(card).getByText(`True ${String(asTrue).padStart(3, "0")}°`)).toBeInTheDocument();
    expect(within(card).getByText(/^Grid \d{3}°$/)).toBeInTheDocument();
    expect(within(card).getByText("The phone says it is good to ±10°.")).toBeInTheDocument();
    // Shown from grid north instead.
    fireEvent.click(within(card).getByRole("radio", { name: "Grid" }));
    expect(within(card).getByText("Grid bearing of the top of the phone")).toBeInTheDocument();

    // Hidden: every listener goes. Shown again: back.
    release.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(release.mock.calls.filter(([type]) => String(type).startsWith("deviceorientation")).map(([type]) => type)).toEqual([
      "deviceorientationabsolute",
      "deviceorientation",
    ]);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    release.mockClear();
    fireEvent.click(within(card).getByRole("button", { name: "Stop the compass" }));
    expect(release.mock.calls.some(([type]) => type === "deviceorientation")).toBe(true);
    expect(within(card).getByRole("button", { name: "Start the compass" })).toBeInTheDocument();
  });

  it("says so when the compass is refused", async () => {
    vi.stubGlobal("DeviceOrientationEvent", Object.assign(class {}, { requestPermission: async () => "denied" }));
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    fireEvent.click(within(region("Live compass")).getByRole("button", { name: "Start the compass" }));
    expect(await screen.findByText("The compass was not allowed")).toBeInTheDocument();
  });
});

describe("converting a bearing", () => {
  it("gives a grid bearing from magnetic and true north", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [home] } });
    renderScreen(<CompassPage />, "/tools/compass");
    const section = region("Convert a bearing");
    fireEvent.change(within(section).getByLabelText("Bearing"), { target: { value: "45" } });
    const norths = northsAt(home.lat, home.lon, NOW);
    const magnetic = Math.round(45 - norths.gridMagneticAngle!);
    const asTrue = Math.round(45 + norths.convergence!);
    expect(
      await within(section).findByText(`True ${String(asTrue).padStart(3, "0")}° · Magnetic ${String(magnetic).padStart(3, "0")}°`),
    ).toBeInTheDocument();
    fireEvent.change(within(section).getByLabelText("Bearing"), { target: { value: "400" } });
    expect(within(section).getByText(/a bearing is from 0° to 360°/)).toBeInTheDocument();
  });
});

describe("the words", () => {
  it("say which way magnetic north lies and how it is moving", () => {
    expect(declinationSentence(-0.62, 0.18, NOW)).toBe(
      "Magnetic north is 0.6° west of true north here, in November 2026, moving about 0.2° east a year.",
    );
    expect(declinationSentence(0.02, -0.01, NOW)).toBe(
      "Magnetic north is in line with true north here, to a tenth of a degree, in November 2026, and hardly moving from year to year.",
    );
  });

  it("say how long out of date the model is", () => {
    expect(lengthOfTime(0.04)).toBe("less than a month");
    expect(lengthOfTime(1)).toBe("1 year");
    expect(lengthOfTime(2.5)).toBe("2 years and 6 months");
    expect(outOfDateSentence(null)).toBeNull();
    expect(outOfDateSentence(-0.5)).toMatch(/^This device's date is 6 months before 2025/);
  });
});

describe("a heading from the device", () => {
  it("takes an iPhone's compass heading as it is", () => {
    expect(headingFrom({ alpha: 0, beta: 0, gamma: 0, webkitCompassHeading: 271.4, webkitCompassAccuracy: -1 })).toEqual({
      magnetic: 271.4,
      accuracy: null,
    });
  });

  it("works a heading from Android's absolute angles, flat and held up", () => {
    // Flat, top to the east: alpha counts anticlockwise, so 270.
    expect(headingFrom({ alpha: 270, beta: 0, gamma: 0, absolute: true })!.magnetic).toBeCloseTo(90, 6);
    expect(headingFrom({ alpha: 0, beta: 0, gamma: 0, absolute: true })!.magnetic).toBeCloseTo(0, 6);
    // Held upright facing north, the back of the phone looks north.
    expect(headingFrom({ alpha: 0, beta: 90, gamma: 0, absolute: true })!.magnetic).toBeCloseTo(0, 6);
    expect(headingFrom({ alpha: 90, beta: 90, gamma: 0, absolute: true })!.magnetic).toBeCloseTo(270, 6);
    // A screen turned a quarter in landscape.
    expect(headingFrom({ alpha: 0, beta: 0, gamma: 0, absolute: true }, 90)!.magnetic).toBeCloseTo(90, 6);
  });

  it("ignores readings that are not against the Earth", () => {
    expect(headingFrom({ alpha: 120, beta: 0, gamma: 0, absolute: false })).toBeNull();
    expect(headingFrom({ alpha: null, beta: null, gamma: null, absolute: true })).toBeNull();
  });
});

describe("the line on the map's centre card", () => {
  it("gives magnetic north at the centre of the map and opens the compass for that point", () => {
    expect(magneticShort(-0.62)).toBe("Magnetic 0.6° W");
    expect(magneticShort(1.25)).toBe("Magnetic 1.3° E");
    expect(magneticShort(0.04)).toBe("Magnetic 0.0°");
    const engine = { getView: () => ({ lat: 54.4542, lon: -3.2116, zoom: 12, bearing: 0, pitch: 0 }), on: () => () => undefined };
    renderScreen(<CentreLines engine={engine as unknown as MapEngine} sun={null} />, "/maps");
    const declination = northsAt(54.4542, -3.2116, NOW).declination;
    const link = screen.getByRole("link", { name: /of true north at the centre of the map\. Open the compass for this point/ });
    expect(link).toHaveTextContent(magneticShort(declination));
    expect(link).toHaveAttribute("href", "/tools/compass?lat=54.45420&lon=-3.21160");
  });
});
