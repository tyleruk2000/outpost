import type { BackupDownloaded } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupSection } from "./backup-section";

afterEach(() => vi.unstubAllGlobals());

const EARLIER: BackupDownloaded = {
  at: new Date(2026, 10, 10, 9, 30).getTime(),
  name: "outpost-backup-2026-11-10-09-30.zip",
  bytes: 4_100_000,
};
const NOW: BackupDownloaded = {
  at: new Date(2026, 10, 17, 13, 14).getTime(),
  name: "outpost-backup-2026-11-17-13-14.zip",
  bytes: 5_200_000,
};

function serve(lastDownload: () => BackupDownloaded | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/backup/status")
        return json({
          lastDownload: lastDownload(),
          restorePending: false,
          previousData: [],
          supervised: false,
          right: { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" },
          protection: { on: false, setAt: null, right: { allowed: true, reason: "local" } },
        });
      return json({}, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BackupSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("saving a backup from Settings", () => {
  it("says the file was made, where the browser put it, and what is not in it", async () => {
    let made: BackupDownloaded | null = EARLIER;
    serve(() => made);
    show();
    // What was saved last time is said under the button.
    expect(await screen.findByText(/Last saved 10 Nov 2026/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Download backup/ });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(await screen.findByText(/Making the backup/)).toBeInTheDocument();
    made = NOW;
    const done = (await screen.findByText("Backup made")).closest('[aria-live="polite"]');
    expect(done).toHaveTextContent("outpost-backup-2026-11-17-13-14.zip");
    expect(done).toHaveTextContent(/Downloads/);
    expect(done).toHaveTextContent(/original documents, collections and maps are not in it/);
  }, 10_000);
});
