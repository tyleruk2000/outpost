/**
 * The credits under a map: all of them on a wide screen, and on a phone one line with
 * the map's own credit and a button that opens the rest.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { type Credit, creditsFor, leadingCredit, MapFooter } from "./map-footer";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function screenOf(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? desktop : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

/** As the server gives them for an installed region with terrain, place names and Ordnance Survey's names. */
const credits = creditsFor(
  [
    { name: "Mapterhorn", html: '&copy; <a href="https://mapterhorn.com/attribution">Mapterhorn</a>' },
    {
      name: "Protomaps",
      html: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    { name: "GeoNames", html: 'Place names: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0)' },
    { name: "OS Open Names", html: "Contains OS data &copy; Crown Copyright and database rights 2026 (OGL v3.0)" },
  ] as never,
  { hasTiles: true, terrain: true },
);

const footer = (list: Credit[] = credits) => render(<MapFooter engine={null} format="decimal" onFormatChange={() => {}} credits={list} />);
const line = () => document.querySelector<HTMLElement>("[data-credits]")!;

describe("the credits under a map", () => {
  it("are all there on a wide screen, with nothing to open", () => {
    screenOf(true);
    footer();
    expect(line()).toHaveAttribute("data-credits", "all");
    expect(line()).toHaveTextContent(
      "© Mapterhorn · Protomaps © OpenStreetMap · Place names: GeoNames (CC BY 4.0) · Contains OS data © Crown Copyright and database rights 2026 (OGL v3.0) · Outlines: Natural Earth",
    );
    expect(screen.queryByRole("button", { name: /map credits/ })).toBeNull();
  });

  it("on a phone are one line: OpenStreetMap's stays in sight, and the rest open with a press and fold away again", async () => {
    screenOf(false);
    footer();
    expect(line()).toHaveAttribute("data-credits", "folded");
    expect(line()).toHaveTextContent("Protomaps © OpenStreetMap · 4 more");
    expect(within(line()).getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    const more = screen.getByRole("button", { name: "4 more map credits: show all 5" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(more);
    expect(line()).toHaveAttribute("data-credits", "opened");
    expect(line()).toHaveTextContent(
      "© Mapterhorn · Protomaps © OpenStreetMap · Place names: GeoNames (CC BY 4.0) · Contains OS data © Crown Copyright and database rights 2026 (OGL v3.0) · Outlines: Natural Earth · Fewer",
    );
    const fewer = screen.getByRole("button", { name: "Fewer map credits: show one line" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(fewer);
    expect(line()).toHaveTextContent("Protomaps © OpenStreetMap · 4 more");
  });

  it("with one credit there is nothing to fold", () => {
    screenOf(false);
    footer(creditsFor([], { hasTiles: false, terrain: false }));
    expect(line()).toHaveAttribute("data-credits", "all");
    expect(line()).toHaveTextContent("Natural Earth");
    expect(screen.queryByRole("button", { name: /map credits/ })).toBeNull();
  });

  it("keeps the first credit in sight where OpenStreetMap's data is not drawn", () => {
    const list: Credit[] = [
      { key: "a", parts: [{ text: "NASA Earth Observatory" }] },
      { key: "b", parts: [{ text: "Natural Earth" }] },
    ];
    expect(leadingCredit(list)?.key).toBe("a");
    expect(leadingCredit(credits)?.key).toBe("Protomaps");
    expect(leadingCredit([])).toBeUndefined();
  });
});
