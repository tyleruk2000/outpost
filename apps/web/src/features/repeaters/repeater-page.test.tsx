import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import RepeaterPage from "./repeater-page";

afterEach(() => vi.restoreAllMocks());

describe("a repeater that cannot be loaded", () => {
  it("still has the screen's heading, says why, and offers to try again and the way back", async () => {
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/repeaters/")) throw new ApiError(500, "internal", "The server could not read the database.");
      return { markers: [] } as never;
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/radio/repeaters/r1"]}>
          <Routes>
            <Route path="/radio/repeaters/:id" element={<RepeaterPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("The server could not read the database.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Repeater" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Repeaters" })).toHaveAttribute("href", "/radio/repeaters");
  });
});
