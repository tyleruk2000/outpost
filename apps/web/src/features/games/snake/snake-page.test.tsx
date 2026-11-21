/**
 * The Snake screen: it waits to be started, an arrow key or a button starts and steers it,
 * it moves at the speed chosen, it pauses with Space and by itself when the page is
 * hidden, the end is said with the score, the best score is kept on this device, and the
 * score goes to the tally. The clock is faked, so the steps can be counted.
 */
import type { GamesResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SnakePage, { STEP_MS } from "./snake-page";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const empty: GamesResponse = {
  tallies: { solitaire: {}, "peg-solitaire": {}, sudoku: {}, draughts: {}, chess: {}, pairs: {}, snake: {} },
  allotmentStarted: false,
};
let posted: Array<Record<string, unknown>> = [];

beforeEach(() => {
  localStorage.clear();
  posted = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/games/snake/results") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json({ tally: {} });
      }
      if (url.endsWith("/api/games")) return json(empty);
      return json({ error: "not found" }, 404);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/games/snake"]}>
        <SnakePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const status = () => screen.getByTestId("snake-status");
const score = () => screen.getByText(/^Score \d+ · length/);
const steps = (count: number, speed: keyof typeof STEP_MS = "steady") => act(() => vi.advanceTimersByTime(STEP_MS[speed] * count + 5));

describe("Snake", () => {
  it("waits to be started, and an arrow key starts it", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Snake" })).toBeInTheDocument();
    expect(status()).toHaveTextContent("Press an arrow key, swipe on the field or tap an arrow to start.");
    expect(screen.getByRole("application", { name: /Snake field, 16 by 16/ })).toBeInTheDocument();
    for (const name of ["Up", "Down", "Left", "Right"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(status()).toHaveTextContent("Eat the apples.");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("runs into the wall with walls, says so with the score, keeps the best, and sends the result", async () => {
    show();
    fireEvent.keyDown(window, { key: "w" });
    // From row 8 heading up, the head reaches row 0 after 8 steps and leaves the field on the 9th.
    steps(12);
    expect(status()).toHaveTextContent(/The snake hit the wall\. Score \d+\./);
    await waitFor(() =>
      expect(posted).toEqual([expect.objectContaining({ variant: "steady-walls", won: false, score: expect.any(Number) })]),
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("outpost.games.snake") ?? "{}")).toMatchObject({ version: 1, speed: "steady" }),
    );
    expect(screen.getByRole("button", { name: "New game" })).toBeInTheDocument();
  });

  it("wraps round at the edges when asked, and does not end there", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Wrap round" }));
    fireEvent.keyDown(window, { key: "ArrowUp" });
    steps(12);
    expect(status()).toHaveTextContent("Eat the apples. Do not run into yourself.");
  });

  it("pauses with Space and when the page is hidden, and carries on when asked", () => {
    show();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: " " });
    expect(status()).toHaveTextContent("Paused.");
    const before = score().textContent;
    steps(20);
    expect(score().textContent).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(status()).toHaveTextContent("Eat the apples.");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(status()).toHaveTextContent("Paused.");
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Shown again, it waits rather than starting by itself.
    expect(status()).toHaveTextContent("Paused.");
  });

  it("is steered by the on-screen buttons", () => {
    show();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Down" }));
    expect(status()).toHaveTextContent("Eat the apples.");
    steps(12);
    expect(status()).toHaveTextContent("The snake hit the wall.");
  });

  it("goes slowly at the slow speed, for small children", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Slow" }));
    fireEvent.keyDown(window, { key: "ArrowUp" });
    // Twelve steady steps are under six slow ones: the snake is still on the field.
    steps(12);
    expect(status()).toHaveTextContent("Eat the apples.");
    steps(6, "slow");
    expect(status()).toHaveTextContent("The snake hit the wall.");
  });
});
