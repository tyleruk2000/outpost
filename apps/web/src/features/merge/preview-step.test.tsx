import type { MergeAnalysis } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analysis, merge } from "./merge-fixtures";
import { PreviewStep } from "./preview-step";
import { ReportStep } from "./report-step";

const compared = {
  key: "page:anchorages",
  home: {
    title: "Anchorages",
    updatedAt: Date.UTC(2026, 10, 12),
    fields: [{ label: "Tags", value: "pilotage" }],
    text: "Shelter from the west.\nGood holding in sand.",
    truncatedAt: null,
  },
  drive: {
    title: "Anchorages",
    updatedAt: Date.UTC(2026, 10, 9),
    fields: [],
    text: "Shelter from the west.\nPoor holding in the north bay.",
    truncatedAt: null,
  },
};

/** Renders the preview against a server that records what it is asked to do. */
function renderPreview(plan: MergeAnalysis = analysis()) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      requests.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      const body = url.includes("/compare") ? compared : { merge: merge(plan, { state: "merging" }) };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PreviewStep dto={merge(plan)} analysis={plan} onDiscarded={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe("the preview of a drive's changes", () => {
  it("lists what changed in groups with counts, and says nothing has been done yet", () => {
    renderPreview();
    expect(screen.getByRole("heading", { name: "What changed on TRAVEL/Outpost" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been changed yet, here or on the drive/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changed on both sides 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New on the drive 3" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Removed on the drive 2" })).toBeInTheDocument();
    const added = screen.getByRole("list", { name: "New on the drive" });
    expect(within(added).getByText("Pilot notes")).toBeInTheDocument();
    expect(within(added).getByText("2.40 MB")).toBeInTheDocument();
    expect(within(added).getByText("In Trip notes")).toBeInTheDocument();
    // What cannot come says why, and has nothing to tick.
    const blocked = screen.getByRole("list", { name: "Cannot be brought back" });
    expect(within(blocked).getByText(/larger than a page can be/)).toBeInTheDocument();
    expect(within(blocked).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("56 things are the same on the drive and at home.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download a backup" })).toHaveAttribute("href", "/api/backup/download");
  });

  it("starts from the safe defaults: new things ticked, conflicts keep both, nothing removed, nothing large copied", async () => {
    const requests = renderPreview();
    expect(screen.getByRole("checkbox", { name: "Trip notes" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Kit list" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Old plans" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Knots" })).not.toBeChecked();
    const anchorages = screen.getByRole("radiogroup", { name: "What to do with “Anchorages”" });
    expect(within(anchorages).getByRole("radio", { name: "Keep both" })).toBeChecked();
    expect(screen.getByText("Keeps both versions of 1 page and 1 saved place.")).toBeInTheDocument();
    expect(screen.getAllByText("Stays at home.")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Bring back 7 changes" }));
    expect(requests).toEqual([{ url: "/api/merge/m1/commit", method: "POST", body: { choices: {}, deletionsConfirmed: false } }]);
  });

  it("lets each conflict be decided on its own, or all at once", async () => {
    const requests = renderPreview();
    const anchorages = screen.getByRole("radiogroup", { name: "What to do with “Anchorages”" });
    await userEvent.click(within(anchorages).getByRole("radio", { name: "Use the drive’s" }));
    expect(screen.getByText("Updates 2 pages. What each was is kept in the record.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep home’s" }));
    expect(within(anchorages).getByRole("radio", { name: "Keep home’s" })).toBeChecked();
    expect(
      within(screen.getByRole("radiogroup", { name: "What to do with “Harbour”" })).getByRole("radio", { name: "Keep home’s" }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Bring back 5 changes" }));
    expect(requests.at(-1)!.body).toEqual({ choices: { "page:anchorages": "home", "place:harbour": "home" }, deletionsConfirmed: false });
  });

  it("shows both versions of a conflict side by side, saying which lines differ", async () => {
    const requests = renderPreview();
    const list = screen.getByRole("list", { name: "Changed on both sides" });
    const [open] = within(list).getAllByRole("button", { name: "Compare the two versions" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(open!);
    expect(requests).toEqual([{ url: "/api/merge/m1/compare?key=page%3Aanchorages", method: "GET", body: undefined }]);
    const home = await screen.findByRole("region", { name: "At home" });
    const drive = screen.getByRole("region", { name: "On the drive" });
    expect(within(home).getByText("Good holding in sand.")).toBeInTheDocument();
    expect(within(home).getByText("pilotage")).toBeInTheDocument();
    expect(within(drive).getByText("Poor holding in the north bay.")).toBeInTheDocument();
    expect(within(home).getByText("1 line on a tinted ground is only in this version.")).toBeInTheDocument();
    // The difference is said, not only coloured.
    expect(within(drive).getByText("Only here:")).toBeInTheDocument();
    expect(within(drive).getAllByText("Only here:")).toHaveLength(1);
  });

  it("asks again, by name, before removing anything at home", async () => {
    const requests = renderPreview();
    await userEvent.click(screen.getByRole("checkbox", { name: "Old plans" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Charts" }));
    expect(screen.getByText("Will go to the trash here too.")).toBeInTheDocument();
    expect(screen.getByText("Will be removed here too.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bring back 9 changes" }));
    expect(requests).toEqual([]);

    const dialog = screen.getByRole("alertdialog", { name: "Remove 1 page and 1 document here?" });
    expect(within(dialog).getByText("Old plans")).toBeInTheDocument();
    expect(within(dialog).getByText(/A document’s file is deleted for good/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(requests).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Bring back 9 changes" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Bring back 9 changes" }));
    expect(requests).toEqual([
      {
        url: "/api/merge/m1/commit",
        method: "POST",
        body: { choices: { "page:old": "apply", "document:charts": "apply" }, deletionsConfirmed: true },
      },
    ]);
  });

  it("ticks and unticks a whole group, and leaves on the drive what is unticked", async () => {
    const requests = renderPreview();
    const section = screen.getByRole("heading", { name: "New on the drive 3" }).closest("section")!;
    await userEvent.click(within(section).getByRole("button", { name: "Untick all" }));
    expect(screen.getByRole("checkbox", { name: "Trip notes" })).not.toBeChecked();
    expect(screen.getByText("Leaves 2 pages, 1 document and 1 collection on the drive for now.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Trip notes" }));
    await userEvent.click(screen.getByRole("button", { name: "Bring back 5 changes" }));
    expect(requests.at(-1)!.body).toEqual({ choices: { "page:day2": "skip", "document:pilot": "skip" }, deletionsConfirmed: false });
  });

  it("explains a drive made before drives kept a record, and one from another Outpost", () => {
    renderPreview(analysis({ baseline: "dates" }));
    expect(screen.getByText("This drive was made before drives kept a record of what they held")).toBeInTheDocument();
    expect(screen.getByText(/Where the dates do not settle it, the item is listed as changed on both sides/)).toBeInTheDocument();
  });

  it("says so when there is nothing to bring back, and offers nothing to press but a way out", async () => {
    const requests = renderPreview(analysis({ items: [], attachments: { count: 0, bytes: 0 } }));
    expect(screen.getByRole("heading", { name: "Nothing to bring back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nothing to bring back" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Download a backup" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(requests).toEqual([{ url: "/api/merge/m1", method: "DELETE", body: undefined }]);
  });
});

describe("the record of a merge", () => {
  const report = {
    actions: [
      {
        seq: 1,
        kind: "document",
        outcome: "added",
        title: "Pilot notes",
        message: "Copied from the drive and checked against its checksum.",
        homeItemId: "d9",
        undo: "can",
        undoMessage: null,
      },
      {
        seq: 2,
        kind: "page",
        outcome: "added",
        title: "Trip notes",
        message: "Added from the drive.",
        homeItemId: "trip",
        undo: "can",
        undoMessage: null,
      },
      {
        seq: 3,
        kind: "page",
        outcome: "skipped",
        title: "Kit list",
        message: "It changed at home after the preview was made, so it was left alone.",
        homeItemId: "kit",
        undo: "nothing",
        undoMessage: null,
      },
      {
        seq: 4,
        kind: "page",
        outcome: "kept",
        title: "Old plans",
        message: "Deleted on the drive; kept at home.",
        homeItemId: "old",
        undo: "nothing",
        undoMessage: null,
      },
      {
        seq: 5,
        kind: "document",
        outcome: "removed",
        title: "Charts",
        message: "Removed from your library, with its file, because you ticked it. This cannot be undone.",
        homeItemId: "charts",
        undo: "cannot",
        undoMessage: null,
      },
    ],
    counts: { added: 2, updated: 0, copied: 0, trashed: 0, removed: 1, moved: 0, kept: 1, already: 0, skipped: 1, failed: 0 },
    documentsAdded: 1,
    cannotUndo: 1,
  } as const;

  function renderReport(change = {}) {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        requests.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
        return new Response(JSON.stringify({ merge: merge(null, { state: "completed", undoneAt: 5 }) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ReportStep dto={merge(null, { state: "completed", ...change })} report={structuredClone(report) as never} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return requests;
  }

  it("says what was done, puts what was not done first, and offers to update the drive without doing it", () => {
    renderReport();
    expect(screen.getByText(/2 added, 1 removed, 1 left as it was at home\./)).toBeInTheDocument();
    expect(screen.getByText(/Nothing on the drive was changed/)).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Not done 1", "What was done 3", "Left as it was at home 1"]);
    expect(screen.getByRole("link", { name: "Trip notes" })).toHaveAttribute("href", "/notes/trip");
    expect(screen.getByRole("link", { name: "Update this drive" })).toHaveAttribute(
      "href",
      "/storage?update-drive=%2FVolumes%2FTRAVEL%2FOutpost",
    );
  });

  it("undoes from the record, saying what cannot be undone and leaving copied documents unless asked", async () => {
    const requests = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Undo this merge" }));
    const dialog = screen.getByRole("alertdialog", { name: "Undo this merge?" });
    expect(within(dialog).getByText(/1 thing cannot be undone/)).toBeInTheDocument();
    const also = within(dialog).getByRole("checkbox", { name: /Also remove the 1 document it copied into the library/ });
    expect(also).not.toBeChecked();
    await userEvent.click(also);
    await userEvent.click(within(dialog).getByRole("button", { name: "Undo this merge" }));
    expect(requests).toEqual([{ url: "/api/merge/m1/undo", body: { removeDocuments: true } }]);
  });

  it("says plainly when a merge was stopped part-way or has been undone", () => {
    renderReport({ state: "stopped" });
    expect(screen.getByText("Stopped part-way")).toBeInTheDocument();
    expect(screen.getByText(/Your library is whole/)).toBeInTheDocument();
  });
});
