/**
 * Energy from USDA FoodData Central in the Supplies form, and the days of energy under
 * "How long it lasts": each state of the offers (looking, found, none, failed), what
 * choosing one fills for a weight and for a tin, the label's figure winning, the note of
 * where a figure came from, and the press that goes through the items without a figure.
 */
import { DEFAULT_HOUSEHOLD, energyNoteLine, type FoodMatch, type Household, readEnergyNote, type SupplyItem } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { draftOf, inputOf } from "./item-form";
import SuppliesPage from "./supplies-page";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const SOURCE = "USDA FoodData Central, SR Legacy (April 2018)";
const RICE: FoodMatch = {
  fdcId: 169756,
  description: "Rice, white, long-grain, regular, raw, unenriched",
  group: "Cereal Grains and Pasta",
  kcalPer100g: 365,
  proteinG: 7.13,
  fatG: 0.66,
  carbohydrateG: 79.95,
};
const COOKED: FoodMatch = { ...RICE, fdcId: 168878, description: "Rice, white, long-grain, regular, enriched, cooked", kcalPer100g: 130 };
const TUNA: FoodMatch = {
  ...RICE,
  fdcId: 171986,
  description: "Fish, tuna, light, canned in water, without salt, drained solids",
  kcalPer100g: 86,
};
const NOTE = { dataset: "SR Legacy", release: "April 2018", fdcId: RICE.fdcId, description: RICE.description, kcalPer100g: 365 };

