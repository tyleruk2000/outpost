/**
 * The sun calculator's "today" is the date on this device's clock, not the date in
 * Greenwich: late in a New York evening it is still the day before there.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OutdoorsPage from "./outdoors-page";

const home = vi.hoisted(() => ({ value: null as null | { name: string; lat: number; lon: number } }));
vi.mock("@/features/households/home", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/households/home")>();
  return {
    ...real,
    useHome: () => ({
      ...real.useHome(),
      home: home.value ? { kind: "place", id: "m1", country: "GB", at: null, source: null, ...home.value } : null,
    }),
  };
});

vi.mock("@/features/maps/lib/sun-text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/maps/lib/sun-text")>()),
  deviceZone: () => "America/New_York",
}));

beforeEach(() => {
  localStorage.clear();
  home.value = null;
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
    expect(screen.getByText(/ today \(2026-11-16\), in this device's time/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tomorrow" })).toBeInTheDocument();
  });

  it("starts from the household's home, says so, and names the figure as the sunrise", () => {
    vi.setSystemTime(new Date("2026-11-17T03:00:00Z"));
    home.value = { name: "Home", lat: 51.5074, lon: -0.1278 };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <OutdoorsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const sun = document.getElementById("sun")!;
    expect(sun.querySelector<HTMLInputElement>("input[name=place]")!.value).toBe("51.5074, -0.1278");
    expect(screen.getByText(/^Home, the household's home/)).toBeInTheDocument();
    expect(screen.getByText(/^Sunrise at Home today \(2026-11-16\)/)).toBeInTheDocument();
  });
});
