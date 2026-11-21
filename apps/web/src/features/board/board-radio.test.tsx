/** Messages on a radio channel: the switch, the byte counter, and how a radio message is shown. Every person and radio here is made up. */
import { BOARD_LIMITS, type BoardMessage, type BoardSummaryResponse, type MeshChannel, type MeshResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardPage from "./board-page";
import { setDeviceName } from "./data";

beforeEach(() => {
  localStorage.clear();
  setDeviceName("Sam");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LONGFAST: MeshChannel = { id: "meshtastic:longfast", transport: "meshtastic", label: "LongFast", textBytes: 200, linkUp: true };

const mesh = (channels: MeshChannel[]): MeshResponse => ({
  meshtastic: {
    config: {
      mode: "broker",
      broker: { port: 1883, userName: "radio", passwordSet: true },
      client: { host: "", port: 1883, userName: "", passwordSet: false, rootTopic: "msh/EU_868" },
      channels: [{ name: "LongFast", index: 0 }],
    },
    status: {
      state: "connected",
      since: Date.now(),
      peers: [],
      lastHeardAt: null,
      lastError: null,
      retryAt: null,
      brokerAddresses: [],
      heardRoot: null,
      gateway: null,
      otherChannels: [],
      json: true,
    },
  },
  meshcore: {
    config: { mode: "off", device: null, host: "", port: 5000, channels: [] },
    status: { state: "off", since: null, lastHeardAt: null, lastError: null, retryAt: null, radioName: null, radioChannels: [] },
  },
  channels,
  right: { allowed: true },
  inContainer: false,
  lanAccess: true,
});

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

const summary: BoardSummaryResponse = {
  checkIns: [{ name: "Sam", latest: null }],
  people: ["Sam"],
  newSince: 0,
  newestAt: null,
  fileDays: 7,
  limits: BOARD_LIMITS,
};

const radioMessages = [
  message({
    id: "r1",
    channel: "meshtastic:longfast",
    source: "meshtastic",
    author: "Hilltop base",
    body: "Road over the pass is open.",
    meta: { node: { id: "!a1b2c3d4", shortName: "HTB", longName: "Hilltop base" } },
  }),
  message({
    id: "r2",
    channel: "meshtastic:longfast",
    source: "meshtastic",
    author: "!0badf00d",
    body: "Anyone on?",
    meta: { node: { id: "!0badf00d", shortName: null, longName: null } },
  }),
  message({ id: "r3", channel: "meshtastic:longfast", author: "Sam", body: "Heading home.", meta: null }),
  message({
    id: "r4",
    channel: "meshtastic:longfast",
    author: "Sam",
    body: "At the shop.",
    meta: { delivery: { state: "handed", at: Date.now() } },
  }),
  message({
    id: "r5",
    channel: "meshtastic:longfast",
    author: "Sam",
    body: "Back by six.",
    meta: { delivery: { state: "failed", at: Date.now(), detail: "the radio is away" } },
  }),
];

function serve(channels: MeshChannel[] | null, sent: Array<{ path: string; body: unknown }> = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        sent.push({ path: `${method} ${url.pathname}`, body });
        return json({ message: message({ id: "new", channel: body?.channel ?? "board", author: body?.author, body: body?.body ?? "" }) });
      }
      if (url.pathname === "/api/mesh")
        return channels ? json(mesh(channels)) : json({ error: { code: "not_found", message: "Not here." } }, 404);
      if (url.pathname === "/api/board/summary") return json(summary);
      if (url.pathname === "/api/board/messages") {
        const channel = url.searchParams.get("channel");
        return json({ messages: channel === "meshtastic:longfast" ? radioMessages : [message()], older: null });
      }
      return json({ error: { code: "not_found", message: "Not here." } }, 404);
    }),
  );
  return sent;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SWITCH = "Which board to read and write";

async function toLongFast() {
  await userEvent.click(await screen.findByRole("radio", { name: "LongFast" }));
  await screen.findByText("Road over the pass is open.");
}

