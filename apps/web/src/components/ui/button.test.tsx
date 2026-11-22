/**
 * A button whose action is in flight. It used to be made `disabled`, and a disabled button under
 * the focus drops it: a keyboard or screen reader user pressing "Keep on this computer" was sent
 * back to the top of the page.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

/** A button that is busy from its first press on. */
function Busy({ pressed }: { pressed: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      onClick={() => {
        pressed();
        setBusy(true);
      }}
    >
      Keep
    </Button>
  );
}

describe("a button while it is busy", () => {
  it("keeps the keyboard, says it is busy and unavailable, and refuses a second press", async () => {
    const user = userEvent.setup();
    const pressed = vi.fn();
    render(<Busy pressed={pressed} />);
    const button = screen.getByRole("button", { name: "Keep" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("disabled");
    await user.keyboard("{Enter}");
    await user.click(button);
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("is disabled outright when it is disabled as well", () => {
    render(
      <Button loading disabled>
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("does not submit its form while busy", async () => {
    const submitted = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => submitted(event.nativeEvent as SubmitEvent)}>
        <Button type="submit" loading>
          Busy
        </Button>
      </form>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Busy" }));
    expect(submitted).not.toHaveBeenCalled();
  });
});
