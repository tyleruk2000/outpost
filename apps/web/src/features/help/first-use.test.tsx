import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { FirstUseGuide } from "./first-use";
import { GUIDES } from "./guides";

const show = () =>
  render(
    <TooltipProvider>
      <MemoryRouter>
        <FirstUseGuide slug="map-quick-start" words="New to the map?" />
      </MemoryRouter>
    </TooltipProvider>,
  );

afterEach(() => localStorage.clear());

describe("the quick start on a screen's first use", () => {
  it("leads to the guide, and is not offered again once read", async () => {
    const view = show();
    const link = screen.getByRole("link", { name: "Read the quick start" });
    expect(link).toHaveAttribute("href", "/help/map-quick-start");
    await userEvent.click(link);
    view.unmount();
    show();
    expect(screen.queryByRole("link", { name: "Read the quick start" })).not.toBeInTheDocument();
  });

  it("can be put away without reading it", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Put the quick start away" }));
    expect(screen.queryByText("New to the map?")).not.toBeInTheDocument();
  });

  it("names guides that are in Help", () => {
    for (const slug of ["map-quick-start", "radio-quick-start"]) expect(GUIDES.some((guide) => guide.slug === slug)).toBe(true);
  });
});
