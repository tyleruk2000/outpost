import type { JobDto } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DownloadsPage from "./downloads-page";
import { adminSession, collection, download, fakeServer, installBrowserStubs, memberSession, plan, renderScreen } from "./test-support";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const job = (over: Partial<JobDto>): JobDto => ({
  id: "j1",
  type: "collection.move",
  queue: "transfer",
  state: "running",
  title: "Move Wikipedia 100 to USB drive",
  subject: "collection:c1",
  progress: { current: 50, total: 200, message: "Copying to USB drive" },
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
    "GET /api/jobs": {
      jobs: [job({}), job({ id: "j0", type: "download.run", title: "Download Best of Wikipedia", subject: "download:run" })],
    },
    "GET /api/collections": { collections: [collection({ id: "c1" })] },
    "GET /api/auth/session": adminSession,
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

  it("lists other background work, leaving out the jobs that are downloads", async () => {
    const server = serve({ "POST /api/jobs/j1/cancel": { job: job({ state: "cancelled" }) } });
    renderScreen(<DownloadsPage />);
    const other = within(await section("Other work in the background"));
    expect(other.getByText("Move Wikipedia 100 to USB drive")).toBeInTheDocument();
    expect(other.getByText("Copying to USB drive")).toBeInTheDocument();
    expect(other.getByText("25%")).toBeInTheDocument();
    expect(other.queryByText("Download Best of Wikipedia")).not.toBeInTheDocument();
    await userEvent.click(other.getByRole("button", { name: "Cancel: Move Wikipedia 100 to USB drive" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/jobs/j1/cancel"));
  });

  it("hides the background section when there is no such work", async () => {
    serve({ "GET /api/jobs": { jobs: [] } });
    renderScreen(<DownloadsPage />);
    await section("In progress");
    expect(screen.queryByRole("heading", { name: "Other work in the background" })).not.toBeInTheDocument();
  });

  it("shows members the state of things without controls", async () => {
    serve({ "GET /api/auth/session": memberSession });
    renderScreen(<DownloadsPage />);
    await section("In progress");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Pause|Cancel|Retry|Remove/ })).not.toBeInTheDocument());
  });

  it("points to Explore when nothing has ever been downloaded", async () => {
    serve({ "GET /api/downloads": { downloads: [] }, "GET /api/jobs": { jobs: [] } });
    renderScreen(<DownloadsPage />);
    expect(await screen.findByRole("heading", { name: "Nothing has been downloaded yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore collections" })).toHaveAttribute("href", "/explore");
  });
});
