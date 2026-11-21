/**
 * The trainer's tabs: named for a beginner, in learn, practise and look-up order, while
 * the ?tab= ids that links and bookmarks use keep choosing the same panels; the Koch
 * lesson shows on Receive from every tab; and a device starts from the server's settings
 * and the contact log's callsign when it has none of its own.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tabs/receive-tab", () => ({ ReceiveTab: () => <p>receive panel</p> }));
vi.mock("./tabs/send-tab", () => ({ SendTab: () => <p>send panel</p> }));
vi.mock("./tabs/qso-tab", () => ({ QsoTab: () => <p>qso panel</p> }));
vi.mock("./tabs/on-the-air-tab", () => ({ default: () => <p>rbn panel</p> }));
vi.mock("./tabs/code-chart-tab", () => ({ CodeChartTab: () => <p>reference panel</p> }));
vi.mock("./tabs/progress-tab", () => ({ ProgressTab: () => <p>progress panel</p> }));

import MorsePage from "./morse-page";
import { getMorsePrefs, resetMorsePrefs } from "./prefs";

let served: unknown;
const requests: Array<{ method: string; url: string; body: unknown }> = [];

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <MorsePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const response = (over: Record<string, unknown> = {}) => ({
  progress: { kochLesson: 1, bestCharWpm: null, bestEffWpm: null, settings: {}, updatedAt: 0, ...over },
  sessions: [],
  sessionCount: 0,
  weakChars: {},
  suggestedCallsign: null,
});

beforeEach(() => {
  localStorage.clear();
  resetMorsePrefs();
  served = response();
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(init?.method === "PUT" ? { progress: {} } : served), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("the Morse trainer's tabs", () => {
  it("are named for a beginner, in learn, practise and look-up order", () => {
    renderAt("/radio/morse");
    expect(screen.getByRole("heading", { level: 1, name: "Morse trainer" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      expect.stringMatching(/^Receive/),
      "Send",
      "QSO practice",
      "On the air",
      "Code chart",
      "Progress",
    ]);
  });

  it.each([
    ["receive", /^Receive/, "receive panel"],
    ["send", /^Send$/, "send panel"],
    ["qso", /^QSO practice$/, "qso panel"],
    ["rbn", /^On the air$/, "rbn panel"],
    ["reference", /^Code chart$/, "reference panel"],
    ["progress", /^Progress$/, "progress panel"],
  ])("keep ?tab=%s choosing its panel", async (id, name, panel) => {
    renderAt(`/radio/morse?tab=${id}`);
    expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(panel)).toBeInTheDocument();
  });

  it("show the Koch lesson on Receive from every tab, the further on of this device's and the server's", async () => {
    served = response({ kochLesson: 7 });
    renderAt("/radio/morse?tab=progress");
    const receive = screen.getByRole("tab", { name: /^Receive/ });
    await waitFor(() => expect(receive).toHaveTextContent("L7"));
    expect(receive).toHaveAccessibleName("Receive L7, Koch lesson 7");
    expect(getMorsePrefs().kochLesson).toBe(7);
  });

  it("send this device's lesson up when it is further on than the server's", async () => {
    const { applyMorsePrefs } = await import("./prefs");
    applyMorsePrefs({ kochLesson: 5 });
    renderAt("/radio/morse");
    await waitFor(() => expect(requests).toContainEqual({ method: "PUT", url: "/api/morse/progress", body: { kochLesson: 5 } }));
  });

  it("start a device with no settings of its own from the server's, and from the contact log's callsign", async () => {
    served = { ...response({ settings: { charWpm: 22, keyType: "straight" } }), suggestedCallsign: "Q7OWN" };
    renderAt("/radio/morse");
    await waitFor(() => expect(getMorsePrefs()).toMatchObject({ charWpm: 22, keyType: "straight", callsign: "Q7OWN" }));
  });
});
