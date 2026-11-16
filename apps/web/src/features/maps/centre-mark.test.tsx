import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CentreMark } from "./centre-mark";
import type { LatLon } from "./lib/geo";
import type { MapEngine } from "./map/engine";

/** A map that says where its centre is on screen, and tells its listeners when it moves or a pointer comes over it. */
function fakeEngine(start: { x: number; y: number }) {
  let at = start;
  const listeners = { move: new Set<() => void>(), pointer: new Set<(position: LatLon | null) => void>() };
  return {
    engine: {
      centrePoint: () => at,
      on: (type: "move" | "pointer", listener: never) => {
        listeners[type].add(listener);
        return () => listeners[type].delete(listener);
      },
    } as unknown as MapEngine,
    moveCentreTo(next: { x: number; y: number }) {
      at = next;
      for (const listener of listeners.move) listener();
    },
    pointer(position: LatLon | null) {
      for (const listener of listeners.pointer) listener(position);
    },
    listeners,
  };
}

const mark = () => document.querySelector("[data-centre-mark]") as HTMLElement;

describe("the cross at the centre of the map", () => {
  it("is put where the map says its centre is, not at the middle of the map's rectangle", () => {
    // 28 px left of the middle and 8 px below it: what a wide screen's controls leave clear.
    const map = fakeEngine({ x: 472, y: 438 });
    render(<CentreMark engine={map.engine} always={false} />);
    expect([mark().style.left, mark().style.top]).toEqual(["472px", "438px"]);
    // Its own middle is on that point.
    expect(mark()).toHaveClass("-translate-x-1/2", "-translate-y-1/2");
    expect(mark()).toHaveAttribute("aria-hidden", "true");
    expect(mark()).toHaveClass("pointer-events-none");
  });

  it("follows the centre when the camera's clear space changes, as when the sheet on a phone is raised", () => {
    const map = fakeEngine({ x: 195, y: 256 });
    render(<CentreMark engine={map.engine} always={false} />);
    act(() => map.moveCentreTo({ x: 195, y: 179.4 }));
    expect([mark().style.left, mark().style.top]).toEqual(["195px", "179px"]);
  });

  it("stays where it is while a pointer is over the map: the readout says which point it gives, the cross is always the centre", () => {
    const map = fakeEngine({ x: 100, y: 100 });
    render(<CentreMark engine={map.engine} always={false} />);
    expect(mark()).not.toHaveClass("hidden");
    act(() => map.pointer({ lat: 51, lon: 0 }));
    expect(mark()).not.toHaveClass("hidden");
    act(() => map.pointer(null));
    expect(mark()).not.toHaveClass("hidden");
  });

  it("stays while something else is reading the centre, such as the Sun tab, whatever the pointer does", () => {
    const map = fakeEngine({ x: 100, y: 100 });
    render(<CentreMark engine={map.engine} always />);
    act(() => map.pointer({ lat: 51, lon: 0 }));
    expect(mark()).not.toHaveClass("hidden");
  });

  it("stops listening when it is taken away", () => {
    const map = fakeEngine({ x: 100, y: 100 });
    const { unmount } = render(<CentreMark engine={map.engine} always={false} />);
    unmount();
    expect(map.listeners.move.size + map.listeners.pointer.size).toBe(0);
  });
});
