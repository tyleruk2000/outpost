/** One item's own page: what a person is told when marking it used up fails. */
import { DEFAULT_HOUSEHOLD, type SupplyItem } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorAnnouncer } from "@/lib/notify";
import SupplyItemPage from "./item-page";

afterEach(() => vi.unstubAllGlobals());

const beans: SupplyItem = {
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
};

it("says so when “All used up” could not be saved, and still shows the count as it was", async () => {
  const changes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "PATCH") {
        changes.push(JSON.parse(String(init.body)));
        return json({ error: { code: "internal", message: "The database is busy." } }, 500);
      }
      if (pathname === "/api/supplies/items/i1") return json({ item: beans });
      if (pathname === "/api/supplies") return json({ items: [beans], household: DEFAULT_HOUSEHOLD, locations: ["Pantry"] });
      return json({ error: { code: "not_found", message: "No." } }, 404);
    }),
  );
  const { container } = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <ErrorAnnouncer />
      <MemoryRouter initialEntries={["/prepare/supplies/items/i1"]}>
        <Routes>
          <Route path="/prepare/supplies/items/:id" element={<SupplyItemPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "All used up" }));
  await waitFor(() => expect(container.querySelector("[aria-live='assertive']")).toHaveTextContent("The database is busy."));
  expect(changes).toEqual([{ quantity: 0 }]);
  // Nothing pretends it worked: the button is still there to try again.
  expect(screen.getByRole("button", { name: "All used up" })).toBeEnabled();
});
