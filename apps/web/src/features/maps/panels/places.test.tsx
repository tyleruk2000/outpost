import type { MarkerDto } from "@outpost/shared";
import { MARKER_ICONS } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { PLACE_ICON_NAMES } from "../lib/place-icons";
import { draftOf, isDraftChanged, type PlaceDraft, PlaceEditor, PlacesList } from "./places";

const marker = (id: string, name: string, extra: Partial<MarkerDto> = {}): MarkerDto => ({
  id,
  name,
  note: "",
  lat: 54.461,
  lon: -3.184,
  color: "amber",
  icon: "pin",
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

  it("says, where there are no places yet, that sun times do not need one, and opens the Sun tab", async () => {
    const onShowSun = vi.fn();
    render(
      <PlacesList markers={loaded([])} onOpen={() => {}} onToggleFavourite={() => {}} onAdd={() => {}} canAddOnMap onShowSun={onShowSun} />,
    );
    expect(screen.getByRole("heading", { name: "No saved places yet" })).toBeInTheDocument();
    expect(
      screen.getByText(/Sunrise and sunset do not need a saved place\. The Sun tab gives them for the centre of the map\./),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show sun times" }));
    expect(onShowSun).toHaveBeenCalledTimes(1);
  });

  it("shows each place's icon in its colour, as on the map, and says the icon's name to a screen reader", () => {
    const list = [
      marker("m1", "Esk Hause shelter", { icon: "shelter", color: "green" }),
      marker("m2", "Styhead Tarn", { icon: "water", color: "blue" }),
      marker("m3", "Just a pin", { color: "red" }),
    ];
    render(<PlacesList markers={loaded(list)} onOpen={() => {}} onToggleFavourite={() => {}} onAdd={() => {}} canAddOnMap />);
    const row = (name: RegExp) => screen.getByRole("button", { name });
    const mark = (name: RegExp) => row(name).querySelector("[data-place-icon]") as HTMLElement;
    expect(mark(/^Esk Hause shelter/)).toHaveAttribute("data-place-icon", "shelter");
    expect(mark(/^Esk Hause shelter/).querySelector("svg")).not.toBeNull();
    // The disc is the place's colour.
    expect((mark(/^Esk Hause shelter/).firstElementChild as HTMLElement).style.background).toBe("rgb(61, 145, 80)");
    expect((mark(/^Styhead Tarn/).firstElementChild as HTMLElement).style.background).toBe("rgb(63, 127, 214)");
    expect(row(/^Esk Hause shelter/)).toHaveAccessibleName("Esk Hause shelter, Shelter or hut");
    expect(row(/^Styhead Tarn/)).toHaveAccessibleName("Styhead Tarn, Water");
    // A plain pin is the dot it always was, and its name is only its name.
    expect(mark(/^Just a pin/)).toHaveAttribute("data-place-icon", "pin");
    expect(mark(/^Just a pin/).querySelector("svg")).toBeNull();
    expect(row(/^Just a pin/)).toHaveAccessibleName("Just a pin");
    // The marks take the same room, so the names line up.
    for (const item of list) expect(mark(new RegExp(`^${item.name}`))).toHaveClass("size-[1.375rem]");
  });

  it("shows a place kept before there were icons as the plain pin it was", () => {
    const old = { ...marker("m1", "Old cairn") } as Partial<MarkerDto>;
    delete old.icon;
    render(<PlacesList markers={loaded([old as MarkerDto])} onOpen={() => {}} onToggleFavourite={() => {}} onAdd={() => {}} canAddOnMap />);
    expect(screen.getByRole("button", { name: "Old cairn" }).querySelector("[data-place-icon]")).toHaveAttribute("data-place-icon", "pin");
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
        draft={{
          id: saved.id,
          name: saved.name,
          note: "",
          color: saved.color,
          icon: "pin",
          isFavorite: false,
          lat: saved.lat,
          lon: saved.lon,
        }}
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
        draft={{
          id: saved.id,
          name: "Esk Hause",
          note: "",
          color: saved.color,
          icon: "pin",
          isFavorite: false,
          lat: saved.lat,
          lon: saved.lon,
        }}
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

const saved = marker("m1", "Esk Hause shelter", { color: "green" });
function Editor({ draft, onChange, onSave }: { draft: PlaceDraft; onChange: (draft: PlaceDraft) => void; onSave?: () => void }) {
  return (
    <PlaceEditor
      draft={draft}
      saved={saved}
      format="decimal"
      saving={false}
      deleting={false}
      mapReady
      onChange={onChange}
      onSave={onSave ?? (() => {})}
      onClose={() => {}}
      onDelete={() => {}}
    />
  );
}

/** The editor holding its own draft, as the map's page does. */
function StatefulEditor() {
  const [draft, setDraft] = useState(draftOf(saved));
  return <Editor draft={draft} onChange={setDraft} />;
}

describe("choosing a place's icon", () => {
  it("is a choice of sixteen beside the colour, each named, with the plain pin chosen to begin with", () => {
    render(<Editor draft={draftOf(saved)} onChange={() => {}} />, { wrapper: MemoryRouter });
    const icons = screen.getByRole("radiogroup", { name: "Icon" });
    const colours = screen.getByRole("radiogroup", { name: "Colour" });
    expect(colours.compareDocumentPosition(icons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const choices = within(icons).getAllByRole("radio");
    expect(choices.map((choice) => choice.getAttribute("aria-label"))).toEqual(MARKER_ICONS.map((icon) => PLACE_ICON_NAMES[icon]));
    expect(within(icons).getByRole("radio", { name: "Pin" })).toBeChecked();
    for (const choice of choices) {
      // Large enough to touch on a phone, and drawn in the place's colour.
      expect(choice).toHaveClass("max-md:size-11");
      const disc = choice.querySelector("[data-place-icon] > span") as HTMLElement;
      if (choice.getAttribute("aria-label") !== "Pin") expect(disc.style.background).toBe("rgb(61, 145, 80)");
    }
    // The chosen one is also said in words, not by its ring alone.
    expect(icons.parentElement).toHaveTextContent("Pin");
  });

  it("changes the draft when one is pressed", async () => {
    const onChange = vi.fn();
    render(<Editor draft={draftOf(saved)} onChange={onChange} />, { wrapper: MemoryRouter });
    const icons = screen.getByRole("radiogroup", { name: "Icon" });
    await userEvent.click(within(icons).getByRole("radio", { name: "Shelter or hut" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...draftOf(saved), icon: "shelter" });
  });

  it("can be worked from the keyboard: the arrow keys move through the set and choose", async () => {
    render(<StatefulEditor />, { wrapper: MemoryRouter });
    const icons = screen.getByRole("radiogroup", { name: "Icon" });
    const choice = (name: string) => within(icons).getByRole("radio", { name });
    // A key is down for longer than it takes the focus to move, which is when the icon it lands on is chosen.
    const press = async (key: "ArrowRight" | "ArrowLeft", lands: string) => {
      await userEvent.keyboard(`{${key}>}`);
      await waitFor(() => expect(choice(lands)).toHaveFocus());
      await userEvent.keyboard(`{/${key}}`);
    };
    choice("Pin").focus();
    await press("ArrowRight", "Home");
    expect(choice("Home")).toBeChecked();
    await press("ArrowRight", "Shelter or hut");
    await press("ArrowRight", "Camp");
    expect(choice("Camp")).toBeChecked();
    await press("ArrowLeft", "Shelter or hut");
    expect(choice("Shelter or hut")).toBeChecked();
    expect(icons.parentElement).toHaveTextContent("Shelter or hut");
  });

  it("shows the choice on the place's own heading, and counts as a change that can be saved", async () => {
    const onSave = vi.fn();
    const { rerender } = render(<Editor draft={draftOf(saved)} onChange={() => {}} onSave={onSave} />, { wrapper: MemoryRouter });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    const heading = screen.getByRole("heading", { name: "Esk Hause shelter" });
    expect(heading.querySelector("[data-place-icon]")).toHaveAttribute("data-place-icon", "pin");

    rerender(<Editor draft={{ ...draftOf(saved), icon: "shelter" }} onChange={() => {}} onSave={onSave} />);
    expect(heading.querySelector("[data-place-icon]")).toHaveAttribute("data-place-icon", "shelter");
    expect(within(screen.getByRole("radiogroup", { name: "Icon" })).getByRole("radio", { name: "Shelter or hut" })).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Icon" }).parentElement).toHaveTextContent("Shelter or hut");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("is part of what makes a draft differ from the saved place", () => {
    expect(isDraftChanged(draftOf(saved), saved)).toBe(false);
    expect(isDraftChanged({ ...draftOf(saved), icon: "tent" }, saved)).toBe(true);
    const iconed = marker("m2", "Camp", { icon: "tent" });
    expect(draftOf(iconed).icon).toBe("tent");
    expect(isDraftChanged({ ...draftOf(iconed), icon: "pin" }, iconed)).toBe(true);
    // A place kept before there were icons opens as a plain pin and is not thereby changed.
    const old = { ...saved } as Partial<MarkerDto>;
    delete old.icon;
    expect(draftOf(old as MarkerDto).icon).toBe("pin");
    expect(isDraftChanged(draftOf(old as MarkerDto), old as MarkerDto)).toBe(false);
  });
});
