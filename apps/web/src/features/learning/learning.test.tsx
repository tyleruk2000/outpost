import type { LearningCourse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { fakeServer, installBrowserStubs, renderScreen } from "../downloads/test-support";
import { chooseLearner, reloadLearningDevice, setRecording } from "./device";
import LearningPanel from "./learning-panel";
import { progressDocument } from "./progress-document";
import { ReaderLearning } from "./reader-controls";
import { useLearningTracker, WRITE_EVERY_MS } from "./tracker";

beforeAll(installBrowserStubs);
beforeEach(() => {
  localStorage.clear();
  reloadLearningDevice();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const course = (over: Partial<LearningCourse> = {}): LearningCourse => ({
  learner: "Sam",
  archive: "number-school_en_all",
  title: "Number school",
  collectionId: "c1",
  last: { path: "lessons/quarters", title: "Quarters", at: Date.now() - 60_000 },
  pagesOpened: 4,
  pagesDone: 2,
  secondsThisWeek: 2 * 3600 + 120,
  secondsInAll: 3 * 3600,
  topics: [{ path: "topics/fractions", title: "Fractions", listed: 3, done: 2 }],
  ...over,
});

const learners = { learners: [{ name: "Sam", courses: 1, pages: 4, lastAt: 1 }], household: ["Robin"] };

describe("the Learning view", () => {
  it("shows a skeleton, then says plainly when nothing is recorded for the learner of this device", async () => {
    chooseLearner("Sam");
    fakeServer({ "GET /api/learning/progress": { courses: [], weekFrom: 0 }, "GET /api/learning/learners": learners });
    renderScreen(<LearningPanel />);
    expect(screen.getByLabelText("Loading progress")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Nothing recorded for Sam yet" })).toBeInTheDocument();
    expect(screen.getByText("This device records progress for Sam.")).toBeInTheDocument();
    expect(screen.getByText(/Anyone in the house can see everyone's progress/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a collection" })).toHaveAttribute("href", "/library?tab=collections");
  });

  it("lists where the learner got to, pages done, time this week and a topic's count, and offers it on paper", async () => {
    chooseLearner("Sam");
    const server = fakeServer({
      "GET /api/learning/progress": { courses: [course()], weekFrom: 0 },
      "GET /api/learning/learners": learners,
    });
    renderScreen(<LearningPanel />);
    const list = await screen.findByRole("list", { name: "Courses Sam has opened" });
    expect(within(list).getByRole("heading", { name: "Number school" })).toBeInTheDocument();
    expect(within(list).getByText("Got to “Quarters”", { exact: false })).toBeInTheDocument();
    expect(within(list).getByText("4 pages opened")).toBeInTheDocument();
    expect(within(list).getByText("2 done")).toBeInTheDocument();
    expect(within(list).getByText("about 2 hours this week")).toBeInTheDocument();
    expect(within(list).getByText("2 of 3 done in Fractions")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /Carry on where Sam left off in Number school: Quarters/ })).toHaveAttribute(
      "href",
      "/library/read/c1/lessons/quarters",
    );
    expect(screen.getByRole("link", { name: /Save as PDF/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to library/ })).toBeInTheDocument();
    expect(server.calls).toContain("GET /api/learning/progress?learner=Sam");
  });

  it("says a course no longer installed is kept, and offers no way into it", async () => {
    chooseLearner("Sam");
    fakeServer({
      "GET /api/learning/progress": { courses: [course({ collectionId: null, topics: [] })], weekFrom: 0 },
      "GET /api/learning/learners": learners,
    });
    renderScreen(<LearningPanel />);
    expect(await screen.findByText(/Not installed now/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Carry on/ })).not.toBeInTheDocument();
  });

  it("shows everyone's progress, a row for each learner under each course, where no one is chosen on the device", async () => {
    const server = fakeServer({
      "GET /api/learning/progress": {
        courses: [course(), course({ learner: "", last: { path: "index", title: "Number school", at: 1 } })],
        weekFrom: 0,
      },
      "GET /api/learning/learners": learners,
    });
    renderScreen(<LearningPanel />);
    const section = await screen.findByRole("region", { name: "Number school" });
    expect(within(section).getByRole("heading", { name: "Sam" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "Just me" })).toBeInTheDocument();
    expect(screen.getByText(/No one has said who is learning on this device/)).toBeInTheDocument();
    expect(server.calls).toContain("GET /api/learning/progress?everyone=1");
  });

  it("switches between one learner and everyone", async () => {
    chooseLearner("Sam");
    const server = fakeServer({
      "GET /api/learning/progress": { courses: [course()], weekFrom: 0 },
      "GET /api/learning/learners": learners,
    });
    renderScreen(<LearningPanel />);
    await screen.findByRole("list", { name: "Courses Sam has opened" });
    await userEvent.click(screen.getByRole("button", { name: "Showing Sam. Change" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Everyone" }));
    await waitFor(() => expect(server.calls).toContain("GET /api/learning/progress?everyone=1"));
    expect(await screen.findByRole("button", { name: "Showing everyone. Change" })).toBeInTheDocument();
  });

  it("shows an error with a way to try again", async () => {
    chooseLearner("Sam");
    fakeServer({
      "GET /api/learning/progress": { status: 500, error: { code: "internal", message: "The database is busy." } },
      "GET /api/learning/learners": learners,
    });
    renderScreen(<LearningPanel />);
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });
});

describe("the learner switch in the reader's bar", () => {
  const tracker = (learner: string | null) => ({
    learner,
    page: { path: "lessons/halves", title: "Halves" },
    shown: () => {},
    listed: () => {},
    ended: () => false,
  });

  it("asks who is learning, offers the household, and is one press from switching", async () => {
    fakeServer({ "GET /api/learning/learners": learners, "GET /api/learning/page": { page: null } });
    renderScreen(<ReaderLearning tracker={tracker(null)} collectionId="c1" watched={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Choose who is learning" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Robin" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Sam" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Just me" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Robin" }));
    expect(JSON.parse(localStorage.getItem("outpost.learning.learner")!)).toEqual({ name: "Robin" });
    expect(await screen.findByRole("button", { name: "Learning: Robin. Switch learner" })).toBeInTheDocument();
  });

  it("marks the page done, says so, and says when recording is off", async () => {
    chooseLearner("Sam");
    const server = fakeServer({
      "GET /api/learning/learners": learners,
      "GET /api/learning/page": { page: null },
      "POST /api/learning/done": { page: { path: "lessons/halves", doneAt: 5, doneHow: "marked" } },
    });
    renderScreen(
      <TooltipProvider>
        <ReaderLearning tracker={tracker("Sam")} collectionId="c1" watched={null} />
      </TooltipProvider>,
    );
    const done = await screen.findByRole("button", { name: "Mark “Halves” as done" });
    await waitFor(() => expect(done).toBeEnabled());
    expect(done).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(done);
    expect(await screen.findByRole("button", { name: "Done: Halves. Press to undo" })).toHaveAttribute("aria-pressed", "true");
    expect(server.calls).toContain("POST /api/learning/done");
    act(() => setRecording(false));
    expect(await screen.findByRole("button", { name: "Progress is not being recorded on this device. Change" })).toHaveTextContent(
      "Not recording",
    );
  });
});

describe("what the reader records", () => {
  function track(learner: string | null) {
    if (learner !== null) chooseLearner(learner);
    const writes: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init?: RequestInit) => {
        if (init?.method === "POST") writes.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useLearningTracker("c1", true), { wrapper });
    return { writes, hook };
  }
  const hide = (hidden: boolean) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("writes when a page is left, when the tab is hidden and once a minute, never per second, counting only visible time", async () => {
    vi.useFakeTimers();
    hide(false);
    const { writes, hook } = track("Sam");
    act(() => hook.result.current.shown("lessons/halves", "Halves"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(writes).toEqual([]);
    act(() => hook.result.current.shown("lessons/quarters", "Quarters"));
    expect(writes).toEqual([{ learner: "Sam", collectionId: "c1", path: "lessons/halves", title: "Halves", seconds: 30, opened: true }]);
    act(() => vi.advanceTimersByTime(WRITE_EVERY_MS));
    expect(writes.at(-1)).toMatchObject({ path: "lessons/quarters", seconds: 60, opened: true });
    act(() => vi.advanceTimersByTime(20_000));
    act(() => hide(true));
    expect(writes.at(-1)).toMatchObject({ path: "lessons/quarters", seconds: 20, opened: false });
    const before = writes.length;
    // Hidden: no timer, no time counted, nothing written.
    act(() => vi.advanceTimersByTime(10 * WRITE_EVERY_MS));
    expect(writes).toHaveLength(before);
    act(() => hide(false));
    act(() => vi.advanceTimersByTime(5_000));
    hook.unmount();
    expect(writes.at(-1)).toMatchObject({ path: "lessons/quarters", seconds: 5 });
    expect(writes).toHaveLength(before + 1);
  });

  it("writes nothing at all before anyone is chosen, or with recording off", () => {
    vi.useFakeTimers();
    hide(false);
    const { writes, hook } = track(null);
    act(() => hook.result.current.shown("lessons/halves", "Halves"));
    act(() => vi.advanceTimersByTime(5 * WRITE_EVERY_MS));
    act(() => hook.result.current.shown("lessons/quarters", "Quarters"));
    act(() => hook.result.current.listed("topics/fractions", ["a", "b", "c"], false));
    hook.unmount();
    expect(writes).toEqual([]);
    setRecording(false);
    chooseLearner("Sam");
    const off = track(null);
    act(() => off.hook.result.current.shown("lessons/halves", "Halves"));
    act(() => vi.advanceTimersByTime(5 * WRITE_EVERY_MS));
    off.hook.unmount();
    expect(off.writes).toEqual([]);
  });

  it("gives what was counted to the learner it was counted for when the tablet changes hands", () => {
    vi.useFakeTimers();
    hide(false);
    const { writes, hook } = track("Sam");
    act(() => hook.result.current.shown("lessons/halves", "Halves"));
    act(() => vi.advanceTimersByTime(12_000));
    act(() => chooseLearner("Alex"));
    expect(writes.at(-1)).toMatchObject({ learner: "Sam", path: "lessons/halves", seconds: 12 });
    act(() => vi.advanceTimersByTime(7_000));
    hook.unmount();
    expect(writes.at(-1)).toMatchObject({ learner: "Alex", path: "lessons/halves", seconds: 7, opened: true });
  });

  it("counts a video as watched only when most of it was played, on the page on show", () => {
    hide(false);
    const { hook } = track("Sam");
    act(() => hook.result.current.shown("videos/adding-fractions", "Adding fractions"));
    expect(hook.result.current.ended("videos/adding-fractions", 0.95)).toBe(true);
    expect(hook.result.current.ended("videos/adding-fractions", 0.2)).toBe(false);
    expect(hook.result.current.ended("lessons/halves", 1)).toBe(false);
    hook.unmount();
  });
});

describe("on paper", () => {
  it("names the learner, where they got to, and the topic counts", () => {
    const blocks = progressDocument([course()], "Sam", new Date(2026, 10, 17).getTime());
    expect(blocks[0]).toEqual({ kind: "title", text: "Learning progress: Sam" });
    const table = blocks.find((block) => block.kind === "table") as { rows: string[][] };
    expect(table.rows[0]).toEqual(["Number school", expect.stringContaining("Quarters"), "4", "2", "about 2 hours"]);
    expect(blocks.some((block) => block.kind === "list" && block.items[0] === "Number school: 2 of 3 done in Fractions")).toBe(true);
  });
});
