import type { DocumentDto, JobDto, OcrStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OcrDetails, OcrTextView, ocrActionLabel, ocrStage, ScanStrip, useDocumentOcr } from "./document-ocr";

const doc = (change: Partial<DocumentDto>): DocumentDto => ({
  id: "d1",
  title: "Hut logbook",
  originalName: "logbook.pdf",
  type: "pdf",
  mime: "application/pdf",
  ext: "pdf",
  sizeBytes: 40_478,
  sha256: "a".repeat(64),
  locationId: "loc1",
  locationAvailable: true,
  relPath: "documents/d1/logbook.pdf",
  category: null,
  description: null,
  author: null,
  source: null,
  language: null,
  tags: [],
  pageCount: 12,
  extraction: "unsupported",
  extractionDetail: "This PDF has no text of its own.",
  textChars: 0,
  scanPages: 12,
  ocrPages: null,
  ocrDetail: null,
  fileUrl: "/api/documents/d1/file",
  createdAt: 1,
  updatedAt: 1,
  ...change,
});

const job = (change: Partial<JobDto>): JobDto => ({
  id: "j1",
  type: "document.ocr",
  queue: "ocr",
  state: "running",
  title: 'Reading scanned pages of "Hut logbook"',
  subject: "document:d1",
  progress: { current: 3, total: 12, message: "Reading scanned page 4 of 12" },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 1,
  result: null,
  createdAt: 1,
  startedAt: 1,
  finishedAt: null,
  updatedAt: 1,
  ...change,
});

const ready: OcrStatus = {
  available: true,
  reason: null,
  engine: "Tesseract",
  languages: [{ code: "eng", name: "English", builtIn: true, selected: true }],
  missingLanguages: [],
  languageFolder: "ocr/tessdata",
  auto: false,
  limits: { pagesPerRun: 1000, maxPixels: 40_000_000 },
};

let requests: Array<{ method: string; path: string; body: unknown }> = [];

function serve({ status = ready, jobs = [] as JobDto[], document = doc({}) } = {}) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (method !== "GET") requests.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.pathname === "/api/ocr") return json(status);
      if (url.pathname === "/api/jobs") return json({ jobs });
      if (url.pathname === "/api/documents/d1/ocr") return json({ document, jobId: "j1" });
      if (url.pathname === "/api/jobs/j1/cancel") return json({ job: job({ state: "cancelled" }) });
      if (url.pathname === "/api/documents/d1/text") {
        return json({
          documentId: "d1",
          extraction: "done",
          extractionDetail: null,
          pageCount: 2,
          sections: [
            { page: 1, heading: null, text: "Typed words about kerosene", ocr: false },
            { page: 2, heading: null, text: "Signal the bridge at dawn\nCarry rope and a lantern", ocr: true },
          ],
        });
      }
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
}

/** The band and the details group together, as the document screen has them. */
function Screen({ document }: { document: DocumentDto }) {
  const ocr = useDocumentOcr(document);
  const [showingText, setShowingText] = useState(false);
  return (
    <>
      <div data-testid="strip">
        <ScanStrip document={document} ocr={ocr} showingText={showingText} onShowText={setShowingText} />
      </div>
      <output data-testid="view">{showingText ? "text" : "pages"}</output>
      <div data-testid="details">
        <OcrDetails document={document} ocr={ocr} />
      </div>
    </>
  );
}

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  serve();
});
afterEach(() => vi.unstubAllGlobals());

describe("where a document stands with OCR", () => {
  it("offers, reads, and tells part-read from read", () => {
    expect(ocrStage(doc({}), undefined)).toBe("offer");
    expect(ocrStage(doc({}), job({}))).toBe("reading");
    expect(ocrStage(doc({ ocrPages: 5 }), undefined)).toBe("partial");
    expect(ocrStage(doc({ ocrPages: 12 }), undefined)).toBe("read");
    // A PDF whose pages all have text, a drawing, and a text file have nothing to read.
    expect(ocrStage(doc({ scanPages: 0 }), undefined)).toBe("none");
    expect(ocrStage(doc({ type: "image", ext: "svg", scanPages: 0 }), undefined)).toBe("none");
    expect(ocrStage(doc({ type: "markdown", ext: "md", scanPages: 0 }), undefined)).toBe("none");
  });

  it("names the action for what it will do", () => {
    expect(ocrActionLabel(doc({}), "offer")).toBe("Read text from the scanned pages");
    expect(ocrActionLabel(doc({ type: "image", ext: "png" }), "offer")).toBe("Read text from this image");
    expect(ocrActionLabel(doc({}), "partial")).toBe("Read the remaining scanned pages");
    expect(ocrActionLabel(doc({}), "read")).toBe("Read the scanned pages again");
  });
});

