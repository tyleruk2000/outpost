import type { JobDto } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DownloadsPage from "./downloads-page";
import { download, fakeServer, installBrowserStubs, plan, planItem, planLocation, renderScreen } from "./test-support";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const queue = [
  download({ id: "run", title: "Best of Wikipedia" }),
  download({
    id: "next",
    title: "Wikibooks",
    state: "queued",
    receivedBytes: 0,
    totalBytes: 1_200_000_000,
    bytesPerSecond: null,
    etaSeconds: null,
    createdAt: 2,
  }),
  download({
    id: "last",
    title: "iFixit repair guides",
    state: "queued",
    receivedBytes: 0,
    totalBytes: 1_512_000_000,
    bytesPerSecond: null,
    etaSeconds: null,
    createdAt: 3,
  }),
];
const settings = { "downloads.concurrency": 2, "downloads.rateLimitKbps": 0, "downloads.maxAttempts": 8 };

function serve(routes: Record<string, unknown> = {}) {
  return fakeServer({
    "GET /api/downloads": { downloads: queue },
    "GET /api/downloads/plan": plan(),
    "GET /api/jobs": { jobs: [] },
    "GET /api/collections": { collections: [] },
    ...routes,
  });
}

/** Figures are tied to their units with no-break spaces; tests read them as ordinary ones. */
const reads = (text: string) => (_: string, node: Element | null) => node?.textContent?.replace(/\u00a0/g, " ") === text;
/** The JSON body of the last request made with `method` to `path`. */
function sent(method: string, path: string): unknown {
  const call = vi.mocked(fetch).mock.calls.findLast(([input, init]) => String(input).startsWith(path) && init?.method === method);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}
const planSection = async () => (await screen.findByRole("heading", { name: "The plan" })).closest("section") as HTMLElement;

