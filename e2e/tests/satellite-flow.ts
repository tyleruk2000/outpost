/**
 * Satellite pictures of the area in view, added the one way map data is added: the map's
 * Offline tab, Add this view, then in Add a place the area's name, Map left unticked and
 * Satellite pictures ticked, and Choose the picture. Leaves the dialog at the list of pictures.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

export async function startAreaPictures(page: Page, name: string, touch = false): Promise<Locator> {
  const press = (target: Locator) => (touch ? target.tap() : target.click());
  await press(page.getByRole("tab", { name: "Offline maps" }));
  await press(page.getByRole("button", { name: "Add this view" }));
  const dialog = page.getByRole("dialog", { name: "Add a place" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await expect(dialog.getByRole("heading", { name: `What for ${name}?` })).toBeVisible();
  const map = dialog.getByRole("checkbox", { name: /^Map/ });
  if (await map.isChecked()) await press(map);
  await press(dialog.getByRole("checkbox", { name: /Satellite pictures/ }));
  await press(dialog.getByRole("button", { name: "Choose the picture" }));
  await expect(dialog.getByRole("heading", { name: `Satellite pictures of ${name}` })).toBeVisible();
  return dialog;
}

/** The sets held, by name, from the server. */
export async function imageryNamed(page: Page, name: string) {
  const answer = await page.request.get("/api/maps/imagery");
  const body = (await answer.json()) as { sets: Array<{ name: string; imageDateText: string; source: string }> };
  return body.sets.find((set) => set.name === name) ?? null;
}
