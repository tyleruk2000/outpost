import type { KeptCopy, SpaceWeatherData } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayConditions } from "./today";

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.now();
const data: SpaceWeatherData = {
  scales: { at: NOW - 600_000, r: { level: 1, text: "minor" }, s: { level: 0, text: "none" }, g: { level: 2, text: "moderate" } },
  flux: { value: 103, at: NOW - 3_600_000 },
  kp: { value: 5.33, at: NOW - 3_600_000, a: 32 },
  wwv: { text: "Solar flux 103 and estimated planetary A-index 4.", issuedAt: NOW - 3_600_000 },
  sunspots: { value: 62, day: "2026-11-20" },
};
const copy: KeptCopy = {
  id: "s1",
  kind: "space-weather",
  source: "swpc",
  placeId: null,
  fetchedAt: NOW - 600_000,
  validFrom: null,
  validUntil: null,
  bytes: 9000,
  sent: "services.swpc.noaa.gov: five files for the whole Earth; no position",
  data,
};

function show(kept: KeptCopy[]) {
  const posted: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (init?.method === "POST") {
        posted.push({ path: new URL(String(input), "http://outpost.test").pathname, body: JSON.parse(String(init.body)) });
        return json({ outcomes: [{ kind: "space-weather", ok: true }] });
      }
      return json({ places: [], kept, sources: [], updateOnOpen: false, riversKm: 8, now: NOW });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TodayConditions />
    </QueryClientProvider>,
  );
  return posted;
}

describe("today's HF conditions", () => {
  it("fetches only on a press, and only NOAA's space weather", async () => {
    const posted = show([]);
    expect(await screen.findByText(/Not fetched yet/)).toBeInTheDocument();
    expect(posted).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Fetch today's conditions" }));
    await waitFor(() => expect(posted).toEqual([{ path: "/api/weather/update", body: { kinds: ["space-weather"] } }]));
  });

  it("says in plain words, against the prediction, what a blackout and a storm in force mean, with the figures", async () => {
    show([copy]);
    const panel = await screen.findByTestId("today-conditions");
    expect(panel).toHaveTextContent(
      "A radio blackout is in force (R1): HF on the sunlit side of the Earth is likely worse than predicted today.",
    );
    expect(panel).toHaveTextContent(
      'A geomagnetic storm is in force (G2): HF is likely worse than predicted today, most of all on paths at high latitudes. NOAA: "HF radio propagation can fade at higher latitudes".',
    );
    expect(panel).toHaveTextContent("103 sfu");
    expect(panel).toHaveTextContent("5.33");
    expect(screen.getByText(/They are not passed to the prediction/)).toBeInTheDocument();
  });
});
