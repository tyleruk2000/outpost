/** The Garden screen against a stand-in server: the month's lists, the last frost keeping tender crops back, the record, and its states. */
import type { GardenResponse, GardenSowing } from "@outpost/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findPlaces, placeName } from "@/components/find-places";
import { householdOf, householdsAnswer, ONE_HOUSEHOLD, placeHomeIn } from "../households/test-support";
import { fakeApi, renderScreen } from "../manage/test-support";
import GardenPage, { heldBackText, sowingParts } from "./garden-page";

const MAY = Date.UTC(2026, 4, 15, 12);
/** One household, its home in a country. */
const withHome = (country: string) =>
  householdsAnswer([householdOf({ id: "household", name: "Home", home: placeHomeIn("Home", country), country })]);
const catalogue = {
  providers: [],
  linked: [],
  countries: [
    { code: "GB", name: "United Kingdom", bbox: [-8.6, 49.9, 1.8, 60.9] },
    { code: "FR", name: "France", bbox: [-5.1, 41.3, 9.6, 51.1] },
  ],
};
const sowing: GardenSowing = {
  id: "s1",
  cropId: "carrots",
  name: "Carrots",
  sownOn: "2026-04-12",
  place: "Bed 3",
  amount: "",
  plantedOutOn: null,
  harvestedOn: null,
  notes: "",
  createdAt: 1,
  updatedAt: 1,
};
const garden = (over: Partial<GardenResponse> = {}): GardenResponse => ({
  settings: { lastFrost: null, updatedAt: null },
  sowings: [],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(MAY);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const region = async (name: string) => (await screen.findByRole("heading", { level: 2, name })).closest("section") as HTMLElement;

describe("the Tools registry", () => {
  it("is found by the words people use", () => {
    for (const word of ["garden", "sow", "frost"]) expect(placeName(findPlaces(word)[0]!)).toBe("Tools: Garden");
  });
});

describe("the month", () => {
  it("lists May's sowing, planting and harvest from the RHS calendar, for the UK", async () => {
    fakeApi({
      "GET /api/garden": garden(),
      "GET /api/households": withHome("GB"),
      "GET /api/reference/catalogue": catalogue,
    });
    renderScreen(<GardenPage />, "/tools/garden");
    expect(screen.getByRole("heading", { level: 1, name: "Garden" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "In May" })).toBeInTheDocument();
    expect(screen.getAllByText("Squash").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Potatoes").length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText("No last-frost date is set, so the RHS months are shown as they are.")).toBeInTheDocument();
    expect(screen.queryByText(/not the UK/)).toBeNull();
  });

  it("keeps tender crops back until after a late last frost", async () => {
    fakeApi({
      "GET /api/garden": garden({ settings: { lastFrost: "06-05", updatedAt: 2 } }),
      "GET /api/households": ONE_HOUSEHOLD,
      "GET /api/reference/catalogue": catalogue,
    });
    renderScreen(<GardenPage />, "/tools/garden");
    expect(await screen.findByText("Your last frost is usually about 5 June.")).toBeInTheDocument();
    expect(screen.getAllByText(heldBackText("06-06")).length).toBe(7);
    // No home place: said in a line, and the UK calendar still shown.
    expect(screen.getByText(/No saved place has the home icon/)).toBeInTheDocument();
  });

  it("says plainly when home is outside the UK", async () => {
    fakeApi({
      "GET /api/garden": garden(),
      "GET /api/households": withHome("FR"),
      "GET /api/reference/catalogue": catalogue,
    });
    renderScreen(<GardenPage />, "/tools/garden");
    expect(await screen.findByText("Home is in France, not the UK")).toBeInTheDocument();
    expect(screen.queryByTestId("for-household")).toBeNull();
  });

  it("with several households, is for the current one: its name, its country, its record", async () => {
    const answer = (country: string | null) =>
      householdsAnswer(
        [
          householdOf({ id: "household", name: "Home", home: placeHomeIn("Home", "GB"), country: "GB" }),
          householdOf({ id: "gran", name: "Gran's", home: country ? placeHomeIn("Gran's", country) : null, country }),
        ],
        "gran",
      );
    fakeApi({ "GET /api/garden": garden(), "GET /api/households": answer("FR"), "GET /api/reference/catalogue": catalogue });
    const first = renderScreen(<GardenPage />, "/tools/garden");
    expect(await screen.findByText("Gran's is in France, not the UK")).toBeInTheDocument();
    expect(screen.getByTestId("for-household").textContent).toBe("For Gran's · Change");
    first.unmount();

    fakeApi({ "GET /api/garden": garden(), "GET /api/households": answer(null), "GET /api/reference/catalogue": catalogue });
    renderScreen(<GardenPage />, "/tools/garden");
    expect(await screen.findByText(/Outpost cannot tell which country Gran's is in/)).toBeInTheDocument();
    expect(screen.queryByText(/No saved place has the home icon/)).toBeNull();
  });

  it("saves the last frost the person gives", async () => {
    const api = fakeApi({
      "GET /api/garden": garden(),
      "GET /api/households": ONE_HOUSEHOLD,
      "GET /api/reference/catalogue": catalogue,
      "PUT /api/garden/settings": { settings: { lastFrost: "05-12", updatedAt: 3 } },
    });
    renderScreen(<GardenPage />, "/tools/garden");
    const section = await region("Your last frost");
    fireEvent.change(await within(section).findByLabelText("Day"), { target: { value: "12" } });
    fireEvent.click(within(section).getByRole("button", { name: "Save last frost" }));
    await vi.waitFor(() => expect(api.bodiesOf("PUT /api/garden/settings")).toEqual([{ lastFrost: "05-12", baseUpdatedAt: null }]));
  });
});

describe("the record", () => {
  it("starts empty, with a first action", async () => {
    fakeApi({ "GET /api/garden": garden(), "GET /api/households": ONE_HOUSEHOLD, "GET /api/reference/catalogue": catalogue });
    renderScreen(<GardenPage />, "/tools/garden");
    expect(await screen.findByRole("heading", { name: "Nothing recorded yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record a sowing" })).toBeInTheDocument();
  });

  it("lists what was sown with where, and when the RHS harvests it", async () => {
    fakeApi({
      "GET /api/garden": garden({ sowings: [sowing] }),
      "GET /api/households": ONE_HOUSEHOLD,
      "GET /api/reference/catalogue": catalogue,
    });
    renderScreen(<GardenPage />, "/tools/garden");
    await screen.findByRole("button", { name: "Change" });
    const section = await region("What you sowed");
    expect(await within(section).findByText("Carrots")).toBeInTheDocument();
    expect(sowingParts(sowing)).toEqual(["Sown 12 Apr 2026", "Bed 3", "the RHS harvests it May to November"]);
  });

  it("records a sowing on the person's press", async () => {
    const api = fakeApi({
      "GET /api/garden": garden(),
      "GET /api/households": ONE_HOUSEHOLD,
      "GET /api/reference/catalogue": catalogue,
      "POST /api/garden/sowings": { sowing },
    });
    renderScreen(<GardenPage />, "/tools/garden");
    fireEvent.click(await screen.findByRole("button", { name: "Record a sowing" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("What was sown"), { target: { value: "Sunflowers" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record it" }));
    await vi.waitFor(() => expect(api.bodiesOf("POST /api/garden/sowings")).toHaveLength(1));
    expect(api.bodiesOf("POST /api/garden/sowings")[0]).toMatchObject({ cropId: null, name: "Sunflowers", sownOn: "2026-05-15" });
  });

  it("changes a sowing with only its fields, and the time it was read so a change made elsewhere is not overwritten", async () => {
    const api = fakeApi({
      "GET /api/garden": garden({ sowings: [sowing] }),
      "GET /api/households": ONE_HOUSEHOLD,
      "GET /api/reference/catalogue": catalogue,
      "PUT /api/garden/sowings/s1": { sowing },
    });
    renderScreen(<GardenPage />, "/tools/garden");
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(api.bodiesOf("PUT /api/garden/sowings/s1")).toHaveLength(1));
    const body = api.bodiesOf("PUT /api/garden/sowings/s1")[0] as Record<string, unknown>;
    expect(body).toMatchObject({ cropId: "carrots", place: "Bed 3", baseUpdatedAt: 1 });
    // The server refuses keys it does not know, so these must not be sent.
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["id"]));
    expect(body).not.toHaveProperty("createdAt");
    expect(body).not.toHaveProperty("updatedAt");
  });

  it("says when the record cannot be loaded", async () => {
    fakeApi({
      "GET /api/garden": { status: 500, error: { code: "internal", message: "The database is busy." } },
      "GET /api/households": ONE_HOUSEHOLD,
      "GET /api/reference/catalogue": catalogue,
    });
    renderScreen(<GardenPage />, "/tools/garden");
    expect((await screen.findAllByText("The database is busy.")).length).toBeGreaterThan(0);
    expect(screen.getByText("The last-frost date could not be read, so the RHS months are shown as they are.")).toBeInTheDocument();
  });
});
