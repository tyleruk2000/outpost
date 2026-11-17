import { expect, type Page } from "@playwright/test";

export interface DiagramReport {
  name: string;
  /** The accessible name: the figure's caption. */
  label: string;
  labels: number;
}

/**
 * Every diagram on the page (features/diagrams/plate.tsx), measured as drawn: each is an
 * image named by its caption and described by a sentence of its own, and no two of its
 * labels overlap, none runs outside the drawing, and none is smaller than the small text
 * size. Returns what it checked.
 */
export async function checkDiagrams(page: Page): Promise<DiagramReport[]> {
  // The plates are drawn after the screen has measured itself: wait until their number holds still.
  let count = -1;
  await expect
    .poll(async () => {
      const now = await page.locator("figure[data-diagram]").count();
      const settled = now === count;
      count = now;
      return settled;
    })
    .toBe(true);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll("figure[data-diagram]")].map((element) => {
      const svg = element.querySelector("svg[role=img]")!;
      const named = (attribute: string) =>
        (svg.getAttribute(attribute) ?? "")
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      const frame = svg.getBoundingClientRect();
      const small = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.875;
      const texts = [...svg.querySelectorAll("text")].filter((text) => (text.textContent ?? "").trim() !== "");
      const boxes = texts.map((text) => ({
        text: text.textContent!,
        box: text.getBoundingClientRect(),
        size: parseFloat(getComputedStyle(text).fontSize),
      }));
      const problems: string[] = [];
      if (frame.width < 100) problems.push(`the drawing is only ${frame.width}px wide`);
      for (const [i, a] of boxes.entries()) {
        if (a.size + 0.01 < small) problems.push(`"${a.text}" is ${a.size}px, under the small text size`);
        if (a.box.left < frame.left - 1 || a.box.right > frame.right + 1 || a.box.top < frame.top - 1 || a.box.bottom > frame.bottom + 1)
          problems.push(`"${a.text}" runs outside the drawing`);
        for (const b of boxes.slice(i + 1)) {
          const overlap =
            Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 0.5 &&
            Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 0.5;
          if (overlap) problems.push(`"${a.text}" overlaps "${b.text}"`);
        }
      }
      return {
        name: element.getAttribute("data-diagram") ?? "",
        label: named("aria-labelledby"),
        description: named("aria-describedby"),
        labels: boxes.length,
        problems,
      };
    }),
  );
  for (const each of found) {
    expect(each.problems, `${each.name}: ${each.problems.join("; ")}`).toEqual([]);
    expect(each.label.length, `${each.name} has a caption`).toBeGreaterThan(30);
    expect(each.description.length, `${each.name} has a description`).toBeGreaterThan(30);
    expect(each.description, `${each.name}'s description is not its caption again`).not.toBe(each.label);
  }
  return found.map(({ name, label, labels }) => ({ name, label, labels }));
}
