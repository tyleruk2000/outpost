import type { KeptCopy, PressureReading, ReadingImportResult, WeatherPlace, WeatherResponse, WeatherSourceInfo } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { positionAvailable } from "./places-view";
import WeatherPage from "./weather-page";
import { daySentence, windText } from "./words";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const HOUR = 3_600_000;
const NOW = Date.now();

const home: WeatherPlace = { id: "p1", name: "Home", lat: 52.13, lon: -0.46, markerId: "m1", isHome: true, region: "em", createdAt: 1 };
const source = (id: WeatherSourceInfo["id"], kind: WeatherSourceInfo["kind"], publisher: string): WeatherSourceInfo => ({
  id,
  kind,
  publisher,
  name: publisher,
  covers: "",
  host: "example.org",
  sends: "",
  licence: "",
  licenceUrl: "https://example.org",
  attribution: `${publisher} credit`,
  liveUrl: "https://example.org/live",
  termsUrl: "https://example.org/terms",
  termsRead: "2026-11-16",
});
const sources = [source("open-meteo", "forecast", "Open-Meteo"), source("met-office-warnings", "warnings", "Met Office")];

function forecast(fetchedAt: number, hoursAhead: number): KeptCopy {
  const start = Math.floor(fetchedAt / HOUR) * HOUR;
  const hours = Array.from({ length: hoursAhead }, (_, index) => ({
    t: start + index * HOUR,
    tempC: 8 + index * 0.1,
    precipMm: 0,
    precipChance: 10,
    code: 3,
    windKmh: 20,
    gustKmh: 40,
    windFrom: 225,
    pressureHpa: 1010,
  }));
  return {
    id: "c1",
    kind: "forecast",
    source: "open-meteo",
    placeId: "p1",
    fetchedAt,
    validFrom: start,
    validUntil: start + hoursAhead * HOUR,
    bytes: 10_000,
    sent: "api.open-meteo.com: latitude 52.13, longitude -0.46",
    data: { service: "Open-Meteo", model: "Met Office UKV", elevation: 30, gridLat: 52.13, gridLon: -0.46, hours, days: [] },
  };
}

/** What the server says of a file of readings. */
const importAnswer: ReadingImportResult = {
  rows: [
    {
      line: 2,
      takenAt: NOW - 6 * HOUR,
      value: 1013.2,
      unit: "hPa",
      heightM: 12.5,
      seaLevelHpa: 1014.7,
      windFrom: null,
      duplicate: false,
      notes: ["“1.013,2” read as 1013.2.", "“12,5” read as 12.5."],
    },
    {
      line: 3,
      takenAt: NOW - 3 * HOUR,
      value: 1012,
      unit: "hPa",
      heightM: 10,
      seaLevelHpa: 1013.2,
      windFrom: null,
      duplicate: false,
      notes: [],
    },
  ],
  problems: [],
  added: 0,
};

