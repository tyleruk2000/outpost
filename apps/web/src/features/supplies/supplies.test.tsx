import { DEFAULT_HOUSEHOLD, type Household, type ShoppingList, type SupplyItem } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { draftOf, inputOf } from "./item-form";
import SuppliesPage from "./supplies-page";
import { lineWords, quantityWords, shoppingText, whenWords } from "./words";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const item = (patch: Partial<SupplyItem>): SupplyItem => ({
  id: "i1",
  name: "Baked beans",
  category: "food",
  quantity: 10,
  unit: "tin",
  location: "Pantry",
  dateKind: "best-before",
  date: "2099-06-30",
  kcalPerUnit: null,
  kcalPer100g: 84,
  gramsPerUnit: 400,
  litresPerUnit: null,
  minimum: null,
  barcode: null,
  notes: "",
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

interface Server {
  posted: Array<{ path: string; body: unknown }>;
}

function show(
  options: {
    items?: SupplyItem[] | "fails" | "never";
    /** What the server says to adding an item, in place of taking it. */
    refuseAdd?: string;
    household?: Household;
    shopping?: ShoppingList;
    lookup?: unknown;
    view?: string;
  } = {},
): Server {
  const server: Server = { posted: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method && init.method !== "GET") {
        const body = init.body ? JSON.parse(String(init.body)) : null;
        server.posted.push({ path: `${init.method} ${pathname}`, body });
        if (pathname.endsWith("/adjust")) return json({ item: item({ quantity: 9 }) });
        if (pathname === "/api/supplies/items" && options.refuseAdd)
          return json({ error: { code: "bad_request", message: options.refuseAdd } }, 400);
        if (pathname === "/api/supplies/items") return json({ item: item({ id: "new", ...body }) });
        if (pathname.endsWith("/bought")) return json({ item: item({ id: "new", quantity: body.quantity, date: body.date }), line: null });
        return json({ ok: true });
      }
      if (pathname === "/api/supplies") {
        if (options.items === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        if (options.items === "never") return new Promise<Response>(() => {});
        return json({ items: options.items ?? [], household: options.household ?? DEFAULT_HOUSEHOLD, locations: ["Pantry"] });
      }
      if (pathname === "/api/supplies/shopping") return json(options.shopping ?? { lines: [], workedOutAt: null, stale: false });
      if (pathname.startsWith("/api/supplies/barcodes/"))
        return json(options.lookup ?? { code: decodeURIComponent(pathname.split("/").pop()!), key: "x", items: [], product: null });
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
  return server;
}

describe("the words", () => {
  it("counts in plain English", () => {
    expect(quantityWords(10, "tin")).toBe("10 tins");
    expect(quantityWords(1, "box")).toBe("1 box");
    expect(quantityWords(3, "box")).toBe("3 boxes");
    expect(quantityWords(2.5, "kg")).toBe("2.5 kg");
    expect(quantityWords(4, "battery")).toBe("4 batteries");
    expect(whenWords(-2)).toBe("2 days ago");
    expect(whenWords(120)).toBe("in about 4 months");
  });
  it("writes the shopping list as text", () => {
    const lines = [
      {
        id: "a",
        source: "worked" as const,
        itemId: "i1",
        name: "Baked beans",
        quantity: 5,
        unit: "tin",
        reasons: ["energy" as const],
        note: "",
      },
      {
        id: "b",
        source: "worked" as const,
        itemId: null,
        name: "Water",
        quantity: null,
        unit: "",
        reasons: ["water" as const],
        note: "About 21 litres more",
      },
    ];
    expect(lineWords(lines[0]!)).toBe("5 tins of Baked beans");
    expect(shoppingText(lines)).toBe("- 5 tins of Baked beans\n- Water: about 21 litres more");
  });
});

describe("the Supplies screen", () => {
  it("shows a skeleton while loading", () => {
    show({ items: "never" });
    expect(screen.getByRole("status", { name: "Loading supplies" })).toBeInTheDocument();
  });

  it("says what failed, with a way to try again", async () => {
    show({ items: "fails" });
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("invites the first item when empty", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Nothing stored yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add the first item" })).toBeInTheDocument();
  });

  it("uses one with one press", async () => {
    const server = show({ items: [item({})] });
    await userEvent.click(await screen.findByRole("button", { name: "Use one tin of Baked beans" }));
    await waitFor(() => expect(server.posted).toContainEqual({ path: "POST /api/supplies/items/i1/adjust", body: { by: -1 } }));
  });

  it("names the buttons of an item counted without a unit in plain words", async () => {
    show({ items: [item({ name: "AA batteries", unit: "" })] });
    expect(await screen.findByRole("button", { name: "Use one of AA batteries" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add one of AA batteries" })).toBeInTheDocument();
  });

  it("marks what is past its use-by", async () => {
    show({ items: [item({ name: "Ham", dateKind: "use-by", date: "2020-01-01" })] });
    expect(await screen.findByText(/Past its use-by, 1 Jan 2020/)).toBeInTheDocument();
  });

  it("adds an item, and another like it keeping all but the date", async () => {
    const server = show();
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to supplies" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Chickpeas");
    await userEvent.click(within(dialog).getByRole("button", { name: "One more: how many" }));
    await userEvent.type(within(dialog).getByLabelText("kcal in one (optional)"), "400");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add, then another" }));
    await waitFor(() => expect(server.posted.filter((post) => post.path === "POST /api/supplies/items")).toHaveLength(1));
    expect(server.posted[0]!.body).toMatchObject({
      name: "Chickpeas",
      quantity: 2,
      unit: "tin",
      category: "food",
      kcalPerUnit: 400,
      date: null,
    });
    // Still open, with the same name, for the next batch.
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Chickpeas");
    expect(await within(dialog).findByText("1 added so far.")).toBeInTheDocument();
  });

  it("asks for a name before adding", async () => {
    const server = show();
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText(/Give it a name/)).toBeInTheDocument();
    expect(server.posted).toEqual([]);
  });

  it("saves a row whose hidden fields hold something that is not a number", () => {
    // Typed in the per-100 g fields, then switched to per pack; or typed as food, then made equipment.
    const switched = inputOf({ ...draftOf({ name: "Oats", category: "food" }), energyBy: "pack", kcalPerUnit: "380", kcalPer100g: "abc" });
    expect(switched).toMatchObject({ name: "Oats", kcalPerUnit: 380, kcalPer100g: null });
    const recategorised = inputOf({ ...draftOf({ name: "Torch", category: "equipment" }), kcalPerUnit: "x", litresPerUnit: "y" });
    expect(recategorised).toMatchObject({ name: "Torch", kcalPerUnit: null, litresPerUnit: null });
    // kJ typed for kcal is caught where it is typed.
    expect(inputOf({ ...draftOf({ name: "Oats", category: "food" }), energyBy: "100g", kcalPer100g: "1550", gramsPerUnit: "500" })).toEqual(
      {
        field: "kcalPer100g",
        text: "At most 1,000.",
      },
    );
    // A field that is shown still has to be a number.
    expect(inputOf({ ...draftOf({ name: "Oats", category: "food" }), energyBy: "pack", kcalPerUnit: "abc" })).toEqual({
      field: "kcalPerUnit",
      text: "A number, or leave it empty.",
    });
  });

  it("opens the closed part of the form to show what is wrong in it", async () => {
    const server = show();
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to supplies" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    await userEvent.click(within(dialog).getByText("More: minimum, barcode, notes"));
    await userEvent.type(within(dialog).getByLabelText("Keep at least (optional)"), "lots");
    const more = within(dialog).getByText("More: minimum, barcode, notes").closest("details")!;
    more.open = false;
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText("A number, or leave it empty.")).toBeVisible();
    expect(more.open).toBe(true);
    expect(server.posted).toEqual([]);
  });

  it("says what the server refused as a notice, not as a fault in the name", async () => {
    show({ refuseAdd: "The inventory holds at most 5,000 rows." });
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to supplies" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText("The inventory holds at most 5,000 rows.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  it("says who the days are for before working them out", async () => {
    show({ items: [item({})], view: "days" });
    expect(await screen.findByText("Say who the supplies are for")).toBeInTheDocument();
  });

  it("works out the days for the household, saying what it counted and left out", async () => {
    show({
      items: [item({}), item({ id: "i2", name: "Salt", kcalPer100g: null, gramsPerUnit: null, date: null, dateKind: null })],
      household: {
        ...DEFAULT_HOUSEHOLD,
        daysWanted: 7,
        members: [
          {
            id: "m",
            kind: "person",
            name: "",
            band: "19-64",
            sex: "female",
            kcalPerDay: null,
            drinkingLitres: null,
            allUsesLitres: null,
            note: "",
          },
        ],
      },
      view: "days",
    });
    // 10 tins at 336 kcal: 3,360 against 2,000 a day.
    expect(await screen.findByText(/That is 3,360 kcal in 1 item against 2,000 kcal a day/)).toBeInTheDocument();
    expect(screen.getByText(/The food holds about 1.6 days of energy/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Salt" })).toHaveAttribute("href", "/prepare/supplies/items/i2");
  });

  it("says plainly that there is no water, rather than that it runs out in none", async () => {
    show({
      items: [item({})],
      household: {
        ...DEFAULT_HOUSEHOLD,
        daysWanted: 7,
        members: [
          {
            id: "m",
            kind: "person",
            name: "",
            band: "19-64",
            sex: "female",
            kcalPerDay: null,
            drinkingLitres: null,
            allUsesLitres: null,
            note: "",
          },
        ],
      },
      view: "days",
    });
    expect(await screen.findByText(/^There is no water stored\./)).toBeInTheDocument();
    expect(screen.queryByText(/in none/)).toBeNull();
  });

  it("counts the stock in items, a household's word, not in rows", async () => {
    show({ items: [item({}), item({ id: "i2", name: "Rice" })] });
    expect(await screen.findByText("2 items")).toBeInTheDocument();
    expect(screen.queryByText(/\brows?\b/)).toBeNull();
  });

  it("offers the shopping list as a PDF and as text", async () => {
    show({
      view: "shopping",
      shopping: {
        lines: [{ id: "l1", source: "worked", itemId: "i1", name: "Baked beans", quantity: 5, unit: "tin", reasons: ["energy"], note: "" }],
        workedOutAt: Date.UTC(2026, 10, 16),
        stale: true,
      },
    });
    expect(await screen.findByText("5 tins of Baked beans")).toBeInTheDocument();
    expect(screen.getByText(/has changed since this list was worked out/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Save as PDF/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to library/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy as text" })).toBeInTheDocument();
  });

  it("asks the date when something on the list is bought", async () => {
    const server = show({
      items: [item({})],
      view: "shopping",
      shopping: {
        lines: [{ id: "l1", source: "worked", itemId: "i1", name: "Baked beans", quantity: 5, unit: "tin", reasons: ["energy"], note: "" }],
        workedOutAt: 1,
        stale: false,
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Bought Baked beans" }));
    const dialog = await screen.findByRole("dialog", { name: "Bought: Baked beans" });
    await userEvent.type(within(dialog).getByLabelText("Best before"), "2028-03-01");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add to stock" }));
    await waitFor(() =>
      expect(server.posted).toContainEqual({
        path: "POST /api/supplies/shopping/l1/bought",
        body: { quantity: 5, dateKind: "best-before", date: "2028-03-01", location: "Pantry" },
      }),
    );
  });
});

describe("the scanner", () => {
  it("at a plain http address, says the camera is not available and why, and still offers a photo and the number", async () => {
    vi.stubGlobal("isSecureContext", false);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    const dialog = await screen.findByRole("dialog", { name: "Scan a barcode" });
    expect(within(dialog).getByText("The camera is not available at this address")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Settings → HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    expect(within(dialog).queryByRole("button", { name: "Use the camera" })).toBeNull();
    expect(within(dialog).getByText("Take or choose a photo of it")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Barcode number")).toBeInTheDocument();
  });

  it("takes a number typed (or typed by a scanner, ending in Enter) and offers a new item for an unknown one", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    const dialog = await screen.findByRole("dialog", { name: "Scan a barcode" });
    await userEvent.type(within(dialog).getByLabelText("Barcode number"), "5012345678900{Enter}");
    expect(await within(dialog).findByText("Not in your supplies yet")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "New item with this barcode" }));
    const form = await screen.findByRole("dialog", { name: "Add to supplies" });
    await userEvent.click(within(form).getByText("More: minimum, barcode, notes"));
    expect(within(form).getByLabelText("Barcode (optional)")).toHaveValue("5012345678900");
  });

  it("lets the camera go when the dialog is closed", async () => {
    vi.stubGlobal("isSecureContext", true);
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }) as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    try {
      show();
      await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
      const dialog = await screen.findByRole("dialog", { name: "Scan a barcode" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Use the camera" }));
      expect(await within(dialog).findByRole("button", { name: "Stop the camera" })).toBeInTheDocument();
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
      await waitFor(() => expect(track.stop).toHaveBeenCalled());
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("finds an item already kept, to change how many", async () => {
    show({ lookup: { code: "5012345678900", key: "05012345678900", items: [item({ barcode: "5012345678900" })], product: null } });
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    const dialog = await screen.findByRole("dialog", { name: "Scan a barcode" });
    await userEvent.type(within(dialog).getByLabelText("Barcode number"), "5012345678900{Enter}");
    expect(await within(dialog).findByText("In your supplies")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Use one tin of Baked beans" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "All used up" })).toBeInTheDocument();
  });
});
