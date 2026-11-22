/** A button while its action is under way: marked unavailable, presses stopped, the keyboard's focus kept. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

function Saving({ pressed }: { pressed: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      loading={loading}
      onClick={() => {
        pressed();
        setLoading(true);
      }}
    >
      Save
    </Button>
  );
}

describe("Button while loading", () => {
  it("keeps the focus and stops further presses", async () => {
    const pressed = vi.fn();
    render(<Saving pressed={pressed} />);
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    await userEvent.keyboard("{Enter}");
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(save).toHaveFocus();
    expect(save).toBeEnabled();
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(save);
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("does not send its form again", async () => {
    const sent = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => sent(event.nativeEvent as SubmitEvent)}>
        <input aria-label="Name" />
        <Button type="submit" loading>
          Add
        </Button>
      </form>,
    );
    await userEvent.type(screen.getByLabelText("Name"), "Torch{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(sent).not.toHaveBeenCalled();
  });

  it("is still disabled when it is disabled", () => {
    render(
      <Button disabled loading>
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
