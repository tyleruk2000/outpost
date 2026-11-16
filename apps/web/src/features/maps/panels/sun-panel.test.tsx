import { act, fireEvent, render as renderBare, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClockChoice } from "@/lib/clock";
import type { CameraView } from "../lib/view";
import type { MapEngine } from "../map/engine";
import { SunPanel } from "./sun-panel";

const render = (ui: ReactElement) => renderBare(ui, { wrapper: MemoryRouter });

// Greenwich, then Suva. The times are the US Naval Observatory's (see lib/sun.test.ts), on a clock in UTC.
const GREENWICH: CameraView = { lat: 51.48, lon: 0, zoom: 9 };
const SUVA: CameraView = { lat: -18.14, lon: 178.44, zoom: 9 };

/** A map that sits where it is told and says when it has come to rest. */
function fakeEngine(start: CameraView) {
  let view = start;
  const listeners = new Set<(view: CameraView) => void>();
  return {
    engine: {
      getView: () => view,
      on: (type: string, listener: (view: CameraView) => void) => {
        if (type !== "moveend") throw new Error(`the Sun tab should only wait for the map to rest, not listen for "${type}"`);
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as MapEngine,
    moveTo(next: CameraView) {
      view = next;
      for (const listener of listeners) listener(next);
    },
    listeners,
  };
}

const secure = (value: boolean) => Object.defineProperty(window, "isSecureContext", { configurable: true, value });

describe("the Sun tab of the map's panel", () => {
  const before = Object.getOwnPropertyDescriptor(window, "isSecureContext");
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-21T09:00:00Z"));
    secure(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    if (before) Object.defineProperty(window, "isSecureContext", before);
    else Reflect.deleteProperty(window, "isSecureContext");
  });

  it("gives the day's sunrise and sunset for the centre of the map, with nothing saved and nothing searched for", () => {
    const { engine } = fakeEngine(GREENWICH);
    render(<SunPanel engine={engine} format="decimal" locate="off" onLocate={() => {}} zone="UTC" />);
    expect(screen.getByRole("heading", { name: "Sun at the centre of the map" })).toBeInTheDocument();
    // The same words the readout at the bottom of the map uses for the same point.
    expect(screen.getByRole("button", { name: "Copy coordinates 51.4800, 0.0000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Maidenhead locator JO01AL" })).toBeInTheDocument();
    // The answer comes first, and the rest is open under it without anything to unfold.
    expect(screen.getByText("Sunrise 03:43, sunset 20:21")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-06-21");
    expect(screen.getByText("Solar noon", { selector: "dt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Sun/ })).not.toBeInTheDocument();
  });

  it("follows the map when it comes to rest somewhere else", () => {
    const map = fakeEngine(GREENWICH);
    const { unmount } = render(<SunPanel engine={map.engine} format="decimal" locate="off" onLocate={() => {}} zone="UTC" />);
    act(() => map.moveTo(SUVA));
    expect(screen.getByRole("button", { name: "Copy coordinates -18.1400, 178.4400" })).toBeInTheDocument();
    // Suva's 20 March, published as sunrise 06:10 and sunset 18:17 at UTC+12: the sunrise is the evening of the 19th in UTC.
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
    expect(screen.getByText("20 Mar: Sunrise 18:10 on 19 Mar, sunset 06:17")).toBeInTheDocument();
    unmount();
    expect(map.listeners.size).toBe(0);
  });

  it("writes the times on the 12-hour clock when that is the clock in use", () => {
    setClockChoice("12");
    const { engine } = fakeEngine(GREENWICH);
    render(<SunPanel engine={engine} format="decimal" locate="off" onLocate={() => {}} zone="Europe/London" />);
    expect(screen.getByText("Sunrise 4:43 am, sunset 9:21 pm")).toBeInTheDocument();
  });

  it("says why it cannot give the times where you are over plain HTTP, and where to put that right", () => {
    secure(false);
    const onLocate = vi.fn();
    const { engine } = fakeEngine(GREENWICH);
    render(<SunPanel engine={engine} format="decimal" locate="off" onLocate={onLocate} zone="UTC" />);
    expect(screen.getByRole("heading", { name: "Where you are" })).toBeInTheDocument();
    expect(screen.getByText(/This page was opened over plain HTTP, so Outpost cannot find where you are\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    expect(screen.getByText(/Until then, move the map until its centre is where you are\./)).toBeInTheDocument();
    // Nothing is offered that would only fail.
    expect(screen.queryByRole("button", { name: "Show where I am" })).not.toBeInTheDocument();
    // The times for the centre are there all the same.
    expect(screen.getByText("Sunrise 03:43, sunset 20:21")).toBeInTheDocument();
  });

  it("offers to move the map to where you are when the browser will share that", async () => {
    const onLocate = vi.fn();
    const { engine } = fakeEngine(GREENWICH);
    const { rerender } = render(<SunPanel engine={engine} format="decimal" locate="off" onLocate={onLocate} zone="UTC" />);
    expect(screen.queryByRole("link", { name: "Settings → HTTPS on your network" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show where I am" }));
    expect(onLocate).toHaveBeenCalledTimes(1);

    rerender(<SunPanel engine={engine} format="decimal" locate="following" onLocate={onLocate} zone="UTC" />);
    expect(screen.getByText(/The map has been moved to where this device is\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop showing where I am" })).toBeInTheDocument();
  });

  it("leaves out where you are in a browser that cannot find a position at all", () => {
    const { engine } = fakeEngine(GREENWICH);
    render(<SunPanel engine={engine} format="decimal" locate={undefined} onLocate={() => {}} zone="UTC" />);
    expect(screen.queryByRole("heading", { name: "Where you are" })).not.toBeInTheDocument();
  });

  it("gives the locator once when coordinates are shown as locators", () => {
    const { engine } = fakeEngine(GREENWICH);
    render(<SunPanel engine={engine} format="maidenhead" locate="off" onLocate={() => {}} zone="UTC" />);
    expect(screen.getByRole("button", { name: /^Copy coordinates JO01/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Copy Maidenhead locator/ })).not.toBeInTheDocument();
  });

  it("says so when there is no map to take a centre from", () => {
    render(<SunPanel engine={null} format="decimal" locate="off" onLocate={() => {}} zone="UTC" />);
    expect(screen.getByText(/the map is not drawn\. A saved place has a Sun line of its own/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
  });
});
