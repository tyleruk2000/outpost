/**
 * Links into the guides from outside them: the app's own links to a section of a guide
 * (`/help/<slug>#h-<heading>`), and the relative links in the README and the other
 * Markdown files of the repository, which are read on GitHub rather than under Help.
 * A heading renamed in docs/ without its links fails here.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { GUIDE_LOADERS } from "virtual:outpost-guides";
import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";

const repo = path.resolve(import.meta.dirname, "../../../../..");
const src = path.join(repo, "apps/web/src");

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

describe("links into the guides", () => {
  it("lands every link the app makes to a section of a guide on a heading that guide has", async () => {
    const links = new Set<string>();
    for (const file of sourceFiles(src)) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/["'`]\/help\/([a-z0-9-]+)#([a-z0-9-]+)["'`]/g)) {
        links.add(`${match[1]}#${match[2]}`);
      }
    }
    expect(links.size).toBeGreaterThan(3);
    const broken: string[] = [];
    for (const link of links) {
      const [slug, anchor] = link.split("#") as [string, string];
      const guide = GUIDES.find((each) => each.slug === slug);
      if (!guide) {
        broken.push(`${link}: no such guide`);
        continue;
      }
      // A screen of its own (the set-up guide) names its parts itself, with no "h-".
      if (guide.own) continue;
      const blocks = (await GUIDE_LOADERS[slug]!()).default;
      const ids = new Set(blocks.flatMap((block) => (block.t === "heading" && block.id ? [`h-${block.id}`] : [])));
      if (!ids.has(anchor)) broken.push(`${link}: no heading makes #${anchor}`);
    }
    expect(broken).toEqual([]);
  }, 60_000);

  it("leads every relative link in the README and the other Markdown files somewhere", () => {
    const pages = ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", "catalog/README.md"].filter((file) =>
      fs.existsSync(path.join(repo, file)),
    );
    const docs = (dir: string): string[] =>
      fs
        .readdirSync(path.join(repo, dir), { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory() ? docs(`${dir}/${entry.name}`) : entry.name.endsWith(".md") ? [`${dir}/${entry.name}`] : [],
        );
    let output = "";
    try {
      output = execFileSync(process.execPath, ["scripts/check-readme-links.mjs", ...pages, ...docs("docs")], {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const failed = error as { stderr?: string };
      expect.fail(failed.stderr ?? String(error));
    }
    expect(output).toMatch(/all lead somewhere/);
  });
});
