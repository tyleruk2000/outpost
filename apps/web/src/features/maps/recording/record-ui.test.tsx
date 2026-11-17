/**
 * What the Record button says where recording cannot work. jsdom is such a place: it
 * is not a secure origin unless told so, and it has no storage of the kind a recording
 * is kept in, which are exactly the two cases a person meets in a browser.
 */
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { beforeYouStart, RecordButton, TrackRecording, useNow } from "./record-ui";

beforeAll(() => {
  // A browser with geolocation, as every phone has. It is never asked for anything in these tests.
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition: vi.fn(), clearWatch: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

const ui = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <RecordButton />
        <TrackRecording engine={null} onShowTrack={() => {}} />
      </TooltipProvider>
    </MemoryRouter>,
  );

describe("the Record button", () => {
  it("over plain HTTP, says a browser shares no location there and points to the HTTPS setting", async () => {
    vi.stubGlobal("isSecureContext", false);
    ui();
    await userEvent.click(screen.getByRole("button", { name: "Record a track" }));
    const card = screen.getByRole("region", { name: "Record a track" });
    expect(card).toHaveTextContent(
      "Browsers share a device's location only with pages opened over HTTPS, or on the computer Outpost runs on.",
    );
    expect(card).toHaveTextContent("This page was opened over plain HTTP, so it cannot record.");
    expect(screen.getByRole("link", { name: "Settings → HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    // There is nothing to press that would pretend to record.
    expect(screen.queryByRole("button", { name: "Start recording" })).not.toBeInTheDocument();
    // The button closes what it opened.
    await userEvent.click(screen.getByRole("button", { name: "Record a track: close" }));
    expect(screen.queryByRole("region", { name: "Record a track" })).not.toBeInTheDocument();
  });

  it("where the browser keeps nothing for the page, says a recording could not survive a reload and does not offer one", async () => {
    vi.stubGlobal("isSecureContext", true);
    ui();
    await userEvent.click(screen.getByRole("button", { name: "Record a track" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Record a track" })).toHaveTextContent(
        "This browser keeps nothing on the device for this page (a private window does this), so a recording could not survive a reload.",
      ),
    );
    expect(screen.queryByRole("button", { name: "Start recording" })).not.toBeInTheDocument();
  });
});

describe("what is said before a recording is relied on", () => {
  it("always says that nothing is recorded with the screen locked or another app in front", () => {
    for (const lines of [beforeYouStart(true, false), beforeYouStart(false, false), beforeYouStart(true, true)]) {
      expect(lines[0]).toBe(
        "A recording runs only while this screen is on and Outpost is in front. No browser gives a web page positions with the screen locked, or with another app or tab in front.",
      );
      expect(lines.at(-1)).toMatch(/If Outpost is out of reach then, the track waits here until it is back\.$/);
    }
  });

  it("says what this browser can do about the screen, and no more", () => {
    expect(beforeYouStart(true, false)[1]).toBe(
      "Outpost asks the browser to keep the screen on. It can refuse (battery saver does this), and the lock button still locks the phone.",
    );
    expect(beforeYouStart(false, false)[1]).toBe(
      "This browser cannot keep the screen on. Set the screen not to lock for the length of the walk, or recording stops when it does.",
    );
    expect(beforeYouStart(true, true)[1]).toMatch(
      /Opened from a Home Screen icon on an iPhone or iPad older than iOS 18\.4, the screen is not kept on at all/,
    );
  });
});

describe("the recording card's clock", () => {
  afterEach(() => vi.useRealTimers());

  it("ticks once a second while the page is in sight, not at all while it is hidden, and catches up when shown", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z"));
    const { result } = renderHook(() => useNow(true));
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(Date.parse("2026-06-21T12:00:03Z"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date("2026-06-21T12:10:00Z"));
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe(Date.parse("2026-06-21T12:10:00Z"));
    expect(vi.getTimerCount()).toBe(1);
    visibility.mockRestore();
  });
});
