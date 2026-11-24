/** Messages: what the board says, and each of its states. Every person here is made up. */
import { BOARD_LIMITS, type BoardCheckInLine, type BoardMessage, type BoardSummaryResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardPage from "./board-page";
import { setDeviceName } from "./data";
import { BoardHomeLine } from "./elsewhere";
import { checkInWords, isLong, linkPieces, whenCheckedIn, whenWritten } from "./words";

const NOW = new Date(2026, 10, 17, 15, 0).getTime();
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the words", () => {
  it("says when, in the house style for times", () => {
    expect(whenWritten(at(17, 14, 2), NOW)).toBe("14:02");
    expect(whenWritten(at(16, 9, 5), NOW)).toBe("yesterday, 09:05");
    expect(whenWritten(at(12, 9, 5), NOW)).toBe("Thursday, 09:05");
    expect(whenWritten(at(1, 9, 5), NOW)).toBe("1 Nov 2026, 09:05");
    expect(whenCheckedIn(at(17, 14, 2), NOW)).toBe("14:02 today");
  });

  it("puts each person's latest check-in in one line, and says when there has been none for a day", () => {
    const line = (latest: Partial<NonNullable<BoardCheckInLine["latest"]>> | null): BoardCheckInLine => ({
      name: "Sam",
      latest: latest && { id: "c", status: "safe", body: "", place: null, hasPosition: false, createdAt: at(17, 14, 2), ...latest },
    });
    expect(checkInWords(line({ place: "gone to Mum's" }), NOW)).toBe("safe · gone to Mum's · 14:02 today");
    expect(checkInWords(line({ status: "help", body: "Car won't start" }), NOW)).toBe("needs help: Car won't start · 14:02 today");
    // Its own full stop is left off, so that "fine.," never shows.
    expect(checkInWords(line({ body: "At work, all fine.", place: "Keswick library" }), NOW)).toBe(
      "safe: At work, all fine · Keswick library · 14:02 today",
    );
    expect(checkInWords(line({ status: "other", body: "On the train\nmore" }), NOW)).toBe("On the train · 14:02 today");
    expect(checkInWords(line({ createdAt: at(12, 18) }), NOW)).toBe("no check-in since Thursday");
    expect(checkInWords(line(null), NOW)).toBe("no check-in yet");
  });

  it("recognises web addresses as links and nothing else", () => {
    expect(linkPieces("See https://example.org/guide. Or javascript:alert(1) or <a href=x>")).toEqual([
      { text: "See " },
      { href: "https://example.org/guide", text: "https://example.org/guide" },
      { text: ". Or javascript:alert(1) or <a href=x>" },
    ]);
    expect(linkPieces("(http://example.org/a_(b))")).toEqual([
      { text: "(" },
      { href: "http://example.org/a_(b)", text: "http://example.org/a_(b)" },
      { text: ")" },
    ]);
    expect(isLong("short")).toBe(false);
    expect(isLong("a\n".repeat(10))).toBe(true);
  });
});

// ── The screen ──

const message = (over: Partial<BoardMessage> = {}): BoardMessage => ({
  sentAt: null,
  id: "m1",
  channel: "board",
  source: "here",
  kind: "message",
  author: "Alex",
  body: "Bins go out tonight.",
  status: null,
  place: null,
  position: null,
  file: null,
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now() - 60_000,
  edited: null,
  removed: null,
  meta: null,
  ...over,
});

const summary = (over: Partial<BoardSummaryResponse> = {}): BoardSummaryResponse => ({
  checkIns: [
    {
      name: "Sam",
      latest: { id: "c1", status: "safe", body: "", place: "gone to Mum's", hasPosition: false, createdAt: Date.now() - 60_000 },
    },
    { name: "Alex", latest: null },
  ],
  people: ["Sam", "Alex"],
  newSince: 0,
  newestAt: null,
  fileDays: 7,
  limits: BOARD_LIMITS,
  ...over,
});

interface Served {
  sent: Array<{ path: string; body: unknown }>;
}

function serve(routes: Record<string, unknown>): Served {
  const served: Served = { sent: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET")
        served.sent.push({ path: `${method} ${url.pathname}`, body: init?.body ? JSON.parse(String(init.body)) : null });
      const answer = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
      if (answer instanceof Response) return answer;
      if (answer !== undefined) return json(typeof answer === "function" ? (answer as (url: URL) => unknown)(url) : answer);
      return json({ error: { code: "not_found", message: "Not here." } }, 404);
    }),
  );
  return served;
}

