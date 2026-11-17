import { render as draw, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { ViewerToolbar } from "./document-toolbar";
import type { ViewerState } from "./document-viewer";

const state: ViewerState = { zoom: 1, fitted: true, fitLabel: "Fit width", canZoomIn: true, canZoomOut: true, page: 12, pageCount: 340 };
const render = (ui: ReactElement) => draw(<TooltipProvider>{ui}</TooltipProvider>);
const controls = () => ({ zoomBy: vi.fn(), fit: vi.fn(), goToPage: vi.fn() });

describe("the viewing controls", () => {
  it("in the top bar, have the steps to the page before and after as buttons", () => {
    render(<ViewerToolbar state={state} controls={controls()} />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More viewing controls" })).not.toBeInTheDocument();
  });

  it("on a phone, keep the steps in a menu so that the rest fit at a finger's size, and the menu works from the keyboard", async () => {
    const user = userEvent.setup();
    const given = controls();
    render(<ViewerToolbar state={state} controls={given} spread />);
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    for (const name of ["Zoom out", "Zoom in", "Fit width"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();

    screen.getByRole("button", { name: "More viewing controls" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Previous page" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Next page" }));
    expect(given.goToPage).toHaveBeenCalledWith(13);
  });

  it("on a phone, cannot step past either end", async () => {
    const user = userEvent.setup();
    render(<ViewerToolbar state={{ ...state, page: 340 }} controls={controls()} spread />);
    await user.click(screen.getByRole("button", { name: "More viewing controls" }));
    expect(await screen.findByRole("menuitem", { name: "Next page" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Previous page" })).not.toHaveAttribute("aria-disabled");
  });
});
