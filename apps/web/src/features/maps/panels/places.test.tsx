import type { MarkerDto } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { PlaceEditor, PlacesList } from "./places";

const marker = (id: string, name: string, extra: Partial<MarkerDto> = {}): MarkerDto => ({
  id,
  name,
  note: "",
  lat: 54.461,
  lon: -3.184,
  color: "amber",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const loaded = (markers: MarkerDto[]) => ({ data: markers, isPending: false, isError: false }) as UseQueryResult<MarkerDto[]>;

describe("the list of saved places", () => {
  const places = [marker("m1", "Esk Hause shelter"), marker("m2", "Styhead Tarn", { isFavorite: true })];

  it("lets a place be moved on the map without opening it", async () => {
    const onMove = vi.fn();
    const onOpen = vi.fn();
    render(
      <PlacesList markers={loaded(places)} onOpen={onOpen} onToggleFavourite={() => {}} onMove={onMove} onAdd={() => {}} canAddOnMap />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Move Esk Hause shelter on the map" }));
    expect(onMove).toHaveBeenCalledWith(places[0]);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Move Styhead Tarn on the map" })).toBeInTheDocument();
  });

  it("reaches the move button from the keyboard, between the place and its star", async () => {
    const onMove = vi.fn();
    render(
      <PlacesList
        markers={loaded([places[0]!])}
        onOpen={() => {}}
        onToggleFavourite={() => {}}
        onMove={onMove}
        onAdd={() => {}}
        canAddOnMap
      />,
    );
    screen.getByRole("button", { name: /^Esk Hause shelter/ }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Move Esk Hause shelter on the map" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onMove).toHaveBeenCalledTimes(1);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Make Esk Hause shelter a favourite" })).toHaveFocus();
  });

  it("has no move button when there is no map to move it on", () => {
    render(<PlacesList markers={loaded(places)} onOpen={() => {}} onToggleFavourite={() => {}} onAdd={() => {}} canAddOnMap={false} />);
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });
});

describe("an opened place", () => {
  it("says the pin can be moved from the keyboard as well as dragged", () => {
    const saved = marker("m1", "Esk Hause shelter");
    render(
      <PlaceEditor
        draft={{ id: saved.id, name: saved.name, note: "", color: saved.color, isFavorite: false, lat: saved.lat, lon: saved.lon }}
        saved={saved}
        format="decimal"
        saving={false}
        deleting={false}
        mapReady
        onChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/Drag the pin on the map to move it\./)).toBeInTheDocument();
    expect(screen.getByText(/From the keyboard, Tab to the pin and use the arrow keys; Shift moves it further\./)).toBeInTheDocument();
  });

  it("has its sun times in one line straight under its name, and looking at them does not save the place", async () => {
    localStorage.clear();
    const saved = marker("m1", "Esk Hause shelter");
    const onSave = vi.fn();
    const onNeedRoom = vi.fn();
    render(
      <PlaceEditor
        draft={{ id: saved.id, name: "Esk Hause", note: "", color: saved.color, isFavorite: false, lat: saved.lat, lon: saved.lon }}
        saved={saved}
        format="decimal"
        saving={false}
        deleting={false}
        mapReady
        onChange={() => {}}
        onSave={onSave}
        onClose={() => {}}
        onDelete={() => {}}
        onNeedRoom={onNeedRoom}
      />,
      { wrapper: MemoryRouter },
    );
    const sun = screen.getByRole("button", { name: /^Sun/ });
    expect(sun).toHaveAttribute("aria-expanded", "false");
    // Between the place's name and its fields: on a phone the sheet shows little more than that before it is scrolled.
    const follows = (earlier: Element, later: Element) =>
      Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByRole("heading", { name: "Esk Hause shelter" }), sun)).toBe(true);
    expect(follows(sun, screen.getByLabelText("Name"))).toBe(true);
    // Opening it asks for room (the sheet is raised on a phone); folding it again does not.
    expect(onNeedRoom).not.toHaveBeenCalled();
    await userEvent.click(sun);
    expect(onNeedRoom).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "The day after" }));
    await userEvent.type(screen.getByLabelText("Date"), "{Enter}");
    await userEvent.click(screen.getByRole("radio", { name: "UTC" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
