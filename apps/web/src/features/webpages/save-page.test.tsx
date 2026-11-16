import type { JobDto, SavedCopy, WebPagePreview } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveWebPage } from "./save-page";
import { creditLine, hostsLine, picturesLabel, resultOf } from "./save-page-data";

const MB = 1024 * 1024;
const page = (change: Partial<WebPagePreview> = {}): WebPagePreview => ({
  previewId: "p1",
  requestedUrl: "https://gazette.example/articles/rainwater",
  url: "https://gazette.example/articles/rainwater",
  host: "gazette.example",
  title: "Collecting rainwater",
  byline: "Mabel Thorne",
  site: "The Allotment Gazette",
  published: "2026-03-09T23:30:00-08:00",
  language: "en-GB",
  words: 1240,
  excerpt: "A rain barrel fills faster than most people expect.",
  pictures: { count: 3, willFetch: 3, hosts: ["gazette.example", "cdn.example.net"] },
  existing: [],
  limits: { pageBytes: 5 * MB, pageSeconds: 20, pictures: 30, pictureBytes: 5 * MB, picturesTotalBytes: 20 * MB },
  ...change,
});

const job = (change: Partial<JobDto> = {}): JobDto => ({
  id: "j1",
  type: "webpage.save",
  queue: "webpage",
  state: "running",
  title: "Save",
  subject: null,
  progress: { current: 1, total: 3, message: "Fetching picture 2 of 3" },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 1,
  result: null,
  createdAt: 0,
  startedAt: 0,
  finishedAt: null,
  updatedAt: 0,
  ...change,
});

interface Served {
  preview?: WebPagePreview | { status: number; code: string; message: string };
  /** What `POST /api/webpages/save` answers, in order; the last is repeated. */
  saves?: Array<JobDto | { status: number; code: string; message: string; details?: Record<string, unknown> }>;
  job?: JobDto;
}
let saved: Array<Record<string, unknown>> = [];
let previews: string[] = [];
let cancelled = 0;

