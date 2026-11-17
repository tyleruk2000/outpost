import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AutosaveStatus } from "./autosave";
import { SaveState } from "./note-top-bar";

const live = () => screen.getByRole("status");

describe("SaveState", () => {
  it("shows every state, but tells a screen reader only what needs attention", () => {
    const view = render(<SaveState status={{ kind: "saved" } as AutosaveStatus} />);
    expect(screen.getByText("Saved")).toBeVisible();
    expect(live()).toHaveTextContent("");

    // Typing saves every few seconds; announcing each one would talk over the writing.
    view.rerender(<SaveState status={{ kind: "saving" } as AutosaveStatus} />);
    expect(screen.getByText("Saving…")).toBeVisible();
    expect(live()).toHaveTextContent("");
    view.rerender(<SaveState status={{ kind: "saved" } as AutosaveStatus} />);
    expect(live()).toHaveTextContent("");

    view.rerender(<SaveState status={{ kind: "offline" } as AutosaveStatus} />);
    expect(live()).toHaveTextContent("Offline, changes kept here");
    view.rerender(<SaveState status={{ kind: "saving" } as AutosaveStatus} />);
    // Back from a problem, the first save is worth hearing.
    view.rerender(<SaveState status={{ kind: "saved" } as AutosaveStatus} />);
    expect(live()).toHaveTextContent("Saved");
  });
});
