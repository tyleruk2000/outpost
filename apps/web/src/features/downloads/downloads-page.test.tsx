import type { JobDto } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DownloadsPage from "./downloads-page";
import { collection, download, fakeServer, installBrowserStubs, plan, renderScreen } from "./test-support";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const job = (over: Partial<JobDto>): JobDto => ({
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
  maxAttempts: 1,
  result: null,
  createdAt: 1,
  startedAt: 2,
  finishedAt: null,
  updatedAt: 3,
  ...over,
});

const everything = [
  download({ id: "run", title: "Best of Wikipedia" }),
  download({
    id: "check",
    title: "Wikipedia 100",
    state: "verifying",
    receivedBytes: 1_900_000_000,
    message: "Checking the file",
    bytesPerSecond: null,
    etaSeconds: null,
  }),
  download({
    id: "wait",
    title: "Wikibooks",
    state: "queued",
    error: "No connection. This download will resume when the network is back.",
    errorKind: "offline",
    bytesPerSecond: null,
    etaSeconds: null,
  }),
  download({ id: "stop", title: "iFixit repair guides", state: "paused", bytesPerSecond: null, etaSeconds: null }),
  download({
    id: "bad",
    title: "Ready.gov",
    state: "failed",
    error: "“USB drive” is full. Free some space on it, then retry.",
    errorKind: "insufficient_space",
    finishedAt: 5,
  }),
  download({ id: "gone", title: "Gardenology", state: "cancelled", receivedBytes: 0, finishedAt: 6 }),
  download({
    id: "done",
    title: "Vikidia",
    state: "completed",
    receivedBytes: 10_600_000,
    totalBytes: 10_600_000,
    collectionId: "c1",
    finishedAt: 7,
  }),
];

function serve(routes: Record<string, unknown> = {}) {
  return fakeServer({
    "GET /api/downloads": { downloads: everything },
    "GET /api/downloads/plan": plan(),
    "GET /api/jobs": ({ url }: { url: URL }) =>
      url.searchParams.get("active") === "true"
        ? { jobs: [job({}), job({ id: "j0", type: "download.run", title: "Download Best of Wikipedia", subject: "download:run" })] }
        : {
            jobs: [
              job({
                id: "j2",
                type: "document.extract",
                state: "failed",
                title: "Reading text from “Field manual”",
                error: "The file is missing from “USB drive”.",
                errorKind: "not_found",
                progress: { current: 0, total: null, message: null },
                finishedAt: 20,
              }),
              job({ id: "j3", type: "database.check", state: "succeeded", title: "Check the database", finishedAt: 10 }),
            ],
          },
    "GET /api/collections": { collections: [collection({ id: "c1" })] },
    ...routes,
  });
}

const section = async (name: string) => (await screen.findByRole("heading", { name })).closest("section") as HTMLElement;

