import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { CONTOUR_NOTES, ContextMenu, MapControls, MoveCard } from "./map-chrome";

function controls(overrides: Partial<ComponentProps<typeof MapControls>> = {}) {
  const onContoursChange = vi.fn();
  render(
    <Tooltip.Provider>
      <MapControls
        tool="browse"
        onToolChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        rotated={false}
        onResetNorth={() => {}}
        locate={undefined}
        onLocate={() => {}}
        hillshade
        onHillshadeChange={() => {}}
        contours={false}
        contourReach="drawn"
        onContoursChange={onContoursChange}
        locatorGrid={false}
        onLocatorGridChange={() => {}}
        disabled={false}
        {...overrides}
      />
    </Tooltip.Provider>,
  );
  return onContoursChange;
}

describe("the contour lines control", () => {
  it("sits after hill shading and says whether it is on", async () => {
    const onChange = controls();
    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(names.indexOf("Contour lines")).toBe(names.indexOf("Hill shading") + 1);
    const button = screen.getByRole("button", { name: "Contour lines" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("switches off again when it is on", async () => {
    const onChange = controls({ contours: true });
    const button = screen.getByRole("button", { name: "Contour lines" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("is offered when no terrain is installed, where hill shading is not", () => {
    controls({ hillshade: undefined, contourReach: "no-terrain" });
    expect(screen.queryByRole("button", { name: "Hill shading" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contour lines" })).toBeEnabled();
  });

  it("names the reason when it is on and there is nothing to draw here", () => {
    controls({ contours: true, contourReach: "no-terrain-here" });
    expect(screen.getByRole("button", { name: "Contour lines: no terrain is downloaded for this area" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says to zoom in when the map is too far out", () => {
    controls({ contours: true, contourReach: "too-far-out" });
    expect(screen.getByRole("button", { name: "Contour lines: zoom in to see them" })).toBeInTheDocument();
  });

  it("has a plain sentence for every way of having nothing to draw", () => {
    for (const note of Object.values(CONTOUR_NOTES)) {
      expect(note.label.startsWith("Contour lines: ")).toBe(true);
      expect(note.message).toMatch(/^Contour lines .*\.$/);
    }
    expect(CONTOUR_NOTES["no-terrain"].message).toMatch(/none is downloaded yet/);
  });

  it("cannot be used while there is no map", () => {
    controls({ disabled: true });
    expect(screen.getByRole("button", { name: "Contour lines" })).toBeDisabled();
  });
});

describe("the card for moving a place", () => {
  const show = (props: Partial<ComponentProps<typeof MoveCard>> = {}) => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<MoveCard name="Esk Hause shelter" movedMeters={0} saving={false} onSave={onSave} onCancel={onCancel} {...props} />);
    return { onSave, onCancel };
  };

  it("says how to move the pin, by pointer and by keyboard, and has nothing to save yet", () => {
    show();
    expect(screen.getByRole("heading", { name: "Move “Esk Hause shelter”" })).toBeInTheDocument();
    expect(screen.getByText(/Drag the pin to where the place should be\./)).toBeInTheDocument();
    expect(screen.getByText(/From the keyboard, the arrow keys move it and Shift moves it further\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new position" })).toBeDisabled();
  });

  it("says how far the pin has gone and that nothing is kept until it is saved", async () => {
    const { onSave, onCancel } = show({ movedMeters: 286.4 });
    expect(screen.getByText("Moved 286 m from where it is saved. Not kept until you save.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save new position" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("is put down by Cancel or by its close button, saving nothing", async () => {
    const { onSave, onCancel } = show({ movedMeters: 40 });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel the move" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("the menu at a point on the map", () => {
  const menu = (place?: { name: string; onMove: () => void }) =>
    render(
      <ContextMenu
        point={{ x: 100, y: 100 }}
        bounds={{ width: 800, height: 600 }}
        coordinates="54.46100, -3.18400"
        place={place}
        onSave={() => {}}
        onMeasure={() => {}}
        onDraw={() => {}}
        onSun={() => {}}
        onClose={() => {}}
      />,
    );

  it("offers to move the saved place that is under the point, first", () => {
    const onMove = vi.fn();
    menu({ name: "Esk Hause shelter", onMove });
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Move “Esk Hause shelter”",
      "Save a place here",
      "Measure from here",
      "Draw a route from here",
      "Sun times here",
      "Copy coordinates",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move “Esk Hause shelter”" }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("is as it was where there is no saved place", () => {
    menu();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Save a place here",
      "Measure from here",
      "Draw a route from here",
      "Sun times here",
      "Copy coordinates",
    ]);
  });

  it("keeps the focus on the item moved to when the page draws itself again with a new onClose", async () => {
    const props = {
      point: { x: 100, y: 100 },
      bounds: { width: 800, height: 600 },
      coordinates: "54.46100, -3.18400",
      onSave: () => {},
      onMeasure: () => {},
      onDraw: () => {},
      onSun: () => {},
    };
    const first = vi.fn();
    const { rerender } = render(<ContextMenu {...props} onClose={first} />);
    expect(screen.getByRole("menuitem", { name: "Save a place here" })).toHaveFocus();
    screen.getByRole("menuitem", { name: "Sun times here" }).focus();
    const latest = vi.fn();
    rerender(<ContextMenu {...props} onClose={latest} />);
    expect(screen.getByRole("menuitem", { name: "Sun times here" })).toHaveFocus();
    // Escape still closes it, by the onClose it was last given.
    await userEvent.keyboard("{Escape}");
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
