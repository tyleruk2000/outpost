import type { ArchiveAddPlan, ArchiveAddResult, ArchiveDocument, ArchiveDocumentsResponse, JobDto, PageFile } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventsProvider } from "@/lib/events";
import { fakeServer, installBrowserStubs, renderScreen } from "../downloads/test-support";
import { addOutcome, planSize, whichOnes, whyNotAll } from "./add-all";
import { DocumentList } from "./document-list";
import { LinkedFiles } from "./linked-files";

beforeAll(installBrowserStubs);
beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const file = (name: string, over: Partial<ArchiveDocument["files"][number]> = {}): ArchiveDocument["files"][number] => ({
  name,
  path: `files/${name}`,
  kind: "pdf",
  documentId: null,
  adding: null,
  problem: null,
  ...over,
});
const document = (id: string, title: string, files: ArchiveDocument["files"]): ArchiveDocument => ({
  id,
  title,
  description: "",
  author: "",
  files,
});
const three = [
  document("0", "Boiling water to make it safe", [file("water.pdf")]),
  document("1", "Finding north without a compass", [file("north.pdf")]),
  document("2", "Storing grain for a year", [file("grain.pdf")]),
];
const listOf = (documents: ArchiveDocument[], total = documents.length): ArchiveDocumentsResponse => ({
  list: { home: "home", total, matched: documents.length, offset: 0, documents, skipped: 0, truncated: false },
  problem: null,
});
const plan = (over: Partial<ArchiveAddPlan> = {}): ArchiveAddPlan => ({
  count: 3,
  already: 0,
  bytes: 212_000_000,
  unsized: 0,
  location: { id: "loc1", name: "Main", freeBytes: 41_200_000_000 },
  reserveBytes: 268_435_456,
  refusal: null,
  ocrAuto: false,
  ...over,
});
const result = (over: Partial<ArchiveAddResult> = {}): ArchiveAddResult => ({
  scope: "list",
  q: "",
  wanted: 3,
  added: 3,
  addedBytes: 212_000_000,
  already: 0,
  failed: [],
  failedMore: 0,
  notReached: 0,
  stopped: null,
  stoppedReason: null,
  locationName: "Main",
  ...over,
});
const job = (over: Partial<JobDto> = {}): JobDto => ({
  id: "j1",
  type: "kiwix.add-files",
  queue: "reference-files",
  state: "running",
  title: "Adding documents from “Field library” to your library",
  subject: "reference-files:c1",
  progress: { current: 1, total: 3, message: "Adding “Finding north without a compass”" },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 1,
  result: null,
  createdAt: Date.now() - 5000,
  startedAt: Date.now() - 5000,
  finishedAt: null,
  updatedAt: Date.now(),
  ...over,
});
const finished = (outcome: ArchiveAddResult, over: Partial<JobDto> = {}) =>
  job({ state: "succeeded", result: outcome as unknown as Record<string, unknown>, finishedAt: Date.now() - 1000, ...over });

const BASE = "/api/kiwix/books/c1";

function list(query = "") {
  renderScreen(
    <DocumentList
      collectionId="c1"
      contentBase="/kiwix/open/content/field-library/"
      description={null}
      query={query}
      onOpen={vi.fn()}
      onShowOwnPage={vi.fn()}
      onClearQuery={vi.fn()}
    />,
  );
}

/** What the page sent as the body of its last request to an address. */
function sent(path: string): unknown {
  const call = vi
    .mocked(fetch)
    .mock.calls.filter(([input, init]) => init?.method === "POST" && String(input).endsWith(path))
    .at(-1);
  return call ? JSON.parse(String(call[1]!.body)) : undefined;
}

