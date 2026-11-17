import { northsAt } from "@outpost/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapToCompass, NorthsRose, rose } from "./norths-plates";

const NOV_2026 = Date.UTC(2026, 10, 17);

describe("the norths, drawn", () => {
  it("draws the norths at their real sides, enlarged by the factor it states", () => {
    const keswick = northsAt(54.6, -3.13, NOV_2026);
    const drawn = rose(keswick);
    expect(drawn.factor).toBeGreaterThan(1);
    expect(drawn.magneticAt).toBeCloseTo(keswick.declination * drawn.factor, 9);
    expect(drawn.gridAt).toBeCloseTo(keswick.convergence! * drawn.factor, 9);
    // West of the central meridian (2° W) the grid's north leans west of true north.
    expect(drawn.gridAt!).toBeLessThan(0);
    render(<NorthsRose norths={keswick} />);
    const svg = screen.getByRole("img", { name: new RegExp(`drawn ${drawn.factor} times their real size`) });
    const description = document.getElementById(svg.getAttribute("aria-describedby")!)!.textContent!;
    expect(description).toMatch(/grid north turned left of it/);
  });

  it("leaves grid north out away from Great Britain and draws a large declination at its real angle", () => {
    // Anchorage: about 13° east in 2026.
    const anchorage = northsAt(61.2, -149.9, NOV_2026);
    const drawn = rose(anchorage);
    expect(drawn.gridAt).toBeNull();
    expect(drawn.factor).toBe(1);
    render(<NorthsRose norths={anchorage} />);
    expect(screen.getByRole("img", { name: /Magnetic north is 1\d\.\d° east of true north\.$/ })).toBeTruthy();
  });

  it("says map to compass as the rule does", () => {
    const keswick = northsAt(54.6, -3.13, NOV_2026);
    render(<MapToCompass norths={keswick} mapBearing={90} />);
    const svg = screen.getByRole("img", { name: /the way is 090° from grid north/ });
    expect(svg.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText(/^map 090°$/)).toBeTruthy();
  });
});
