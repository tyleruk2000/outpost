/**
 * Readiness: the words of the roll call and the checks, Home's one line of what is
 * overdue, the log as it prints, the drill's answers kept on the device, and the roll
 * call and drill screens as a person sees them.
 */
import type { DrillLine, EventLogLine, RollCallLine, RollCallResponse, RoutineCheck } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDeviceName } from "@/features/board/data";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import CheckInPage from "./check-in-page";
import ChecksPage from "./checks-page";
import DrillPage, { thisDeviceLine } from "./drill-page";
import { answerStep, drillProgress, setDrillProgress } from "./drill-steps";
import { logDocument } from "./log-document";
import { checkDueWords, everyWords, overdueLine, rollCallWords } from "./words";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 21, 15, 0).getTime();

const check = (over: Partial<RoutineCheck> = {}): RoutineCheck => ({
  id: "c1",
  name: "Run the generator",
  everyDays: 30,
  note: "",
  link: null,
  templateId: null,
  lastDoneAt: null,
  lastDoneBy: null,
  dueAt: null,
  overdue: true,
  position: 0,
  updatedAt: 1,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  setDrillProgress(null);
  setDeviceName(null);
});

describe("what the screens say", () => {
  it("says a person's latest check-in with its age, and by radio when it came that way", () => {
    const line: RollCallLine = {
      name: "Sam",
      answered: true,
      latest: {
        id: "m",
        status: "safe",
        body: "",
        place: "Gone to Mum's",
        hasPosition: false,
        createdAt: NOW - 2 * 60 * 60_000,
        channel: "board",
      },
    };
    expect(rollCallWords(line, NOW)).toBe("safe · Gone to Mum's · 13:00 today (2 hours ago)");
    expect(
      rollCallWords({ ...line, latest: { ...line.latest!, channel: "meshtastic:longfast", status: "help", body: "Car stuck." } }, NOW),
    ).toBe("needs help: Car stuck · Gone to Mum's · by radio · 13:00 today (2 hours ago)");
    expect(rollCallWords({ name: "Jo", answered: false, latest: null }, NOW)).toBe("has not checked in");
  });

  it("says how often in a household's words", () => {
    expect(everyWords(182)).toBe("Every 6 months");
    expect(everyWords(30)).toBe("Every 30 days");
    expect(everyWords(365)).toBe("Every year");
    expect(everyWords(14)).toBe("Every 2 weeks");
  });

  it("says when a check was done and when it is due, and Home names only what is overdue", () => {
    const done = check({ lastDoneAt: NOW - 20 * DAY, lastDoneBy: "Sam", dueAt: NOW + 10 * DAY, overdue: false });
    expect(checkDueWords(done, NOW)).toBe("Done 1 Nov 2026 by Sam · due in 10 days");
    expect(checkDueWords(check(), NOW)).toBe("Never done");
    expect(overdueLine([done], NOW)).toBeNull();
    expect(overdueLine([done, check(), check({ id: "c2", name: "Test the torches" })], NOW)).toBe("run the generator and test the torches");
    expect(overdueLine([check(), check({ name: "A" }), check({ name: "B" }), check({ name: "C" })], NOW)).toBe(
      "run the generator, a and 2 more",
    );
  });

  it("prints the log as a table for each day, with check-ins and ticked steps marked, and its names found", async () => {
    const lines: EventLogLine[] = [
      {
        kind: "entry",
        id: "a",
        at: NOW - DAY,
        author: "Ana",
        text: "Power went off",
        planId: null,
        planName: null,
        createdAt: 1,
        updatedAt: 1,
        edited: null,
      },
      {
        kind: "checkin",
        id: "b",
        at: NOW - 60_000,
        author: "Ελένη",
        text: "Checked in: OK",
        planId: null,
        planName: null,
        createdAt: 1,
        updatedAt: 1,
        edited: null,
      },
      {
        kind: "tick",
        id: "p:s",
        at: NOW,
        author: "",
        text: "Done: Switch off the oven",
        planId: "p",
        planName: "Power cut",
        createdAt: 1,
        updatedAt: 1,
        edited: null,
      },
    ];
    const doc = logDocument(lines, { now: NOW, made: new Date(NOW) });
    const words = contentText(doc.content);
    expect(words).toContain("20 Nov 2026 to 21 Nov 2026");
    expect(words).toContain("3 lines, among them 1 check-in and 1 ticked step");
    expect(words.indexOf("20 Nov 2026")).toBeLessThan(words.indexOf("Power went off"));
    expect(words).toContain("Done: Switch off the oven (Power cut)");
    expect(words).toContain("Plan step");
    const printed = await renderPdf(doc);
    writeSample("readiness-log-after", printed.bytes);
    const loading = getDocument({ data: printed.bytes.slice() });
    const page = await (await loading.promise).getPage(1);
    const text = ((await page.getTextContent()).items as Array<{ str: string }>).map((item) => item.str).join(" ");
    await loading.destroy();
    for (const expected of ["Ελένη", "Power went off", "Check-in", "Plan step ticked", "15:00"]) expect(text).toContain(expected);
  });
});

describe("the drill on this device", () => {
  it("keeps each answer as it is given, and takes one back on a second press", () => {
    answerStep("map", "worked", NOW);
    answerStep("radio", "failed", NOW);
    expect(drillProgress()?.answers).toEqual({ map: "worked", radio: "failed" });
    answerStep("map", "worked", NOW);
    expect(drillProgress()?.answers).toEqual({ radio: "failed" });
    expect(drillProgress()?.startedAt).toBe(NOW);
  });

  it("says what this device keeps, and that a plain http page keeps nothing", () => {
    expect(thisDeviceLine(false, undefined).state).toBe("missing");
    expect(thisDeviceLine(true, [{ kind: "area" }, { kind: "plan" }, { kind: "plan" }]).summary).toBe("1 map area, 2 plans.");
    expect(thisDeviceLine(true, []).state).toBe("missing");
  });
});

