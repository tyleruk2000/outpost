import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMissingPart, ScreenErrorBoundary } from "./screen-error";

function Broken(): never {
  throw new Error("cannot read properties of undefined");
}

function Shell() {
  const location = useLocation();
  return (
    <>
      <Link to="/fine">Elsewhere</Link>
      <ScreenErrorBoundary path={location.pathname}>
        <Routes>
          <Route path="/broken" element={<Broken />} />
          <Route path="/fine" element={<h1>Fine</h1>} />
          <Route path="/" element={<h1>Home</h1>} />
        </Routes>
      </ScreenErrorBoundary>
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("a screen that fails", () => {
  it("says so, offers a way back, and clears when another screen is chosen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <Shell />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "This screen stopped working" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(screen.getByRole("heading", { name: "Fine" })).toBeInTheDocument();
  });

  it("tells a part of the app that could not be fetched from a fault in it", () => {
    expect(isMissingPart(new TypeError("Failed to fetch dynamically imported module: /assets/maps-page-OLD.js"))).toBe(true);
    expect(isMissingPart(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isMissingPart(new TypeError("x is undefined"))).toBe(false);
  });
});
