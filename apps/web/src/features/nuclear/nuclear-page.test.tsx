import type { MarkerDto, NuclearScenario } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanMapProps } from "@/features/propagation/map/plan-map";
import NuclearPage from "./nuclear-page";

// The map needs WebGL, which the test's browser has not got. What stands in for it
// shows what it was handed and lets a test press a place on it.
vi.mock("@/features/propagation/map/plan-map", () => ({
  PlanMap: ({ label, nuclear, places, onPress }: PlanMapProps) => (
    <section aria-label={label}>
      <output data-testid="drawn">
        {nuclear?.features
          .filter((feature) => feature.properties.kind !== "plume")
          .map((feature) => String(feature.properties.label))
          .join("|")}
      </output>
      <output data-testid="plumes">{nuclear?.features.filter((feature) => feature.properties.kind === "plume").length ?? 0}</output>
      <output data-testid="places">{places?.length ?? 0}</output>
      <button type="button" onClick={() => onPress?.({ position: { lat: 54.46, lon: -3.09 }, place: null })}>
        press the map
      </button>
    </section>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const home: MarkerDto = {
  id: "home",
  name: "Home",
  note: "",
  lat: 54.47,
  lon: -3.05,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
} as MarkerDto;

const saved: NuclearScenario = {
  id: "s1",
  name: "Megaton over the bay",
  notes: "",
  lat: 54.2,
  lon: -3.3,
  effects: { yieldKt: 1000, burst: { kind: "optimum", psi: 5 }, wind: null },
  createdAt: 1,
  updatedAt: Date.UTC(2026, 10, 16),
};

function serve(options: { scenarios?: NuclearScenario[] | "fails"; regions?: number; markers?: MarkerDto[] } = {}) {
  const posted: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "POST" || init?.method === "PATCH") {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        posted.push({ path: pathname, body });
        return json({ ...body, id: "new", createdAt: 5, updatedAt: 5 }, 201);
      }
      if (pathname === "/api/nuclear/scenarios") {
        if (options.scenarios === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ scenarios: options.scenarios ?? [] });
      }
      if (pathname === "/api/maps/markers") return json({ markers: options.markers ?? [] });
      if (pathname === "/api/maps/overview")
        return json({ regions: Array.from({ length: options.regions ?? 0 }, (_, index) => ({ id: `r${index}` })), places: [] });
      if (pathname === "/api/maps/sources") return json({ hasTiles: (options.regions ?? 0) > 0, attributions: [], imagery: [] });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/prepare/nuclear"]}>
        <NuclearPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { posted };
}

describe("Nuclear preparedness", () => {
  it("says it works offline, and that no offline map is installed when none is", async () => {
    serve({ regions: 0 });
    expect(screen.getByRole("heading", { level: 1, name: "Nuclear preparedness" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("offline-line")).toHaveTextContent(/No offline map region is installed/));
    expect(screen.getByTestId("offline-line")).toHaveTextContent(/nothing here uses the internet/);
  });

  it("names the installed regions when there are some", async () => {
    serve({ regions: 2 });
    await waitFor(() => expect(screen.getByTestId("offline-line")).toHaveTextContent("2 offline map regions installed."));
  });

  it("draws the rings with their levels and rounded distances once ground zero is pressed, with the caveat in words", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi · 1\.1 km/));
    expect(screen.getAllByText(/not a forecast and not instructions/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Affected population/)).toBeInTheDocument();
    // A surface burst with no wind: no plume, and why.
    expect(screen.getByTestId("plumes")).toHaveTextContent("0");
    expect(screen.getByText(/Give a wind direction and speed/)).toBeInTheDocument();
  });

  it("draws the fallout plume for a surface burst with a wind", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.change(screen.getByLabelText("Wind from, degrees"), { target: { value: "270" } });
    fireEvent.change(screen.getByLabelText("Wind speed"), { target: { value: "24" } });
    await waitFor(() => expect(screen.getByTestId("plumes")).toHaveTextContent("4"));
  });

  it("refuses a yield outside the model's range, with the reason, and draws nothing", async () => {
    serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.change(screen.getByLabelText("Yield"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("radio", { name: "megatons" }));
    expect(await screen.findByText(/must be from 1 kiloton to 10 megatons/)).toBeInTheDocument();
    expect(screen.getByTestId("drawn")).toHaveTextContent("");
  });

  it("measures saved places against the scenario in plain words", async () => {
    serve({ markers: [home] });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    expect(await screen.findByText(/from ground zero\. (Inside|Outside)/)).toBeInTheDocument();
    expect(screen.getByTestId("places")).toHaveTextContent("1");
  });

  it("asks for a name before saving, then saves what was typed", async () => {
    const { posted } = serve();
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
    expect(await screen.findByText("Give the scenario a name to save it.")).toBeInTheDocument();
    expect(posted).toEqual([]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Quarry" } });
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      path: "/api/nuclear/scenarios",
      body: { name: "Quarry", lat: 54.46, lon: -3.09, effects: { yieldKt: 15 } },
    });
  });

  it("lists saved scenarios and compares one beside the open scenario, as B", async () => {
    serve({ scenarios: [saved] });
    fireEvent.click(await screen.findByRole("button", { name: "press the map" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Saved/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Saved/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Compare as B" }));
    await waitFor(() => expect(screen.getByTestId("drawn")).toHaveTextContent(/B · 5 psi/));
    expect(screen.getByTestId("drawn")).toHaveTextContent(/A · 5 psi/);
  });

  it("has an empty state and an error state for saved scenarios", async () => {
    serve({ scenarios: [] });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Saved/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Saved/ }));
    expect(await screen.findByText("No saved scenarios")).toBeInTheDocument();
  });

  it("says when saved scenarios cannot be loaded", async () => {
    serve({ scenarios: "fails" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Saved/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Saved/ }));
    expect(await screen.findByText(/The database is busy/)).toBeInTheDocument();
  });

  it("shows the five provenance classes in the layers panel, saying which are empty in this version", async () => {
    serve();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Layers" }));
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    const key = await screen.findByRole("list", { name: "Where things on this map come from" });
    for (const name of [
      "Verified public infrastructure",
      "Historical documentation",
      "Modelled effects",
      "Made by you",
      "Unverified or speculative",
    ])
      expect(key).toHaveTextContent(name);
  });
});
