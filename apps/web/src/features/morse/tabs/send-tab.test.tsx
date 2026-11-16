import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMorsePrefs, DEFAULT_MORSE_PREFS } from "../prefs";
import { PRESET_NOTE, SendTab } from "./send-tab";

const tone = vi.hoisted(() => ({
  ensure: vi.fn(() => Promise.resolve()),
  unlock: vi.fn(),
  setFrequency: vi.fn(),
  setVolume: vi.fn(),
  playTimeline: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve(true), positionMs: () => 0, totalMs: 0 })),
  keyDown: vi.fn(),
  keyUp: vi.fn(),
  keyAt: vi.fn(),
  clearSchedule: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  soundState: vi.fn(() => "none"),
}));
vi.mock("../audio/sidetone", () => ({ getSidetone: () => tone }));

const requests: { method: string; url: string; body: unknown }[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ session: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SendTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  applyMorsePrefs({
    keyType: DEFAULT_MORSE_PREFS.keyType,
    keyDit: DEFAULT_MORSE_PREFS.keyDit,
    keyDah: DEFAULT_MORSE_PREFS.keyDah,
    keyStraight: DEFAULT_MORSE_PREFS.keyStraight,
    swapPaddles: DEFAULT_MORSE_PREFS.swapPaddles,
    presetId: DEFAULT_MORSE_PREFS.presetId,
  });
  window.history.replaceState({}, "", "/");
});

describe("the Send tab's real-key section", () => {
  it("folds key bindings and the physical key behind one closed disclosure", () => {
    renderTab();
    const toggle = screen.getByRole("button", { name: "Use a real key or paddle" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Key bindings" })).toBeNull();
    // The beginner's settings stay in view.
    expect(screen.getByRole("radiogroup", { name: "Key type" })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Key bindings" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Physical key or paddle" })).toBeVisible();
  });

  it("opens by itself when the key bindings are not the defaults", () => {
    applyMorsePrefs({ swapPaddles: true });
    renderTab();
    expect(screen.getByRole("button", { name: "Use a real key or paddle" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens from the #real-key link", () => {
    window.history.replaceState({}, "", "/morse?tab=send#real-key");
    renderTab();
    expect(screen.getByRole("button", { name: "Use a real key or paddle" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the panel mounted (hidden) after closing, so a connected key keeps working", () => {
    renderTab();
    const toggle = screen.getByRole("button", { name: "Use a real key or paddle" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Start mouse paddle" })).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel).toHaveAttribute("hidden");
    expect(panel).toHaveTextContent("Start mouse paddle");
  });
});

describe("the Send tab's key and keyer", () => {
  it("offers the four key types and shows the preset only for keyers that use one", () => {
    applyMorsePrefs({ keyType: "paddle" });
    renderTab();
    const group = screen.getByRole("radiogroup", { name: "Key type" });
    for (const name of ["Straight", "Iambic paddle", "Single lever", "Bug"]) expect(group).toHaveTextContent(name);
    expect(screen.getByText("Radio keyer preset")).toBeInTheDocument();
    expect(screen.getByText(PRESET_NOTE)).toBeInTheDocument();
    expect(screen.getByText(/Mode B with dit and dah memory/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Keyer speed" })).toBeInTheDocument();
    expect(screen.getByTestId("morse-paddles")).toBeInTheDocument();

    act(() => applyMorsePrefs({ keyType: "straight" }));
    expect(screen.queryByText("Radio keyer preset")).toBeNull();
    expect(screen.queryByRole("group", { name: "Keyer speed" })).toBeNull();
    expect(screen.getByTestId("morse-straight-key")).toBeInTheDocument();

    act(() => applyMorsePrefs({ keyType: "bug" }));
    expect(screen.queryByText("Radio keyer preset")).toBeNull();
    expect(screen.getByRole("group", { name: "Keyer speed" })).toBeInTheDocument();
  });

  it("changes the tone and the volume, and says what to check when nothing is heard", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Increase tone" }));
    expect(tone.setFrequency).toHaveBeenLastCalledWith(DEFAULT_MORSE_PREFS.toneHz + 25);
    fireEvent.click(screen.getByRole("button", { name: "Decrease volume" }));
    expect(tone.setVolume).toHaveBeenLastCalledWith(0.6);
    expect(screen.getByText(/silent switch/)).toBeInTheDocument();
    applyMorsePrefs({ toneHz: DEFAULT_MORSE_PREFS.toneHz, volume: DEFAULT_MORSE_PREFS.volume });
  });
});

describe("the Send tab's practice", () => {
  it("grades a quick target against what was keyed and keeps one send session", async () => {
    applyMorsePrefs({ keyType: "straight", keyStraight: "Space" });
    renderTab();
    expect(screen.getByText(/Key freely onto the tape/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New target" }));
    expect(screen.getByTestId("send-target").textContent).toMatch(/^[A-Z0-9 /?]+$/);
    const grade = screen.getByRole("button", { name: "Grade my sending" });
    expect(grade).toBeDisabled();

    const press = (type: "keydown" | "keyup") =>
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent(type, { code: "Space", bubbles: true }));
      });
    press("keydown");
    await new Promise((r) => setTimeout(r, 200));
    press("keyup");
    await waitFor(() => expect(grade).not.toBeDisabled(), { timeout: 3000 });
    fireEvent.click(grade);
    expect(screen.getByText(/copy accuracy/)).toBeInTheDocument();
    await waitFor(() => expect(requests.filter((r) => r.url === "/api/morse/sessions")).toHaveLength(1));
    expect(requests[0]!.body).toMatchObject({ kind: "send" });
  });

  it("switches between Quick targets, Echo and CQ conversations, each with its line", () => {
    applyMorsePrefs({ keyType: "paddle" });
    renderTab();
    expect(screen.getByText(/See it, key it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Echo" }));
    expect(screen.getByText(/Hear a hidden group/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeInTheDocument();
    // In Echo the keyer runs at the played speed instead of its own setting.
    expect(screen.queryByRole("group", { name: "Keyer speed" })).toBeNull();
    expect(screen.getByText(/In Echo the keyer runs at the played character speed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "CQ conversations" }));
    expect(screen.getByText(/whole CQ contact/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "CQ conversation type" })).toBeInTheDocument();
  });

  it("makes no request but to Outpost's own server", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Echo" }));
    fireEvent.click(screen.getByRole("radio", { name: "CQ conversations" }));
    await act(async () => {});
    for (const request of requests) expect(request.url.startsWith("/api/")).toBe(true);
  });
});
