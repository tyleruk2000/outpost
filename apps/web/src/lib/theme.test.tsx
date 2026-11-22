import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TextSizeSetting } from "@/features/settings/text-size-setting";
import { applyTextSize, TEXT_SIZES, ThemeProvider } from "./theme";

const prePaint = fs.readFileSync(path.join(import.meta.dirname, "../../public/pre-paint.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(import.meta.dirname, "../../index.html"), "utf8");

function runPrePaint() {
  // As the browser runs it: a plain script, before the app.
  new Function(prePaint)();
}

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("style");
  delete root.dataset.theme;
  delete root.dataset.reading;
  delete root.dataset.spacing;
});
afterEach(() => root.removeAttribute("style"));

describe("the appearance choices before the first paint", () => {
  it("is loaded by index.html as a plain script in the head, ahead of the app", () => {
    const head = indexHtml.slice(0, indexHtml.indexOf("</head>"));
    expect(head).toMatch(/<script src="\/pre-paint\.js"><\/script>/);
    expect(indexHtml.indexOf("/pre-paint.js")).toBeLessThan(indexHtml.indexOf("/src/main.tsx"));
  });

  it.each(["smaller", "larger", "largest"] as const)("scales the root text for “%s” as the app does", (size) => {
    localStorage.setItem("outpost.textSize", size);
    runPrePaint();
    expect(root.style.fontSize).toBe(TEXT_SIZES[size]);
  });

  it("leaves the root text alone for the default, and for anything it does not know", () => {
    for (const value of [null, "default", "enormous"]) {
      if (value === null) localStorage.removeItem("outpost.textSize");
      else localStorage.setItem("outpost.textSize", value);
      runPrePaint();
      expect(root.style.fontSize).toBe("");
    }
  });

  it("puts the chosen theme and reading face on the page", () => {
    localStorage.setItem("outpost.theme", "dark");
    localStorage.setItem("outpost.reading", "sans");
    runPrePaint();
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.reading).toBe("sans");
    localStorage.setItem("outpost.theme", "light");
    runPrePaint();
    expect(root.dataset.theme).toBe("light");
  });

  it("puts wide reading spacing on the page, and nothing for normal", () => {
    localStorage.setItem("outpost.spacing", "wide");
    runPrePaint();
    expect(root.dataset.spacing).toBe("wide");
    delete root.dataset.spacing;
    localStorage.setItem("outpost.spacing", "normal");
    runPrePaint();
    expect(root.dataset.spacing).toBeUndefined();
  });

  it("knows the same text sizes as the setting", () => {
    for (const [size, scale] of Object.entries(TEXT_SIZES)) {
      if (size === "default") continue;
      expect(prePaint).toContain(`${size}: "${scale}"`);
    }
  });
});

describe("the Text size setting", () => {
  it("offers four steps, starts at the default, and scales the root text and keeps the choice on this device", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TextSizeSetting />
      </ThemeProvider>,
    );
    const choice = screen.getByRole("radiogroup", { name: "Text size" });
    expect(
      within(choice)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Smaller", "Default", "Larger", "Largest"]);
    expect(within(choice).getByRole("radio", { name: "Default" })).toBeChecked();
    expect(root.style.fontSize).toBe("");

    await user.click(within(choice).getByRole("radio", { name: "Largest" }));
    expect(root.style.fontSize).toBe("150%");
    expect(localStorage.getItem("outpost.textSize")).toBe("largest");

    await user.click(within(choice).getByRole("radio", { name: "Smaller" }));
    expect(root.style.fontSize).toBe("87.5%");

    await user.click(within(choice).getByRole("radio", { name: "Default" }));
    expect(root.style.fontSize).toBe("");
    expect(localStorage.getItem("outpost.textSize")).toBe("default");
  });

  it("starts from the choice kept on this device", () => {
    localStorage.setItem("outpost.textSize", "larger");
    render(
      <ThemeProvider>
        <TextSizeSetting />
      </ThemeProvider>,
    );
    expect(screen.getByRole("radio", { name: "Larger" })).toBeChecked();
    expect(root.style.fontSize).toBe("125%");
  });

  it("does not take away a root size it did not set", () => {
    root.style.setProperty("font-size", "24px", "important");
    applyTextSize("default");
    expect(root.style.fontSize).toBe("24px");
  });
});
