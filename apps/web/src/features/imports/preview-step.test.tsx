import type { ImportAnalysis, ImportDto, ImportItem } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewStep } from "./preview-step";

const page = (path: string, title: string, change: Partial<ImportItem> = {}): ImportItem => ({
  path,
  kind: "page",
  title,
  parentPath: null,
  sizeBytes: 100,
  importKey: `path:${path}`,
  warnings: [],
  format: "markdown",
  ...change,
});

const before = (noteId: string, title: string) => ({ noteId, title, reason: "imported-before" as const });

function analysis(change: Partial<ImportAnalysis> = {}): ImportAnalysis {
  const items = [
    page("Trip.md", "Trip plan", { duplicateOf: before("n1", "Trip plan") }),
    page("Trip/Packing.md", "Packing list", { parentPath: "Trip.md", duplicateOf: before("n2", "Packing list") }),
    page("Trip/Route.md", "Route", {
      parentPath: "Trip.md",
      warnings: ['The link to "x.md" is kept as plain text, because nothing in this import matches it.'],
    }),
    page("Knots.md", "Knots", { duplicateOf: { noteId: "n9", title: "Knots", reason: "same-content" } }),
  ];
  return {
    source: "notion",
    items,
    totals: { pages: 4, databases: 0, attachments: 0, documents: 0, skipped: 0, ignored: 0, bytes: 400, importedBefore: 2, sameContent: 1 },
    unsupported: [{ kind: "equation", count: 2, example: "Trip.md" }],
    converted: [{ kind: "callout", count: 1, example: "Trip.md" }],
    problems: [],
    warnings: 1,
    ...change,
  };
}

function dto(plan: ImportAnalysis): ImportDto {
  return {
    id: "imp1",
    kind: "notion",
    state: "ready",
    originalName: "Export.zip",
    sizeBytes: 400,
    error: null,
    createdAt: 0,
    completedAt: null,
    analysis: plan,
    options: null,
    report: null,
    job: null,
    canRetry: false,
  };
}

/** Renders the step against a server that records what it is asked to do. */
function renderStep(plan = analysis()) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      requests.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ import: { ...dto(plan), state: "importing" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PreviewStep dto={dto(plan)} analysis={plan} onDiscarded={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe("the import preview", () => {
  it("says what the upload is and shows the pages as a tree", () => {
    renderStep();
    expect(screen.getByRole("heading", { name: "Export.zip" })).toBeInTheDocument();
    expect(screen.getByText(/A Notion export:/)).toHaveTextContent(
      "A Notion export: 4 pages, 400 bytes in all. 3 of these pages are already in your notes.",
    );
    const tree = screen.getByRole("list", { name: "Pages in this upload" });
    expect(within(tree).getByText("Packing list")).toBeInTheDocument();
    expect(within(tree).getByText("1 warning")).toBeInTheDocument();
    expect(screen.getByText("2 equations")).toBeInTheDocument();
    expect(screen.getByText(/Recognised and kept as they are: 1 callout\./)).toBeInTheDocument();
  });

  it("closes and opens a page's sub-pages from the keyboard", async () => {
    renderStep();
    const toggle = screen.getByRole("button", { name: "Hide the 2 pages inside Trip plan" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("Packing list")).not.toBeInTheDocument();
    expect(screen.getByText("2 pages inside")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the 2 pages inside Trip plan" }));
    expect(screen.getByText("Packing list")).toBeInTheDocument();
  });

  it("leaves existing pages alone by default and imports only the new one", async () => {
    const requests = renderStep();
    expect(screen.getByRole("radio", { name: /Leave them as they are/ })).toBeChecked();
    expect(screen.getAllByText("Already here")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Import 1 page" }));
    expect(requests).toEqual([
      {
        url: "/api/imports/imp1/commit",
        method: "POST",
        body: { parentId: null, duplicates: "skip", pdfs: "library", replaceConfirmed: false },
      },
    ]);
  });

  it("will not replace existing pages until the box naming how many is ticked", async () => {
    const requests = renderStep();
    await userEvent.click(screen.getByRole("radio", { name: /Replace them with the imported versions/ }));

    const submit = screen.getByRole("button", { name: "Import 3 pages" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Tick the box to confirm that 2 existing pages will be overwritten.");
    // The tree shows which pages are at stake; the one written by hand is not among them.
    expect(screen.getAllByText("Will be overwritten")).toHaveLength(2);
    expect(screen.getAllByText("Already here")).toHaveLength(1);
    await userEvent.click(submit);
    expect(requests).toEqual([]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Yes, overwrite 2 existing pages" }));
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(requests).toEqual([
      {
        url: "/api/imports/imp1/commit",
        method: "POST",
        body: { parentId: null, duplicates: "replace", pdfs: "library", replaceConfirmed: true },
      },
    ]);
  });

  it("withdraws the confirmation when the choice changes", async () => {
    renderStep();
    await userEvent.click(screen.getByRole("radio", { name: /Replace them/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Yes, overwrite/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Import them again as copies/ }));
    expect(screen.queryByRole("checkbox", { name: /Yes, overwrite/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 4 pages" })).toBeEnabled();

    await userEvent.click(screen.getByRole("radio", { name: /Replace them/ }));
    expect(screen.getByRole("checkbox", { name: /Yes, overwrite/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Import 3 pages" })).toBeDisabled();
  });

  it("does not offer replace when no page came from an earlier import", () => {
    const plan = analysis();
    plan.items = plan.items.filter((item) => item.duplicateOf?.reason !== "imported-before");
    plan.totals = { ...plan.totals, pages: 2, importedBefore: 0 };
    renderStep(plan);
    expect(screen.getByRole("radio", { name: /Replace them/ })).toBeDisabled();
    expect(screen.getByText(/pages you wrote yourself are never overwritten/)).toBeInTheDocument();
  });

  it("shows the server's reason and no way forward when the upload holds nothing to import", () => {
    renderStep(
      analysis({
        items: [],
        totals: { ...analysis().totals, pages: 0, importedBefore: 0, sameContent: 0 },
        problems: ["Nothing in this upload can be imported."],
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing in this upload can be imported.");
    expect(screen.getByRole("button", { name: "Nothing to import" })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Pages in this upload" })).not.toBeInTheDocument();
  });

  it("asks before discarding, and says what is and is not removed", async () => {
    const requests = renderStep();
    await userEvent.click(screen.getByRole("button", { name: "Discard this upload" }));
    const dialog = screen.getByRole("alertdialog", { name: "Discard “Export.zip”?" });
    expect(dialog).toHaveTextContent("Nothing was added to your notes, and the file on your own device is not touched.");
    expect(requests).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Discard upload" }));
    expect(requests).toEqual([{ url: "/api/imports/imp1", method: "DELETE", body: undefined }]);
  });
});
