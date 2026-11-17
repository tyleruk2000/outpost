/** The solar clock against a stand-in server: each tab's states. The places are made up. */
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { toolScreens } from "../tools/screens";
import SolarClockPage from "./solar-clock-page";

const marker = (over: Record<string, unknown>) => ({
  id: "m1",
  name: "Cottage",
  note: "",
  lat: 51.4779,
  lon: -0.0015,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  // Clocks on UTC+0 set by hand, so that nothing depends on the zone the tests run in.
  localStorage.setItem("outpost.tools.solar-clock.zone", "fixed:0");
  URL.createObjectURL = vi.fn(() => "blob:solar");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const region = (name: string) => screen.getByRole("region", { name });

describe("the Tools registry", () => {
  it("lists the solar clock", () => {
    expect(toolScreens.find((screen) => screen.to === "/tools/solar-clock")?.label).toBe("Solar clock");
  });
});

describe("the solar clock", () => {
  it("says never to look at the sun, and asks for a place when none is saved", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [] } });
    renderScreen(<SolarClockPage />, "/tools/solar-clock");
    expect(screen.getByRole("heading", { level: 1, name: "Solar clock" })).toBeInTheDocument();
    expect(screen.getByText("Never look at the sun directly")).toBeInTheDocument();
    expect(await screen.findByText(/No saved place has the home icon/)).toBeInTheDocument();
    expect(screen.getByText(/Choose a place above, or type its coordinates/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Coordinates"), { target: { value: "nowhere" } });
    expect(screen.getByText(/Not a position Outpost reads/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Coordinates"), { target: { value: "60.155, -1.145" } });
    expect(await screen.findByText("Solar noon today")).toBeInTheDocument();
  });

  it("shows a skeleton while saved places load", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    renderScreen(<SolarClockPage />, "/tools/solar-clock");
    expect(screen.getByLabelText("Loading saved places")).toBeInTheDocument();
  });

  it("still works from typed coordinates when saved places cannot be read", async () => {
    fakeApi({ "GET /api/maps/markers": { status: 503, error: { code: "unavailable", message: "The server is busy." } } });
    renderScreen(<SolarClockPage />, "/tools/solar-clock");
    expect(await screen.findByText("Saved places could not be read")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Coordinates"), { target: { value: "51.4779, -0.0015" } });
    expect(await screen.findByText("Equation of time today")).toBeInTheDocument();
  });

  it("uses the home place, and says that Now trusts this device's clock", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [marker({}), marker({ id: "m2", name: "Bothy", icon: "pin", createdAt: 2 })] } });
    renderScreen(<SolarClockPage />, "/tools/solar-clock");
    expect(await screen.findByText("Solar noon today")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Place" })).toHaveTextContent("Home: Cottage");
    expect(screen.getByText(/Everything on this tab trusts this device's clock/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /The sun's height above the horizon through today/ })).toBeInTheDocument();
  });

  it("recovers the time from a noon shadow and from a shadow's length, with a range, without the device's clock", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [marker({})] } });
    const user = userEvent.setup();
    renderScreen(<SolarClockPage />, "/tools/solar-clock?tab=recover");
    await screen.findByRole("region", { name: "Noon from a shadow" });
    fireEvent.change(screen.getByLabelText("The date of the measurement"), { target: { value: "2026-11-17" } });

    // Two equal shadows: halfway, 11:45 UTC (USNO's transit), to the minute.
    const noon = region("Noon from a shadow");
    expect(
      await within(noon).findByText(/Halfway between your two marks, the clock should have read 11:45, give or take/),
    ).toBeInTheDocument();
    fireEvent.change(within(noon).getByLabelText("At the morning mark"), { target: { value: "09:30" } });
    fireEvent.change(within(noon).getByLabelText("At the afternoon mark"), { target: { value: "14:30" } });
    expect(within(noon).getByText(/That clock is 15 minutes fast: put it back by that much/)).toBeInTheDocument();

    // The shortest shadow, picked from the list: a wider range.
    await user.click(within(noon).getByRole("combobox", { name: "How" }));
    await user.click(await screen.findByRole("option", { name: /The shortest shadow/ }));
    expect(within(noon).getByText(/At the moment the shadow is shortest, set your clock to 11:4\d|11:50/)).toBeInTheDocument();

    // The shadow's length: refused when it is shorter than the sun can cast, answered otherwise.
    const length = region("The time from a shadow's length");
    fireEvent.change(within(length).getByRole("textbox", { name: "Length of the shadow" }), { target: { value: "150" } });
    expect(within(length).getByText(/That shadow is shorter than any the sun casts here/)).toBeInTheDocument();
    fireEvent.change(within(length).getByRole("textbox", { name: "Length of the shadow" }), { target: { value: "400" } });
    expect(within(length).getByText(/When you measured it, the time was \d\d:\d\d, give or take/)).toBeInTheDocument();

    // The bearing, with no declination: off by an unknown amount.
    expect(within(region("The time from a shadow's bearing")).getByText(/off by an unknown amount/)).toBeInTheDocument();
    // The date's effect.
    expect(within(region("If the date is not certain")).getByRole("table")).toBeInTheDocument();
    expect(within(region("Better sources")).getByRole("link", { name: "Radio frequencies" })).toHaveAttribute("href", "/radio/frequencies");
  });

  it("works out the sundial for the place and offers its template as a PDF", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [marker({})] } });
    renderScreen(<SolarClockPage />, "/tools/solar-clock?tab=sundial");
    const lines = await screen.findByRole("region", { name: "A horizontal sundial for 51.5° N" });
    expect(within(lines).getByRole("row", { name: /3 pm 38\.0° east/ })).toBeInTheDocument();
    expect(within(region("A template to print")).getByRole("link", { name: /Save as PDF/ })).toBeInTheDocument();
    expect(within(region("Reading clock time from it")).getByRole("row", { name: /1 November/ })).toHaveTextContent("−16 min");
  });

  it("refuses a horizontal dial on the equator, and offers the card dial", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [marker({ lat: 0.2, lon: 32.6 })] } });
    renderScreen(<SolarClockPage />, "/tools/solar-clock?tab=sundial");
    expect(await screen.findByText("A horizontal dial does not work on the equator")).toBeInTheDocument();
    expect(within(region("A template to print")).queryByRole("link", { name: /Save as PDF/ })).toBeNull();
    expect(region("The simplest dial: a card and a pencil")).toBeInTheDocument();
  });

  it("reads the star clock, and says the southern hemisphere is not covered", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [marker({})] } });
    const { unmount } = renderScreen(<SolarClockPage />, "/tools/solar-clock?tab=nocturnal");
    const read = await screen.findByRole("region", { name: "Read the star clock now" });
    fireEvent.change(within(read).getByLabelText("The date the night began"), { target: { value: "2026-11-17" } });
    expect(within(read).getByText(/With the hand there, the time is .*give or take 30 minutes/)).toBeInTheDocument();
    expect(within(region("A nocturnal to print")).getByRole("link", { name: /Save as PDF/ })).toBeInTheDocument();
    unmount();

    fakeApi({ "GET /api/maps/markers": { markers: [marker({ lat: -33.87, lon: 151.21 })] } });
    renderScreen(<SolarClockPage />, "/tools/solar-clock?tab=nocturnal");
    expect(await screen.findByText("Not for the southern hemisphere")).toBeInTheDocument();
    expect(screen.getByText("No nocturnal for a place south of the equator.")).toBeInTheDocument();
  });
});
