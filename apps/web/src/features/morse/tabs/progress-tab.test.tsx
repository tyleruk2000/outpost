import type { MorseResponse, MorseSession } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { applyMorsePrefs, getMorsePrefs, resetMorsePrefs } from "../prefs";
import { ProgressTab } from "./progress-tab";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 16, 12);

const session = (overrides: Partial<MorseSession> = {}): MorseSession => ({
  id: `s${Math.random()}`,
  kind: "receive",
  at: NOW,
  accuracy: 0.8,
  charWpm: 18,
  effWpm: 10,
  rhythm: null,
  lesson: 1,
  misses: {},
  tries: {},
  ...overrides,
});

const response = (overrides: Partial<MorseResponse> = {}): MorseResponse => ({
  progress: { kochLesson: 1, bestCharWpm: null, bestEffWpm: null, settings: {}, updatedAt: 0 },
  sessions: [],
  sessionCount: 0,
  weakChars: {},
  suggestedCallsign: null,
  ...overrides,
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/radio/morse?tab=progress"]}>
        <ProgressTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetMorsePrefs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Progress", () => {
  it("shows skeletons while the history loads, not an empty history", () => {
    vi.spyOn(api, "get").mockImplementation(() => new Promise(() => {}));
    const { container } = show();
    expect(container.querySelector("[aria-busy]")).toBeInTheDocument();
    expect(screen.queryByText("No practice sessions yet")).not.toBeInTheDocument();
  });

  it("says when the history could not be read, and tries again", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting."))
      .mockResolvedValue(response() as never);
    show();
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("The Outpost server is not responding. It may be restarting.")).toBeInTheDocument();
    expect(screen.queryByText("No practice sessions yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No practice sessions yet")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/morse");
  });

  it("offers the first lesson from an empty history, and says progress is shared", async () => {
    vi.spyOn(api, "get").mockResolvedValue(response() as never);
    show();
    expect(await screen.findByText("No practice sessions yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start lesson 1" })).toHaveAttribute("href", "/radio/morse?tab=receive");
    expect(screen.getByText(/shared by everyone who uses this copy of Outpost: there are no accounts/)).toBeInTheDocument();
    expect(screen.getByText("Lesson 1 of 40: 2 of 41 characters met so far.")).toBeInTheDocument();
    // Nothing to clear yet.
    expect(screen.queryByRole("button", { name: "Start again" })).not.toBeInTheDocument();
  });

  it("draws accuracy over time per kind, the lesson reached, the bests and the characters that get away", async () => {
    const sessions = [
      session({ id: "a", kind: "qso", at: NOW, accuracy: 0.6, charWpm: 15 }),
      session({ id: "b", kind: "send", at: NOW - HOUR, accuracy: 0.7 }),
      session({ id: "c", kind: "receive", at: NOW - 2 * HOUR, accuracy: 0.92 }),
      session({ id: "d", kind: "receive", at: NOW - 30 * HOUR, accuracy: 0.5 }),
    ];
    vi.spyOn(api, "get").mockResolvedValue(
      response({
        progress: { kochLesson: 5, bestCharWpm: 18, bestEffWpm: 10, settings: { charWpm: 18 }, updatedAt: NOW },
        sessions,
        sessionCount: 4,
        weakChars: { Q: 7, K: 2 },
      }) as never,
    );
    show();
    expect(await screen.findByText("Lesson 5 of 40: 6 of 41 characters met so far.")).toBeInTheDocument();
    expect(screen.getByText(/^4 practice sessions kept\./)).toHaveTextContent(
      "4 practice sessions kept. 68% accuracy on average over the last 4 sessions. Best copy speed 18 wpm.",
    );
    const legend = screen.getByRole("list", { name: "Kinds of practice" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Receive", "Send", "QSO practice"]);
    // The readout starts at the newest session, and the arrow keys move along.
    const chart = screen.getByRole("region", { name: /Accuracy of each session over time/ });
    expect(within(chart).getByText(/^QSO practice, 16 Nov 2026, \d\d:00: 60% at 15 wpm$/)).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(within(chart).getByText(/^Send, 16 Nov 2026, \d\d:00: 70% at 18 wpm$/)).toBeInTheDocument();

    const weak = screen.getByRole("list", { name: "Characters missed most" });
    expect(
      within(weak)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Q7 misses", "K2 misses"]);
    expect(screen.getAllByRole("row").length).toBeGreaterThan(4);
  });

  it("starts again only once confirmed, naming what goes", async () => {
    applyMorsePrefs({ kochLesson: 3, toneHz: 700 });
    vi.spyOn(api, "get").mockResolvedValue(
      response({
        progress: { kochLesson: 3, bestCharWpm: 18, bestEffWpm: 10, settings: { toneHz: 700 }, updatedAt: NOW },
        sessions: [session({ id: "a" }), session({ id: "b", at: NOW - HOUR })],
        sessionCount: 12,
      }) as never,
    );
    const remove = vi.spyOn(api, "delete").mockResolvedValue({ removed: { sessions: 12, progress: 1 } } as never);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Start the Morse trainer again?" });
    expect(dialog).toHaveTextContent(
      "the Koch lesson (lesson 3), the trainer's settings, here and on the server, and 12 practice sessions",
    );
    expect(dialog).toHaveTextContent("everyone who uses this copy of Outpost");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Start again" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("/api/morse"));
    await waitFor(() => expect(getMorsePrefs().kochLesson).toBe(1));
    expect(getMorsePrefs().toneHz).toBe(600);
  });

  it("says when starting again did not work", async () => {
    vi.spyOn(api, "get").mockResolvedValue(response({ sessions: [session()], sessionCount: 1 }) as never);
    vi.spyOn(api, "delete").mockRejectedValue(
      new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting."),
    );
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Start again" }));
    expect(await screen.findByText("Nothing was cleared")).toBeInTheDocument();
  });
});
