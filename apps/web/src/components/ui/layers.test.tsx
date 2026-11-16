/**
 * What is opened by a press (the list of a drop-down, a menu, a popover) is put at the
 * end of the page, outside whatever it was opened from. Opened from inside a dialog it
 * must still be drawn above the dialog, or it opens where nobody can see or press it.
 * A test here cannot see what is drawn; it holds the layers to the order that draws it.
 */
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Dialog, DialogBody, DialogContent } from "./dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./menu";
import { Popover, PopoverContent, PopoverTrigger, Select } from "./misc";

const tokens = fs.readFileSync(path.join(import.meta.dirname, "../../styles/tokens.css"), "utf8");
/** The number a layer's token is given in tokens.css. */
function layer(name: string): number {
  const found = new RegExp(`--z-${name}:\\s*(\\d+);`).exec(tokens);
  if (!found) throw new Error(`tokens.css has no --z-${name}`);
  return Number(found[1]);
}
/** The layer an element is drawn in, by the token its class names. */
function layerOf(element: Element | null): number {
  const found = /(?:^|\s)z-\(--z-([a-z]+)\)/.exec(element?.getAttribute("class") ?? "");
  if (!found) throw new Error("the element names no layer");
  return layer(found[1]!);
}

describe("layers", () => {
  it("draws a drop-down's list, a menu and a popover above the dialog they are opened in", async () => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <DialogContent title="A form">
          <DialogBody>
            <Select
              aria-label="What happened"
              value="contact"
              onChange={() => undefined}
              options={[
                { value: "contact", label: "A contact" },
                { value: "heard", label: "Heard, no contact" },
              ]}
            />
            <Menu>
              <MenuTrigger>More</MenuTrigger>
              <MenuContent>
                <MenuItem>Remove</MenuItem>
              </MenuContent>
            </Menu>
            <Popover>
              <PopoverTrigger>About this</PopoverTrigger>
              <PopoverContent>Words about it.</PopoverContent>
            </Popover>
          </DialogBody>
        </DialogContent>
      </Dialog>,
    );
    const dialog = layerOf(screen.getByRole("dialog", { name: "A form" }));
    expect(dialog).toBe(layer("dialog"));

    await user.click(screen.getByRole("combobox", { name: "What happened" }));
    expect(layerOf(await screen.findByRole("listbox"))).toBeGreaterThan(dialog);
    await user.click(screen.getByRole("option", { name: "Heard, no contact" }));

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(layerOf(await screen.findByRole("menu"))).toBeGreaterThan(dialog);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "About this" }));
    expect(layerOf(await screen.findByText("Words about it."))).toBeGreaterThan(dialog);
  });

  it("keeps the order the design gives: what is pressed open over a dialog, a toast over that, a tooltip over all", () => {
    const order = ["sticky", "nav", "dropdown", "overlay", "dialog", "popover", "toast", "tooltip"].map(layer);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });
});
