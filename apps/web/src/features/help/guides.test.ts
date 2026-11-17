/**
 * The guides and the pages of docs/ they are made from. A page of docs/ is a guide, or is
 * named in NOT_GUIDES with its reason: a new page cannot be left out of Help by accident.
 * The words are read from docs/ when the app is built (apps/web/guides-plugin.ts), here
 * as in the app, so these tests read the same guides a person does.
 */
import type { MarkdownBlock, MarkdownInline } from "@outpost/shared";
import { GUIDE_DOCS, GUIDE_INDEX, GUIDE_LOADERS, GUIDE_PROBLEMS } from "virtual:outpost-guides";
import { describe, expect, it } from "vitest";
import { everyPlace } from "@/components/find-places";
import { findGuides, sectionPath } from "./guide-places";
import { GUIDES, NOT_GUIDES } from "./guides";

function* runsOf(blocks: readonly MarkdownBlock[]): Generator<MarkdownInline> {
  function* within(runs: readonly MarkdownInline[]): Generator<MarkdownInline> {
    for (const run of runs) {
      yield run;
      if ("c" in run) yield* within(run.c);
    }
  }
  for (const block of blocks) {
    if (block.t === "heading" || block.t === "paragraph") yield* within(block.c);
    else if (block.t === "quote") yield* runsOf(block.c);
    else if (block.t === "list") for (const item of block.items) yield* runsOf(item.c);
    else if (block.t === "table") for (const row of block.rows) for (const cell of row) yield* within(cell);
  }
}

const drawn = GUIDES.filter((guide) => !guide.own);

describe("the guides under Help", () => {
  it("has every page of docs/ as a guide, or names it as left out with a reason", () => {
    const decided = new Set([...GUIDES.map((guide) => guide.file), ...Object.keys(NOT_GUIDES)]);
    expect(GUIDE_DOCS.filter((file) => !decided.has(file))).toEqual([]);
    expect([...decided].filter((file) => !GUIDE_DOCS.includes(file))).toEqual([]);
    for (const reason of Object.values(NOT_GUIDES)) expect(reason.length).toBeGreaterThan(10);
    expect(GUIDE_DOCS).toContain("deployment.md");
    expect(GUIDE_DOCS).toContain("development/web-screens.md");
  });

  it("gives each guide one address, a title, one sentence and a group", () => {
    expect(new Set(GUIDES.map((guide) => guide.slug)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((guide) => guide.file)).size).toBe(GUIDES.length);
    for (const guide of GUIDES) {
      expect(GUIDE_INDEX[guide.slug]?.title, guide.slug).toBeTruthy();
      expect(guide.about, guide.slug).toMatch(/^[A-Z].*\.$/);
    }
    expect(GUIDE_INDEX.deployment!.title).toBe("Installing and running Outpost");
  });

  it("has a set of words for every guide drawn from Markdown, and none for a guide that is a screen of its own", () => {
    expect(Object.keys(GUIDE_LOADERS).sort()).toEqual(drawn.map((guide) => guide.slug).sort());
  });

  it("lets every link between the pages of docs/ lead somewhere", () => {
    expect(GUIDE_PROBLEMS).toEqual([]);
  });

  it("opens each screen a guide describes at an address the navigation has", () => {
    const screens = new Set(everyPlace.map((place) => place.to.split("#")[0]));
    for (const guide of GUIDES) if (guide.opens) expect(screens.has(guide.opens.to.split("#")[0]!), guide.opens.to).toBe(true);
  });

  it("links one guide to another at a heading it has, and fetches nothing from anywhere", async () => {
    let chapters = 0;
    for (const guide of drawn) {
      const blocks = (await GUIDE_LOADERS[guide.slug]!()).default;
      const ids = new Set(blocks.flatMap((block) => (block.t === "heading" && block.id ? [block.id] : [])));
      for (const [id] of GUIDE_INDEX[guide.slug]!.sections) expect(ids.has(id), `${guide.slug}#${id}`).toBe(true);
      for (const run of runsOf(blocks)) {
        // A picture would be fetched by the browser: a guide carries none, only what its author wrote about one.
        expect(run.t === "image" && run.picture !== undefined, guide.slug).toBe(false);
        expect(run.t, guide.slug).not.toBe("picture");
        if (run.t === "link") expect(run.href, guide.slug).toMatch(/^(https?:|mailto:)/);
        if (run.t !== "chapter") continue;
        chapters += 1;
        const target = GUIDES[run.chapter - 1];
        expect(target, `${guide.slug} → chapter ${run.chapter}`).toBeDefined();
        if (run.anchor && target && !target.own) {
          const sections = (await GUIDE_LOADERS[target.slug]!()).default;
          expect(
            sections.some((block) => block.t === "heading" && block.id === run.anchor),
            `${guide.slug} → ${target.slug}#${run.anchor}`,
          ).toBe(true);
        }
      }
      expect(blocks.some((block) => block.t === "figure")).toBe(false);
    }
    expect(chapters).toBeGreaterThan(100);
  });

  it("turns a link to a file of the repository into a link to it on GitHub", async () => {
    const security = (await GUIDE_LOADERS.security!()).default;
    const hrefs = [...runsOf(security)].flatMap((run) => (run.t === "link" ? [run.href] : []));
    expect(hrefs).toContain("https://github.com/tyleruk2000/outpost/blob/main/SECURITY.md");
  });
});

describe("finding a guide in the quick search", () => {
  it("lands on the section of the deployment guide about the Raspberry Pi", () => {
    const found = findGuides("raspberry pi", GUIDE_INDEX);
    expect(found[0]?.to).toMatch(/^\/help\/deployment#h-/);
    expect(found[0]?.label).toMatch(/Raspberry Pi/);
  });

  it("finds guides by their everyday words and their sections", () => {
    const where = (typed: string) => findGuides(typed, GUIDE_INDEX).map((place) => place.to);
    expect(where("docker")).toContain("/help/deployment#h-docker-compose-quick-start");
    expect(where("https")).toContain("/help/deployment#h-https-on-your-network");
    expect(where("restore a backup").some((to) => to.startsWith("/help/"))).toBe(true);
    expect(where("troubleshooting")[0]).toBe("/help/troubleshooting");
    expect(where("licence").some((to) => to.startsWith("/help/sources"))).toBe(true);
    expect(findGuides("raspberry pi", GUIDE_INDEX).length).toBeLessThanOrEqual(6);
  });

  it("gives a section of a screen of its own that screen's own ids", () => {
    expect(sectionPath("search-and-answers", "docker")).toBe("/help/search-and-answers#docker");
    expect(sectionPath("deployment", "logs")).toBe("/help/deployment#h-logs");
  });

  it("does not offer the set-up guide twice: it is a screen of the navigation already", () => {
    expect(findGuides("setting up search by meaning", GUIDE_INDEX).map((place) => place.to)).not.toContain("/help/search-and-answers");
  });
});
