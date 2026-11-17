/**
 * The sun calculator's "today" is the date on this device's clock, not the date in
 * Greenwich: late in a New York evening it is still the day before there.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OutdoorsPage from "./outdoors-page";

vi.mock("@/features/maps/lib/sun-text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/maps/lib/sun-text")>()),
  deviceZone: () => "America/New_York",
}));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the sun's day", () => {
  it("is for today on this device's clock when no date is typed", () => {
    // 10 pm on 16 November in New York.
    vi.setSystemTime(new Date("2026-11-17T03:00:00Z"));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <OutdoorsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/^On 2026-11-16, in this device's time/)).toBeInTheDocument();
  });
});
