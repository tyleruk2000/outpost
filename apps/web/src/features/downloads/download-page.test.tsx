import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DownloadPage from "./download-page";
import {
  adminSession,
  collection,
  detail,
  download,
  fakeServer,
  installBrowserStubs,
  memberSession,
  plan,
  planItem,
  renderScreen,
} from "./test-support";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

function serve(routes: Record<string, unknown> = {}) {
  return fakeServer({
    "GET /api/downloads/d1": detail(),
    "GET /api/downloads": { downloads: [download()] },
    "GET /api/downloads/plan": plan({ queue: [planItem({ id: "d1" })], counts: { active: 1, waiting: 0, paused: 0, failed: 0 } }),
    "GET /api/collections": { collections: [collection({ id: "c1" })] },
    "GET /api/auth/session": adminSession,
    ...routes,
  });
}

const show = () =>
  renderScreen(
    <Routes>
      <Route path="/downloads/:id" element={<DownloadPage />} />
      <Route path="/downloads" element={<h1>The downloads list</h1>} />
    </Routes>,
    "/downloads/d1",
  );
const part = async (name: string) => (await screen.findByRole("heading", { name })).closest("section") as HTMLElement;

describe("Download details", () => {
  it("heads the screen with the title, the state in words and the way back", async () => {
    serve();
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Wikipedia 100" })).toBeInTheDocument();
    expect(screen.getByText("Downloading")).toBeInTheDocument();
    expect(screen.getByText(/Reference collection/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Downloads" })).toHaveAttribute("href", "/downloads");
  });

  it("shows where it stands now with real bytes, a forecast and the controls", async () => {
    const server = serve({
      "POST /api/downloads/d1/pause": { download: download({ state: "paused", bytesPerSecond: null, etaSeconds: null }) },
    });
    show();
    const now = within(await part("Now"));
    expect(now.getByText("412 MB of 1.90 GB")).toBeInTheDocument();
    expect(now.getByText("2.10 MB/s, 4 minutes left")).toBeInTheDocument();
    expect(now.getByRole("progressbar", { name: "Progress of Wikipedia 100" })).toBeInTheDocument();
    expect(await now.findByText("in 20 minutes")).toBeInTheDocument();
    expect(now.getByText("Finishes").nextElementSibling).toHaveTextContent(/^about \d\d:\d\din 20 minutes$/);
    expect(now.getByText("17 Mbit/s")).toBeInTheDocument();
    await userEvent.click(now.getByRole("button", { name: "Pause Wikipedia 100" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/downloads/d1/pause"));
  });

  it("says where a waiting download stands in the queue and when it should start", async () => {
    const waiting = download({ state: "queued", receivedBytes: 0, bytesPerSecond: null, etaSeconds: null });
    serve({
      "GET /api/downloads/d1": detail({ download: waiting }),
      "GET /api/downloads": { downloads: [waiting] },
      "GET /api/downloads/plan": plan({
        queue: [
          planItem({ id: "other" }),
          planItem({ id: "d1", state: "queued", phase: "waiting", startsInSeconds: 720, finishesInSeconds: 3000 }),
        ],
      }),
    });
    show();
    const now = within(await part("Now"));
    expect(await now.findByText("Next")).toBeInTheDocument();
    expect(now.getByText("in 12 minutes")).toBeInTheDocument();
    expect(now.getByText("in 50 minutes")).toBeInTheDocument();
  });

  it("counts down to the next attempt while waiting to retry, and promises no finish time", async () => {
    const stalled = download({
      state: "queued",
      error: "No connection. This download will resume when the network is back.",
      errorKind: "offline",
      bytesPerSecond: null,
      etaSeconds: null,
    });
    serve({
      "GET /api/downloads/d1": detail({ download: stalled, attempts: { made: 2, allowed: 8, nextAttemptAt: Date.now() + 40_000 } }),
      "GET /api/downloads": { downloads: [stalled] },
      "GET /api/downloads/plan": plan({
        queue: [planItem({ id: "d1", state: "queued", phase: "waiting", startsInSeconds: 0, finishesInSeconds: 3000 })],
      }),
    });
    show();
    const now = within(await part("Now"));
    expect(screen.getByText("Waiting for a connection")).toBeInTheDocument();
    expect(now.getByText("No connection. This download will resume when the network is back.")).toBeInTheDocument();
    expect(now.getByRole("timer")).toHaveTextContent(/^Attempt 3 of 8, in (40|39) seconds\. It carries on from where it stopped\.$/);
    expect(now.queryByText("Finishes")).not.toBeInTheDocument();
  });

  it("draws the speed history with its average and peak, and the same numbers as a table", async () => {
    const start = new Date(2026, 10, 15, 18, 40, 0).getTime();
    serve({
      "GET /api/downloads/d1": detail({
        speedHistory: Array.from({ length: 90 }, (_, index) => ({
          at: start + index * 1000,
          bytesPerSecond: index < 60 ? 250_000 : 400_000,
        })),
        timing: { createdAt: 1, startedAt: 2, finishedAt: null, averageBytesPerSecond: 300_000, peakBytesPerSecond: 400_000 },
        rateLimitBytesPerSecond: 500_000,
      }),
    });
    show();
    const speed = within(await part("Speed over time"));
    expect(speed.getByText(/^Average/)).toHaveTextContent("Average 300 kB/s, peak 400 kB/s over the 1 minute from 18:40:00 to 18:41:29.");
    expect(speed.getByText("All downloads together are limited to 500 kB/s.")).toBeInTheDocument();
    expect(speed.getByRole("group", { name: /^Speed of this download from 18:40:00 to 18:41:29\. Chart/ })).toBeInTheDocument();
    const rows = within(speed.getByRole("table", { name: "Speed of this download, averaged over each 30 seconds" })).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual(["TimeSpeed", "at 18:40:00250 kB/s", "at 18:40:30250 kB/s", "at 18:41:00400 kB/s"]);
  });

  it("reads the chart from the keyboard", async () => {
    const start = new Date(2026, 10, 15, 18, 40, 0).getTime();
    serve({
      "GET /api/downloads/d1": detail({
        speedHistory: [0, 1, 2].map((index) => ({ at: start + index * 1000, bytesPerSecond: 100_000 * (index + 1) })),
      }),
    });
    show();
    const speed = within(await part("Speed over time"));
    const chart = speed.getByRole("group", { name: /^Speed of this download/ });
    chart.focus();
    expect(await speed.findAllByText("300 kB/s")).not.toHaveLength(0);
    await userEvent.keyboard("{ArrowLeft}");
    expect(speed.getAllByText("at 18:40:01").length).toBeGreaterThan(0);
    await userEvent.keyboard("{Home}");
    expect(speed.getAllByText("100 kB/s").length).toBeGreaterThan(0);
  });

  it("says so when no speed has been recorded", async () => {
    const done = download({ state: "completed", receivedBytes: 1_900_000_000, collectionId: "c1", finishedAt: 9 });
    serve({ "GET /api/downloads/d1": detail({ download: done }), "GET /api/downloads": { downloads: [done] } });
    show();
    const speed = within(await part("Speed over time"));
    expect(
      speed.getByText("Speed is recorded while a download runs. Nothing has been recorded for this one since the server last started."),
    ).toBeInTheDocument();
  });

  it("tells what happened, oldest first, with the reasons", async () => {
    serve({
      "GET /api/downloads/d1": detail({
        events: [
          { at: 1_794_000_000_000, state: "queued" },
          { at: 1_794_000_002_000, state: "running" },
          { at: 1_794_000_090_000, state: "queued", detail: "No connection. This download will resume when the network is back." },
          { at: 1_794_000_120_000, state: "running" },
        ],
      }),
    });
    show();
    const story = within(await part("What happened"));
    expect(story.getAllByRole("listitem").map((item) => item.querySelector("p > span")?.textContent)).toEqual([
      "Added to the queue",
      "Started",
      "Connection lost — waiting to retry",
      "Carried on",
    ]);
    expect(story.getByText("No connection. This download will resume when the network is back.")).toBeInTheDocument();
  });

  it("folds the middle of a long history away until asked", async () => {
    const events = [
      { at: 1_794_000_000_000, state: "queued" },
      ...Array.from({ length: 20 }, (_, index) => ({
        at: 1_794_000_000_000 + (index + 1) * 60_000,
        state: index % 2 === 0 ? "running" : "paused",
      })),
    ];
    serve({ "GET /api/downloads/d1": detail({ events }) });
    show();
    const story = within(await part("What happened"));
    expect(story.getAllByRole("listitem")).toHaveLength(10);
    await userEvent.click(story.getByRole("button", { name: "Show 12 more steps" }));
    expect(story.getAllByRole("listitem")).toHaveLength(21);
  });

  it("says where the file comes from, and explains a mirror", async () => {
    serve({
      "GET /api/downloads/d1": detail({
        source: {
          requestedUrl: "https://download.example.org/wikipedia_en_100.zim",
          requestedHost: "download.example.org",
          servedBy: "mirror.example.net",
          fetcher: "http",
          etag: '"abc-123"',
          lastModified: null,
        },
      }),
    });
    show();
    const from = within(await part("Where from"));
    expect(from.getByText("download.example.org")).toBeInTheDocument();
    expect(from.getByText("https://download.example.org/wikipedia_en_100.zim")).toBeInTheDocument();
    expect(from.getByText("mirror.example.net")).toBeInTheDocument();
    expect(from.getByText(/Mirrors only carry the bytes; what is trusted is the checksum/)).toBeInTheDocument();
    expect(from.getByText(/A plain download of the whole file/)).toBeInTheDocument();
    expect(from.getByText('"abc-123"')).toBeInTheDocument();
  });

  it("gives a verdict on integrity and copies a checksum", async () => {
    const done = download({ state: "completed", receivedBytes: 1_900_000_000, collectionId: "c1", finishedAt: 9 });
    const sha = "a".repeat(64);
    serve({
      "GET /api/downloads/d1": detail({ download: done, integrity: { sha256Expected: sha, sha256Actual: sha, verified: true } }),
      "GET /api/downloads": { downloads: [done] },
    });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("isSecureContext", true);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    show();
    const integrity = within(await part("Integrity"));
    expect(integrity.getByText("Verified.")).toBeInTheDocument();
    expect(integrity.getAllByText(sha)).toHaveLength(2);
    await userEvent.click(integrity.getByRole("button", { name: "Copy the published checksum" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sha));
    expect(await integrity.findByRole("button", { name: "Copied the published checksum" })).toBeInTheDocument();
  });

  it("says when the source publishes no checksum", async () => {
    serve({ "GET /api/downloads/d1": detail({ integrity: { sha256Expected: null, sha256Actual: null, verified: null } }) });
    show();
    const integrity = within(await part("Integrity"));
    expect(integrity.getByText("No checksum published.")).toBeInTheDocument();
    expect(integrity.getByText(/The file's own checksum is recorded once it arrives\./)).toBeInTheDocument();
    expect(integrity.getByText("None published by the source")).toBeInTheDocument();
  });

  it("says where a finished download went and links to it in the library and in Explore", async () => {
    const done = download({
      state: "completed",
      receivedBytes: 1_900_000_000,
      collectionId: "c1",
      finishedAt: 1_794_000_000_000,
      startedAt: 1_794_000_000_000 - 600_000,
    });
    serve({
      "GET /api/downloads/d1": detail({
        download: done,
        timing: {
          createdAt: 1,
          startedAt: done.startedAt,
          finishedAt: done.finishedAt,
          averageBytesPerSecond: null,
          peakBytesPerSecond: null,
        },
      }),
      "GET /api/downloads": { downloads: [done] },
    });
    show();
    const ended = within(await part("How it ended"));
    expect(ended.getByText("10 minutes")).toBeInTheDocument();
    const to = within(await part("Where to"));
    expect(to.getByText("Internal storage")).toBeInTheDocument();
    expect(to.getByText("Connected")).toBeInTheDocument();
    expect(to.getByText("collections/zim/wikipedia_en_100.zim")).toBeInTheDocument();
    expect(to.getByText("60.0 GB of 500 GB")).toBeInTheDocument();
    expect(await to.findByRole("link", { name: "Open in the library" })).toHaveAttribute("href", "/library/collections/c1");
    expect(to.getByRole("link", { name: "See it in Explore" })).toHaveAttribute("href", "/explore?entry=kiwix.wikipedia-en-100");
  });

  it("shows why a download failed and asks before removing its partial file", async () => {
    const failed = download({
      state: "failed",
      error: "The file is no longer at this address. Refresh the catalogue and try again.",
      errorKind: "not_found",
      bytesPerSecond: null,
      etaSeconds: null,
      finishedAt: 9,
    });
    const server = serve({
      "GET /api/downloads/d1": detail({
        download: failed,
        events: [
          { at: 1, state: "queued" },
          { at: 2, state: "running" },
          { at: 3, state: "failed", detail: failed.error! },
        ],
      }),
      "GET /api/downloads": { downloads: [failed] },
      "DELETE /api/downloads/d1": { ok: true },
    });
    show();
    const ended = within(await part("How it ended"));
    expect(screen.getByText("Failed", { selector: "span.rounded-full" })).toBeInTheDocument();
    expect(ended.getByText("The file is no longer at this address. Refresh the catalogue and try again.")).toBeInTheDocument();
    expect(ended.getByRole("button", { name: "Retry Wikipedia 100" })).toBeInTheDocument();
    await userEvent.click(ended.getByRole("button", { name: "Remove: Wikipedia 100" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(server.calls).not.toContain("DELETE /api/downloads/d1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove and delete the partial file" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/downloads/d1"));
    expect(await screen.findByRole("heading", { name: "The downloads list" })).toBeInTheDocument();
  });

  it("describes the item and, for a map, the region", async () => {
    serve({
      "GET /api/downloads/d1": detail({
        download: download({ kind: "map", title: "Mont Blanc massif" }),
        source: {
          requestedUrl: "https://maps.example.org/planet.pmtiles",
          requestedHost: "maps.example.org",
          servedBy: null,
          fetcher: "pmtiles-extract",
          etag: null,
          lastModified: null,
        },
        about: {
          publisher: "OpenStreetMap contributors",
          license: "ODbL 1.0",
          attribution: "© OpenStreetMap",
          version: "2026-11-01",
          language: "en",
        },
        region: { bbox: [6.8, 45.8, 7.4, 46.2], minZoom: 0, maxZoom: 14, tileType: "vector", sourceBuild: "20261101" },
      }),
      "GET /api/downloads": { downloads: [download({ kind: "map", title: "Mont Blanc massif" })] },
    });
    show();
    const about = within(await part("About this item"));
    expect(about.getByText("OpenStreetMap contributors")).toBeInTheDocument();
    expect(about.getByText("ODbL 1.0")).toBeInTheDocument();
    expect(about.getByText("English")).toBeInTheDocument();
    const region = within(await part("The map region"));
    expect(region.getByText("45.80° N to 46.20° N, 6.80° E to 7.40° E")).toBeInTheDocument();
    expect(region.getByText("Zoom 0 to 14: detailed enough for footpaths and buildings.")).toBeInTheDocument();
    expect(within(await part("Where from")).getByText(/A region cut from a larger map archive/)).toBeInTheDocument();
  });

  it("shows members everything but the controls", async () => {
    serve({ "GET /api/auth/session": memberSession });
    show();
    await part("Now");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Pause|Cancel|Retry|Remove/ })).not.toBeInTheDocument());
    expect(screen.getByText("412 MB of 1.90 GB")).toBeInTheDocument();
  });

  it("says when the download is not listed any more", async () => {
    serve({ "GET /api/downloads/d1": { status: 404, error: { code: "not_found", message: "That download does not exist." } } });
    show();
    expect(await screen.findByRole("heading", { name: "This download is not listed any more" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Downloads" })).toHaveAttribute("href", "/downloads");
  });

  it("offers to try again when the server cannot be reached", async () => {
    serve({
      "GET /api/downloads/d1": {
        status: 503,
        error: { code: "unavailable", message: "The Outpost server is not responding. It may be restarting." },
      },
    });
    show();
    expect(await screen.findByText("The Outpost server is not responding. It may be restarting.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
