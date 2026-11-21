import type { UpdateStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateSection } from "./update-section";

const local = { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" } as const;
const remote = { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" } as const;

const status = (change: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: "0.1.0",
  install: "docker-helper",
  keyed: true,
  checkUrl: "https://example.org/releases",
  latest: null,
  staged: null,
  lastResult: null,
  waiting: null,
  active: null,
  right: local,
  ...change,
});

const staged = {
  release: "0.2.0",
  publishedAt: "2026-12-01T00:00:00Z",
  notes: "A new screen.",
  platform: "linux/arm64",
  image: "outpost:0.2.0",
  bytes: 210_000_000,
  sha256: "a".repeat(64),
  signedComment: "outpost 0.2.0",
  stagedAt: 1,
  source: "upload" as const,
};

let requests: string[] = [];
function serve(first: UpdateStatus, after?: UpdateStatus) {
  requests = [];
  let current = first;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (method !== "GET") {
        requests.push(`${method} ${url.pathname}`);
        current = after ?? current;
      }
      if (url.pathname === "/api/update/status" || url.pathname === "/api/update/check") return json(current);
      if (url.pathname === "/api/update/files") return json({ files: [] });
      return json({ job: { id: "j" } });
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UpdateSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.findByRole("region", { name: "Updates" });
}

afterEach(() => vi.unstubAllGlobals());

describe("updates in Settings", () => {
  it("says plainly what each kind of installation can do", async () => {
    serve(status({ install: "docker" }));
    const section = await show();
    expect(await within(section).findByText(/A container cannot replace itself/)).toBeVisible();
  });

  it("says when this build cannot check releases, and offers nothing to install", async () => {
    serve(status({ keyed: false }));
    const section = await show();
    expect(await within(section).findByText("Releases cannot be checked yet")).toBeVisible();
    expect(within(section).queryByRole("button", { name: /Check for a newer version/ })).toBeNull();
  });

  it("checks the release page only when pressed, and installs a checked release only after asking", async () => {
    serve(status({ staged }));
    const section = await show();
    expect(await within(section).findByText(/is checked and ready/)).toBeVisible();
    expect(requests).toEqual([]);
    await userEvent.click(within(section).getByRole("button", { name: "Check for a newer version" }));
    expect(requests).toEqual(["POST /api/update/check"]);

    await userEvent.click(within(section).getByRole("button", { name: "Install 0.2.0" }));
    const asking = await screen.findByRole("alertdialog", { name: "Install Outpost 0.2.0?" });
    expect(asking).toHaveTextContent("A backup is made first");
    await userEvent.click(within(asking).getByRole("button", { name: "Back up and install" }));
    expect(requests).toEqual(["POST /api/update/check", "POST /api/update/apply"]);
  });

  it("on another device shows the version and offers no installing", async () => {
    serve(status({ staged, right: remote }));
    const section = await show();
    expect(await within(section).findByText(/offered at the computer Outpost runs on/)).toBeVisible();
    expect(within(section).queryByRole("button", { name: "Install 0.2.0" })).toBeNull();
    expect(within(section).queryByRole("button", { name: /Choose a file/ })).toBeNull();
  });

  it("reports an update that was undone, with the backup from before to restore", async () => {
    serve(
      status({
        lastResult: {
          at: 1,
          outcome: "rolled-back",
          release: "0.2.0",
          message: "It did not report healthy.",
          backupName: "before-0.2.0.zip",
        },
      }),
    );
    const section = await show();
    expect(await within(section).findByText("The update to 0.2.0 was undone")).toBeVisible();
    await userEvent.click(within(section).getByRole("button", { name: "Restore the backup from before" }));
    expect(requests).toEqual(["POST /api/update/restore-before"]);
  });
});