function serve(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const body = routes[pathname] ?? {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderScreen(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the screens", () => {
  beforeEach(() => setDeviceName("Ana"));

  it("lists the roll call and names who has not checked in since the last ask", async () => {
    const roll: RollCallResponse = {
      since: Date.now() - 60 * 60_000,
      answered: 1,
      asks: [{ id: "r", askedBy: "Ana", note: "", at: Date.now() - 60 * 60_000 }],
      lines: [
        {
          name: "Sam",
          answered: true,
          latest: { id: "m", status: "safe", body: "", place: null, hasPosition: false, createdAt: Date.now(), channel: "board" },
        },
        { name: "Jo", answered: false, latest: null },
      ],
    };
    serve({
      "/api/board/roll-call": roll,
      "/api/board/summary": { checkIns: [], people: ["Sam", "Jo"], newSince: 0, newestAt: null, fileDays: 7, limits: {} },
      "/api/mesh": { channels: [] },
    });
    renderScreen(<CheckInPage />);
    expect(await screen.findByText(/1 of 2 checked in since .*, when Ana asked\./)).toBeTruthy();
    expect(screen.getByText("Not checked in since then:", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: /I'm safe/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ask everyone to check in/ }));
    expect(await screen.findByRole("dialog", { name: "Ask everyone to check in" })).toBeTruthy();
  });

  it("shows each line of the drill as held, missing or not checked, with the screen that fixes it", async () => {
    const lines: DrillLine[] = [
      {
        id: "map",
        title: "A map of home",
        state: "missing",
        summary: "No map that is installed covers Home.",
        link: { to: "/maps?tab=offline", label: "Maps, Offline maps" },
      },
      {
        id: "plan",
        title: "An emergency plan",
        state: "held",
        summary: "1 plan: Power cut.",
        link: { to: "/prepare/plans", label: "Emergency plans" },
      },
      {
        id: "radio-mains",
        title: "The radio receiver is heard with the power off",
        state: "untried",
        summary: "Outpost does not check this yet.",
        link: null,
      },
    ];
    serve({ "/api/offline-drill": { checkedAt: Date.now(), lines, lastRun: null } });
    renderScreen(<DrillPage />);
    expect(await screen.findByText("A map of home")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Maps, Offline maps" })).toBeTruthy();
    expect(screen.getByText("Not checked")).toBeTruthy();
    // The drill's own steps are answered here, and the result offered once one is.
    fireEvent.click(screen.getByRole("button", { name: "Step 3 worked" }));
    expect(await screen.findByRole("button", { name: "Keep the result" })).toBeTruthy();
  });
});

describe("marking a check done", () => {
  beforeEach(() => setDeviceName("Ana"));

  it("sends the check as the screen showed it, so a newer done on another device is not put back", async () => {
    const bodies: unknown[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const { pathname } = new URL(String(input), "http://outpost.test");
        if (pathname.endsWith("/done")) {
          bodies.push(JSON.parse(String(init?.body)));
          return json({ check: check({ updatedAt: 9, lastDoneAt: Date.now(), overdue: false }) });
        }
        return json(pathname === "/api/routine-checks" ? { checks: [check({ updatedAt: 7 })], expiringSupplies: 0 } : {});
      }),
    );
    renderScreen(<ChecksPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Done today/ }));
    await vi.waitFor(() => expect(bodies).toEqual([{ by: "Ana", baseUpdatedAt: 7 }]));
  });
});

describe("undoing a check marked done", () => {
  beforeEach(() => setDeviceName("Ana"));

  function serveChecks(first: RoutineCheck) {
    const bodies: Array<{ path: string; body: unknown }> = [];
    let current = first;
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const { pathname } = new URL(String(input), "http://outpost.test");
        if (init?.method && init.method !== "GET") {
          const body = JSON.parse(String(init.body));
          bodies.push({ path: `${init.method} ${pathname}`, body });
          current = pathname.endsWith("/done")
            ? check({ ...current, lastDoneAt: body.at === undefined ? Date.now() : body.at, updatedAt: current.updatedAt + 1 })
            : check({ ...current, ...body, updatedAt: current.updatedAt + 1 });
          return json({ check: current });
        }
        return json(pathname === "/api/routine-checks" ? { checks: [current], expiringSupplies: 0 } : {});
      }),
    );
    return bodies;
  }

  it("keeps Undo on the row after the toast has gone, and puts the last time back", async () => {
    const bodies = serveChecks(check({ lastDoneAt: Date.UTC(2026, 9, 1), lastDoneBy: "Sam", updatedAt: 7 }));
    renderScreen(<ChecksPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Done today/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo “Done today”" }));
    await vi.waitFor(() =>
      expect(bodies.at(-1)).toEqual({
        path: "POST /api/routine-checks/c1/done",
        body: { by: "Sam", at: Date.UTC(2026, 9, 1), baseUpdatedAt: 8 },
      }),
    );
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Undo “Done today”" })).toBeNull());
  });

  it("clears the last time from Change, for a check marked done by mistake", async () => {
    const bodies = serveChecks(check({ lastDoneAt: Date.now() - 60_000, lastDoneBy: "Ana", updatedAt: 7 }));
    renderScreen(<ChecksPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Change “Run the generator”" }));
    const field = await screen.findByLabelText(/Last done/);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(bodies.at(-1)).toEqual({ path: "POST /api/routine-checks/c1/done", body: { by: "", at: null, baseUpdatedAt: 8 } }),
    );
  });
});
