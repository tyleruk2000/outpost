/**
 * The ration calculator: it answers from the household it starts with, keeps a child on a
 * full ration at reduced levels, says who must not be put on a reduced ration, warns of a
 * ration of one food, and takes its household and food from Supplies.
 */
import { DEFAULT_HOUSEHOLD, type SuppliesResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import RationsPage from "./rations-page";

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Rations", () => {
  it("says who must not be put on a reduced ration, and gives the two adults' day by the UK figures", () => {
    show();
    expect(screen.getAllByText(/should not be put on a reduced ration by a calculator/).length).toBeGreaterThan(0);
    expect(within(section("A day's energy")).getByText("4,500 kcal")).toBeTruthy();
  });

  it("works out how long food lasts, the reduced rows reducing only those who may be reduced", async () => {
    show();
    const lasts = section("How long food lasts");
    // 60,000 kcal for 4,500 kcal a day.
    expect(within(lasts).getAllByText("13 days").length).toBe(2);
    expect(within(lasts).getByText("3,375 kcal")).toBeTruthy();
    expect(within(lasts).getByText("2,250 kcal")).toBeTruthy();
  });

  it("keeps a child on full at every level", async () => {
    localStorage.setItem(
      "outpost.tools.rations.people",
      JSON.stringify([{ id: "c", name: "Sam", age: 8, sex: "male", pregnant: false, breastfeeding: false, ill: false, ownKcal: null }]),
    );
    show();
    expect(within(section("A day's energy")).getByText(/Kept on a full ration: a child/)).toBeTruthy();
    expect(within(section("How long food lasts")).getByText(/Everyone in the household is kept on a full ration/)).toBeTruthy();
  });

  it("warns when the food to store is nearly all one food", async () => {
    localStorage.setItem(
      "outpost.tools.rations.store.shares",
      JSON.stringify({ rice: "100", lentils: "", oats: "", oil: "", "milk-powder": "", sugar: "" }),
    );
    show();
    expect(within(section("Food to store")).getByText(/Nearly all the energy/)).toBeTruthy();
  });

  it("takes the household from Supplies", async () => {
    const data: SuppliesResponse = {
      items: [],
      locations: [],
      household: {
        ...DEFAULT_HOUSEHOLD,
        members: [
          {
            id: "1",
            kind: "person",
            name: "Ada",
            band: "19-64",
            sex: "female",
            kcalPerDay: null,
            drinkingLitres: null,
            allUsesLitres: null,
            note: "",
          },
          {
            id: "2",
            kind: "pet",
            name: "Rex",
            band: null,
            sex: null,
            kcalPerDay: 800,
            drinkingLitres: null,
            allUsesLitres: null,
            note: "",
          },
        ],
      },
    };
    vi.spyOn(api, "get").mockResolvedValue(data as never);
    show();
    await userEvent.click(screen.getByRole("button", { name: /Use my household from Supplies/ }));
    expect(await within(section("A day's energy")).findByText("2,000 kcal", { selector: "p" })).toBeTruthy();
    expect(screen.getByDisplayValue("Ada")).toBeTruthy();
    expect(screen.queryByDisplayValue("Rex")).toBeNull();
  });
});