function serve(served: Served) {
  saved = [];
  previews = [];
  cancelled = 0;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const refusal = (answer: { status: number; code: string; message: string; details?: Record<string, unknown> }) =>
    json({ error: { code: answer.code, message: answer.message, details: answer.details } }, answer.status);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url.pathname === "/api/webpages/preview") {
        previews.push(String(body.url));
        const answer = served.preview ?? page();
        return "status" in answer ? refusal(answer) : json(answer);
      }
      if (url.pathname === "/api/webpages/save") {
        const answer = served.saves?.[Math.min(saved.length, served.saves.length - 1)] ?? job();
        saved.push(body);
        return "status" in answer ? refusal(answer) : json({ job: answer });
      }
      if (url.pathname === "/api/jobs/j1/cancel") {
        cancelled += 1;
        return json({ job: job({ state: "cancelled" }) });
      }
      if (url.pathname === "/api/jobs/j1") return json({ job: served.job ?? job() });
      return json({ error: { code: "not_found", message: "Not found." } }, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SaveWebPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function look(user: ReturnType<typeof userEvent.setup>, address = "https://gazette.example/articles/rainwater") {
  await user.type(screen.getByLabelText("Address of the page"), address);
  await user.click(screen.getByRole("button", { name: "Look at the page" }));
}

afterEach(() => vi.unstubAllGlobals());

const succeeded = job({
  state: "succeeded",
  result: {
    documentId: "01DOC",
    title: "Collecting rainwater",
    url: "https://gazette.example/articles/rainwater",
    pictures: { kept: 2, bytes: 3_400_000, skipped: [{ url: "https://cdn.example.net/big.png", reason: "It is larger than 5 MB." }] },
  },
});

describe("saving a web page", () => {
  it("says what it will and will not do before anything is fetched", () => {
    serve({});
    show();
    expect(screen.getByText(/fetches this one page and nothing it links to, and keeps nothing until you save/)).toBeInTheDocument();
    // Said once, and plainly: whose page it is.
    expect(screen.getAllByText(/copy for your own reading: the page still belongs to whoever published it/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Look at the page" })).toBeDisabled();
    expect(previews).toEqual([]);
  });

  it("shows what was found, and saves it with its pictures only if the box stays ticked", async () => {
    serve({ job: succeeded });
    const user = show();
    await look(user);

    const found = await screen.findByTestId("web-page-found");
    expect(within(found).getByRole("heading", { name: "Collecting rainwater" })).toBeInTheDocument();
    // The day the page names, wherever the reader is.
    expect(within(found).getByText("By Mabel Thorne, The Allotment Gazette, 9 March 2026")).toBeInTheDocument();
    expect(within(found).getByText("1,240 words")).toBeInTheDocument();
    expect(within(found).getByText("https://gazette.example/articles/rainwater")).toBeInTheDocument();
    const box = within(found).getByRole("checkbox", { name: "Bring its 3 pictures" });
    expect(box).toBeChecked();
    expect(
      within(found).getByText(/Fetched from gazette\.example and cdn\.example\.net.*At most 30 pictures, 5 MB each and 20 MB in all/),
    ).toBeInTheDocument();
    expect(previews).toEqual(["https://gazette.example/articles/rainwater"]);
    expect(saved).toEqual([]);

    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Save page" }));
    await waitFor(() => expect(saved).toEqual([{ url: "https://gazette.example/articles/rainwater", previewId: "p1", pictures: false }]));

    expect(await screen.findByText("Saved to your library")).toBeInTheDocument();
    expect(screen.getByText(/2 pictures came with it \(3\.40 MB\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the saved page" })).toHaveAttribute("href", "/library/documents/01DOC");
    await user.click(screen.getByText("1 picture was left out"));
    expect(screen.getByText("It is larger than 5 MB.")).toBeVisible();

    // Another page starts from an empty field.
    await user.click(screen.getByRole("button", { name: "Save another page" }));
    expect(screen.getByLabelText("Address of the page")).toHaveValue("");
    expect(screen.queryByTestId("web-page-found")).not.toBeInTheDocument();
  });

  it("puts a mistyped address under the field, and a page that cannot be saved in words of its own", async () => {
    serve({ preview: { status: 400, code: "bad_request", message: "Only addresses that start with http:// or https:// can be saved." } });
    const user = show();
    await look(user, "ftp://example.org/file");
    const field = screen.getByLabelText("Address of the page");
    expect(await screen.findByText(/Only addresses that start with/)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("This page cannot be saved")).not.toBeInTheDocument();

    serve({
      preview: {
        status: 415,
        code: "unsupported",
        message: "No readable text was found on this page. Outpost has no browser inside it and does not run a page's scripts.",
      },
    });
    await user.clear(field);
    // Typing again puts the earlier complaint away.
    await user.type(field, "https://app.example/");
    expect(screen.queryByText(/Only addresses that start with/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Look at the page" }));
    expect(await screen.findByText("This page cannot be saved")).toBeInTheDocument();
    expect(screen.getByText(/has no browser inside it and does not run a page's scripts/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save page" })).not.toBeInTheDocument();

    serve({ preview: { status: 403, code: "forbidden", message: "That address is on this computer or a private network." } });
    await user.click(screen.getByRole("button", { name: "Look at the page" }));
    expect(await screen.findByText("Outpost does not fetch from this address")).toBeInTheDocument();
  });

  it("asks what to do with an earlier copy, and saves nothing until it is told", async () => {
    const earlier: SavedCopy = { documentId: "01OLD", title: "Collecting rainwater", savedAt: Date.UTC(2026, 10, 3, 12) };
    serve({ preview: page({ existing: [earlier], pictures: { count: 0, willFetch: 0, hosts: [] } }) });
    const user = show();
    await look(user);

    expect(await screen.findByText("This address is already in your library")).toBeInTheDocument();
    expect(screen.getByText(/You saved it on 3 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText("None in the article that can be brought along.")).toBeInTheDocument();
    // No choice is made for the person.
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save page" })).toBeDisabled();
    expect(screen.getByText("Choose what happens to the earlier copy first.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Keep both/ }));
    await user.click(screen.getByRole("button", { name: "Save page" }));
    await waitFor(() => expect(saved).toEqual([{ url: page().requestedUrl, previewId: "p1", pictures: false, keepBoth: true }]));
  });

  it("replaces an earlier copy only after naming it and being told to", async () => {
    const earlier: SavedCopy = { documentId: "01OLD", title: "Collecting rainwater", savedAt: Date.UTC(2026, 10, 3, 12) };
    serve({
      preview: page({ existing: [earlier] }),
      job: job({ state: "succeeded", result: { ...succeeded.result, replacedDocumentId: "01OLD" } }),
    });
    const user = show();
    await look(user);
    await user.click(await screen.findByRole("radio", { name: /Replace the earlier copy/ }));
    await user.click(screen.getByRole("button", { name: "Replace with this copy" }));

    // Nothing has been sent yet: the copy to be deleted is named first.
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/“Collecting rainwater”/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/will be deleted from your library once the page as it is now has been saved in its place/),
    ).toBeInTheDocument();
    expect(saved).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Keep the earlier copy" }));
    expect(saved).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Replace with this copy" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Replace copy" }));
    await waitFor(() => expect(saved).toEqual([{ url: page().requestedUrl, previewId: "p1", pictures: true, replaceDocumentId: "01OLD" }]));
    expect(await screen.findByText("Saved in place of the earlier copy")).toBeInTheDocument();
  });

  it("asks the question after all when a copy appeared between looking and saving", async () => {
    const earlier: SavedCopy = { documentId: "01NEW", title: "Collecting rainwater", savedAt: Date.UTC(2026, 10, 16, 9) };
    serve({
      saves: [
        { status: 409, code: "conflict", message: "This address is already in your library.", details: { existing: [earlier] } },
        job(),
      ],
    });
    const user = show();
    await look(user);
    await user.click(await screen.findByRole("button", { name: "Save page" }));
    expect(await screen.findByText("This address is already in your library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save page" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Keep both/ }));
    await user.click(screen.getByRole("button", { name: "Save page" }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]).toMatchObject({ keepBoth: true });
  });

  it("shows a save under way with real numbers, and can stop it", async () => {
    serve({});
    const user = show();
    await look(user);
    await user.click(await screen.findByRole("button", { name: "Save page" }));
    expect(await screen.findByText("Fetching picture 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 pictures")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Saving the page" })).toHaveAttribute("aria-valuenow", "33.33333333333333");
    // The address cannot be changed under a save that is running.
    expect(screen.getByLabelText("Address of the page")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelled).toBe(1));
  });

  it("says why a save failed, in the server's words", async () => {
    serve({
      job: job({ state: "failed", error: "“Field drive” is full. Free some space or choose another storage location, then try again." }),
    });
    const user = show();
    await look(user);
    await user.click(await screen.findByRole("button", { name: "Save page" }));
    expect(await screen.findByText("This page was not saved")).toBeInTheDocument();
    expect(screen.getByText(/“Field drive” is full/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the saved page" })).not.toBeInTheDocument();
  });

  it("drops what was found as soon as the address is changed", async () => {
    serve({});
    const user = show();
    await look(user);
    await screen.findByTestId("web-page-found");
    await user.type(screen.getByLabelText("Address of the page"), "x");
    expect(screen.queryByTestId("web-page-found")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save page" })).not.toBeInTheDocument();
  });
});

describe("the words about a page", () => {
  it("name the hosts pictures come from, however many", () => {
    expect(hostsLine(["a.example"])).toBe("a.example");
    expect(hostsLine(["a.example", "b.example"])).toBe("a.example and b.example");
    expect(hostsLine(["a.example", "b.example", "c.example", "d.example"])).toBe("a.example and 3 other hosts");
  });

  it("say how many pictures the box will bring", () => {
    expect(picturesLabel({ count: 1, willFetch: 1, hosts: [] })).toBe("Bring its picture");
    expect(picturesLabel({ count: 12, willFetch: 12, hosts: [] })).toBe("Bring its 12 pictures");
    expect(picturesLabel({ count: 1042, willFetch: 30, hosts: [] })).toBe("Bring the first 30 of its 1,042 pictures");
  });

  it("credit whoever the page credits, and no one when it credits no one", () => {
    expect(creditLine({ byline: null, site: null, published: null })).toBe("");
    expect(creditLine({ byline: null, site: "Field Notes", published: "not a date" })).toBe("Field Notes");
    expect(creditLine({ byline: "A. Writer", site: null, published: "2026-12-01" })).toBe("By A. Writer, 1 December 2026");
  });

  it("read a job's result only when it is the result of a save that worked", () => {
    expect(resultOf(undefined)).toBeUndefined();
    expect(resultOf(job({ state: "failed", result: { documentId: "01DOC" } }))).toBeUndefined();
    expect(resultOf(job({ state: "succeeded", result: { documentId: "../../settings" } }))).toBeUndefined();
    expect(resultOf(job({ state: "succeeded", result: { documentId: "01DOC" } }))).toEqual({
      documentId: "01DOC",
      title: "The page",
      url: "",
      pictures: { kept: 0, bytes: 0, skipped: [] },
    });
  });
});
