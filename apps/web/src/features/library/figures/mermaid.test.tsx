/**
 * Diagrams written as ```mermaid blocks. A test browser cannot lay a diagram out (it
 * measures nothing), so what is tested here is everything around the drawing: the
 * settings Mermaid is given, what is done to the SVG it returns before it is shown as
 * an image, what happens when the text is not a diagram, and that every diagram in the
 * books that ship with Outpost is one Mermaid can read.
 */
import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import MermaidDiagram from "./mermaid-diagram";
import { describeDiagram, diagramConfig, readPalette, standalone } from "./mermaid-render";

describe("how Mermaid is set up", () => {
  const config = diagramConfig(readPalette());

  it("draws strictly, with labels as SVG text, and nothing fetched or started on its own", () => {
    expect(config).toMatchObject({ securityLevel: "strict", htmlLabels: false, startOnLoad: false, suppressErrorRendering: true });
    expect(config.maxTextSize).toBeLessThanOrEqual(50_000);
  });

  it("lets a diagram's own text change none of that", () => {
    for (const key of [
      "secure",
      "securityLevel",
      "htmlLabels",
      "themeCSS",
      "theme",
      "themeVariables",
      "fontFamily",
      "flowchart",
      "layout",
      "maxTextSize",
    ]) {
      expect(config.secure, key).toContain(key);
    }
  });

  it("takes its colours from the design tokens, as colours Mermaid can do arithmetic on", () => {
    for (const [name, value] of Object.entries(config.themeVariables as Record<string, unknown>)) {
      if (/color|bkg|border|background/i.test(name)) expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(config.theme).toBe("base");
  });
});

describe("the picture made from Mermaid's SVG", () => {
  const drawing = (inside: string, attributes = 'viewBox="0 0 320.4 120" style="max-width: 320px" aria-roledescription="flowchart-v2"') =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="d1" ${attributes}>${inside}</svg>`;

  it("is sized in pixels and carries its own font", () => {
    const picture = standalone(drawing('<g><rect width="80" height="40"/><text><tspan>Antenna</tspan></text></g>'));
    expect(picture).toMatchObject({ width: 321, height: 120 });
    expect(picture.svg).toMatch(/^<svg[^>]* width="321"[^>]* height="120"/);
    expect(picture.svg).not.toMatch(/max-width/);
    expect(picture.svg).toMatch(/@font-face\{font-family:"Atkinson Hyperlegible Next Variable"[^}]*src:url\(data:/);
    // Nothing in it has an address outside the picture itself.
    expect(picture.svg.replace(/url\(data:[^)]*\)/g, "").replace(/xmlns(:\w+)?="[^"]*"/g, "")).not.toMatch(/https?:|\/\//);
  });

  it("has nothing left in it that is not drawing", () => {
    const picture = standalone(
      drawing(
        [
          "<script>alert(1)</script>",
          '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://evil.example/p.gif" onerror="alert(1)"/></div></foreignObject>',
          '<image href="https://evil.example/pixel.png" width="1" height="1"/>',
          '<a href="https://evil.example/" xlink:href="javascript:alert(1)"><text>Mixer</text></a>',
          '<rect width="10" height="10" onclick="alert(1)" onmouseover="alert(2)"/>',
          '<use href="#arrow"/><use xlink:href="https://evil.example/sprite.svg#x"/>',
          '<iframe src="https://evil.example/"></iframe>',
        ].join(""),
      ),
    );
    expect(picture.svg).not.toMatch(/<script|foreignObject|<image|<a[\s>]|<iframe|onclick|onmouseover|onerror|evil\.example|javascript:/);
    // The words and the local reference are kept.
    expect(picture.svg).toMatch(/<text>Mixer<\/text>/);
    expect(picture.svg).toMatch(/<use href="#arrow"/);
  });

  it("is refused when it is not a drawing with a size", () => {
    expect(() => standalone("<div>not a picture</div>")).toThrow();
    expect(() => standalone(drawing("<rect/>", ""))).toThrow(/no size/);
    expect(() => standalone(drawing("<rect/>", 'viewBox="0 0 0 0"'))).toThrow(/no size/);
    expect(() => standalone(drawing("<rect/>", 'viewBox="0 0 999999 10"'))).toThrow(/no size/);
    expect(() => standalone("<svg")).toThrow();
  });

  it("is described in words: its kind, the title its author gave it, and its labels", () => {
    const parse = (markup: string) => new DOMParser().parseFromString(markup, "image/svg+xml").documentElement as unknown as SVGSVGElement;
    expect(
      describeDiagram(
        parse(
          drawing(
            "<text><tspan>Microphone</tspan><tspan>(audio)</tspan></text><text>Mixer</text><text> Mixer </text><text></text><text>IF filter</text>",
          ),
        ),
      ),
    ).toBe("Flow chart. It shows: Microphone (audio); Mixer; IF filter");
    expect(
      describeDiagram(
        parse(drawing("<title>Opening a repeater</title><desc>Who speaks when.</desc><text>You</text>", 'aria-roledescription="sequence"')),
      ),
    ).toBe("Sequence diagram: Opening a repeater. Who speaks when.. It shows: You");
    expect(describeDiagram(parse(drawing("<rect/>", "")))).toBe("Diagram");
  });
});

describe("a block marked as a diagram that Mermaid cannot draw", () => {
  it("is shown as the text it is, with the reason", async () => {
    const source = "this is not a diagram <img src=x onerror=alert(1)>";
    const { container } = render(
      <ThemeProvider>
        <MermaidDiagram source={source} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("img", { name: "Diagram, being drawn" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/could not be drawn, so its source is shown/)).toBeInTheDocument(), { timeout: 20_000 });
    expect(container.querySelector("pre code")?.textContent).toBe(source);
    expect(container.querySelector("img, svg, script")).toBeNull();
    // Nothing of the attempt is left lying about the page.
    expect(document.querySelector('[id^="doutpost-diagram"], [id^="outpost-diagram"]')).toBeNull();
  }, 30_000);
});

describe("the diagrams in the books that ship with Outpost", () => {
  const root = path.resolve(import.meta.dirname, "../../../../../../catalog/bundled");
  const diagrams: Array<{ where: string; source: string }> = [];
  for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, source = ""] of text.matchAll(/^```mermaid\n([\s\S]*?)\n```$/gm)) diagrams.push({ where: file, source });
  }

  it("are all diagrams Mermaid can read, and none tries to set itself up", async () => {
    expect(diagrams.length).toBeGreaterThanOrEqual(563);
    mermaid.initialize(diagramConfig(readPalette()));
    const problems: string[] = [];
    const kinds = new Map<string, number>();
    for (const { where, source } of diagrams) {
      // The handbook's own style: no directives, no styling. A directive would be ignored here anyway.
      if (/%%\{|^\s*(classDef|style|click|linkStyle)\b/m.test(source)) problems.push(`${where}: a diagram carries a directive or styling`);
      try {
        const parsed = await mermaid.parse(source);
        if (parsed) kinds.set(parsed.diagramType, (kinds.get(parsed.diagramType) ?? 0) + 1);
      } catch (error) {
        problems.push(`${where}: ${String(error).split("\n")[0]}`);
      }
    }
    expect(problems).toEqual([]);
    expect([...kinds.keys()].sort()).toEqual(["flowchart-v2", "sequence"]);
  }, 180_000);
});