describe("a scanned document nobody has read yet", () => {
  it("offers to read it, says it is slow and imperfect, and starts the job", async () => {
    renderWith(<Screen document={doc({})} />);
    const strip = screen.getByTestId("strip");
    await waitFor(() => expect(strip).toHaveTextContent("These pages are pictures of text, so they cannot be searched yet."));
    expect(strip).toHaveTextContent("Reading runs on this device. It is slow, and it makes mistakes.");
    expect(screen.getByTestId("details")).toHaveTextContent("Language: English.");

    await userEvent.click(screen.getAllByRole("button", { name: "Read text from the scanned pages" })[0] as HTMLElement);
    expect(requests).toEqual([{ method: "POST", path: "/api/documents/d1/ocr", body: { redo: false } }]);
  });

  it("can have the offer put away, and remembers that for this document", async () => {
    renderWith(<Screen document={doc({})} />);
    await userEvent.click(await screen.findByRole("button", { name: "Hide this offer" }));
    expect(screen.getByTestId("strip")).toBeEmptyDOMElement();
    // The action is still there in the details.
    expect(screen.getByRole("button", { name: "Read text from the scanned pages" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("outpost.ocr.hidden") ?? "[]")).toEqual(["d1"]);
  });

  it("says why when this installation cannot run OCR, and offers nothing that would not work", async () => {
    const reason = "Reading text from scans (OCR) is not part of this installation: the OCR engine or its language data is missing.";
    serve({ status: { ...ready, available: false, reason, languages: [] } });
    renderWith(<Screen document={doc({})} />);
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByTestId("strip")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: /Read text/ })).not.toBeInTheDocument();
  });
});

describe("while it is being read", () => {
  it("shows the real progress and stops when asked", async () => {
    serve({ jobs: [job({})] });
    renderWith(<Screen document={doc({})} />);
    const strip = screen.getByTestId("strip");
    await waitFor(() => expect(strip).toHaveTextContent("Reading scanned page 4 of 12"));
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuenow", "25");
    expect(screen.queryByRole("button", { name: /Read text/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Stop reading" })[0] as HTMLElement);
    expect(requests).toEqual([{ method: "POST", path: "/api/jobs/j1/cancel", body: {} }]);
  });

  it("says so when another document is being read first", async () => {
    serve({ jobs: [job({ state: "queued", progress: { current: 0, total: null, message: null } })] });
    renderWith(<Screen document={doc({})} />);
    await waitFor(() => expect(screen.getByTestId("strip")).toHaveTextContent("Waiting for its turn to be read"));
  });
});

describe("once it has been read", () => {
  it("says the text came from OCR and may be wrong, and switches between the pages and the text", async () => {
    const read = doc({
      extraction: "done",
      extractionDetail: null,
      textChars: 900,
      ocrPages: 12,
      ocrDetail: "OCR found no text on 1 of the 12 pages it read.",
    });
    renderWith(<Screen document={read} />);
    const strip = screen.getByTestId("strip");
    await waitFor(() => expect(strip).toHaveTextContent("The text of 12 scanned pages was read by OCR and may contain mistakes."));
    expect(strip).toHaveTextContent("OCR found no text on 1 of the 12 pages it read.");
    expect(screen.getByTestId("details")).toHaveTextContent("was read by OCR, which makes mistakes: some words may be wrong or missing.");

    await userEvent.click(screen.getByRole("button", { name: "Show the text" }));
    expect(screen.getByTestId("view")).toHaveTextContent("text");
    await userEvent.click(screen.getByRole("button", { name: "Show the pages" }));
    expect(screen.getByTestId("view")).toHaveTextContent("pages");

    // Reading again is asked for as such, so the server replaces what it read before.
    await userEvent.click(screen.getByRole("button", { name: "Read the scanned pages again" }));
    expect(requests).toEqual([{ method: "POST", path: "/api/documents/d1/ocr", body: { redo: true } }]);
  });

  it("offers the rest when it was stopped part-way", async () => {
    const partial = doc({
      extraction: "done",
      textChars: 400,
      ocrPages: 5,
      ocrDetail: "Stopped after 5 of 12 pages. What was read so far is searchable.",
    });
    renderWith(<Screen document={partial} />);
    await waitFor(() =>
      expect(screen.getByTestId("strip")).toHaveTextContent("5 of 12 scanned pages have been read by OCR and may contain mistakes."),
    );
    expect(screen.getByTestId("details")).toHaveTextContent("Stopped after 5 of 12 pages.");
    // In the band above the pages, and in the details.
    expect(await screen.findAllByRole("button", { name: "Read the remaining scanned pages" })).toHaveLength(2);
  });

  it("shows the text page by page and marks the pages a machine read", async () => {
    renderWith(<OcrTextView document={doc({ extraction: "done", textChars: 70, scanPages: 1, ocrPages: 1, pageCount: 2 })} />);
    expect(await screen.findByRole("heading", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Page 2, ?read by OCR$/ })).toBeInTheDocument();
    expect(screen.getByText(/Carry rope and a lantern/)).toBeInTheDocument();
    expect(screen.getByText(/may contain mistakes; the pages themselves are the record/)).toBeInTheDocument();
  });
});
