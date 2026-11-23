import type { DeviceStatus, ServerClock } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clockIsWrong, offsetOf, offsetSentence } from "./clock";
import { ClockNotice } from "./clock-notice";
import StatusPage, { overallSentence } from "./status-page";

const HOUR = 3_600_000;

function clockAnswer(offsetMs: number, allowed: boolean): ServerClock {
  return {
    now: Date.now() + offsetMs,
    timeZone: "Europe/London",
    setting: {
      possible: true,
      how: "helper",
      allowed,
      reason: allowed ? null : "Only the computer Outpost runs on may set its clock. Start Outpost with OUTPOST_ALLOW_REMOTE_CLOCK=true.",
      option: "OUTPOST_ALLOW_REMOTE_CLOCK",
    },
  };
}

const STATUS: DeviceStatus = {
  checkedAt: Date.now(),
  eventLoop: { measuring: true, minutes: [{ at: Date.now(), worstMs: 1200, meanMs: 3.5 }], worst: { at: Date.now(), ms: 1200 } },
  checks: [
    {
      id: "storage:a",
      group: "storage",
      title: "Internal storage",
      state: "good",
      summary: "Connected. 40 GB free of 64 GB (62% free).",
      advice: null,
      link: { to: "/storage", label: "Storage" },
    },
    {
      id: "backup",
      group: "data",
      title: "Last backup",
      state: "attention",
      summary: "No backup has been made.",
      advice: "Save one from Settings, Backup.",
      link: null,
    },
    {
      id: "card:mmcblk0",
      group: "device",
      title: "SD card",
      state: "unknown",
      summary: "SD cards do not report their wear.",
      advice: null,
      link: null,
    },
    {
      id: "slow",
      group: "work",
      title: "Anything slow lately",
      state: "attention",
      summary: "Held up for up to 1.2 s.",
      advice: null,
      link: null,
    },
  ],
};

/** Answers the app's requests: the clock and the status, and records what is sent. */
function serve(clock: ServerClock) {
  const sent: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = url.includes("/api/device/clock") ? (init?.method === "POST" ? { now: Date.now(), movedMs: HOUR } : clock) : STATUS;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return sent;
}

function show(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("comparing clocks", () => {
  it("takes the server's time as of the middle of the request, and a minute's difference as none", () => {
    expect(offsetOf(10_500, 10_000, 11_000)).toBe(0);
    expect(offsetOf(10_000 - HOUR, 10_000, 10_200)).toBe(-HOUR - 100);
    expect(clockIsWrong(59_000)).toBe(false);
    expect(clockIsWrong(-61_000)).toBe(true);
    expect(offsetSentence(-(3 * HOUR + 12 * 60_000), "phone")).toBe("The server's clock is 3 hours 12 minutes behind this phone's.");
    expect(offsetSentence(2 * 86_400_000, "computer")).toBe("The server's clock is 48 hours ahead of this computer's.");
  });
});

describe("the clock notice", () => {
  it("says nothing when the clocks agree", async () => {
    serve(clockAnswer(5_000, true));
    show(<ClockNotice />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says how far out the server is and sets it from this device's clock", async () => {
    const sent = serve(clockAnswer(-HOUR, true));
    show(<ClockNotice />);
    expect(await screen.findByRole("status")).toHaveTextContent(/The server's clock is 1 hour behind this computer's/);
    await userEvent.click(screen.getByRole("button", { name: "Set the server's clock from this computer" }));
    await vi.waitFor(() => expect(sent.some((request) => request.method === "POST")).toBe(true));
    const posted = sent.find((request) => request.method === "POST")?.body as { deviceNow: number };
    expect(Math.abs(posted.deviceNow - Date.now())).toBeLessThan(5_000);
  });

  it("where it may not be set from here, says why and the option, with no button that does nothing", async () => {
    serve(clockAnswer(2 * HOUR, false));
    show(<ClockNotice />);
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/ahead of this computer's/);
    expect(notice).toHaveTextContent("OUTPOST_ALLOW_REMOTE_CLOCK=true");
    expect(screen.queryByRole("button", { name: /Set the server's clock/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("the status screen", () => {
  it("gives the answer first, then each line in words, the clock with them", async () => {
    serve(clockAnswer(-HOUR, true));
    show(<StatusPage />);
    expect(await screen.findByText("Internal storage")).toBeInTheDocument();
    expect(screen.getByText(/things need attention/)).toBeInTheDocument();
    expect(screen.getByText("No backup has been made.")).toBeInTheDocument();
    expect(screen.getByText("Not reported")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Clock" })).toBeInTheDocument();
    // Under the sentence, what needs attention, each a link to its line further down.
    const needing = screen.getByRole("navigation", { name: "What needs attention" });
    expect(within(needing).getByRole("link", { name: "Clock" })).toHaveAttribute("href", "#check-clock");
    expect(screen.getByRole("heading", { name: "Clock" }).closest("li")).toHaveAttribute("id", "check-clock");
    expect(screen.getByRole("button", { name: "Set the server's clock from this computer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Storage" })).toHaveAttribute("href", "/storage");
    expect(screen.getByText("The hold-ups, minute by minute")).toBeInTheDocument();
  });

  it("counts what needs doing in one sentence", () => {
    expect(overallSentence([{ state: "good" }, { state: "unknown" }])).toBe("Everything is fine.");
    expect(overallSentence([{ state: "attention" }])).toBe("1 thing needs attention.");
    expect(overallSentence([{ state: "problem" }, { state: "attention" }, { state: "attention" }])).toBe(
      "1 problem, 2 things need attention.",
    );
    // What has not been checked is never called fine.
    expect(overallSentence([{ state: "good" }, { state: "unchecked" }])).toBe("Nothing needs attention. 1 thing is not checked yet.");
    expect(overallSentence([{ state: "attention" }, { state: "unchecked" }])).toBe("1 thing needs attention. 1 thing is not checked yet.");
  });

  it("says the database is not checked yet, and checks it at a press", async () => {
    const user = userEvent.setup();
    const sent = serve(clockAnswer(0, true));
    STATUS.checks.push({
      id: "database",
      group: "data",
      title: "Database",
      state: "unchecked",
      summary: "5.64 MB. Not checked for damage yet.",
      advice: "A check reads the whole file and takes a moment.",
      link: { to: "/storage", label: "Storage" },
    });
    try {
      show(<StatusPage />);
      expect(await screen.findByText("Not checked for damage yet.", { exact: false })).toBeInTheDocument();
      const row = screen.getByRole("heading", { name: "Database" }).closest("li") as HTMLElement;
      expect(row).toHaveTextContent("Not checked yet");
      expect(row).not.toHaveTextContent("Fine");
      await user.click(screen.getByRole("button", { name: "Check now" }));
      expect(sent.some((request) => request.url.includes("/api/database/check") && request.method === "POST")).toBe(true);
    } finally {
      STATUS.checks.pop();
    }
  });
});