function show(response: Partial<WeatherResponse> | "fails" | "never", view = "", markers: unknown[] = [], kept: PressureReading[] = []) {
  const posted: Array<{ path: string; body: unknown }> = [];
  let readings = [...kept];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method && init.method !== "GET") {
        posted.push({ path: `${init.method} ${pathname}`, body: init.body ? JSON.parse(String(init.body)) : null });
        if (pathname === "/api/weather/update") return json({ outcomes: [] });
        if (pathname === "/api/weather/readings/import") return json(importAnswer);
        if (pathname === "/api/weather/readings/clear") {
          const removed = readings.length;
          readings = [];
          return json({ removed });
        }
        return json({ ok: true });
      }
      if (pathname === "/api/weather/readings") return json({ readings });
      if (pathname === "/api/weather") {
        if (response === "never") return new Promise<Response>(() => {});
        if (response === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ places: [], kept: [], sources, updateOnOpen: false, riversKm: 8, now: NOW, ...response });
      }
      if (pathname === "/api/weather/readings") return json({ readings: [] });
      if (pathname === "/api/maps/markers") return json({ markers });
      return json({});
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/prepare/weather${view}`]}>
        <WeatherPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return posted;
}

describe("the Weather and hazards screen", () => {
  it("shows a skeleton while loading, and the error with a retry", async () => {
    show("never");
    expect(screen.getByRole("status", { name: "Loading weather" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("says what went wrong when the cache cannot be read", async () => {
    show("fails");
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("invites a first place when there is none, and fetches nothing on opening", async () => {
    const posted = show({});
    expect(await screen.findByRole("heading", { name: "Choose a place for forecasts" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Also update when I open this screen" })).not.toBeChecked();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted).toEqual([]);
  });

  it("fetches once on opening when the tick is on, and only then", async () => {
    const posted = show({ places: [home], updateOnOpen: true });
    await waitFor(() => expect(posted.filter((call) => call.path === "POST /api/weather/update")).toHaveLength(1));
    expect(posted[0]!.body).toEqual({ kinds: ["forecast", "warnings", "flood", "rivers"] });
  });

  it("makes the whole 'update when I open' row the thing to press, at least 44 px tall", async () => {
    const posted = show({});
    const box = await screen.findByRole("checkbox", { name: "Also update when I open this screen" });
    const row = box.closest("label");
    expect(row).toHaveClass("min-h-11");
    expect(box).toHaveAccessibleDescription(/Off unless ticked/);
    await userEvent.click(screen.getByText("Also update when I open this screen"));
    await waitFor(() => expect(posted).toEqual([{ path: "PUT /api/weather/options", body: { updateOnOpen: true } }]));
  });

  it("fetches when Update now is pressed", async () => {
    const posted = show({ places: [home] });
    await userEvent.click(await screen.findByRole("button", { name: "Update now" }));
    await waitFor(() => expect(posted.map((call) => call.path)).toEqual(["POST /api/weather/update"]));
  });

  it("shows a fresh forecast in words, with when it was fetched and who from", async () => {
    show({ places: [home], kept: [forecast(NOW - 5 * 60_000, 48)] });
    expect(await screen.findByText("Fetched 5 minutes ago.")).toBeInTheDocument();
    expect(screen.getByText(/^From Open-Meteo, fetched/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Temperature through the hours ahead" })).toBeInTheDocument();
  });

  it("says an old forecast has run out, and does not show it as current", async () => {
    show({ places: [home], kept: [forecast(NOW - 3 * 24 * HOUR, 24)] });
    expect(
      await screen.findByText("Fetched 3 days ago: this forecast has run out. Update it to see what is expected now."),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing in this forecast is still ahead. Update it to see what is expected.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Temperature through the hours ahead" })).not.toBeInTheDocument();
  });

  it("names the place on each kept copy's remove button, so that two forecasts are told apart", async () => {
    const cottage: WeatherPlace = { ...home, id: "p2", name: "Cottage", markerId: "m2", isHome: false };
    show({ places: [home, cottage], kept: [forecast(NOW, 24), { ...forecast(NOW, 24), id: "c2", placeId: "p2" }] }, "?view=kept");
    expect(await screen.findByRole("button", { name: "Remove the kept copy: Forecast, Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove the kept copy: Forecast, Cottage" })).toBeInTheDocument();
  });

  it("says when warnings have never been fetched", async () => {
    show({ places: [home] }, "?view=warnings");
    expect(await screen.findByText(/Warnings have not been fetched yet/)).toBeInTheDocument();
  });
});

describe("alerts worldwide", () => {
  const plan = {
    home: { name: "Home", lat: 50.72, lon: -3.53 },
    homeCountry: "GB",
    homeCountryName: "the United Kingdom",
    chosenCountry: null,
    country: "GB",
    countryName: "the United Kingdom",
    national: "meteoalarm" as const,
  };
  const meteoalarm: KeptCopy<"meteoalarm"> = {
    id: "m1",
    kind: "meteoalarm",
    source: "meteoalarm",
    placeId: null,
    fetchedAt: NOW - 60_000,
    validFrom: null,
    validUntil: null,
    bytes: 14_837,
    sent: "feeds.meteoalarm.org: the feed for the United Kingdom; no position",
    data: {
      country: "GB",
      countryName: "the United Kingdom",
      updatedAt: NOW,
      items: [
        {
          id: "w1",
          title: "Yellow rain warning",
          event: "Yellow rain warning",
          area: "South West England",
          level: "yellow",
          severity: "Moderate",
          urgency: "Future",
          certainty: "Likely",
          sent: NOW - 3_600_000,
          onset: NOW,
          expires: NOW + 3_600_000,
          coversHome: true,
          link: "https://meteoalarm.org/",
          sender: "",
        },
      ],
    },
  };

  it("says which country Home is taken to be in, and fetches the worldwide feeds and that country's on a press", async () => {
    const posted = show({ alerts: plan }, "?view=world");
    expect(await screen.findByText(/Home \(Home\) is taken to be in the United Kingdom/)).toBeInTheDocument();
    expect(posted).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Fetch alerts" }));
    await waitFor(() => expect(posted).toEqual([{ path: "POST /api/weather/update", body: { kinds: ["gdacs", "quakes", "meteoalarm"] } }]));
  });

  it("shows MeteoAlarm's warnings covering Home with its time of issue and its disclaimer, word for word", async () => {
    show({ alerts: plan, kept: [meteoalarm] }, "?view=world");
    expect(await screen.findByRole("heading", { name: "Covering Home (1)" })).toBeInTheDocument();
    expect(screen.getByText(/^Time delays between this website and the www\.meteoalarm\.org website are possible\./)).toBeInTheDocument();
    expect(screen.getByText(/South West England\..*Issued /)).toBeInTheDocument();
  });

  describe("MeteoAlarm's terms", () => {
    // A fake clock (Date only, so React Query and the user events keep their timers).
    const CLOCK = Date.UTC(2026, 10, 22, 12, 0);
    afterEach(() => vi.useRealTimers());
    const at = (ageMs: number, sender = ""): KeptCopy<"meteoalarm"> => ({
      ...meteoalarm,
      fetchedAt: CLOCK - ageMs,
      data: { ...meteoalarm.data, items: meteoalarm.data.items.map((item) => ({ ...item, sender })) },
    });

    it("names the country's national services with its warnings, from MeteoAlarm's list where the feed names none", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(CLOCK);
      show({ alerts: plan, kept: [at(60_000)] }, "?view=world");
      expect(
        await screen.findByText(
          "Warnings issued by Met Office, Environment Agency, Natural Resources Wales and Scottish Environment Protection Agency, as published through MeteoAlarm.",
        ),
      ).toBeInTheDocument();
    });

    it("prefers the service the warnings themselves name", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(CLOCK);
      show({ alerts: plan, kept: [at(60_000, "UK Met Office")] }, "?view=world");
      expect(await screen.findByText("Warnings issued by UK Met Office, as published through MeteoAlarm.")).toBeInTheDocument();
      expect(screen.getByText(/Issued .* by UK Met Office\./)).toBeInTheDocument();
    });

    it("shows a copy under ten minutes old as current, and one older as not current, with the time it was fetched", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(CLOCK);
      show({ alerts: plan, kept: [at(9 * 60_000)] }, "?view=world");
      expect(await screen.findByRole("heading", { name: "Covering Home (1)" })).toBeInTheDocument();
      expect(screen.queryByText(/Not current: for reference only/)).not.toBeInTheDocument();
    });

    it("marks a copy over ten minutes old not current, for reference only, in words, and still shows it", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(CLOCK);
      show({ alerts: plan, kept: [at(11 * 60_000)] }, "?view=world");
      const label = await screen.findByText("Not current: for reference only.");
      expect(label.closest("p")).toHaveTextContent(/Fetched .+, more than ten minutes ago\./);
      expect(screen.getByRole("heading", { name: "Covering Home (1)" })).toBeInTheDocument();
    });

    it("says the same in the list of kept copies", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(CLOCK);
      show({ alerts: plan, kept: [at(11 * 60_000), { ...at(60_000), id: "m2" }] }, "?view=kept");
      const lines = await screen.findAllByText(/^The United Kingdom: Met Office, Environment Agency/);
      expect(lines.map((line) => /Not current: for reference only/.test(line.textContent ?? ""))).toEqual([true, false]);
    });
  });

  it("lets a person choose the country for national warnings, and says it is the chosen one", async () => {
    const posted = show({ alerts: plan }, "?view=world");
    await userEvent.click(await screen.findByRole("combobox", { name: "Country for national warnings" }));
    await userEvent.click(await screen.findByRole("option", { name: "Canada" }));
    await waitFor(() => expect(posted).toEqual([{ path: "PUT /api/weather/options", body: { alertCountry: "CA" } }]));
  });

  it("shows JMA's headlines as written, with the office and the level", async () => {
    const jma: KeptCopy = {
      id: "j1",
      kind: "jma",
      source: "jma-warnings",
      placeId: null,
      fetchedAt: NOW,
      validFrom: null,
      validUntil: null,
      bytes: 1000,
      sent: "www.data.jma.go.jp: no position",
      data: {
        updatedAt: NOW,
        entries: [
          {
            id: "a",
            office: "新潟地方気象台",
            headline: "【新潟県気象警報・注意報】〈危険警報（土砂災害）〉中越では、土砂災害に厳重に警戒してください。",
            updated: NOW,
            level: "危険警報",
            link: "https://www.data.jma.go.jp/developer/xml/data/x_VPWW53_150000.xml",
          },
          {
            id: "b",
            office: "富山地方気象台",
            headline: "【富山県気象警報・注意報】注意報を解除します。",
            updated: NOW,
            level: "解除",
            link: "",
          },
        ],
      },
    };
    const tokyo = { ...plan, chosenCountry: "JP", country: "JP", countryName: "Japan", national: "jma" as const };
    show({ alerts: tokyo, kept: [jma] }, "?view=world");
    expect(await screen.findByText(/〈危険警報（土砂災害）〉中越では/)).toBeInTheDocument();
    expect(screen.getByText(/National warnings are fetched for Japan, as chosen below/)).toBeInTheDocument();
    expect(screen.getByText("Lifted (1)")).toBeInTheDocument();
  });
});

describe("clearing barometer readings", () => {
  const reading = (id: string, hoursAgo: number, seaLevelHpa: number): PressureReading => ({
    id,
    takenAt: NOW - hoursAgo * HOUR,
    value: seaLevelHpa,
    unit: "hPa",
    stationHpa: seaLevelHpa,
    heightM: 0,
    seaLevelHpa,
    note: "",
    windFrom: null,
    origin: "typed",
    createdAt: 1,
  });
  const three = [reading("r1", 72, 1004), reading("r2", 3, 1008), reading("r3", 0, 1010)];

  it("shows the wind noted with a reading, and the Zambretti forecast starts from the latest one's", async () => {
    show({}, "?view=barometer", [], [...three.slice(0, 2), { ...three[2]!, windFrom: "N" }]);
    expect(await screen.findByText(/wind from N\. A rule of thumb/)).toBeInTheDocument();
    expect(screen.getByText(/, wind from N$/)).toBeInTheDocument();
  });

  it("states the count, offers the CSV first, removes only what it said, and the log goes to its empty state", async () => {
    const posted = show({}, "?view=barometer", [], three);
    expect(await screen.findByTestId("tendency")).toHaveTextContent("Rising: +2.0 hPa");
    expect(screen.getByTestId("zambretti")).toHaveTextContent("Becoming fine");
    await userEvent.click(screen.getByRole("button", { name: "Clear readings" }));
    expect(screen.getByTestId("clear-question")).toHaveTextContent("Remove all 3 readings? This cannot be undone.");
    expect(screen.getByText(/Saved places and fetched forecasts are not touched/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save them as a CSV file first" })).toHaveAttribute("href", "/api/weather/readings/export");

    await userEvent.click(screen.getByRole("radio", { name: "Between two days" }));
    expect(screen.getByTestId("clear-question")).toHaveTextContent(/^Remove \d readings? taken from .+ to .+\? This cannot be undone\.$/);
    expect(screen.getByRole("link", { name: /as a CSV file first/ }).getAttribute("href")).toMatch(
      /^\/api\/weather\/readings\/export\?from=\d+&to=\d+$/,
    );

    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove 3 readings" }));
    await waitFor(() =>
      expect(posted.filter((call) => call.path === "POST /api/weather/readings/clear")).toEqual([
        { path: "POST /api/weather/readings/clear", body: { range: { range: "all" }, expected: 3 } },
      ]),
    );
    expect(await screen.findByRole("heading", { name: "No readings yet" })).toBeInTheDocument();
    expect(screen.queryByTestId("tendency")).not.toBeInTheDocument();
    expect(screen.queryByTestId("zambretti")).not.toBeInTheDocument();
  });

  it("removes one reading from its row with a button that says so", async () => {
    const posted = show({}, "?view=barometer", [], three);
    const buttons = await screen.findAllByRole("button", { name: /^Remove the reading of / });
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveTextContent("Remove");
    await userEvent.click(buttons[0]!);
    await waitFor(() => expect(posted.map((call) => call.path)).toEqual(["DELETE /api/weather/readings/r3"]));
  });
});

describe("bringing in barometer readings from a file", () => {
  const file = () => new File(["time;pressure;height\n"], "logger.csv", { type: "text/csv" });

  it("says under each row how a number that was not plain was read", async () => {
    show({}, "?view=barometer");
    await userEvent.click(await screen.findByRole("button", { name: "Bring in a CSV file" }));
    const reads = () => vi.mocked(fetch).mock.calls.filter(([, init]) => !init?.method || init.method === "GET").length;
    const before = reads();
    await userEvent.upload(screen.getByLabelText("File"), file());
    expect(await screen.findByText(/logger\.csv: 2 readings read/)).toBeInTheDocument();
    // A preview changes nothing, so nothing is asked for again.
    expect(reads()).toBe(before);
    const list = screen.getByRole("list", { name: /how they were read/ });
    expect(list).toHaveTextContent("Line 2: “1.013,2” read as 1013.2. “12,5” read as 12.5.");
    expect(list).not.toHaveTextContent("Line 3");
  });

  it("reads a height with a decimal comma, and refuses one that is not a number instead of taking nought", async () => {
    const posted = show({}, "?view=barometer");
    await userEvent.click(await screen.findByRole("button", { name: "Bring in a CSV file" }));
    const height = screen.getByRole("textbox", { name: "Height above sea level, m, where the file gives none" });
    await userEvent.clear(height);
    await userEvent.type(height, "12,5");
    await userEvent.upload(screen.getByLabelText("File"), file());
    await waitFor(() => expect(posted.filter((call) => call.path === "POST /api/weather/readings/import")).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({ heightM: 12.5, apply: false });

    await userEvent.clear(height);
    await userEvent.type(height, "high");
    await userEvent.click(screen.getByRole("button", { name: "Read it again with these" }));
    expect(await screen.findByText(/Give the height above sea level/)).toBeInTheDocument();
    expect(posted.filter((call) => call.path === "POST /api/weather/readings/import")).toHaveLength(1);
  });

  it("does not offer to add what a preview showed once the unit or height has changed", async () => {
    show({}, "?view=barometer");
    await userEvent.click(await screen.findByRole("button", { name: "Bring in a CSV file" }));
    await userEvent.upload(screen.getByLabelText("File"), file());
    expect(await screen.findByRole("button", { name: "Add 2 readings" })).toBeEnabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Height above sea level, m, where the file gives none" }), "5");
    expect(screen.queryByRole("button", { name: "Add 2 readings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add readings" })).toBeDisabled();
  });
});

describe("the device's position", () => {
  it("says in one line how to mark a home when no saved place has the home icon, with a link to Maps", async () => {
    show({ places: [{ ...home, isHome: false }] }, "?view=places");
    expect(await screen.findByText(/No saved place has the home icon/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Maps" })).toHaveAttribute("href", "/maps");
  });

  it("says when the home is a saved place that is not in the list", async () => {
    const marker = { id: "m9", name: "Cottage", icon: "home", createdAt: 1, lat: 52, lon: -1 };
    show({ places: [{ ...home, isHome: false }] }, "?view=places", [marker]);
    expect(await screen.findByText(/Cottage has the home icon but is not in this list/)).toBeInTheDocument();
    expect(screen.queryByText(/No saved place has the home icon/)).not.toBeInTheDocument();
  });

  it("is not offered on a page that is not secure, and says how to get it", () => {
    vi.stubGlobal("isSecureContext", false);
    const answer = positionAvailable();
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.reason).toMatch(/needs a secure page.*HTTPS on your network/);
  });

  it("is offered on a secure page with a browser that has it", () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { ...navigator, geolocation: {} });
    expect(positionAvailable().ok).toBe(true);
  });
});

describe("the words", () => {
  it("writes a day in plain words, in either unit", () => {
    const day = {
      date: "2026-11-17",
      code: 63,
      maxC: 12.5,
      minC: 5.1,
      precipMm: 15.2,
      precipChance: 100,
      windMaxKmh: 23,
      gustMaxKmh: 49.3,
    };
    expect(daySentence(day, "kmh", "c")).toBe(
      "Moderate rain. 5 to 13 °C. 15.2 mm of rain or snow; the chance of some is 100%. Wind up to 23 km/h, gusts to 49 km/h.",
    );
    expect(daySentence(day, "mph", "f")).toBe(
      "Moderate rain. 41 to 55 °F. 15.2 mm of rain or snow; the chance of some is 100%. Wind up to 14 mph, gusts to 31 mph.",
    );
    expect(windText(null, "mph")).toBe("no figure");
  });
});
