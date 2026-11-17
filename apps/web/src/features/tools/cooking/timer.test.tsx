/**
 * The kitchen timer wakes the page only while it runs and can be seen: nothing at all
 * while it is stopped, one redraw a second while it counts, and only its alarm while the
 * page is hidden. Shown again, it reads the time from the clock.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerPanel, TimerProvider } from "./timer";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

const shown = () => screen.getByRole("timer").textContent;

describe("the kitchen timer", () => {
  it("sets no timer at all while it is stopped", () => {
    render(
      <TimerProvider>
        <TimerPanel />
      </TimerProvider>,
    );
    expect(shown()).toBe("0:00");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("redraws once a second while it runs, never on a faster tick", () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const setTimeout = vi.spyOn(window, "setTimeout");
    render(
      <TimerProvider>
        <TimerPanel />
      </TimerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(shown()).toBe("10:00");
    setTimeout.mockClear();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(shown()).toBe("9:50");
    expect(setInterval).not.toHaveBeenCalled();
    // Ten redraws in ten seconds, each setting the next.
    expect(setTimeout.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("stops counting while the page is hidden, keeps only its alarm, and reads the clock again when shown", () => {
    render(
      <TimerProvider>
        <TimerPanel />
      </TimerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    setVisibility("hidden");
    // The alarm, and nothing else.
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    setVisibility("visible");
    expect(shown()).toBe("8:59");
  });

  it("ends while hidden, and is found ended when shown", () => {
    render(
      <TimerProvider>
        <TimerPanel />
      </TimerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(11 * 60_000);
    });
    setVisibility("visible");
    expect(shown()).toBe("0:00");
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
