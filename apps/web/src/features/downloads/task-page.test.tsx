import type { JobDetail, JobDto } from "@outpost/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import TaskPage from "./task-page";
import { fakeServer, installBrowserStubs, renderScreen } from "./test-support";

beforeAll(installBrowserStubs);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const START = Date.UTC(2026, 10, 23, 9, 0, 0);

const job = (over: Partial<JobDto> = {}): JobDto => ({
  id: "j1",
  type: "semantic.index",
  queue: "index",
  state: "running",
  title: "Build semantic search index",
  subject: "semantic:m1",
  progress: { current: 1200, total: 6000, message: "1200 of 6000 passages", unit: "passages", ratePerSecond: 5 },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 3,
  result: null,
  createdAt: START - 60_000,
  startedAt: START,
  finishedAt: null,
  updatedAt: START + 240_000,
  ...over,
});

/** Four minutes of samples, every ten seconds, at 300 passages a minute. */
const samples = Array.from({ length: 25 }, (_, n) => ({ at: START + n * 10_000, current: n * 50, total: 6000, unit: "passages" }));

const detail = (over: Partial<JobDetail> = {}): JobDetail => ({
  job: job(),
  samples,
  events: [
    { at: START - 60_000, kind: "state", state: "queued", message: null },
    { at: START, kind: "state", state: "running", message: null },
  ],
  waiting: { reason: null, slots: 1, running: [], ahead: [], aheadCount: 0, held: null, retryAt: null },
  ...over,
});

function show() {
  return renderScreen(
    <Routes>
      <Route path="/downloads/tasks/:id" element={<TaskPage />} />
    </Routes>,
    "/downloads/tasks/j1",
  );
}

const part = async (name: string) => (await screen.findByRole("heading", { name })).closest("section") as HTMLElement;

describe("A task's page", () => {
  it("says what the task is, where it stands, how fast it goes and about how long it has left", async () => {
    fakeServer({ "GET /api/jobs/j1/detail": detail() });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Build semantic search index" })).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getAllByText(/Building search by meaning/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Turns each passage of the library into numbers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Downloads and tasks" })).toHaveAttribute("href", "/downloads?show=tasks");

    const now = within(await part("Now"));
    expect(now.getByRole("progressbar", { name: "Progress of Build semantic search index" })).toBeInTheDocument();
    expect(now.getByText("1,200 of 6,000 passages")).toBeInTheDocument();
    expect(now.getByText("20%")).toBeInTheDocument();
    expect(now.getByText("300 passages a minute")).toBeInTheDocument();
    expect(now.getByText("about 16 minutes left")).toBeInTheDocument();
    expect(now.getByText("Running for")).toBeInTheDocument();
    expect(now.getByRole("button", { name: "Pause Build semantic search index" })).toBeInTheDocument();
    expect(now.getByRole("link", { name: "Open Search by meaning in Settings" })).toHaveAttribute("href", "/settings#semantic");

    const rate = within(await part("Rate over time"));
    expect(rate.getByRole("group", { name: /^Passages a minute for this task from/ })).toBeInTheDocument();
    expect(rate.getByText(/Average/)).toBeInTheDocument();
    // The numbers behind the line, for a screen reader.
    expect(rate.getByRole("table")).toBeInTheDocument();
    expect(rate.getAllByRole("cell", { name: "300 passages a minute" }).length).toBeGreaterThan(0);

    const happened = within(await part("What happened"));
    expect(happened.getByText("Added to the queue")).toBeInTheDocument();
    expect(happened.getByText("Started")).toBeInTheDocument();
  });

  it("says what a waiting task is waiting for, and links to it", async () => {
    fakeServer({
      "GET /api/jobs/j1/detail": detail({
        job: job({ state: "queued", startedAt: null, progress: { current: 0, total: null, message: null } }),
        samples: [],
        events: [{ at: START, kind: "state", state: "queued", message: null }],
        waiting: {
          reason: "turn",
          slots: 1,
          running: [{ id: "j0", type: "roads.build", title: "Building the road network: Wales", state: "running" }],
          ahead: [{ id: "j9", type: "semantic.index", title: "Build semantic search index again", state: "queued" }],
          aheadCount: 1,
          held: null,
          retryAt: null,
        },
      }),
    });
    show();
    const now = within(await part("Now"));
    expect(
      now.getByText(
        "Waiting for “Building the road network: Wales” to finish. One task of this kind runs at a time. One more is ahead of it.",
      ),
    ).toBeInTheDocument();
    expect(now.getByRole("link", { name: "Building the road network: Wales" })).toHaveAttribute("href", "/downloads/tasks/j0");
    expect(within(await part("Rate over time")).getByText(/There is nothing to show until this one is moving/)).toBeInTheDocument();
  });

  it("gives a failed task's error, what to do, and Retry", async () => {
    const server = fakeServer({
      "GET /api/jobs/j1/detail": detail({
        job: job({
          state: "failed",
          error: "The search model is not answering.",
          errorKind: "permanent",
          finishedAt: START + 300_000,
          progress: { current: 1200, total: 6000, message: null, unit: "passages" },
        }),
        events: [
          { at: START - 60_000, kind: "state", state: "queued", message: null },
          { at: START, kind: "state", state: "running", message: null },
          { at: START + 300_000, kind: "state", state: "failed", message: "The search model is not answering." },
        ],
      }),
      "POST /api/jobs/j1/resume": { job: job({ state: "queued" }) },
    });
    show();
    const ended = within(await part("How it ended"));
    expect(ended.getByText("The search model is not answering.")).toBeInTheDocument();
    expect(ended.getByText("Press Retry to run it again.")).toBeInTheDocument();
    expect(ended.getByText("Took")).toBeInTheDocument();
    expect(ended.queryByRole("button", { name: /^Cancel/ })).not.toBeInTheDocument();
    await userEvent.click(ended.getByRole("button", { name: "Retry Build semantic search index" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/jobs/j1/resume"));
    expect(within(await part("What happened")).getByText("Failed")).toBeInTheDocument();
  });

  it("asks before cancelling", async () => {
    const server = fakeServer({ "GET /api/jobs/j1/detail": detail(), "POST /api/jobs/j1/cancel": { job: job({ state: "cancelled" }) } });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel Build semantic search index" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it going" }));
    expect(server.calls).not.toContain("POST /api/jobs/j1/cancel");
    await userEvent.click(screen.getByRole("button", { name: "Cancel Build semantic search index" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel the task" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/jobs/j1/cancel"));
  });

  it("says when it is not listed any more", async () => {
    fakeServer({ "GET /api/jobs/j1/detail": { status: 404, error: { code: "not_found", message: "Job was not found." } } });
    show();
    expect(await screen.findByRole("heading", { name: "This task is not listed any more" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Downloads and tasks" })).toHaveAttribute("href", "/downloads?show=tasks");
  });

  it("says when what is shown has stopped updating", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let asked = 0;
    fakeServer({
      "GET /api/jobs/j1/detail": () =>
        asked++ === 0 ? detail() : { status: 503, error: { code: "unavailable", message: "The Outpost server is not responding." } },
    });
    show();
    await screen.findByRole("heading", { level: 1, name: "Build semantic search index" });
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(await screen.findByText("These details are not updating")).toBeInTheDocument();
    // What was known is still shown.
    expect(screen.getByText("1,200 of 6,000 passages")).toBeInTheDocument();
  });
});
