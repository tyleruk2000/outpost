import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMorsePrefs, getMorsePrefs } from "../prefs";
import OnTheAirTab, { RBN_SPOTS_URL } from "./on-the-air-tab";

const tone = vi.hoisted(() => ({
  ensure: vi.fn(() => Promise.resolve()),
  unlock: vi.fn(),
  setFrequency: vi.fn(),
  setVolume: vi.fn(),
  keyDown: vi.fn(),
  keyUp: vi.fn(),
  keyAt: vi.fn(),
  clearSchedule: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  soundState: vi.fn(() => "none"),
  playTimeline: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve(true), positionMs: () => 0, totalMs: 0 })),
}));
vi.mock("../audio/sidetone", () => ({ getSidetone: () => tone }));

const requests: { method: string; url: string; body: unknown }[] = [];

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OnTheAirTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sessions = () => requests.filter((r) => r.method === "POST" && r.url === "/api/morse/sessions");

const press = (type: "keydown" | "keyup") =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent(type, { code: "Space", bubbles: true }));
  });

describe("On the air", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requests.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return new Response(JSON.stringify({ session: {} }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    applyMorsePrefs({ keyType: "straight", keyStraight: "Space", keyerWpm: 18, callsign: "Q4ABC" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    applyMorsePrefs({ callsign: "" });
  });

  it("builds the call from the trainer's callsign and explains each part", () => {
    renderTab();
    expect(screen.getByLabelText("A callsign to practise with")).toHaveValue("Q4ABC");
    expect(screen.getByText("CQ CQ DE Q4ABC Q4ABC K")).toBeInTheDocument();
    const parts = screen.getByRole("list", { name: "Why each part is there" });
    expect(within(parts).getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(screen.getByRole("radio", { name: "TEST DE" }));
    expect(screen.getByText("TEST DE Q4ABC Q4ABC")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Contest style" }));
    expect(screen.getByText("TEST Q4ABC Q4ABC")).toBeInTheDocument();
    expect(screen.getByText(/does not key your radio/)).toBeInTheDocument();
    expect(screen.getByText(/The trainer never keys a radio/)).toBeInTheDocument();
  });

  it("sends the call three times when asked", () => {
    renderTab();
    fireEvent.click(screen.getByRole("switch", { name: "Send my call three times" }));
    expect(screen.getByText("CQ CQ DE Q4ABC Q4ABC Q4ABC K")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Why each part is there" })).getAllByRole("listitem")).toHaveLength(7);
  });

  it("keeps the callsign typed here with the trainer's settings", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("A callsign to practise with"), { target: { value: "q7xyz" } });
    expect(getMorsePrefs().callsign).toBe("Q7XYZ");
    expect(screen.getByText("CQ CQ DE Q7XYZ Q7XYZ K")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("A callsign to practise with"), { target: { value: "Q7" } });
    expect(screen.getByText(/does not look like a callsign yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hear it/ })).toBeDisabled();
  });

  it("asks for a callsign when the trainer has none", () => {
    applyMorsePrefs({ callsign: "" });
    renderTab();
    expect(screen.getByText(/Enter your callsign to build the call/)).toBeInTheDocument();
    expect(screen.getByText("CQ CQ DE YOURCALL YOURCALL K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hear it/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check my call" })).toBeDisabled();
  });

  it("plays the call at the chosen speed", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Increase speed" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hear it/ }));
    });
    expect(tone.playTimeline).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("group", { name: "Speed" })).toHaveTextContent("19");
  });

  it("checks the call against what a skimmer needs and keeps one session per attempt, however often Check is pressed", async () => {
    renderTab();
    press("keydown");
    await new Promise((r) => setTimeout(r, 200));
    press("keyup");
    const check = screen.getByRole("button", { name: "Check my call" });
    await waitFor(() => expect(check).not.toBeDisabled());
    fireEvent.click(check);
    fireEvent.click(check);
    const result = screen.getByTestId("rbn-result");
    expect(within(result).getAllByText(/needs work|pass/).length).toBeGreaterThan(0);
    expect(within(result).getByText(/before calling on the air/)).toBeInTheDocument();
    expect(check).toBeDisabled();
    expect(screen.getByText(/start a new attempt/)).toBeInTheDocument();
    await waitFor(() => expect(sessions()).toHaveLength(1));
    expect(sessions()[0]!.body).toMatchObject({ kind: "send", charWpm: 18 });
    fireEvent.click(screen.getByRole("button", { name: "Clear and try again" }));
    expect(screen.queryByText(/start a new attempt/)).toBeNull();
    expect(screen.queryByTestId("rbn-result")).toBeNull();
    await act(async () => {});
    expect(sessions()).toHaveLength(1);
  });

  it("lists what to do before calling on the air", () => {
    renderTab();
    const section = screen.getByRole("region", { name: "Before calling on the air, once licensed" });
    expect(within(section).getByText("Listen first")).toBeInTheDocument();
    expect(within(section).getByText("Always identify")).toBeInTheDocument();
  });

  it("explains the Reverse Beacon Network and links to it, opened only by the person", () => {
    renderTab();
    const section = screen.getByRole("region", { name: "Did the RBN hear you?" });
    expect(within(section).getByText(/run by volunteers/)).toBeInTheDocument();
    const link = within(section).getByRole("link", { name: /Open the Reverse Beacon Network's spots/ });
    expect(link).toHaveAttribute("href", "https://www.reversebeacon.net/main.php");
    expect(RBN_SPOTS_URL).toBe("https://www.reversebeacon.net/main.php");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(within(section).getByText("Type your call into the box for the spotted station there.")).toBeInTheDocument();
    expect(
      within(section).getByText("Outpost itself asks the network nothing: the page opens only if you press the link."),
    ).toBeInTheDocument();
    // No spot list any more.
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("makes no request but to Outpost's own server", async () => {
    renderTab();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hear it/ }));
    });
    press("keydown");
    await new Promise((r) => setTimeout(r, 200));
    press("keyup");
    const check = screen.getByRole("button", { name: "Check my call" });
    await waitFor(() => expect(check).not.toBeDisabled());
    fireEvent.click(check);
    await waitFor(() => expect(sessions()).toHaveLength(1));
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.url.startsWith("/api/")).toBe(true);
  });
});
