import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClockChoice } from "@/lib/clock";
import type { CameraView } from "../lib/view";
import type { MapEngine } from "../map/engine";
import { SunGlance } from "./sun-glance";

const GREENWICH: CameraView = { lat: 51.48, lon: 0, zoom: 9 };
const TROMSO: CameraView = { lat: 69.65, lon: 18.96, zoom: 9 };

function fakeEngine(start: CameraView) {
  let view = start;
  const listeners = new Set<(view: CameraView) => void>();
  return {
    engine: {
      getView: () => view,
      on: (type: string, listener: (view: CameraView) => void) => {
        if (type !== "moveend") throw new Error(`the line should only wait for the map to rest, not listen for "${type}"`);
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as MapEngine,
    moveTo(next: CameraView) {
      view = next;
      for (const listener of listeners) listener(next);
    },
  };
}

describe("today's sunrise and sunset under the centre readout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-21T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says both in words, for the centre of the map, and opens the Sun tab when pressed", async () => {
    const onOpen = vi.fn();
    const { engine } = fakeEngine(GREENWICH);
    render(<SunGlance engine={engine} onOpen={onOpen} zone="Europe/London" />);
    const line = screen.getByRole("button", {
      name: "Sun today at the centre of the map: Sunrise 04:43, Sunset 21:21. Show all of the day’s times",
    });
    expect(line).toHaveTextContent("Sunrise 04:43");
    expect(line).toHaveTextContent("Sunset 21:21");
    // Tall enough to touch.
    expect(line).toHaveClass("min-h-11");
    await userEvent.click(line);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps each piece whole, so a narrow phone or large text puts the sunset under the sunrise instead of cutting it", () => {
    const { engine } = fakeEngine(GREENWICH);
    render(<SunGlance engine={engine} onOpen={() => {}} zone="Europe/London" />);
    expect(screen.getByText("Sunrise 04:43")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("Sunset 21:21")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("Sunset 21:21").parentElement).toHaveClass("flex-wrap", "tabular");
  });

  it("follows the map when it comes to rest, and the clock that is chosen", () => {
    const map = fakeEngine(GREENWICH);
    render(<SunGlance engine={map.engine} onOpen={() => {}} zone="Europe/London" />);
    act(() => setClockChoice("12"));
    expect(screen.getByRole("button")).toHaveTextContent("Sunrise 4:43 am");
    act(() => map.moveTo(TROMSO));
    expect(screen.getByRole("button")).toHaveTextContent("The sun does not set");
    expect(screen.getByRole("button")).not.toHaveTextContent(/NaN|Invalid/);
  });
});