describe("Downloads", () => {
  it("lists what is in progress with real numbers and the right controls", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    const active = within(await section("In progress"));
    expect(active.getByText("412 MB of 1.90 GB")).toBeInTheDocument();
    expect(active.getByText("2.10 MB/s, 4 minutes left")).toBeInTheDocument();
    expect(active.getByText("Checking the file against its checksum")).toBeInTheDocument();
    expect(active.getByText("No connection. This download will resume when the network is back.")).toBeInTheDocument();
    expect(active.getByText("Paused at 412 MB of 1.90 GB")).toBeInTheDocument();
    expect(active.getAllByText("To Internal storage")).toHaveLength(4);
    expect(active.getByRole("button", { name: "Pause Best of Wikipedia" })).toBeInTheDocument();
    expect(active.getByRole("button", { name: "Resume iFixit repair guides" })).toBeInTheDocument();
    expect(active.queryByRole("button", { name: "Pause Wikipedia 100" })).not.toBeInTheDocument();
    expect(active.getAllByRole("button", { name: /^Cancel / })).toHaveLength(4);
  });

  it("puts failed downloads under needs attention with the reason and Retry", async () => {
    const server = serve({ "POST /api/downloads/bad/retry": { download: download({ id: "bad", title: "Ready.gov", state: "queued" }) } });
    renderScreen(<DownloadsPage />);
    const attention = within(await section("Needs attention"));
    expect(attention.getByText("“USB drive” is full. Free some space on it, then retry.")).toBeInTheDocument();
    expect(attention.getByText("412 MB already downloaded is kept. Retry continues from there.")).toBeInTheDocument();
    await userEvent.click(attention.getByRole("button", { name: "Retry Ready.gov" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/downloads/bad/retry"));
  });

  it("asks before removing a download whose partial file would be deleted", async () => {
    const server = serve({ "DELETE /api/downloads/bad": { ok: true } });
    renderScreen(<DownloadsPage />);
    await userEvent.click(within(await section("Needs attention")).getByRole("button", { name: "Remove: Ready.gov" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/The 412 MB already downloaded to “Internal storage” will be deleted/)).toBeInTheDocument();
    expect(server.calls).not.toContain("DELETE /api/downloads/bad");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove and delete the partial file" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/downloads/bad"));
  });

  it("keeps history newest first, links finished downloads to their collection, and removes without asking when no file is touched", async () => {
    const server = serve({ "DELETE /api/downloads/done": { ok: true } });
    renderScreen(<DownloadsPage />);
    const history = within(await section("History"));
    expect(
      history
        .getAllByRole("heading")
        .slice(1)
        .map((heading) => heading.textContent),
    ).toEqual(["Vikidia", "Gardenology"]);
    expect(await history.findByRole("link", { name: "Vikidia" })).toHaveAttribute("href", "/library/collections/c1");
    expect(history.getByText("Cancelled before anything was downloaded")).toBeInTheDocument();
    await userEvent.click(history.getByRole("button", { name: "Remove from history: Vikidia" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/downloads/done"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows older history a page at a time, when asked, each download once", async () => {
    const finished = (n: number) =>
      download({ id: `old${n}`, title: `Old download ${n}`, state: "completed", collectionId: null, finishedAt: 1_000 - n });
    const server = serve({
      "GET /api/downloads": { downloads: [...everything, ...Array.from({ length: 48 }, (_, n) => finished(n))], historyTotal: 53 },
      // The page asked for overlaps the first by one: a download finished in between.
      "GET /api/downloads/history": { downloads: [finished(47), finished(48), finished(49), finished(50)], total: 53, offset: 50 },
    });
    renderScreen(<DownloadsPage />);
    const history = within(await section("History"));
    expect(history.getByText("50 of 53 shown")).toBeInTheDocument();
    expect(server.calls.some((call) => call.startsWith("GET /api/downloads/history"))).toBe(false);
    await userEvent.click(history.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(history.getByRole("heading", { name: "Old download 50" })).toBeInTheDocument());
    expect(server.calls).toContain("GET /api/downloads/history?offset=50&limit=50");
    expect(history.getAllByRole("heading", { name: "Old download 47" })).toHaveLength(1);
    // All of it is shown: nothing more to ask for.
    expect(history.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("says what a task is, and lists tasks apart from downloads with their progress, rate and time left", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    expect(await screen.findByRole("heading", { name: "Downloads and tasks", level: 1 })).toBeInTheDocument();
    expect(
      screen.getAllByText(/A task is work Outpost does here, such as reading a document, building search by meaning/).length,
    ).toBeGreaterThan(0);
    const tasks = within(await section("Tasks"));
    expect(await tasks.findByRole("heading", { name: "Build semantic search index" })).toBeInTheDocument();
    expect(tasks.getByText("Building search by meaning")).toBeInTheDocument();
    expect(tasks.getByText("1,200 of 6,000 passages")).toBeInTheDocument();
    expect(tasks.getByText("300 passages a minute")).toBeInTheDocument();
    expect(tasks.getByText("about 16 minutes left")).toBeInTheDocument();
    expect(tasks.getByRole("progressbar", { name: "Progress of Build semantic search index" })).toBeInTheDocument();
    expect(tasks.getByRole("link", { name: "Details of Build semantic search index" })).toHaveAttribute("href", "/downloads/tasks/j1");
    // The jobs that are downloads are the downloads above, not tasks.
    expect(tasks.queryByText("Download Best of Wikipedia")).not.toBeInTheDocument();
    // Finished ones too, newest first, after what is running.
    expect(await tasks.findByText("Reading text from “Field manual”")).toBeInTheDocument();
    expect(tasks.getByText("The file is missing from “USB drive”.")).toBeInTheDocument();
    expect(tasks.getByRole("button", { name: "Pause Build semantic search index" })).toBeInTheDocument();
    // Reading a document is never stopped part of the way.
    expect(tasks.queryByRole("button", { name: /^Cancel Reading/ })).not.toBeInTheDocument();
  });

  it("filters tasks by running, waiting, finished and failed, and says when none are of that kind", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    const tasks = within(await section("Tasks"));
    await tasks.findByText("Reading text from “Field manual”");
    expect(tasks.getByRole("radio", { name: "Running (1)" })).toBeInTheDocument();
    await userEvent.click(tasks.getByRole("radio", { name: "Failed (1)" }));
    expect(tasks.getByText("Reading text from “Field manual”")).toBeInTheDocument();
    expect(tasks.queryByText("Build semantic search index")).not.toBeInTheDocument();
    await userEvent.click(tasks.getByRole("radio", { name: "Waiting (0)" }));
    expect(tasks.getByText("No task is waiting.")).toBeInTheDocument();
    await userEvent.click(tasks.getByRole("button", { name: "Show all tasks" }));
    expect(tasks.getByText("Build semantic search index")).toBeInTheDocument();
  });

  it("asks before cancelling a task", async () => {
    const server = serve({ "POST /api/jobs/j1/cancel": { job: job({ state: "cancelled" }) } });
    renderScreen(<DownloadsPage />);
    const tasks = within(await section("Tasks"));
    await userEvent.click(await tasks.findByRole("button", { name: "Cancel Build semantic search index" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/What it has finished so far is kept/)).toBeInTheDocument();
    expect(server.calls).not.toContain("POST /api/jobs/j1/cancel");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel the task" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/jobs/j1/cancel"));
  });

  it("shows only the tasks, or only the downloads, when asked", async () => {
    serve();
    const { unmount } = renderScreen(<DownloadsPage />, "/downloads?show=tasks");
    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "In progress" })).not.toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /^Tasks/ })).toHaveAttribute("aria-checked", "true");
    unmount();
    renderScreen(<DownloadsPage />, "/downloads?show=downloads");
    expect(await screen.findByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tasks" })).not.toBeInTheDocument();
  });

  it("leaves the tasks out when there have been none", async () => {
    serve({ "GET /api/jobs": { jobs: [] } });
    renderScreen(<DownloadsPage />);
    await section("In progress");
    expect(screen.queryByRole("heading", { name: "Tasks" })).not.toBeInTheDocument();
  });

  it("points to Explore when nothing has ever been downloaded", async () => {
    serve({ "GET /api/downloads": { downloads: [] }, "GET /api/jobs": { jobs: [] }, "GET /api/collections": { collections: [] } });
    renderScreen(<DownloadsPage />);
    expect(await screen.findByRole("heading", { name: "Nothing has been downloaded yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore collections" })).toHaveAttribute("href", "/explore");
  });

  it("does not say nothing is here when the Library holds collections that were never downloaded", async () => {
    // A map imported from a file, or a book included with Outpost, has no download record.
    serve({
      "GET /api/downloads": { downloads: [] },
      "GET /api/jobs": { jobs: [] },
      "GET /api/collections": { collections: [collection({ id: "m", kind: "map" }), collection({ id: "b", kind: "file" })] },
    });
    renderScreen(<DownloadsPage />);
    expect(await screen.findByRole("heading", { name: "Nothing is downloading" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing has been downloaded yet")).not.toBeInTheDocument();
    expect(screen.getByText(/The Library holds 2 collections/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your collections" })).toHaveAttribute("href", "/library?tab=collections");
  });
});