describe("The download plan", () => {
  it("states the plan in a sentence built from the real numbers", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(
      section.getByText(reads("3 downloads, 4.20 GB to go. At the present speed they will finish in about 1 hour 10 minutes.")),
    ).toBeInTheDocument();
    expect(section.getByText(/^That is about /)).toBeInTheDocument();
  });

  it("draws a schedule whose rows lead to each download's details, with the same numbers in a table", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(section.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(section.getByRole("link", { name: "Details of Wikibooks" })).toHaveAttribute("href", "/downloads/next");
    expect(section.getByText("1.20 GB left")).toBeInTheDocument();
    const table = within(section.getByRole("table", { name: "The download schedule, in the order downloads will run" }));
    const row = within(table.getByRole("row", { name: /^Wikibooks/ }));
    expect(row.getByText("Waiting for its turn")).toBeInTheDocument();
    // Just before midnight both moments fall on the next day, and are worded so.
    expect(row.getByText(/^In about 20 minutes, (at|tomorrow at) \d\d:\d\d$/)).toBeInTheDocument();
    expect(row.getByText(/^About (tomorrow at )?\d\d:\d\d, in 45 minutes$/)).toBeInTheDocument();
    expect(within(table.getByRole("row", { name: /^Best of Wikipedia/ })).getByText("Now")).toBeInTheDocument();
  });

  it("lists what cannot be timed with the reason instead of a bar", async () => {
    serve({
      "GET /api/downloads/plan": plan({
        unknownSizes: 1,
        finishesInSeconds: null,
        counts: { active: 1, waiting: 1, paused: 1, failed: 0 },
        queue: [
          planItem({ id: "run", title: "Best of Wikipedia", totalBytes: null, remainingBytes: null, finishesInSeconds: null }),
          planItem({ id: "next", title: "Wikibooks", state: "queued", phase: "waiting", startsInSeconds: null, finishesInSeconds: null }),
          planItem({
            id: "last",
            title: "iFixit repair guides",
            state: "paused",
            phase: "paused",
            startsInSeconds: null,
            finishesInSeconds: null,
          }),
        ],
      }),
    });
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(section.getAllByText("Size not known yet").length).toBeGreaterThan(0);
    expect(section.getAllByText("Behind a download whose size is not known").length).toBeGreaterThan(0);
    expect(section.getAllByText("Paused").length).toBeGreaterThan(0);
    expect(
      section.getByText(
        reads("1 download, 4.20 GB to go, plus 1 whose size is not known yet. A finish time cannot be given until every size is known."),
      ),
    ).toBeInTheDocument();
  });

  it("says where each waiting download stands and when it should finish", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    const progress = within((await screen.findByRole("heading", { name: "In progress" })).closest("section") as HTMLElement);
    expect(await progress.findByText("Next")).toBeInTheDocument();
    expect(progress.getByText("2nd in line")).toBeInTheDocument();
    expect(progress.getAllByText(/^Finishes about /)).toHaveLength(3);
    expect(progress.getByRole("link", { name: "Details of Best of Wikipedia" })).toHaveAttribute("href", "/downloads/run");
  });

  it("gives no forecast to a download waiting for a connection", async () => {
    const offline = download({
      id: "next",
      title: "Wikibooks",
      state: "queued",
      error: "No connection. This download will resume when the network is back.",
      errorKind: "offline",
      bytesPerSecond: null,
      etaSeconds: null,
    });
    serve({ "GET /api/downloads": { downloads: [queue[0], offline] } });
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(section.getAllByText("Waiting for a connection").length).toBeGreaterThan(0);
    const progress = within(screen.getByRole("heading", { name: "In progress" }).closest("section") as HTMLElement);
    expect(progress.getAllByText(/^Finishes about /)).toHaveLength(1);
    expect(progress.queryByText("Next")).not.toBeInTheDocument();
  });

  it("saves a speed limit chosen from the presets and says it is in force", async () => {
    serve({ "PATCH /api/settings": { settings: { ...settings, "downloads.rateLimitKbps": 500 } } });
    renderScreen(<DownloadsPage />);
    await planSection();
    await userEvent.click(screen.getByRole("combobox", { name: "Speed limit" }));
    await userEvent.click(await screen.findByRole("option", { name: /^500 kB\/s/ }));
    await waitFor(() => expect(sent("PATCH", "/api/settings")).toEqual({ "downloads.rateLimitKbps": 500 }));
    expect(
      await screen.findByText("Saved. Downloads are limited to 500 kB/s, 4 Mbit/s; transfers already running have slowed to it."),
    ).toBeInTheDocument();
  });

  it("takes a typed limit with its unit, and refuses one that makes no sense", async () => {
    serve({ "PATCH /api/settings": { settings: { ...settings, "downloads.rateLimitKbps": 1500 } } });
    renderScreen(<DownloadsPage />);
    await planSection();
    await userEvent.click(screen.getByRole("combobox", { name: "Speed limit" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Other/ }));
    const field = await screen.findByLabelText("Limit downloads to");
    await userEvent.click(screen.getByRole("button", { name: "Set limit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Type a speed.");
    expect(sent("PATCH", "/api/settings")).toBeUndefined();
    await userEvent.type(field, "1.5");
    await userEvent.click(screen.getByRole("radio", { name: "MB/s" }));
    expect(screen.getByText("That is 1.5 MB/s, 12 Mbit/s, shared by every transfer.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set limit" }));
    await waitFor(() => expect(sent("PATCH", "/api/settings")).toEqual({ "downloads.rateLimitKbps": 1500 }));
    await waitFor(() => expect(screen.queryByLabelText("Limit downloads to")).not.toBeInTheDocument());
  });

  it("changes how many run at once, within 1 to 8", async () => {
    serve({ "PATCH /api/settings": { settings: { ...settings, "downloads.concurrency": 3 } } });
    renderScreen(<DownloadsPage />);
    await planSection();
    await userEvent.click(screen.getByRole("button", { name: "Run one more at once" }));
    await waitFor(() => expect(sent("PATCH", "/api/settings")).toEqual({ "downloads.concurrency": 3 }));
    expect(await screen.findByText("Saved. Downloads run 3 transfers together.")).toBeInTheDocument();
  });

  it("stops the stepper at its ends", async () => {
    serve({ "GET /api/downloads/plan": plan({ concurrency: 1 }) });
    renderScreen(<DownloadsPage />);
    await planSection();
    expect(screen.getByRole("button", { name: "Run one fewer at once" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run one more at once" })).toBeEnabled();
    expect(screen.getByText("transfer at a time")).toBeInTheDocument();
  });

  it("pauses the whole queue", async () => {
    const server = serve({ "POST /api/downloads/pause-all": { paused: 3 } });
    renderScreen(<DownloadsPage />);
    await planSection();
    expect(screen.queryByRole("button", { name: "Resume all" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pause all" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/downloads/pause-all"));
  });

  it("describes a queue that is only paused, and offers to resume it", async () => {
    const paused = queue.map((item) => ({ ...item, state: "paused" as const, bytesPerSecond: null, etaSeconds: null }));
    const server = serve({
      "GET /api/downloads": { downloads: paused },
      "GET /api/downloads/plan": plan({
        basis: null,
        bytesPerSecond: null,
        assumedBytesPerSecond: null,
        remainingBytes: 0,
        finishesInSeconds: null,
        counts: { active: 0, waiting: 0, paused: 3, failed: 0 },
        queue: plan().queue.map((item) => ({
          ...item,
          state: "paused" as const,
          phase: "paused" as const,
          startsInSeconds: null,
          finishesInSeconds: null,
        })),
      }),
      "POST /api/downloads/resume-all": { resumed: 3 },
    });
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(
      section.getByText(reads("3 downloads paused, 4.20 GB still to fetch. Nothing will arrive until they are resumed.")),
    ).toBeInTheDocument();
    expect(section.queryByRole("heading", { name: "Speed now" })).not.toBeInTheDocument();
    expect(section.queryByRole("heading", { name: "Schedule" })).not.toBeInTheDocument();
    expect(section.getByRole("heading", { name: "Where it will go" })).toBeInTheDocument();
    expect(section.queryByRole("button", { name: "Pause all" })).not.toBeInTheDocument();
    await userEvent.click(section.getByRole("button", { name: "Resume all" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/downloads/resume-all"));
  });

  it("shows where the queue will land and how much is left afterwards", async () => {
    serve();
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(section.getByRole("heading", { name: "Where it will go" })).toBeInTheDocument();
    expect(
      section.getByRole("img", { name: "Internal storage: 440 GB used now, 4.20 GB arriving, 55.8 GB free afterwards" }),
    ).toBeInTheDocument();
    expect(section.getByText("arriving")).toBeInTheDocument();
    expect(section.queryByText("This will not fit.")).not.toBeInTheDocument();
  });

  it("says plainly when the queue will not fit, with the shortfall", async () => {
    serve({
      "GET /api/downloads/plan": plan({
        locations: [planLocation({ name: "USB drive", freeBytes: 1_000_000_000, freeAfterBytes: -3_200_000_000, enough: false })],
      }),
    });
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(section.getByText("This will not fit.")).toBeInTheDocument();
    expect(section.getByText("3.20 GB")).toBeInTheDocument();
  });

  it("starts the speed chart empty and says it is collecting", async () => {
    serve({ "GET /api/downloads/plan": plan({ rateLimitBytesPerSecond: 500_000 }) });
    renderScreen(<DownloadsPage />);
    const section = within(await planSection());
    expect(section.getByRole("heading", { name: "Speed now" })).toBeInTheDocument();
    expect(section.getByText("Collecting readings…")).toBeInTheDocument();
    expect(section.getByRole("group", { name: /^Total download speed over the last 1 min\. Chart/ })).toBeInTheDocument();
  });

  it("keeps the speed limit and the stepper within reach when nothing is queued", async () => {
    serve({
      "GET /api/downloads": { downloads: [download({ id: "done", title: "Vikidia", state: "completed", finishedAt: 7 })] },
      "GET /api/downloads/plan": plan({
        queue: [],
        counts: { active: 0, waiting: 0, paused: 0, failed: 0 },
        remainingBytes: 0,
        finishesInSeconds: null,
        basis: null,
      }),
    });
    renderScreen(<DownloadsPage />);
    const progress = within((await screen.findByRole("heading", { name: "In progress" })).closest("section") as HTMLElement);
    expect(await progress.findByRole("combobox", { name: "Speed limit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Schedule" })).not.toBeInTheDocument();
    expect(progress.queryByRole("button", { name: "Pause all" })).not.toBeInTheDocument();
  });

  it("still lists the downloads when the plan cannot be loaded", async () => {
    serve({ "GET /api/downloads/plan": { status: 500, error: { code: "internal", message: "The plan could not be worked out." } } });
    renderScreen(<DownloadsPage />);
    expect(await screen.findByText("The plan could not be worked out.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByText("412 MB of 1.90 GB")).toBeInTheDocument();
  });

  it("forecasts the tasks running beside the downloads, from their own progress", async () => {
    const task = (over: Partial<JobDto>): JobDto => ({
      id: "t1",
      type: "semantic.index",
      queue: "index",
      state: "running",
      title: "Build semantic search index",
      subject: null,
      progress: { current: 1200, total: 6000, message: null, unit: "passages", ratePerSecond: 4 },
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
    serve({
      "GET /api/jobs": ({ url }: { url: URL }) =>
        url.searchParams.get("active") === "true"
          ? {
              jobs: [
                task({}),
                task({
                  id: "t2",
                  type: "import.analyse",
                  title: "Looking through handbook.zip",
                  progress: { current: 3, total: 12, message: null, unit: "files", ratePerSecond: null },
                }),
                task({
                  id: "t3",
                  type: "document.ocr",
                  state: "queued",
                  title: "Reading scanned pages",
                  progress: { current: 0, total: null, message: null },
                }),
                task({ id: "t0", type: "download.run", title: "Download Best of Wikipedia" }),
              ],
            }
          : { jobs: [] },
    });
    renderScreen(<DownloadsPage />);
    const tasks = within((await screen.findByRole("heading", { name: "Tasks alongside" })).closest("section") as HTMLElement);
    // 4,800 passages left at 240 a minute: 20 minutes.
    const index = within(tasks.getByRole("listitem", { name: /^Building search by meaning/ }));
    expect(index.getByText("1,200 of 6,000 passages")).toBeInTheDocument();
    expect(index.getByText(/^Finishes about (tomorrow at )?\d\d:\d\d, in about 20 minutes$/)).toBeInTheDocument();
    const reading = within(tasks.getByRole("listitem", { name: /^Looking through an import/ }));
    expect(reading.getByText("3 of 12 files")).toBeInTheDocument();
    expect(reading.getByText("No time yet: it has only just started")).toBeInTheDocument();
    expect(within(tasks.getByRole("listitem", { name: /^Reading scanned pages/ })).getByText("Waiting for its turn")).toBeInTheDocument();
    // A download is in the plan above already, not again here.
    expect(tasks.queryByText(/Best of Wikipedia/)).not.toBeInTheDocument();
    expect(tasks.getByRole("link", { name: "Building search by meaning" })).toHaveAttribute("href", "/downloads/tasks/t1");
  });
});