function show(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the Messages screen", () => {
  it("asks for a name first, offering the household's people, and says plainly that names prove nothing", async () => {
    serve({ "/api/board/summary": summary(), "/api/board/messages": { messages: [], older: null } });
    show(<BoardPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeInTheDocument();
    expect(screen.getByText(/anyone on the home network can read everything here, post under any name/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who is using this device?" })).toBeInTheDocument();
    const people = await screen.findByRole("list", { name: "The household's people" });
    expect(
      within(people)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Sam", "Alex"]);
    expect(screen.getByText("Choose a name above to check in.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /I'm safe/ })).not.toBeInTheDocument();
    await userEvent.click(within(people).getByRole("button", { name: "Alex" }));
    expect(await screen.findByText("Alex", { selector: "span.font-semibold" })).toBeInTheDocument();
    expect(localStorage.getItem("outpost.board.name")).toBe("Alex");
    expect(screen.getByRole("button", { name: /I'm safe/ })).toBeInTheDocument();
  });

  it("shows loading, then the empty board", async () => {
    setDeviceName("Sam");
    serve({ "/api/board/summary": summary(), "/api/board/messages": { messages: [], older: null } });
    show(<BoardPage />);
    expect(await screen.findByRole("heading", { name: "Nothing on the board yet" })).toBeInTheDocument();
  });

  it("says when the board could not be loaded, and tries again", async () => {
    setDeviceName("Sam");
    serve({
      "/api/board/summary": summary(),
      "/api/board/messages": new Response(JSON.stringify({ error: { code: "internal", message: "The database is busy." } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    });
    show(<BoardPage />);
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lists everyone's latest check-in at the top and checks in with one press", async () => {
    setDeviceName("Sam");
    const served = serve({
      "/api/board/summary": summary(),
      "/api/board/messages": { messages: [message()], older: null },
      "POST /api/board/check-ins": {
        message: message({ id: "m2", kind: "checkin", author: "Sam", status: "safe", body: "", place: "at work" }),
      },
    });
    show(<BoardPage />);
    const strip = await screen.findByRole("list", { name: "Latest check-ins" });
    expect(
      within(strip)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([expect.stringMatching(/^Sam: safe · gone to Mum's · \d\d:\d\d today$/), "Alex: no check-in yet"]);
    await userEvent.type(screen.getByLabelText(/Where you are, in a few words/), "at work");
    await userEvent.click(screen.getByRole("button", { name: /I'm safe/ }));
    await waitFor(() =>
      expect(served.sent).toContainEqual({ path: "POST /api/board/check-ins", body: { author: "Sam", status: "safe", place: "at work" } }),
    );
  });

  it("says a position needs a secure page on plain http, and where to set one up", async () => {
    setDeviceName("Sam");
    vi.stubGlobal("isSecureContext", false);
    serve({ "/api/board/summary": summary(), "/api/board/messages": { messages: [], older: null } });
    show(<BoardPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Words of my own…" }));
    const dialog = await screen.findByRole("dialog", { name: "Check in" });
    expect(within(dialog).getByText(/opened over plain http, so the browser does not offer it/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Settings, HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers the position on a secure page, only when ticked", async () => {
    setDeviceName("Sam");
    vi.stubGlobal("isSecureContext", true);
    const getCurrentPosition = vi.fn((done: PositionCallback) =>
      done({ coords: { latitude: 54.123456789, longitude: -3.2, accuracy: 12.4 } } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    const served = serve({
      "/api/board/summary": summary(),
      "/api/board/messages": { messages: [], older: null },
      "POST /api/board/check-ins": { message: message({ kind: "checkin" }) },
    });
    show(<BoardPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Words of my own…" }));
    const dialog = await screen.findByRole("dialog", { name: "Check in" });
    await userEvent.type(within(dialog).getByLabelText("Your words"), "On the train");
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(served.sent[0]).toEqual({
        path: "POST /api/board/check-ins",
        body: { author: "Sam", status: "other", body: "On the train", place: null, position: { lat: 54.123457, lon: -3.2, accuracyM: 12 } },
      }),
    );
  });

  it("draws messages as text, files with their name, size and who sent them, and a removed message's trail", async () => {
    setDeviceName("Sam");
    serve({
      "/api/board/summary": summary(),
      "/api/board/messages": {
        messages: [
          message({ body: "<b>bold</b> see https://example.org" }),
          message({
            id: "m2",
            author: "Jo",
            body: "",
            file: { id: "f1", name: "list.txt", sizeBytes: 2048, picture: false, expiresAt: null, gone: null, url: "/api/board/files/f1" },
          }),
          message({ id: "m3", author: "Alex", body: "", removed: { by: "Sam", at: at(17, 14, 2) } }),
        ],
        older: "m1",
      },
    });
    show(<BoardPage />);
    expect(await screen.findByText("<b>bold</b> see", { exact: false })).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByRole("link", { name: "https://example.org" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("list.txt")).toBeInTheDocument();
    expect(screen.getByText("2.05 kB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Save/ })).toHaveAttribute("href", "/api/board/files/f1");
    expect(screen.getByText(/Kept until someone removes it/)).toBeInTheDocument();
    expect(screen.getByText(/Message removed by Sam at /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show earlier messages" })).toBeInTheDocument();
  });

  it("asks before adding a received file to the library", async () => {
    setDeviceName("Sam");
    const served = serve({
      "/api/board/summary": summary(),
      "/api/board/messages": {
        messages: [
          message({
            file: { id: "f1", name: "recipe.pdf", sizeBytes: 900, picture: false, expiresAt: null, gone: null, url: "/api/board/files/f1" },
          }),
        ],
        older: null,
      },
      "POST /api/board/files/f1/library": { status: "created", document: { id: "d1", title: "recipe" } },
    });
    show(<BoardPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Add to library/ }));
    const ask = await screen.findByRole("alertdialog", { name: /Add “recipe.pdf” to the library\?/ });
    expect(served.sent).toEqual([]);
    await userEvent.click(within(ask).getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(served.sent.map((entry) => entry.path)).toEqual(["POST /api/board/files/f1/library"]));
  });

  it("states the size limit before a file is sent, and refuses one over it on the device", async () => {
    setDeviceName("Sam");
    serve({
      "/api/board/summary": summary({ limits: { ...BOARD_LIMITS, fileBytes: 1000 } }),
      "/api/board/messages": { messages: [], older: null },
    });
    show(<BoardPage />);
    expect(await screen.findByText(/Up to 1.00 kB, kept for 7 days, then removed/)).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array(1001)], "big.bin"));
    expect(await screen.findByText(/This is larger than 1.00 kB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to the board/ })).toBeDisabled();
  });

  it("removes a message after asking, saying it leaves a trail", async () => {
    setDeviceName("Sam");
    const served = serve({
      "/api/board/summary": summary(),
      "/api/board/messages": { messages: [message()], older: null },
      "POST /api/board/messages/m1/remove": { message: message({ body: "", removed: { by: "Sam", at: Date.now() } }) },
    });
    show(<BoardPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^What to do with Alex's message/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Remove/ }));
    const ask = await screen.findByRole("alertdialog", { name: "Remove Alex's message?" });
    expect(ask).toHaveTextContent(/keeps a line in its place saying that Sam removed it/);
    await userEvent.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(served.sent).toEqual([{ path: "POST /api/board/messages/m1/remove", body: { by: "Sam" } }]));
    expect(await screen.findByText(/Message removed by Sam at/)).toBeInTheDocument();
  });
});

describe("the line on Home", () => {
  it("says how many are new, and is not there when nothing is", async () => {
    serve({ "/api/board/summary": (url: URL) => summary({ newSince: url.searchParams.get("since") === "1000" ? 2 : 0 }) });
    localStorage.setItem("outpost.board.seenAt", "1000");
    show(<BoardHomeLine />);
    expect(await screen.findByRole("link", { name: "2 new on the board" })).toHaveAttribute("href", "/messages");
  });

  it("draws nothing when there is nothing new", async () => {
    const fetched = serve({ "/api/board/summary": summary({ newSince: 0 }) });
    localStorage.setItem("outpost.board.seenAt", "5");
    show(<BoardHomeLine />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(fetched.sent).toEqual([]);
  });
});
