import type { HouseholdDto, HouseholdHolds, PersonDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForHousehold } from "./for-household";
import { HouseholdHomeLine } from "./home-line";
import HouseholdPage from "./household-page";
import HouseholdsPage from "./households-page";
import { HouseholdSwitcher } from "./switcher";
import { alsoInWords, holdsWords, inWords, whereWords } from "./words";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const household = (patch: Partial<HouseholdDto>): HouseholdDto => ({
  id: "household",
  name: "Home",
  position: 0,
  kind: "fixed",
  homePlaceId: "m1",
  basePlaceId: null,
  home: { kind: "place", id: "m1", name: "Fell Cottage", lat: 54.6, lon: -3.1, country: "GB", at: null, source: null },
  countryOverride: null,
  address: "",
  country: "GB",
  here: null,
  personIds: [],
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const person = (patch: Partial<PersonDto>): PersonDto => ({
  id: "p1",
  kind: "person",
  name: "Ann",
  band: "19-64",
  sex: "female",
  kcalPerDay: null,
  drinkingLitres: null,
  allUsesLitres: null,
  note: "",
  householdIds: ["household"],
  medicalSheets: 0,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const HOLDS: HouseholdHolds = {
  supplies: 12,
  shoppingLines: 0,
  emergencyPlans: 1,
  logEntries: 0,
  routineChecks: 0,
  sowings: 0,
  powerPlans: 0,
  medicalSheets: 0,
  papers: 2,
  positions: 3,
  people: 2,
  peopleOnlyHere: 1,
  theirMedicalSheets: 1,
};

interface Server {
  sent: Array<{ call: string; body: unknown }>;
}

function serve(options: { households: HouseholdDto[]; currentId?: string; people?: PersonDto[] }): Server {
  const server: Server = { sent: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const method = init?.method ?? "GET";
      const listed = { households: options.households, currentId: options.currentId ?? options.households[0]!.id };
      if (method !== "GET") {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        server.sent.push({ call: `${method} ${url.pathname}${url.search}`, body });
        if (method === "DELETE" && url.pathname.startsWith("/api/households/") && !url.search.includes("confirm=true"))
          return json({ error: { code: "conflict", message: "Say again.", details: { holds: HOLDS } } }, 409);
        if (method === "DELETE") return json(listed);
        if (url.pathname === "/api/households/current") return json(listed);
        if (url.pathname === "/api/households") return json({ household: household({ id: "new", name: body.name, kind: body.kind }) });
        if (url.pathname === "/api/maps/markers") return json({ marker: { id: "m9", createdAt: 2, updatedAt: 2, ...body } });
        if (url.pathname === "/api/people") return json({ person: person({ id: "made", ...body }) });
        if (url.pathname.startsWith("/api/people/")) return json({ person: person({ ...body }) });
        const id = url.pathname.split("/")[3]!;
        return json({ household: options.households.find((entry) => entry.id === id) });
      }
      if (url.pathname === "/api/households") return json(listed);
      if (url.pathname === "/api/people") return json({ people: options.people ?? [] });
      if (url.pathname === "/api/maps/markers")
        return json({
          markers: [{ id: "m1", name: "Fell Cottage", lat: 54.6, lon: -3.1, icon: "home", createdAt: 1, updatedAt: 1, note: "" }],
        });
      if (url.pathname === "/api/reference/catalogue") return json({ layers: [], countries: [{ code: "GB", name: "United Kingdom" }] });
      if (url.pathname.endsWith("/positions")) return json({ positions: [] });
      return json({ error: { code: "not_found", message: "No." } }, 404);
    }),
  );
  return server;
}

function wrap(children: ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/prepare/households" element={<HouseholdsPage />} />
          <Route path="/prepare/households/:id" element={<HouseholdPage />} />
          <Route path="*" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const caravan = household({
  id: "caravan",
  name: "Caravan",
  position: 1,
  kind: "portable",
  homePlaceId: null,
  home: null,
  country: null,
  personIds: ["p1", "p2"],
});

describe("the For line and the switcher", () => {
  it("say nothing with one household", async () => {
    serve({ households: [household({})] });
    wrap(
      <>
        <h1>Supplies</h1>
        <ForHousehold />
        <HouseholdSwitcher />
        <HouseholdHomeLine />
      </>,
    );
    await screen.findByRole("heading", { name: "Supplies" });
    // Given time to load, still nothing.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("for-household")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Household:/ })).toBeNull();
    expect(screen.queryByTestId("household-home-line")).toBeNull();
  });

  it("with several, say which is current and change it for everyone", async () => {
    const server = serve({ households: [household({}), caravan], currentId: "household" });
    wrap(
      <>
        <ForHousehold />
        <HouseholdSwitcher />
      </>,
    );
    expect(await screen.findByTestId("for-household")).toHaveTextContent(/^For Home · .*Change$/);
    expect(screen.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/prepare/households");
    await userEvent.click(screen.getByRole("button", { name: /^Household: Home/ }));
    expect(await screen.findByText("Changes it for everyone using this Outpost.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Caravan" }));
    await waitFor(() => expect(server.sent).toContainEqual({ call: "PUT /api/households/current", body: { id: "caravan" } }));
  });

  it("on Home, a portable household offers We're here now", async () => {
    serve({ households: [caravan] });
    wrap(<HouseholdHomeLine />);
    const line = await screen.findByTestId("household-home-line");
    expect(line).toHaveTextContent("Where it is now is not set");
    await userEvent.click(within(line).getByRole("button", { name: "We're here now" }));
    expect(await screen.findByRole("dialog", { name: "Where Caravan is now" })).toBeInTheDocument();
  });
});

describe("Prepare › Households", () => {
  it("lists one household, as most Outposts have, with no Make current", async () => {
    serve({ households: [household({ personIds: ["p1"] })], people: [person({})] });
    wrap(null, "/prepare/households");
    const list = await screen.findByRole("list", { name: "Households" });
    expect(within(list).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/prepare/households/household");
    expect(list).toHaveTextContent(/Fixed · , Home: Fell Cottage · , 1 person or pet/);
    expect(within(list).getByText("Current")).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /^Make current/ })).toBeNull();
    const people = await screen.findByRole("list", { name: "People" });
    expect(people).toHaveTextContent("Ann");
    expect(people).toHaveTextContent(/19 to 64 years · , In Home/);
  });

  it("with several, makes another current", async () => {
    const server = serve({ households: [household({}), caravan], people: [person({ householdIds: ["household", "caravan"] })] });
    wrap(null, "/prepare/households");
    await userEvent.click(await screen.findByRole("button", { name: "Make current: Caravan" }));
    await waitFor(() => expect(server.sent).toContainEqual({ call: "PUT /api/households/current", body: { id: "caravan" } }));
    expect(await screen.findByRole("list", { name: "People" })).toHaveTextContent("In Home and Caravan");
  });

  it("makes a new household with the people of another", async () => {
    const server = serve({ households: [household({ personIds: ["p1"] })], people: [person({})] });
    wrap(null, "/prepare/households");
    await userEvent.click(await screen.findByRole("button", { name: "New household" }));
    const dialog = await screen.findByRole("dialog", { name: "New household" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Gran's");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Start with the people of" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Home/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the household" }));
    await waitFor(() =>
      expect(server.sent).toContainEqual({
        call: "POST /api/households",
        body: { name: "Gran's", kind: "fixed", homePlaceId: null, copyPeopleFrom: "household" },
      }),
    );
  });

  it("deletes someone from the People list, warning of their medical sheet", async () => {
    const server = serve({ households: [household({ personIds: ["p1"] })], people: [person({ medicalSheets: 1 })] });
    wrap(null, "/prepare/households");
    await userEvent.click(await screen.findByRole("button", { name: "Delete Ann from the People list" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("They have a medical sheet. It is kept, linked to nobody");
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete from People" }));
    await waitFor(() => expect(server.sent).toContainEqual({ call: "DELETE /api/people/p1?confirm=true", body: null }));
  });
});

describe("a household's page", () => {
  const people = [
    person({ householdIds: ["household", "caravan"] }),
    person({ id: "p2", name: "Rex", kind: "pet", band: null, householdIds: ["caravan"] }),
  ];

  it("takes someone out without deleting them, and says who is also elsewhere", async () => {
    const server = serve({ households: [household({ personIds: ["p1"] }), caravan], people });
    wrap(null, "/prepare/households/caravan");
    expect(await screen.findByRole("heading", { level: 1, name: "Caravan" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "People of Caravan" });
    expect(list).toHaveTextContent("Also in Home");
    await userEvent.click(within(list).getByRole("button", { name: "Take Rex out of Caravan" }));
    await userEvent.click(screen.getByRole("button", { name: "Save people" }));
    await waitFor(() => expect(server.sent).toContainEqual({ call: "PUT /api/households/caravan/people", body: { personIds: ["p1"] } }));
    expect(server.sent.some((entry) => entry.call.startsWith("DELETE /api/people"))).toBe(false);
  });

  it("adds a new person to the People list and to the household", async () => {
    const server = serve({ households: [household({ personIds: [] })], people: [] });
    wrap(null, "/prepare/households/household");
    await screen.findByRole("heading", { level: 1, name: "Home" });
    await userEvent.click(await screen.findByRole("button", { name: "Add a person" }));
    await userEvent.type(within(screen.getByRole("list", { name: "People of Home" })).getByLabelText(/^Name/), "Bea");
    await userEvent.click(screen.getByRole("button", { name: "Save people" }));
    await waitFor(() =>
      expect(server.sent).toContainEqual(
        expect.objectContaining({ call: "POST /api/people", body: expect.objectContaining({ name: "Bea", householdIds: ["household"] }) }),
      ),
    );
    await waitFor(() =>
      expect(server.sent).toContainEqual({ call: "PUT /api/households/household/people", body: { personIds: ["made"] } }),
    );
  });

  it("says what deleting it takes, then deletes it once confirmed", async () => {
    const server = serve({ households: [household({}), caravan], people });
    wrap(null, "/prepare/households/caravan");
    await userEvent.click(await screen.findByRole("button", { name: "Delete Caravan" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Deleted with it: 12 rows of supplies, 1 emergency plan");
    expect(confirm).toHaveTextContent("1 person or pet will be in no household afterwards, with 1 medical sheet kept.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete Caravan" }));
    await waitFor(() => expect(server.sent).toContainEqual({ call: "DELETE /api/households/caravan?confirm=true", body: null }));
  });

  it("marks home from this device without going to Maps: a saved place with the home icon, made the home place", async () => {
    const server = serve({ households: [household({ homePlaceId: null, home: null, country: null })], people: [] });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 54.6, longitude: -3.1 } } as GeolocationPosition),
      },
    });
    wrap(null, "/prepare/households/household");
    await userEvent.click(await screen.findByRole("button", { name: "Mark home on the map" }));
    const dialog = await screen.findByRole("dialog", { name: "Where Home is" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "This device" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Use this device's location" }));
    await userEvent.type(await within(dialog).findByLabelText(/^Name for this place/), "Fell Cottage");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make it home" }));
    await waitFor(() =>
      expect(server.sent).toContainEqual({
        call: "POST /api/maps/markers",
        body: { name: "Fell Cottage", note: "", lat: 54.6, lon: -3.1, color: "teal", icon: "home", isFavorite: true },
      }),
    );
    await waitFor(() => expect(server.sent).toContainEqual({ call: "PUT /api/households/household", body: { homePlaceId: "m9" } }));
  });

  it("on Households, leads from an empty People list and a missing home straight to the household's page", async () => {
    serve({ households: [household({ homePlaceId: null, home: null, country: null })], people: [] });
    wrap(null, "/prepare/households");
    expect(await screen.findByRole("link", { name: "Add people to Home" })).toHaveAttribute("href", "/prepare/households/household#people");
    expect(screen.getByRole("link", { name: "Mark home" })).toHaveAttribute("href", "/prepare/households/household#place");
  });

  it("with only one household, offers no delete", async () => {
    serve({ households: [household({})], people: [] });
    wrap(null, "/prepare/households/household");
    expect(await screen.findByText("Outpost always keeps one household. Rename this one instead.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Home" })).toBeNull();
  });
});

describe("words", () => {
  it("say where a household is", () => {
    expect(whereWords(household({}))).toBe("Home: Fell Cottage");
    expect(whereWords(household({ home: null }))).toBe("No home place chosen");
    expect(whereWords(caravan)).toBe("Where it is now has not been set");
    expect(
      whereWords({
        ...caravan,
        here: { id: "x", lat: 54.5, lon: -3, name: "Keswick campsite", at: Date.now() - 3 * 3600_000, source: "device" },
      }),
    ).toBe("Where it is now: Keswick campsite, as of 3 hours ago");
  });

  it("say who is in what", () => {
    const both = person({ householdIds: ["household", "caravan"] });
    expect(inWords(both, [household({}), caravan])).toBe("In Home and Caravan");
    expect(alsoInWords(both, [household({}), caravan], "caravan")).toBe("Also in Home");
    expect(alsoInWords(person({}), [household({})], "household")).toBeNull();
    expect(inWords(person({ householdIds: [] }), [])).toBe("In no household");
  });

  it("say what a household holds", () => {
    const words = holdsWords(HOLDS);
    expect(words.goes).toContain("12 rows of supplies");
    expect(words.goes).toContain("3 places it has been");
    expect(words.stays).toBe(
      "Nobody is removed from the People list. 1 person or pet will be in no household afterwards, with 1 medical sheet kept.",
    );
    expect(holdsWords({ ...HOLDS, people: 0, peopleOnlyHere: 0 }).stays).toBeNull();
  });
});
