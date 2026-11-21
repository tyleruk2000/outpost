import type { ExportEstimate, ExportStatus, JobDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportSection } from "./export-section";

afterEach(() => vi.unstubAllGlobals());

const ESTIMATE: ExportEstimate = {
  totalBytes: 12_500_000,
  sections: [
    { id: "notes", label: "Notes", format: "Markdown, with attachments", count: 42, bytes: 2_000_000, leftOut: [] },
    { id: "contacts", label: "Contacts", format: "vCard", count: 0, bytes: 0, leftOut: [] },
    {
      id: "documents",
      label: "Documents",
      format: "The original files",
      count: 3,
      bytes: 10_500_000,
      leftOut: ['2 documents on "NAS", which is not connected. Connect it and export again to include them.'],
    },
  ],
};

const job = (patch: Partial<JobDto>): JobDto => ({
  id: "job1",
  type: "export-all.run",
  queue: "export",
  state: "succeeded",
  title: "Export everything",
  subject: "export-all",
  progress: { current: 0, total: null, message: null },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 1,
  result: null,
  createdAt: Date.now(),
  startedAt: Date.now(),
  finishedAt: Date.now(),
  updatedAt: Date.now(),
  ...patch,
});

function serve(estimate: ExportEstimate, latest: () => JobDto | null) {
  const posted: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/export-all/estimate") return json(estimate);
      if (url.pathname === "/api/export-all" && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json({ job: job({ state: "running", progress: { current: 1, total: 4, message: "Adding notes" } }) });
      }
      if (url.pathname === "/api/export-all") return json({ latest: latest() } satisfies ExportStatus);
      if (url.pathname === "/api/storage/locations") return json({ locations: [] });
      return json({}, 404);
    }),
  );
  return posted;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExportSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("taking everything out", () => {
  it("says how large it will be and what is left out, then starts it", async () => {
    const posted = serve(ESTIMATE, () => null);
    show();
    expect(await screen.findByText("12.5 MB")).toBeInTheDocument();
    expect(screen.getByText(/^42 · 2(\.0+)? MB$/)).toBeInTheDocument();
    // A part with nothing in it is not listed.
    expect(screen.queryByText(/^Contacts/)).not.toBeInTheDocument();
    expect(screen.getByText(/which is not connected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Export everything/ }));
    expect(await screen.findByText("Adding notes")).toBeInTheDocument();
    expect(posted).toEqual([{ destination: { kind: "download" } }]);
  });

  it("offers the last export's file for downloading", async () => {
    serve(ESTIMATE, () =>
      job({
        result: {
          name: "outpost-export-2026-11-21-10-00.zip",
          sizeBytes: 9_000_000,
          destination: "download",
          downloadable: true,
          sections: [],
          leftOut: [],
        },
      }),
    );
    show();
    const link = await screen.findByRole("link", { name: /Download/ });
    expect(link).toHaveAttribute("href", "/api/export-all/job1/download");
    expect(screen.getByRole("button", { name: /Remove from the server/ })).toBeInTheDocument();
  });

  it("says when there is nothing to take out yet", async () => {
    serve({ totalBytes: 0, sections: [{ ...ESTIMATE.sections[1]! }] }, () => null);
    show();
    expect(await screen.findByText(/nothing of yours to take out yet/)).toBeInTheDocument();
  });

  it("says when the estimate cannot be had", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "internal", message: "Broken." } }), { status: 500 })),
    );
    show();
    expect((await screen.findAllByRole("button", { name: /try again/i })).length).toBeGreaterThan(0);
  });
});
