import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ connected: true, answers: false, reconnect: vi.fn() }));
vi.mock("@/lib/events", () => ({
  useServerConnection: () => state.connected,
  useReconnect: () => state.reconnect,
}));
vi.mock("@/features/kept/reach", () => ({ probeServer: async () => state.answers }));
vi.mock("@/features/kept/register", () => ({ canOpenOutOfReach: () => false }));

const { ASK_AFTER_MS, ASK_EVERY_MS, ConnectionNotice } = await import("./connection-notice");
const { ScreenFailed } = await import("./screen-error");
const { UNREACHABLE_EVENT } = await import("@/lib/api");

const show = () =>
  render(
    <MemoryRouter>
      <ConnectionNotice />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.useFakeTimers();
  state.connected = true;
  state.answers = false;
  state.reconnect.mockReset();
});
afterEach(() => vi.useRealTimers());

const line = () => screen.queryByText(/Can't reach Outpost\./);

describe("the line that says the server cannot be reached", () => {
  it("says nothing while the server answers", async () => {
    show();
    await act(() => vi.advanceTimersByTimeAsync(ASK_EVERY_MS * 2));
    expect(line()).toBeNull();
  });

  it("appears once the stream has dropped and the server does not answer, and goes when it answers again", async () => {
    const { rerender } = show();
    state.connected = false;
    rerender(
      <MemoryRouter>
        <ConnectionNotice />
      </MemoryRouter>,
    );
    // A restart that takes a moment does not flash it.
    await act(() => vi.advanceTimersByTimeAsync(ASK_AFTER_MS - 100));
    expect(line()).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(line()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Try now" })).toBeInTheDocument();

    // Asked again a few seconds later: it answers, and the live stream is opened at once.
    state.answers = true;
    await act(() => vi.advanceTimersByTimeAsync(ASK_EVERY_MS));
    expect(line()).toBeNull();
    expect(state.reconnect).toHaveBeenCalled();
  });

  it("appears after a request had no answer at all, while the stream still looked open", async () => {
    show();
    act(() => {
      window.dispatchEvent(new Event(UNREACHABLE_EVENT));
    });
    await act(() => vi.advanceTimersByTimeAsync(ASK_AFTER_MS + 100));
    expect(line()).not.toBeNull();
  });
});

describe("a screen that could not be fetched", () => {
  it("says the server cannot be reached while it cannot, and loads the page afresh once it answers", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    state.connected = false;
    const error = new TypeError("Importing a module script failed.");
    const { rerender } = render(
      <MemoryRouter>
        <ScreenFailed error={error} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/server cannot be reached, so this screen could not be fetched/)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    state.connected = true;
    rerender(
      <MemoryRouter>
        <ScreenFailed error={error} />
      </MemoryRouter>,
    );
    expect(reload).toHaveBeenCalledOnce();
  });
});
