import type { MarkerDto } from "@outpost/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlaceField } from "./data";
import type { PlanMapProps } from "./map/plan-map";
import { PlaceInput } from "./place-field";

// The map itself needs WebGL, which the test's browser has not got. What stands in for
// it shows what it was handed and lets a test press a place on it.
vi.mock("./map/plan-map", () => ({
  PlanMap: ({ label, data, places, onPress, onReady, onMoved }: PlanMapProps) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: said once, as the real map does when it is drawn
    useEffect(() => {
      onReady?.({ bounds: () => [-11, 49, 3, 59] });
      onMoved?.([-11, 49, 3, 59]);
    }, []);
    return (
      <section aria-label={label}>
        <output data-testid="features">{data?.features.map((feature) => feature.properties.kind).join(",")}</output>
        <button type="button" onClick={() => onPress?.({ position: { lat: 50.5, lon: -7 }, place: null })}>
          press the south-west cell
        </button>
        <button type="button" onClick={() => onPress?.({ position: { lat: 57, lon: 1 }, place: null })}>
          press the north-east cell
        </button>
        <button type="button" onClick={() => onPress?.({ position: { lat: 20, lon: 20 }, place: null })}>
          press outside
        </button>
        {places?.map((place) => (
          <button key={place.id} type="button" onClick={() => onPress?.({ position: { lat: place.lat, lon: place.lon }, place })}>
            press {place.name}
          </button>
        ))}
      </section>
    );
  },
}));

const home: MarkerDto = { id: "m1", name: "Home base", lat: 54.2, lon: -2.9 } as MarkerDto;

function Harness() {
  const [value, setValue] = useState<PlaceField>({ text: "", name: "" });
  return (
    <>
      <PlaceInput label="Transmitter" what="the transmitter" value={value} onChange={setValue} places={[home]} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe("choosing a place on the map", () => {
  it("takes a pressed position, or a saved place by name, and nothing until it is confirmed", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Transmitter: choose on the map" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose where the transmitter is" });
    expect(within(dialog).getByText("No place chosen yet.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Use this place" })).toBeDisabled();
    fireEvent.click(await within(dialog).findByRole("button", { name: "press the south-west cell" }));
    expect(within(dialog).getByText("50.5000, -7.0000 · IO60MM")).toBeInTheDocument();
    // Nothing has been chosen for the form yet.
    expect(screen.getByTestId("value").textContent).toBe('{"text":"","name":""}');
    fireEvent.click(within(dialog).getByRole("button", { name: "press Home base" }));
    expect(within(dialog).getByText("Home base · 54.2000, -2.9000 · IO84NE")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use this place" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("value").textContent).toBe('{"text":"54.20000, -2.90000","name":"Home base"}');
    expect(screen.getByText("54.2000, -2.9000 · IO84NE · Home base")).toBeInTheDocument();
  });

  it("can use the middle of the map, for a keyboard, and closes without choosing on Cancel", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Transmitter: choose on the map" }));
    const dialog = await screen.findByRole("dialog");
    const middle = await within(dialog).findByRole("button", { name: "Use the middle of the map" });
    await waitFor(() => expect(middle).toBeEnabled());
    fireEvent.click(middle);
    expect(within(dialog).getByText("54.0000, -4.0000 · IO84AA")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("value").textContent).toBe('{"text":"","name":""}');
  });
});
