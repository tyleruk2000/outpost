import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageTitle } from "./note-header";

describe("a page's title", () => {
  it("is the page's heading for a screen reader as well as a field to type in", () => {
    render(<PageTitle value="Water and food store" editable onChange={() => {}} onEnter={() => {}} onBlur={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Water and food store" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue("Water and food store");
  });

  it("is called Untitled while it is empty", () => {
    render(<PageTitle value="  " editable onChange={() => {}} onEnter={() => {}} onBlur={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Untitled" })).toBeInTheDocument();
  });
});
