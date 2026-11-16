/**
 * The line shown where a prediction would be asked for when VOACAP's data is not here,
 * the download it offers, and removing the data. Every figure here is made up for the test.
 */
import type { EngineDataStatus, EngineStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineNotReady, RemoveEngineData } from "./engine-data";

afterEach(() => vi.unstubAllGlobals());

const data = (change: Partial<EngineDataStatus> = {}): EngineDataStatus => ({
  installed: false,
  line: "VOACAP's ionospheric and noise maps are not on this computer yet (15 files, 559 kB).",
  why: "They are CCIR data, and the ITU has not given Outpost permission to pass them on, so they are fetched from the engine's own project when you ask.",
  bytes: 559_336,
  files: 15,
  downloading: false,
  how: null,
  at: null,
  from: null,
  source: "https://github.com/jonathanmcsweet/hfcast-engine at bf34e8f9f375, embedded/",
  version: "hfcast-bf34e8f9f375",
  sha256: "9".repeat(64),
  collectionId: null,
  removalWarning: "Without these files the HF propagation planner stops working until they are downloaded again.",
  ...change,
});

const engine = (change: Partial<EngineStatus> = {}): EngineStatus =>
  ({
    id: "voacap",
    name: "VOACAP",
    model: "VOACAP Version 16.1207W",
    ready: false,
    problem: data().line,
    selected: true,
    data: data(),
    ...change,
  }) as EngineStatus;

function serve() {
  const sent: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      sent.push(`${init?.method ?? "GET"} ${pathname}`);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (pathname === "/api/radio/propagation/engine-data/download") return json({ download: { id: "d1" }, status: data() });
      if (pathname === "/api/radio/propagation/engine-data") return json(data());
      return json({});
    }),
  );
  return sent;
}

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      {node}
    </QueryClientProvider>,
  );

describe("the planner without VOACAP's data", () => {
  it("says in one calm line what is missing, how big it is and why, and fetches only when pressed", async () => {
    const sent = serve();
    wrap(<EngineNotReady engine={engine()} title="The propagation engine cannot run" />);
    expect(screen.getByText(/not on this computer yet \(15 files, 559 kB\)/)).toBeTruthy();
    expect(screen.getByText(/has not given Outpost permission to pass them on/)).toBeTruthy();
    // Not an alarm: the data is simply not here yet.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/15 files, 559,336 bytes, fetched once/)).toBeTruthy();
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Download (559 kB)" }));
    await waitFor(() => expect(sent).toEqual(["POST /api/radio/propagation/engine-data/download"]));
  });

  it("says it is downloading, and offers no second download", () => {
    serve();
    wrap(<EngineNotReady engine={engine({ data: data({ downloading: true }) })} title="x" />);
    expect(screen.getByText(/Downloading. Progress is under Downloads/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("shows nothing when the engine is ready", () => {
    serve();
    const { container } = wrap(
      <EngineNotReady engine={engine({ ready: true, problem: null, data: data({ installed: true, line: null }) })} title="x" />,
    );
    expect(container.textContent).toBe("");
  });

  it("names any other problem as one, with the screen's own words", () => {
    serve();
    wrap(
      <EngineNotReady
        engine={engine({
          problem: "The propagation engine file is not the one this copy of Outpost was built with.",
          data: data({ installed: true, line: null }),
        })}
        title="The propagation engine cannot run, so nothing can be predicted"
      >
        Outpost does not estimate propagation any other way.
      </EngineNotReady>,
    );
    expect(screen.getByRole("alert").textContent).toContain("not the one this copy of Outpost was built with");
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });
});

describe("removing VOACAP's data", () => {
  it("says what stops working before anything is removed", async () => {
    const sent = serve();
    wrap(<RemoveEngineData data={data({ installed: true, line: null, how: "downloaded" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText(/HF propagation planner stops working until they are downloaded again/)).toBeTruthy();
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove the data" }));
    await waitFor(() => expect(sent).toEqual(["DELETE /api/radio/propagation/engine-data"]));
  });
});
