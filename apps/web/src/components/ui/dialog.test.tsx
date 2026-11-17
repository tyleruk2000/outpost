/**
 * Most dialogs here are opened from state, by a button's onClick or a menu item, not by a
 * `DialogTrigger`. Radix gives focus back only to a trigger of its own, so when one of
 * them closed, focus fell to the top of the page and a keyboard user lost their place.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "./dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./menu";

function FromButton({ autoFocusField = false }: { autoFocusField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">Before</button>
      <button type="button" onClick={() => setOpen(true)}>
        Add location
      </button>
      {/* Put on the page only while open, as several screens do, so it leaves with no closing animation. */}
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent title="Add a storage location">
            <DialogBody>
              <input aria-label="Folder" autoFocus={autoFocusField} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function FromMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setOpen(true)}>Remove</MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove this location?"
        description="Its files stay where they are."
        confirmLabel="Remove location"
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}

describe("dialogs give focus back", () => {
  it("to the button that opened one, when it closes with Escape", async () => {
    const user = userEvent.setup();
    render(<FromButton />);
    const opener = screen.getByRole("button", { name: "Add location" });
    opener.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Add a storage location" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    // Described by nothing rather than by its own title a second time.
    expect(dialog).not.toHaveAttribute("aria-describedby");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("to the button, when a field in the dialog took focus as it opened", async () => {
    const user = userEvent.setup();
    render(<FromButton autoFocusField />);
    const opener = screen.getByRole("button", { name: "Add location" });
    opener.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("textbox", { name: "Folder" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("to the menu's button, when a confirmation opened from a menu item closes", async () => {
    const user = userEvent.setup();
    render(<FromMenu />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove this location?" });
    expect(confirm).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

function KeptMounted() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Add
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add to supplies">
          <DialogBody>Fields</DialogBody>
          <DialogFooter>Buttons</DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("a dialog on a short screen", () => {
  it("is measured each time it opens, also when it stays on the page while closed", async () => {
    // A screen 420 px high with a header and footer of 150 px each: the body would be left 60 px.
    const style = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const real = style(element, pseudo);
      if (element instanceof HTMLElement && element.getAttribute("role") === "dialog") {
        return new Proxy(real, { get: (target, key) => (key === "maxHeight" ? "360px" : Reflect.get(target, key)) });
      }
      return real;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = ["HEADER", "FOOTER"].includes(this.tagName) ? 150 : 0;
      return { height, width: 0, top: 0, left: 0, bottom: height, right: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const user = userEvent.setup();
    render(<KeptMounted />);
    await user.click(screen.getByRole("button", { name: "Add" }));
    // The whole dialog scrolls, so that its fields are not left a sliver between header and footer.
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-cramped", "true");
    vi.restoreAllMocks();
  });
});
