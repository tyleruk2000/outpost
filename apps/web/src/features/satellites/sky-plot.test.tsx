import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/features/maps/lib/map-styles";
import { passSkyPath, predictPasses } from "./engine";
import { SkyPlot } from "./sky-plot";
import { ESHAIL, FUNCUBE } from "./test-orbits";

const LONDON = { lat: 51.5074, lon: -0.1278 };

/** OKLCH, as the tokens are written, to sRGB. */
function oklchToRgb(text: string): string {
  const [L, C, h] = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text)!.slice(1).map(Number) as [number, number, number];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const encoded = linear.map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  });
  return `rgb(${encoded.join(", ")})`;
}

describe("the sky track", () => {
  const passes = predictPasses(FUNCUBE, LONDON, new Date(Date.parse("2026-11-24T00:00:00Z")), 24, 4);
  const pass = passes[0]!;
  const path_ = passSkyPath(FUNCUBE, LONDON, pass, 30);

  it("marks the rise, the highest point and the set each by its own shape, and now by a ring", () => {
    const now = new Date((pass.aos.getTime() + pass.tca.getTime()) / 2);
    const { container } = render(<SkyPlot pass={pass} path={path_} now={now} />);
    expect(screen.getByRole("img", { name: /Sky track\. Rises in the/ })).toBeInTheDocument();
    expect(container.querySelector('circle[r="4.5"]')).not.toBeNull();
    expect(container.querySelector('path[d^="M"][fill="var(--color-ink)"]')).not.toBeNull();
    expect(container.querySelector('rect[width="9"][height="9"]')).not.toBeNull();
    expect(container.querySelector('circle[stroke="var(--color-lamp-ink)"]')).not.toBeNull();
    expect(screen.getByText(/Square: where it sets\. Large ring: where it is now\./)).toBeInTheDocument();
  });

  it("keeps the compass letters clear of a rise or set mark on the horizon, wherever it falls", () => {
    const { container } = render(<SkyPlot pass={pass} path={path_} />);
    const letters = [...container.querySelectorAll("text")].filter((text) => /^[NESW]$/.test(text.textContent ?? ""));
    expect(letters).toHaveLength(4);
    // A mark on the horizon reaches 6.5 out from the ring (the square with its halo); the letter, 12 high and up to
    // 11 wide, must start further out than that, with a gap.
    const centre = 120;
    const ring = 100;
    for (const letter of letters) {
      const x = Number(letter.getAttribute("x"));
      const y = Number(letter.getAttribute("y"));
      const anchor = letter.getAttribute("text-anchor");
      const name = letter.textContent;
      // The edge of the letter nearest the plot.
      const near = name === "N" ? centre - y : name === "S" ? y - 8.6 - centre : name === "E" ? x - centre : centre - x;
      if (name === "E") expect(anchor).toBe("start");
      if (name === "W") expect(anchor).toBe("end");
      expect(near - ring, name ?? "").toBeGreaterThanOrEqual(8);
    }
  });

  it("draws a satellite that is always up as one place to point, with no rise or set", () => {
    const always = predictPasses(ESHAIL, LONDON, new Date(Date.parse("2026-11-24T00:00:00Z")), 24, 4)[0]!;
    expect(always.alwaysUp).toBe(true);
    const { container } = render(<SkyPlot pass={always} path={passSkyPath(ESHAIL, LONDON, always, 12)} />);
    expect(screen.getByRole("img", { name: /Sky track\. Always up here: point \d+° up/ })).toBeInTheDocument();
    expect(container.querySelector('circle[r="4.5"]')).toBeNull();
    expect(container.querySelector('rect[width="9"][height="9"]')).toBeNull();
    expect(screen.getByText(/Diamond: where to point\./)).toBeInTheDocument();
  });

  it("draws now in a colour that stands out at 3:1 from the plot in both themes", () => {
    const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../styles/tokens.css"), "utf8");
    const light = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="dark"]'));
    const dark = css.slice(css.indexOf(':root[data-theme="dark"] {'));
    const token = (block: string, name: string) => new RegExp(`--${name}:\\s*(oklch\\([^)]*\\))`).exec(block)![1]!;
    for (const block of [light, dark]) {
      const ring = oklchToRgb(token(block, "lamp-ink"));
      for (const ground of ["surface", "page"]) expect(contrastRatio(ring, oklchToRgb(token(block, ground)))).toBeGreaterThanOrEqual(3);
    }
  });
});
