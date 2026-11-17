/** The solar clock's pictures as a screen reader meets them: a named image with a description that adds to its name. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerOnDay } from "./answer-plate";
import { NorthSkyPlate } from "./nocturnal-plate";
import { noonByEqualShadows, timeFromShadowLength } from "./recovery";
import { BearingPlan, ShadowPlan, StickSide } from "./shadow-plates";
import { DialPlate, GnomonSide } from "./sundial-plates";

const greenwich = { lat: 51.4779, lon: -0.0015 };
const sydney = { lat: -33.8568, lon: 151.2153 };
const utc = { kind: "fixed" as const, minutes: 0 };

function image(name: RegExp) {
  const svg = screen.getByRole("img", { name });
  const description = svg.getAttribute("aria-describedby");
  const text = description ? document.getElementById(description)?.textContent : "";
  expect(text && text.length > 40).toBe(true);
  // The description says more than the caption, not the caption again.
  expect(text).not.toBe(screen.getByRole("figure").querySelector("figcaption")?.textContent);
  return { svg, description: text! };
}

describe("the solar clock's plates", () => {
  it("names the equal-shadows plan and says which way the noon line points, north or south", () => {
    const { unmount } = render(<ShadowPlan place={greenwich} date="2026-11-17" stick={1} mode={{ kind: "equal", radius: 4 }} />);
    expect(image(/noon line, and points true north/).description).toMatch(/circle of radius 4 m/);
    unmount();
    render(<ShadowPlan place={sydney} date="2026-11-17" stick={1} mode={{ kind: "equal", radius: 4 }} />);
    image(/points true south/);
  });

  it("draws no plan where the screen refuses the method (a circle inside the noon shadow)", () => {
    const { container } = render(<ShadowPlan place={greenwich} date="2026-11-17" stick={1} mode={{ kind: "equal", radius: 2 }} />);
    expect(container.querySelector("figure")).toBeNull();
  });

  it("gives the stick's angle as the screen's own arithmetic does", () => {
    render(<StickSide stick={1} shadow={3.6} />);
    // atan(1 / 3.6) = 15.52°.
    image(/The angle there, 15\.5°, is the sun's height/);
  });

  it("measures the compass bearing clockwise and leaves true north out without a declination", () => {
    render(<BearingPlan bearing={330} declination={null} />);
    expect(image(/reads the shadow from the stick's foot to its tip: 330°/).description).toMatch(/true north is not drawn/);
  });

  it("writes the answer's range on its picture as the answer does", () => {
    const outcome = timeFromShadowLength(greenwich, "2026-11-17", 1, 3.6, "morning", 0.005);
    if (!outcome.ok) throw new Error(outcome.reason);
    render(
      <AnswerOnDay place={greenwich} date="2026-11-17" estimate={outcome.estimate} kind="height" measured={15.52} zone={utc} style="24" />,
    );
    image(/Your reading, 15\.5°, meets the curve at \d\d:\d\d; the band is the range the answer gives, \d\d:\d\d to \d\d:\d\d/);
  });

  it("draws noon's answer at the top of the curve", () => {
    const outcome = noonByEqualShadows(greenwich, "2026-11-17", 1, 4, 0.005);
    if (!outcome.ok) throw new Error(outcome.reason);
    render(<AnswerOnDay place={greenwich} date="2026-11-17" estimate={outcome.estimate} kind="noon" zone={utc} style="24" />);
    image(/Noon is the top of the curve/);
  });

  it("names the dial plate and the gnomon for each hemisphere", () => {
    const { unmount } = render(<DialPlate latitude={51.5} longitude={0} standard={0} summer={0} date="2026-11-17" style="24" />);
    image(/dial plate for 51\.5° N.*true north at the top.*the clock reads 14:45/);
    unmount();
    const second = render(<GnomonSide latitude={-33.9} />);
    expect(image(/rises at 33\.9°, your latitude/).description).toMatch(/south horizon/);
    second.unmount();
    render(<GnomonSide latitude={51.5} />);
    image(/close to Polaris/);
  });

  it("names the sky about Polaris with the reading's hand and time", () => {
    render(
      <NorthSkyPlate
        place={greenwich}
        at={Date.UTC(2026, 10, 18, 3, 20)}
        clockWords="2 o'clock"
        timeWords="03:20"
        dateWords="2026-11-17"
      />,
    );
    expect(image(/Facing north at 03:20.*The arm stands at 2 o'clock/).description).toMatch(/Cassiopeia on the opposite side/);
    for (const name of ["Dubhe", "Merak", "Polaris"]) expect(screen.getByText(name)).toBeTruthy();
  });
});