describe("the channel switch", () => {
  it("is not there when no radio channel is carried, or when the server says nothing of one", async () => {
    serve(null);
    show();
    expect(await screen.findByText("Bins go out tonight.")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/mesh"))).toBe(true));
    expect(screen.queryByRole("radiogroup", { name: SWITCH })).not.toBeInTheDocument();
  });

  it("is not there when the radio link carries nothing", async () => {
    serve([]);
    show();
    expect(await screen.findByText("Bins go out tonight.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: SWITCH })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Send a file" })).toBeInTheDocument();
  });

  it("shows that channel's history, with the warning, no household check-ins and no file", async () => {
    serve([LONGFAST]);
    show();
    const group = await screen.findByRole("radiogroup", { name: SWITCH });
    expect(within(group).getByRole("radio", { name: "Home" })).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("Bins go out tonight.")).toBeInTheDocument();
    await toLongFast();
    expect(screen.queryByText("Bins go out tonight.")).not.toBeInTheDocument();
    expect(screen.getByText(/Anyone with a radio in range may read a public channel/)).toHaveTextContent(
      "not a way to call for help in an emergency",
    );
    expect(screen.queryByRole("list", { name: "Latest check-ins" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I'm safe/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Send a file" })).not.toBeInTheDocument();
    expect(localStorage.getItem("outpost.board.channel")).toBe("meshtastic:longfast");
  });

  it("keeps the choice on this device", async () => {
    localStorage.setItem("outpost.board.channel", "meshtastic:longfast");
    serve([LONGFAST]);
    show();
    expect(await screen.findByText("Road over the pass is open.")).toBeInTheDocument();
  });
});

describe("writing on a radio channel", () => {
  it("counts bytes, not characters, with the name in front", async () => {
    serve([LONGFAST]);
    show();
    await toLongFast();
    const field = screen.getByLabelText("Write a message on LongFast as Sam");
    // "Sam: " is five bytes.
    expect(screen.getByText(/^5 of 200 bytes/)).toBeInTheDocument();
    await userEvent.click(field);
    await userEvent.paste("é");
    expect(screen.getByText(/^7 of 200 bytes/)).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.paste("😀");
    expect(screen.getByText(/^9 of 200 bytes/)).toBeInTheDocument();
  });

  it("refuses rather than cuts a message over the limit", async () => {
    serve([{ ...LONGFAST, textBytes: 10 }]);
    show();
    await toLongFast();
    const field = screen.getByLabelText("Write a message on LongFast as Sam");
    await userEvent.click(field);
    await userEvent.paste("ééé");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Too long for one radio message: 11 of 10 bytes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send by radio/ })).toBeDisabled();
    expect(field).toHaveValue("ééé");
  });

  it("sends a message and a check-in to the channel", async () => {
    const sent = serve([LONGFAST]);
    show();
    await toLongFast();
    await userEvent.click(screen.getByLabelText("Write a message on LongFast as Sam"));
    await userEvent.paste("Home by six");
    await userEvent.click(screen.getByRole("button", { name: /Send by radio/ }));
    await userEvent.click(screen.getByRole("button", { name: /I'm safe/ }));
    await waitFor(() =>
      expect(sent).toEqual([
        { path: "POST /api/board/messages", body: { author: "Sam", body: "Home by six", channel: "meshtastic:longfast" } },
        { path: "POST /api/board/check-ins", body: { author: "Sam", status: "safe", place: null, channel: "meshtastic:longfast" } },
      ]),
    );
  });

  it("refuses a check-in whose place makes it too long", async () => {
    serve([{ ...LONGFAST, textBytes: 30 }]);
    show();
    await toLongFast();
    await userEvent.click(screen.getByLabelText(/Where you are, in a few words/));
    await userEvent.paste("at the far end of the valley");
    expect(screen.getByText(/Too long for one radio message/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I'm safe/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /I need help/ })).toBeDisabled();
  });
});

describe("a radio message on the board", () => {
  it("says it came by radio, who sent it as the radio names them, and what became of one written here", async () => {
    serve([LONGFAST]);
    show();
    await toLongFast();
    const list = screen.getByRole("list", { name: "Messages, oldest first" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Hilltop base");
    expect(within(rows[0]!).getByText("HTB")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("by radio")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("!0badf00d");
    expect(within(rows[2]!).queryByText("by radio")).not.toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("Going to the radio…");
    expect(rows[3]).toHaveTextContent("Handed to the radio");
    expect(rows[4]).toHaveTextContent("Did not go: the radio is away");
  });

  it("offers no Change on a radio message, and removing it says it is removed here only", async () => {
    serve([LONGFAST]);
    show();
    await toLongFast();
    await userEvent.click(screen.getByRole("button", { name: "What to do with Hilltop base's message" }));
    expect(await screen.findByRole("menuitem", { name: /Remove/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Change/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/removed from the board here only/);
  });
});
