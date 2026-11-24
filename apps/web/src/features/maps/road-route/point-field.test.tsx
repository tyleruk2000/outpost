/**
 * A route point's list of suggestions, as Safari on an iPhone presses it: the field loses
 * focus to the panel round it before the tap's click, if it loses focus at all. The list
 * must still be there for the click, and a failed search must say so rather than "Nothing
 * found".
 */
import type { MarkerDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PointField } from "./point-field";
import type { RoutePointChoice } from "./words";

const marker = (name: string, isFavorite = false): MarkerDto =>
  ({
    id: name.toLowerCase(),
    name,
    note: "",
    lat: 52.15,
    lon: -0.7,
    color: "red",
    icon: "pin",
    isFavorite,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }) as unknown as MarkerDto;

function show(onChange = vi.fn<(point: RoutePointChoice | null) => void>()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <div data-testid="panel" tabIndex={-1}>
        <PointField
          label="From"
          value={null}
          onChange={onChange}
          markers={[marker("Home", true), marker("Allotment")]}
          getCenter={() => ({ lat: 52, lon: -1 })}
        />
        <button type="button">Elsewhere</button>
      </div>
    </QueryClientProvider>,
  );
  return { onChange, field: screen.getByLabelText("From") };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a route point's suggestions", () => {
  it("chooses a saved place by touch: the press keeps the field focused and the list stays for the click", () => {
    const { onChange, field } = show();
    act(() => field.focus());
    const home = screen.getByRole("button", { name: "Home" });
    // The press is held from taking focus (Safari moves it to the panel round the list otherwise).
    expect(fireEvent.pointerDown(home)).toBe(false);
    expect(fireEvent.mouseDown(home)).toBe(false);
    // Safari's own order: the field's focusout, to the panel, comes before the click. The list must not go.
    fireEvent.focusOut(field, { relatedTarget: screen.getByTestId("panel") });
    expect(screen.getByRole("list", { name: "Saved places" })).toBeInTheDocument();
    fireEvent.click(home);
    expect(onChange).toHaveBeenCalledWith({ name: "Home", lat: 52.15, lon: -0.7, from: "place" });
  });

  it("closes on a press elsewhere, on focus moving elsewhere and on Escape, and opens again on a press on the field", () => {
    const { field } = show();
    act(() => field.focus());
    expect(screen.getByRole("list", { name: "Saved places" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("list", { name: "Saved places" })).not.toBeInTheDocument();
    fireEvent.click(field);
    expect(screen.getByRole("list", { name: "Saved places" })).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    expect(screen.queryByRole("list", { name: "Saved places" })).not.toBeInTheDocument();
    fireEvent.click(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("list", { name: "Saved places" })).not.toBeInTheDocument();
  });

  it("says a search failed, with Try again, rather than that nothing is called that", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "internal", message: "The place names could not be read." } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { field } = show();
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "Olney" } });
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent("The place names could not be read.");
    expect(screen.queryByText(/Nothing found called that/)).not.toBeInTheDocument();
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
  });

  it("says why Where I am cannot be used over plain http, and takes the device's position where it can", () => {
    vi.stubGlobal("isSecureContext", false);
    const { field, onChange } = show();
    act(() => field.focus());
    expect(screen.getByText("Needs Outpost over HTTPS — Settings › HTTPS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Where I am" })).not.toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 51.1, longitude: -0.2 } } as GeolocationPosition),
      },
    });
    fireEvent.click(field);
    fireEvent.click(screen.getByRole("button", { name: "Where I am" }));
    expect(onChange).toHaveBeenCalledWith({ name: "Where you are", lat: 51.1, lon: -0.2, from: "map" });
  });

  it("takes the first suggestion on Return, and keeps what was typed until there is one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ query: "Allot", coordinate: null, places: [] }), { status: 200 })),
    );
    const { field, onChange } = show();
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "Allot" } });
    // Before the list has caught up with the typing, Return does nothing, and the words stay.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field).toHaveValue("Allot");
    await screen.findByRole("list", { name: "Places for from" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ name: "Allotment", lat: 52.15, lon: -0.7, from: "place" });
  });

  it("is one track no wider than the form, so a long detail cannot widen the list past the screen", () => {
    const { field } = show();
    act(() => field.focus());
    expect(field.closest(".grid")).toHaveClass("grid-cols-[minmax(0,1fr)]");
  });
});
