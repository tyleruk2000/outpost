/**
 * The live camera is let go as soon as it is not wanted: when the scan is ended (the
 * dialog closed, "Stop the camera"), when the page is hidden (another tab, a locked
 * phone), and when it was ended while the browser was still asking for the camera. The
 * reading of frames stops with it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanCamera } from "./camera";

function camera() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  let give: (stream: MediaStream) => void = () => {};
  const asked = new Promise<MediaStream>((resolve) => {
    give = resolve;
  });
  const getUserMedia = vi.fn(() => asked);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  const video = document.createElement("video");
  const play = vi.fn(async () => {});
  video.play = play;
  return { tracks, stream, give: () => give(stream), video, play };
}

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("the live camera", () => {
  it("stops every track, and the reading, when the scan is ended", async () => {
    const { tracks, give, video } = camera();
    const stop = new AbortController();
    const scan = scanCamera(video, stop.signal);
    give();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tracks.every((track) => track.stop.mock.calls.length === 0)).toBe(true);
    stop.abort();
    await vi.advanceTimersByTimeAsync(250);
    await expect(scan).resolves.toBeNull();
    expect(tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(video.srcObject).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops every track, and the reading, when the page is hidden", async () => {
    const { tracks, give, video } = camera();
    const scan = scanCamera(video, new AbortController().signal);
    give();
    await vi.advanceTimersByTimeAsync(600);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(250);
    await expect(scan).resolves.toBeNull();
    expect(tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a camera given after the scan was ended", async () => {
    const { tracks, give, video, play } = camera();
    const stop = new AbortController();
    const scan = scanCamera(video, stop.signal);
    stop.abort();
    give();
    await expect(scan).resolves.toBeNull();
    expect(tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(play).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