const item = (patch: Partial<SupplyItem>): SupplyItem => ({
  id: "i1",
  name: "Rice",
  category: "food",
  quantity: 5,
  unit: "kg",
  location: "Pantry",
  dateKind: null,
  date: null,
  kcalPerUnit: null,
  kcalPer100g: null,
  gramsPerUnit: null,
  litresPerUnit: null,
  minimum: null,
  barcode: null,
  notes: "",
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const adult: Household = {
  ...DEFAULT_HOUSEHOLD,
  daysWanted: 7,
  energyTable: "uk",
  members: [
    {
      id: "m",
      kind: "person",
      name: "",
      band: "19-64",
      sex: "male",
      kcalPerDay: null,
      drinkingLitres: null,
      allUsesLitres: null,
      note: "",
    },
  ],
};

function show(options: { items?: SupplyItem[]; household?: Household; foods?: "fail" | "never"; view?: string } = {}) {
  const posted: Array<{ path: string; body: Record<string, unknown> }> = [];
  const searched: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method && init.method !== "GET") {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        posted.push({ path: `${init.method} ${url.pathname}`, body });
        return json({ item: item({ id: url.pathname.split("/").pop() ?? "new", ...body }) });
      }
      if (url.pathname === "/api/supplies")
        return json({ items: options.items ?? [], household: options.household ?? DEFAULT_HOUSEHOLD, locations: ["Pantry"] });
      if (url.pathname === "/api/supplies/foods") {
        const q = url.searchParams.get("q") ?? "";
        searched.push(q);
        if (options.foods === "fail") return json({ error: { code: "internal", message: "The disk could not be read." } }, 500);
        if (options.foods === "never") return new Promise<Response>(() => {});
        const matches = /rice/i.test(q) ? [RICE, COOKED] : /tuna/i.test(q) ? [TUNA] : [];
        return json({ source: SOURCE, matches });
      }
      if (url.pathname === "/api/supplies/shopping") return json({ lines: [], workedOutAt: null, stale: false });
      return json({ error: { code: "not_found", message: "No." } }, 404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/prepare/supplies${options.view ? `?view=${options.view}` : ""}`]}>
        <SuppliesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { posted, searched };
}

async function openAdd() {
  await userEvent.click(await screen.findByRole("button", { name: "Add" }));
  return screen.findByRole("dialog", { name: "Add to supplies" });
}

describe("energy from USDA FoodData Central, in the form", () => {
  it("offers foods for the name typed, asking once the typing pauses, and fills nothing until one is chosen", async () => {
    const { searched } = show();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    const offers = await within(dialog).findByRole("region", { name: "Energy from USDA FoodData Central" });
    expect(
      within(offers).getByText(`Energy per 100 g from ${SOURCE}. Choose one to fill it in, or give the label's figure below.`),
    ).toBeVisible();
    // Raw and cooked are offered apart, each named as the table names it.
    expect(within(offers).getByRole("button", { name: /Rice, white, long-grain, regular, raw, unenriched\s*365 kcal/ })).toBeVisible();
    expect(within(offers).getByRole("button", { name: /Rice, white, long-grain, regular, enriched, cooked\s*130 kcal/ })).toBeVisible();
    // Four keys, one question: the typing settled first.
    expect(searched).toEqual(["Rice"]);
    expect(within(dialog).getByLabelText(/^kcal in one/)).toHaveValue("");
    expect(within(dialog).getByText("Without it, this is not counted in the days of food.")).toBeVisible();
  });

  it("fills the energy for 5 kg of rice, says where it came from, and keeps that with the item", async () => {
    const { posted } = show();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    await userEvent.clear(within(dialog).getByLabelText("How many", { selector: "input" }));
    await userEvent.type(within(dialog).getByLabelText("How many", { selector: "input" }), "5");
    await userEvent.clear(within(dialog).getByLabelText(/^Of what/));
    await userEvent.type(within(dialog).getByLabelText(/^Of what/), "kg");
    await userEvent.click(await within(dialog).findByRole("button", { name: /raw, unenriched/ }));

    expect(within(dialog).getByLabelText(/^kcal per 100 g/)).toHaveValue("365");
    expect(within(dialog).getByLabelText(/^Grams in one/)).toHaveValue("1000");
    expect(within(dialog).getByText("3,650 kcal in one, 18,250 kcal in all.")).toBeVisible();
    expect(within(dialog).getByText(/From USDA FoodData Central \(SR Legacy, April 2018\), per 100 g of “Rice, white/)).toHaveTextContent(
      "Check the label; products differ.",
    );
    // The offers go once one is chosen.
    expect(within(dialog).queryByRole("region", { name: "Energy from USDA FoodData Central" })).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({
      name: "Rice",
      quantity: 5,
      unit: "kg",
      kcalPerUnit: null,
      kcalPer100g: 365,
      gramsPerUnit: 1000,
    });
    expect(readEnergyNote(String(posted[0]!.body.notes))).toEqual(NOTE);
  });

  it("asks for the weight of a tin rather than assuming one, the drained weight for a drained food", async () => {
    show();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Tuna");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Fish, tuna, light/ }));
    expect(within(dialog).getByLabelText(/^kcal per 100 g/)).toHaveValue("86");
    expect(within(dialog).getByLabelText(/^Grams in one/)).toHaveValue("");
    await waitFor(() => expect(within(dialog).getByLabelText(/^Grams in one/)).toHaveFocus());
    expect(
      within(dialog).getByText(
        "Give the weight of one tin from the label: it is not counted until you do. The food chosen is drained, so give the drained weight.",
      ),
    ).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText(/^Grams in one/), "112");
    // 86 × 1.12 = 96.3 kcal a tin.
    expect(within(dialog).getByText("96 kcal in one, 96 kcal in all.")).toBeVisible();
  });

  it("makes no offer over a figure typed from the label, and drops the table's note when its figure is typed over", async () => {
    const { posted } = show();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/^kcal in one/), "1800");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(within(dialog).queryByRole("region", { name: "Energy from USDA FoodData Central" })).toBeNull();

    // Cleared, chosen from the table, then the label's figure typed over it.
    await userEvent.clear(within(dialog).getByLabelText(/^kcal in one/));
    await userEvent.click(await within(dialog).findByRole("button", { name: /raw, unenriched/ }));
    await userEvent.clear(within(dialog).getByLabelText(/^kcal per 100 g/));
    await userEvent.type(within(dialog).getByLabelText(/^kcal per 100 g/), "350");
    expect(within(dialog).queryByText(/From USDA FoodData Central/)).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/^Grams in one/), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({ kcalPer100g: 350, notes: "" });
  });

  it("lets another food be chosen, and says so when nothing matches", async () => {
    show();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    await userEvent.click(await within(dialog).findByRole("button", { name: /raw, unenriched/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose another food" }));
    expect(within(dialog).getByLabelText(/^kcal per 100 g/)).toHaveValue("");
    await userEvent.click(await within(dialog).findByRole("button", { name: /cooked/ }));
    expect(within(dialog).getByLabelText(/^kcal per 100 g/)).toHaveValue("130");

    await userEvent.clear(within(dialog).getByLabelText("Name"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose another food" }));
    await userEvent.type(within(dialog).getByLabelText("Name"), "Spam fritters");
    expect(await within(dialog).findByText(/No food in the table matches “Spam fritters”/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  });

  it("says so when the table cannot be read", async () => {
    show({ foods: "fail" });
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    expect(await within(dialog).findByText("The table of foods could not be read: The disk could not be read.")).toBeVisible();
  });

  it("says it is looking while the table is asked", async () => {
    show({ foods: "never" });
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    expect(await within(dialog).findByText("Looking for “Rice” in the table of foods…")).toBeVisible();
  });

  it("reads back an item whose figure came from the table, and one whose figure was typed", () => {
    const line = energyNoteLine(NOTE);
    const fromTable = draftOf(item({ kcalPer100g: 365, gramsPerUnit: 1000, notes: `Top shelf\n${line}` }));
    expect(fromTable).toMatchObject({ notes: "Top shelf", energyFrom: NOTE, energyBy: "100g" });
    expect(inputOf(fromTable)).toMatchObject({ notes: `Top shelf\n${line}` });
    // Changed by hand since: the note no longer holds, and goes on the next save.
    const typed = draftOf(item({ kcalPer100g: 350, gramsPerUnit: 1000, notes: `Top shelf\n${line}` }));
    expect(typed.energyFrom).toBeNull();
    expect(inputOf(typed)).toMatchObject({ notes: "Top shelf", kcalPer100g: 350 });
  });
});

describe("days of energy, under How long it lasts", () => {
  const stock = [
    item({ id: "r", name: "Rice", quantity: 5, unit: "kg", kcalPer100g: 365, gramsPerUnit: 1000 }),
    item({ id: "b", name: "Baked beans", quantity: 4, unit: "tin" }),
    item({ id: "o", name: "Oats", quantity: 2, unit: "bag" }),
  ];

  it("says the days, the daily figure and whose it is, what is not counted, and that it is energy only", async () => {
    show({ items: stock, household: adult, view: "days" });
    // 18,250 kcal against 2,500 a day: 7.3 days, more than the 7 wanted.
    expect(await screen.findByText("The food holds about 7.3 days of energy for 1 person.")).toBeVisible();
    expect(
      screen.getByText(
        /That is 18,250 kcal in 1 item against 2,500 kcal a day: each person's figure for their age and sex from Public Health England, Government Dietary Recommendations \(August 2016\)\./,
      ),
    ).toBeVisible();
    const uncounted = screen.getByText(/2 food items have no energy figure and are not counted:/);
    expect(uncounted).toHaveTextContent(
      "2 food items have no energy figure and are not counted: Baked beans, Oats. Give them their energy",
    );
    expect(within(uncounted).getByRole("link", { name: "Oats" })).toHaveAttribute("href", "/prepare/supplies/items/o");
    expect(screen.getByText(/This is energy only: it says nothing about protein, vitamins/)).toBeVisible();
  });

  it("goes through the items with no figure, one after another, from one press", async () => {
    const { posted } = show({ items: stock, household: adult, view: "days" });
    await userEvent.click(await screen.findByRole("button", { name: "Give them their energy" }));
    let dialog = await screen.findByRole("dialog", { name: "Change Baked beans" });
    expect(within(dialog).getByText(/1 of 2 without an energy figure/)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText(/^kcal in one/), "390");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    dialog = await screen.findByRole("dialog", { name: "Change Oats" });
    expect(within(dialog).getByText(/2 of 2 without an energy figure/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted).toEqual([{ path: "PATCH /api/supplies/items/b", body: expect.objectContaining({ kcalPerUnit: 390 }) }]);
  });
});
