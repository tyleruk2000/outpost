import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaceSearch } from "./place-search";

describe("Search for a place, chosen from the dropdown", () => {
  it("puts the cursor in the box after the dropdown has handed the focus back to itself", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <button type="button" role="combobox" aria-label="Measure from" aria-expanded={false} aria-controls="none" />

        <PlaceSearch label="Place to measure from" markers={[]} near={null} autoFocus onChoose={() => {}} />
      </QueryClientProvider>,
    );
    // The dropdown takes the focus back as it closes, as Radix's does.
    screen.getByRole("combobox", { name: "Measure from" }).focus();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Place to measure from")));
    expect(screen.getByPlaceholderText("Town, grid ref or locator")).toBeInTheDocument();
  });
});