describe("what adding to the library means, said where the choice is made", () => {
  it("says that the document is copied, where to, that nothing is downloaded, and how much room all of them take", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/add-all/plan`]: plan(),
      [`GET ${BASE}/files/add-all`]: { job: null },
      [`POST ${BASE}/files/sizes`]: {
        files: [
          { path: "files/water.pdf", sizeBytes: 2_400_000 },
          { path: "files/north.pdf", sizeBytes: null },
          { path: "files/grain.pdf", sizeBytes: 209_600_000 },
        ],
      },
    });
    list();
    const words = await screen.findByText(/copies a document out of this collection into your library on “Main”/);
    expect(words).toHaveTextContent(
      "Add to library copies a document out of this collection into your library on “Main”, where it is searched to the page and shows with your other documents. Nothing is downloaded from the internet. The collection keeps its copy, so adding all 3 uses 212 MB more (41.2 GB free).",
    );
    // Each line says how large its file is, where the collection said.
    const rows = within(screen.getByRole("list", { name: "Documents" })).getAllByRole("listitem");
    await waitFor(() => expect(rows[0]).toHaveTextContent("PDF · , 2.40 MB"));
    expect(rows[1]).not.toHaveTextContent("MB");
    expect(rows[2]).toHaveTextContent("PDF · , 210 MB");
    expect(screen.getByRole("button", { name: "Add all 3 to library" })).toBeInTheDocument();
  });

  it("still says what adding does when the sizes cannot be had", async () => {
    fakeServer({ [`GET ${BASE}/documents`]: listOf(three) });
    list();
    expect(
      await screen.findByText(
        /Nothing is downloaded from the internet\. The collection keeps its copy, so the space is used a second time\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /to library$/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Add to library: / })).toHaveLength(3);
  });

  it("offers only what is left, and says so when everything is in the library", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 2, already: 1, bytes: 9_000_000 }),
      [`GET ${BASE}/files/add-all`]: { job: null },
    });
    list();
    expect(await screen.findByRole("button", { name: "Add the other 2 to library" })).toBeInTheDocument();
    expect(screen.getByText(/so adding the other 2 uses 9\.00 MB more/)).toBeInTheDocument();
  });

  it("has nothing to add when all of them are there, and says they stay", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 0, already: 3, bytes: 0 }),
      [`GET ${BASE}/files/add-all`]: { job: null },
    });
    list();
    expect(await screen.findByText(/All 3 here are in your library, and stay there if this collection is removed\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /to library$/ })).not.toBeInTheDocument();
  });

  it("says nothing about adding in a collection that holds nothing the library keeps", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf([document("0", "Signal whistle", [file("whistle.wav", { kind: "audio" })])]),
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 0, already: 0, bytes: 0 }),
      [`GET ${BASE}/files/add-all`]: { job: null },
    });
    list();
    expect(await screen.findByRole("heading", { level: 2, name: "Signal whistle" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/copies a document out of this collection/)).not.toBeInTheDocument());
  });
});

describe("adding all of them", () => {
  it("asks first, with how many, how much and where, then starts the job and shows how far it has got", async () => {
    let current: JobDto | null = null;
    const server = fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/add-all/plan`]: plan(),
      [`GET ${BASE}/files/add-all`]: () => ({ job: current }),
      [`POST ${BASE}/files/add-all`]: () => {
        current = job();
        return { job: current, already: false };
      },
      "POST /api/jobs/j1/cancel": { job: job({ state: "cancelled" }) },
    });
    list();
    await userEvent.click(await screen.findByRole("button", { name: "Add all 3 to library" }));
    const dialog = await screen.findByRole("dialog", { name: "Add 3 documents to your library?" });
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        "They are copied out of this collection onto “Main”: 212 MB, of 41.2 GB free. Nothing is downloaded from the internet. The collection keeps its own copy, so this space is used a second time.",
      ),
    );
    expect(dialog).toHaveTextContent("Pages that are scans are not read; a document that has some offers OCR on its own page.");
    expect(dialog).toHaveTextContent("It carries on if you close this page, and can be stopped here or under Downloads.");
    expect(dialog).toHaveTextContent("What has been added stays in your library, also if this collection is removed later.");
    // Nothing has been started by opening it.
    expect(server.calls).not.toContain(`POST ${BASE}/files/add-all`);

    await userEvent.click(within(dialog).getByRole("button", { name: "Add 3 documents" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sent("/files/add-all")).toEqual({ kind: "list" });

    const status = await screen.findByRole("region", { name: "Adding to your library" });
    expect(status).toHaveTextContent("Adding documents to your library · 1 of 3");
    expect(status).toHaveTextContent("Adding “Finding north without a compass”");
    expect(status).toHaveTextContent(
      "You can leave this page; it carries on, and shows under Downloads. Stopping keeps what has been added.",
    );
    expect(within(status).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33.33333333333333");
    // While it runs there is no second way to start it.
    expect(screen.queryByRole("button", { name: /to library$/ })).not.toBeInTheDocument();

    await userEvent.click(within(status).getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(server.calls).toContain("POST /api/jobs/j1/cancel"));
  });

  it("adds only what a search is showing", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf(three.slice(0, 2), 3),
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 2, bytes: 5_000_000 }),
      [`GET ${BASE}/files/add-all`]: { job: null },
      [`POST ${BASE}/files/add-all`]: { job: job(), already: false },
    });
    list("water");
    await userEvent.click(await screen.findByRole("button", { name: "Add these 2 to library" }));
    expect(sent("/files/add-all/plan")).toEqual({ kind: "list", q: "water" });
    const dialog = await screen.findByRole("dialog", { name: "Add these 2 documents to your library?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 2 documents" }));
    await waitFor(() => expect(sent("/files/add-all")).toEqual({ kind: "list", q: "water" }));
  });

  it("will not start when there is not room, and says why", async () => {
    const refusal =
      '"Main" does not have room for these 3 files: 212 MB would be needed and 180 MB is free, of which Outpost keeps 268 MB clear. Free some space, or make another storage location the default, then try again.';
    const server = fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/add-all/plan`]: plan({ refusal, location: { id: "loc1", name: "Main", freeBytes: 180_000_000 } }),
      [`GET ${BASE}/files/add-all`]: { job: null },
    });
    list();
    await userEvent.click(await screen.findByRole("button", { name: "Add all 3 to library" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("There is not room for them")).toBeInTheDocument();
    expect(dialog).toHaveTextContent(refusal);
    expect(within(dialog).getByRole("button", { name: "Add 3 documents" })).toBeDisabled();
    expect(server.calls).not.toContain(`POST ${BASE}/files/add-all`);
  });

  it("says what the server says when it refuses to start after all", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/add-all/plan`]: plan(),
      [`GET ${BASE}/files/add-all`]: { job: null },
      [`POST ${BASE}/files/add-all`]: {
        status: 507,
        error: { code: "insufficient_space", message: '"Main" does not have room for these 3 files.' },
      },
    });
    list();
    await userEvent.click(await screen.findByRole("button", { name: "Add all 3 to library" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Add 3 documents" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent('"Main" does not have room for these 3 files.');
  });

  it("follows a running add by the server's word, and asks on a timer only while that word cannot arrive", async () => {
    const statusCalls = (server: { calls: string[] }) => server.calls.filter((call) => call === `GET ${BASE}/files/add-all`).length;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const server = fakeServer({ [`GET ${BASE}/documents`]: listOf(three), [`GET ${BASE}/files/add-all`]: { job: job() } });
      list();
      await screen.findByRole("region", { name: "Adding to your library" });
      const before = statusCalls(server);
      await vi.advanceTimersByTimeAsync(6000);
      expect(statusCalls(server)).toBe(before);

      // With the connection to the server down, nothing would say the job moved: it is asked after again.
      vi.unstubAllGlobals();
      cleanup();
      const fallback = fakeServer({ [`GET ${BASE}/documents`]: listOf(three), [`GET ${BASE}/files/add-all`]: { job: job() } });
      vi.stubGlobal(
        "EventSource",
        class {
          onopen: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor() {
            setTimeout(() => this.onerror?.(), 0);
          }
          addEventListener() {}
          removeEventListener() {}
          close() {}
        },
      );
      renderScreen(
        <EventsProvider enabled>
          <DocumentList
            collectionId="c1"
            contentBase="/kiwix/open/content/field-library/"
            description={null}
            query=""
            onOpen={vi.fn()}
            onShowOwnPage={vi.fn()}
            onClearQuery={vi.fn()}
          />
        </EventsProvider>,
      );
      await screen.findByRole("region", { name: "Adding to your library" });
      const first = statusCalls(fallback);
      await vi.advanceTimersByTimeAsync(6000);
      expect(statusCalls(fallback)).toBeGreaterThan(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves its count on with each job event, when the job is in the active list that the events patch", async () => {
    const sources: Array<{ emit(type: string, data: unknown): void }> = [];
    vi.stubGlobal(
      "EventSource",
      class {
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private readonly handlers = new Map<string, (event: MessageEvent<string>) => void>();
        constructor() {
          sources.push(this);
        }
        addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
          this.handlers.set(type, handler);
        }
        removeEventListener() {}
        close() {}
        emit(type: string, data: unknown) {
          this.handlers.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) }));
        }
      },
    );
    fakeServer({ [`GET ${BASE}/documents`]: listOf(three), [`GET ${BASE}/files/add-all`]: { job: job() } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The sidebar keeps the active jobs listed, so a progress event patches that list rather than fetching.
    client.setQueryData(["jobs", "active"], { jobs: [job()] });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EventsProvider enabled>
            <DocumentList
              collectionId="c1"
              contentBase="/kiwix/open/content/field-library/"
              description={null}
              query=""
              onOpen={vi.fn()}
              onShowOwnPage={vi.fn()}
              onClearQuery={vi.fn()}
            />
          </EventsProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const status = await screen.findByRole("region", { name: "Adding to your library" });
    expect(status).toHaveTextContent("1 of 3");
    act(() =>
      sources[0]!.emit("job.updated", {
        id: "j1",
        data: job({ progress: { current: 2, total: 3, message: "Adding “Storing grain for a year”" } }),
      }),
    );
    await waitFor(() => expect(status).toHaveTextContent("2 of 3"));
    expect(status).toHaveTextContent("Adding “Storing grain for a year”");
  });

  it("shows each document's place while it runs: in the library, being added, or waiting its turn", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf([
        document("0", "Boiling water to make it safe", [file("water.pdf", { documentId: "d1" })]),
        document("1", "Finding north without a compass", [file("north.pdf", { adding: "now" })]),
        document("2", "Storing grain for a year", [file("grain.pdf", { adding: "waiting" })]),
      ]),
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 2, already: 1 }),
      [`GET ${BASE}/files/add-all`]: { job: job() },
    });
    list();
    expect(await screen.findByRole("link", { name: "In your library: Boiling water to make it safe" })).toHaveAttribute(
      "href",
      "/library/documents/d1",
    );
    const rows = within(screen.getByRole("list", { name: "Documents" })).getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("Adding…: Finding north without a compass");
    expect(within(rows[1]!).queryByRole("button", { name: /library/ })).not.toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("Waiting its turn");
    expect(within(rows[2]!).queryByRole("button", { name: /Add to library/ })).not.toBeInTheDocument();
  });

  it("says how it turned out: how many were added, how many were there, which failed and why", async () => {
    fakeServer({
      [`GET ${BASE}/documents`]: listOf([
        document("0", "Boiling water to make it safe", [file("water.pdf", { documentId: "d1" })]),
        document("1", "Finding north without a compass", [file("north.pdf", { problem: '"north.pdf" is not in this collection.' })]),
        document("2", "Storing grain for a year", [file("grain.pdf", { documentId: "d3" })]),
      ]),
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 1, already: 2, bytes: 1_000_000 }),
      [`GET ${BASE}/files/add-all`]: {
        job: finished(
          result({
            wanted: 4,
            added: 2,
            already: 1,
            failed: [
              { path: "files/north.pdf", title: "Finding north without a compass", reason: '"north.pdf" is not in this collection.' },
            ],
          }),
        ),
      },
      [`POST ${BASE}/files/save`]: { status: "created", document: { id: "d2", title: "Finding north without a compass" } },
    });
    list();
    const notice = (await screen.findByText("Added 2 documents to your library; 1 could not be added")).closest(
      "[role=status]",
    ) as HTMLElement;
    expect(notice).toHaveTextContent("They are on “Main” (212 MB) and stay there if this collection is removed.");
    expect(notice).toHaveTextContent("Their text is being read so that search finds it.");
    expect(notice).toHaveTextContent("1 document was in your library already and was not copied again.");
    expect(within(notice).getByRole("list", { name: "Could not be added" })).toHaveTextContent(
      'Finding north without a compass: "north.pdf" is not in this collection.',
    );
    expect(within(notice).getByRole("link", { name: "Open your documents" })).toHaveAttribute("href", "/library");
    // What is left is offered again, all at once or on its own line.
    expect(screen.getByRole("button", { name: "Add the other one to library" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Documents" })).getAllByRole("listitem");
    expect(within(rows[1]!).getByRole("alert")).toHaveTextContent('Not added. "north.pdf" is not in this collection.');
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "Try again: Finding north without a compass" }));
    expect(await screen.findByRole("link", { name: "In your library: Finding north without a compass" })).toBeInTheDocument();

    // Put away, it stays away.
    await userEvent.click(within(notice).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Added 2 documents to your library; 1 could not be added")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("outpost.reader.added.c1")).toBe("j1");
  });

  it("offers to try a single document again when adding it failed", async () => {
    let attempts = 0;
    fakeServer({
      [`GET ${BASE}/documents`]: listOf(three),
      [`POST ${BASE}/files/save`]: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 502, error: { code: "upstream", message: '"water.pdf" could not be read from this collection.' } }
          : { status: "created", document: { id: "d1", title: "Boiling water to make it safe" } };
      },
    });
    list();
    await userEvent.click(await screen.findByRole("button", { name: "Add to library: Boiling water to make it safe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Not added. "water.pdf" could not be read from this collection.');
    await userEvent.click(screen.getByRole("button", { name: "Try again: Boiling water to make it safe" }));
    expect(await screen.findByRole("link", { name: "In your library: Boiling water to make it safe" })).toHaveAttribute(
      "href",
      "/library/documents/d1",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the words for how an add turned out", () => {
  it("names which documents an add would take", () => {
    expect(whichOnes(17, 0, false)).toBe("all 17");
    expect(whichOnes(1, 0, false)).toBe("it");
    expect(whichOnes(3, 0, true)).toBe("these 3");
    expect(whichOnes(1, 0, true)).toBe("this one");
    expect(whichOnes(14, 3, false)).toBe("the other 14");
    expect(whichOnes(1, 16, true)).toBe("the other one");
    expect(whichOnes(1200, 0, false)).toBe("all 1,200");
  });

  it("says why adding counts other than the documents listed", () => {
    expect(whyNotAll(10, 10)).toBeNull();
    expect(whyNotAll(10, 8)).toBe(
      "Adding counts files, not documents: 8 files here are PDFs or e-books, the kinds the library keeps. Everything else is read here in the collection.",
    );
    expect(whyNotAll(3, 1)).toMatch(/: 1 file here is a PDF or an e-book,/);
    expect(whyNotAll(2, 5)).toMatch(/^Adding counts files, not documents: 5 files/);
  });

  it("gives a size only as far as it is known", () => {
    expect(planSize({ bytes: 212_000_000, unsized: 0, count: 17 })).toBe("212 MB");
    expect(planSize({ bytes: 212_000_000, unsized: 2, count: 17 })).toBe("at least 212 MB");
    expect(planSize({ bytes: 0, unsized: 17, count: 17 })).toBeNull();
  });

  it("tells a clean finish from a stop, a full disk and a failure", () => {
    expect(addOutcome(finished(result()), "document")).toMatchObject({ tone: "success", title: "Added 3 documents to your library" });
    expect(addOutcome(finished(result({ added: 1, addedBytes: 5000, wanted: 1 })), "file")).toEqual({
      tone: "success",
      title: "Added 1 file to your library",
      lines: ["It is on “Main” (5.00 kB) and stays there if this collection is removed. Its text is being read so that search finds it."],
    });
    expect(
      addOutcome(
        job({ state: "cancelled", result: { ...result({ added: 12, wanted: 108, notReached: 96, stopped: "cancelled" }) } }),
        "document",
      ),
    ).toMatchObject({
      tone: "warning",
      title: "Stopped after 12 of 108 documents",
      lines: [expect.any(String), "96 documents were not reached."],
    });
    const full = addOutcome(
      finished(
        result({ added: 5, wanted: 8, notReached: 3, stopped: "space", stoppedReason: '"Main" does not have room for "north.pdf".' }),
      ),
      "document",
    );
    expect(full.title).toBe("Stopped after 5 of 8 documents: no room left");
    expect(full.lines.at(-1)).toBe('"Main" does not have room for "north.pdf". 3 documents were not reached.');
    expect(
      addOutcome(
        finished(result({ added: 2, wanted: 8, notReached: 6, stopped: "storage", stoppedReason: '"Main" is not connected.' })),
        "document",
      ),
    ).toMatchObject({ tone: "warning", title: "Stopped after 2 of 8 documents: the storage location could not be written to" });
    expect(
      addOutcome(finished(result({ added: 2, wanted: 8, notReached: 6, stopped: "unreadable", stoppedReason: "It went away." })), "file")
        .title,
    ).toBe("Stopped after 2 of 8 files: the collection could not be read");
    expect(addOutcome(finished(result({ added: 0, addedBytes: 0, already: 2, wanted: 2 })), "document")).toMatchObject({
      tone: "success",
      title: "Nothing new was added",
      lines: ["2 documents were in your library already and were not copied again."],
    });
    expect(addOutcome(job({ state: "failed", error: "This collection cannot be read right now." }), "document")).toEqual({
      tone: "danger",
      title: "Adding stopped with an error",
      lines: ["This collection cannot be read right now.", "What had been added by then is in your library."],
    });
  });
});

describe("the files a page links to", () => {
  const files: PageFile[] = [
    { kind: "archive", path: "example.org/docs/north.pdf", text: "Finding north without a compass" },
    { kind: "archive", path: "example.org/docs/grain.pdf", text: "Part 2" },
  ];

  it("are added by the same job, after saying how much room they take and where", async () => {
    let current: JobDto | null = null;
    fakeServer({
      [`POST ${BASE}/files/check`]: { files: files.map((item) => ({ path: (item as { path: string }).path, state: "new" })) },
      [`POST ${BASE}/files/sizes`]: {
        files: [
          { path: "example.org/docs/north.pdf", sizeBytes: 3_000_000 },
          { path: "example.org/docs/grain.pdf", sizeBytes: 1_100_000 },
        ],
      },
      [`POST ${BASE}/files/add-all/plan`]: plan({ count: 2, bytes: 4_100_000 }),
      [`GET ${BASE}/files/add-all`]: () => ({ job: current }),
      [`POST ${BASE}/files/add-all`]: () => {
        current = job({ progress: { current: 0, total: 2, message: "Adding “Finding north without a compass”" } });
        return { job: current, already: false };
      },
    });
    renderScreen(<LinkedFiles collectionId="c1" files={files} foundIn="Field library" />);
    await userEvent.click(await screen.findByRole("button", { name: "Add them to your library" }));
    const dialog = await screen.findByRole("dialog", { name: "Files this page links to" });
    expect(dialog).toHaveTextContent(
      "They are inside this collection: adding one copies it out into your library, and nothing is downloaded from the internet.",
    );
    await waitFor(() => expect(dialog).toHaveTextContent("2 files are copied onto “Main”: 4.10 MB, of 41.2 GB free."));
    expect(dialog).toHaveTextContent("In this collection, 3.00 MB");

    await userEvent.click(within(dialog).getByRole("button", { name: "Add 2 files" }));
    // The words of a link become the title only when they say what the file is.
    await waitFor(() =>
      expect(sent("/files/add-all")).toEqual({
        kind: "files",
        files: [{ path: "example.org/docs/north.pdf", title: "Finding north without a compass" }, { path: "example.org/docs/grain.pdf" }],
      }),
    );
    const status = await within(dialog).findByRole("region", { name: "Adding to your library" });
    expect(status).toHaveTextContent("Adding files to your library · 0 of 2");
    expect(within(dialog).getByRole("button", { name: "Keep reading" })).toBeInTheDocument();
  });
});
