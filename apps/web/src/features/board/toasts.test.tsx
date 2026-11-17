import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notify } from "@/lib/notify";
import { BoardToasts } from "./toasts";

const heard = vi.hoisted(() => ({ handler: null as ((payload: { data: unknown }) => void) | null }));

vi.mock("@/lib/events", () => ({
  useServerEvent: (_type: string, handler: (payload: { data: unknown }) => void) => {
    heard.handler = handler;
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const posted = (data: Record<string, unknown>) =>
  act(() => {
    heard.handler?.({ data: { action: "posted", channel: "board", ...data } });
    vi.advanceTimersByTime(500);
  });

describe("news from the board, on another screen", () => {
  it("says a message as words, with a way to open the board", () => {
    render(
      <MemoryRouter initialEntries={["/maps"]}>
        <BoardToasts />
      </MemoryRouter>,
    );
    posted({ kind: "message", author: "Sam", excerpt: "Back by six" });
    expect(toast).toHaveBeenCalledWith("Sam: Back by six", expect.objectContaining({ action: expect.objectContaining({ label: "Open" }) }));
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("says at once that someone needs help, the way a failure is said", () => {
    render(
      <MemoryRouter initialEntries={["/maps"]}>
        <BoardToasts />
      </MemoryRouter>,
    );
    posted({ kind: "checkin", status: "help", author: "Sam" });
    expect(notify.error).toHaveBeenCalledWith("Sam checked in: needs help", expect.anything());
    expect(toast).not.toHaveBeenCalled();
  });
});
