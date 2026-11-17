import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => ({
  ensure: vi.fn(() => Promise.resolve()),
  setFrequency: vi.fn(),
  setVolume: vi.fn(),
  keyDown: vi.fn(),
  keyUp: vi.fn(),
  keyAt: vi.fn(),
  clearSchedule: vi.fn(),
}));
vi.mock("../audio/sidetone", () => ({ getSidetone: () => tone }));

import { applyMorsePrefs } from "../prefs";
import { useKeyer } from "./use-keyer";

const key = (type: "keydown" | "keyup", code: string, target: EventTarget = document.body) => {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
};

describe("useKeyer keyboard path", () => {
  beforeEach(() => {
    applyMorsePrefs({ keyType: "straight", keyStraight: "Space" });
  });
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("a release while locked leaves the playing target untouched", () => {
    const { result, rerender } = renderHook(({ on }) => useKeyer(on), {
      initialProps: { on: true },
    });
    key("keydown", "Space");
    rerender({ on: false });
    vi.clearAllMocks();
    act(() => result.current.release("straight"));
    expect(tone.keyUp).not.toHaveBeenCalled();
    expect(tone.keyAt).not.toHaveBeenCalled();
    expect(tone.clearSchedule).not.toHaveBeenCalled();
  });

  it("stops Space scrolling the page while locked", () => {
    renderHook(() => useKeyer(false));
    const event = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("refuses on-screen presses while disabled, so echo playback is never keyed", () => {
    const { result } = renderHook(() => useKeyer(false));
    act(() => result.current.press("straight"));
    expect(tone.keyDown).not.toHaveBeenCalled();
    expect(result.current.keyDown).toBe(false);
    expect(result.current.decoder.marks).toHaveLength(0);
  });

  it("releases a held straight key when the window loses focus (Alt-Tab)", () => {
    const { result } = renderHook(() => useKeyer(true));
    key("keydown", "Space");
    expect(tone.keyDown).toHaveBeenCalledTimes(1);
    expect(result.current.keyDown).toBe(true);
    // The keyup goes to another app; only blur arrives.
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(tone.keyUp).toHaveBeenCalledTimes(1);
    expect(result.current.keyDown).toBe(false);
  });

  it("accepts the release of a held key even if focus moved into an input", () => {
    const { result } = renderHook(() => useKeyer(true));
    key("keydown", "Space");
    const input = document.createElement("input");
    document.body.appendChild(input);
    key("keyup", "Space", input);
    expect(tone.keyUp).toHaveBeenCalledTimes(1);
    expect(result.current.keyDown).toBe(false);
  });

  it("silences the tone when unmounted mid-press", () => {
    const { unmount } = renderHook(() => useKeyer(true));
    key("keydown", "Space");
    unmount();
    expect(tone.keyUp).toHaveBeenCalled();
  });

  it("does not wipe a scheduled playback when disabled with the key up", () => {
    // QSO trainer: key a reply, release, press Send → the station's reply is
    // scheduled on the shared envelope and the keyer is disabled in one tick.
    const { rerender } = renderHook(({ on }) => useKeyer(on), { initialProps: { on: true } });
    key("keydown", "Space");
    key("keyup", "Space");
    tone.clearSchedule.mockClear();
    rerender({ on: false });
    expect(tone.clearSchedule).not.toHaveBeenCalled();
  });
});

describe("useKeyer's frame pump for the automatic keyers", () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    applyMorsePrefs({ keyType: "paddle", keyerWpm: 20 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  /** Runs the frames asked for, at a given time, and says how many there were. */
  const runFrames = (at: number) => {
    const due = frames;
    frames = [];
    vi.spyOn(performance, "now").mockReturnValue(at);
    act(() => {
      for (const callback of due) callback(at);
    });
    return due.length;
  };

  it("asks for no frames while nobody is keying", () => {
    renderHook(() => useKeyer(true));
    expect(runFrames(0)).toBe(0);
  });

  it("runs while an element is under way and stops once the keyer is idle again", () => {
    const { result } = renderHook(() => useKeyer(true));
    act(() => result.current.press("dit", 1000));
    act(() => result.current.release("dit", 1010));
    expect(runFrames(1030)).toBe(1);
    // A dit at 20 wpm is 60 ms, then a 60 ms space: done by 1120.
    expect(runFrames(1200)).toBe(1);
    expect(frames).toHaveLength(0);
    expect(tone.keyAt).toHaveBeenCalledWith(false, 1060);
  });
});
