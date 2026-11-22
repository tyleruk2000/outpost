/** Shared by the households specs: back to the one household every other spec expects. */
import type { Page } from "@playwright/test";
import { api } from "./fixtures";

export async function backToOneHousehold(page: Page): Promise<void> {
  const listed = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
  await api(page, "PUT", "/api/households/current", { id: listed.households[0]!.id });
  for (const household of listed.households.slice(1)) await api(page, "DELETE", `/api/households/${household.id}?confirm=true`);
  for (const person of (await api<{ people: Array<{ id: string; name: string }> }>(page, "GET", "/api/people")).people)
    if (person.name.startsWith("E2E ")) await api(page, "DELETE", `/api/people/${person.id}?confirm=true`);
}

/** How far the page reaches past the right of the screen; 0 when it does not scroll sideways. */
export const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
