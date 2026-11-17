/**
 * Outpost is one product, not a set of tools built one at a time. Where the screens agree on a way
 * of doing something (where the main button goes, how a screen leads back, what a thing is called),
 * the way is written in docs/development/web-screens.md, and this guard reads the source and fails
 * when a screen goes its own way again. Each rule first shows that it catches what it is for.
 *
 * KNOWN lists the places that still break a rule, each to be cleared by whoever owns the file.
 * Take an entry out once it is fixed: an entry that no longer breaks the rule fails the test too.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const web = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(web, "../../..");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.startsWith("test-") ? [file] : [];
  });
}

const files = sources(web).map((file) => ({
  name: path.relative(web, file).split(path.sep).join("/"),
  text: fs.readFileSync(file, "utf8"),
}));

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Every place in `text` that breaks a rule, as "file:line what". */
type Check = (name: string, text: string) => string[];

/** Runs a check over the app and compares what it finds, file by file, with the known exceptions. */
function holds(check: Check, known: Record<string, string> = {}) {
  const found = new Map<string, string[]>();
  for (const { name, text } of files) {
    const broken = check(name, text);
    if (broken.length > 0) found.set(name, broken);
  }
  const unexpected = [...found].filter(([name]) => !(name in known)).flatMap(([, lines]) => lines);
  const cleared = Object.keys(known).filter((name) => !found.has(name));
  expect(unexpected, "breaks the rule (see docs/development/web-screens.md)").toEqual([]);
  expect(cleared, "no longer breaks the rule: take it out of the known list").toEqual([]);
}

// ── 14. Buttons in a dialog ─────────────────────────────────────────────────

/** The variants of the buttons in each dialog footer (or footer bar), in order. */
const footers: Check = (name, text) => {
  const out: string[] = [];
  for (const match of text.matchAll(/<(DialogFooter|footer)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, , attributes = "", body = ""] = match;
    const where = `${name}:${lineOf(text, match.index ?? 0)}`;
    if (/flex-col/.test(attributes)) out.push(`${where} stacks its buttons; a dialog's buttons are one row`);
    const variants = [...body.matchAll(/<Button\b([^>]*)>/g)].map(
      (button) => /variant="([^"]+)"/.exec(button[1] ?? "")?.[1] ?? "secondary",
    );
    const main = variants.filter((variant) => variant === "primary" || variant === "danger");
    if (variants.length > 1 && main.length > 0 && variants[variants.length - 1] !== "primary" && variants[variants.length - 1] !== "danger")
      out.push(`${where} puts the main button before the others (${variants.join(", ")}); it goes last, on the right`);
  }
  return out;
};

// ── 15. Back links ──────────────────────────────────────────────────────────

const backLinks: Check = (name, text) => {
  if (name === "components/page.tsx") return [];
  const out: string[] = [];
  for (const match of text.matchAll(/<Link\b[^>]*>\s*<(ArrowLeft|ChevronLeft)\b/g))
    out.push(`${name}:${lineOf(text, match.index ?? 0)} draws its own back link (${match[1]}); use BackLink or PageHeader's back`);
  return out;
};

// ── 16. Names ───────────────────────────────────────────────────────────────

const names: Check = (name, text) => {
  const out: string[] = [];
  const said = (pattern: RegExp, why: string) => {
    for (const match of text.matchAll(pattern)) {
      const line = text.split("\n")[lineOf(text, match.index ?? 0) - 1] ?? "";
      // Comments explain code; the rule is for what a person reads.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      out.push(`${name}:${lineOf(text, match.index ?? 0)} ${why}`);
    }
  };
  said(/label="Save to"|>\s*Save to\s*</g, 'calls the place a download is kept "Save to"; it is "Where to keep it"');
  said(
    /\b(as a|a new|from a|for a|[Ii]n a|write a) note\b|the note['’]s link/g,
    'calls a page "a note": Notes is the place, a page is what is written in it',
  );
  return out;
};

// ── 18. One separator between facts ─────────────────────────────────────────

const separators: Check = (name, text) => {
  const out: string[] = [];
  for (const match of text.matchAll(/(const|function) Slash\b/g))
    out.push(`${name}:${lineOf(text, match.index ?? 0)} separates facts with a slash; use Joined (" · ")`);
  return out;
};

// ── 19. Empty states ────────────────────────────────────────────────────────

const emptyStates: Check = (name, text) => {
  const out: string[] = [];
  // "Nothing matches" under a filter is a line with a way to clear it; "nothing yet" is the empty state.
  for (const match of text.matchAll(/<p className="[^"]*\bborder\b[^"]*">\s*(No|Nothing)\b[^<{]{0,80}\byet\b/g))
    out.push(`${name}:${lineOf(text, match.index ?? 0)} draws its own empty state; use EmptyState (compact inside a section)`);
  return out;
};

// ── 20. Sections of a screen ────────────────────────────────────────────────

const jumpLinks: Check = (name, text) => {
  if (name === "components/page.tsx") return [];
  const out: string[] = [];
  for (const match of text.matchAll(/<nav\b[^>]*>(?:(?!<\/nav>)[\s\S])*?href=\{?[`"]#/g))
    out.push(`${name}:${lineOf(text, match.index ?? 0)} draws its own links to sections; use JumpLinks`);
  return out;
};

// ── 21. Radios, toasts, icons ───────────────────────────────────────────────

const radios: Check = (name, text) => {
  if (name === "components/ui/misc.tsx") return [];
  const out: string[] = [];
  for (const match of text.matchAll(/<RadioGroup\.Item\b[^>]*size-\[18px\]/g))
    out.push(`${name}:${lineOf(text, match.index ?? 0)} draws its own radio mark; use RadioItem`);
  return out;
};

const toastIcons: Check = (name, text) => {
  const out: string[] = [];
  for (const match of text.matchAll(/\btoast(?:\.\w+)?\([^;]*?\bicon:/g))
    out.push(`${name}:${lineOf(text, match.index ?? 0)} gives a toast an icon of its own; a toast is words`);
  return out;
};

/** Pictographs and dingbats: what an emoji is drawn from. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const emoji: Check = (name, text) => {
  // The page-icon picker offers emoji for a person to choose; that is the one place they belong.
  if (name === "features/notes/emoji.ts") return [];
  const index = text.search(EMOJI);
  return index < 0 ? [] : [`${name}:${lineOf(text, index)} uses an emoji where Outpost draws line icons`];
};

describe("one product", () => {
  it("catches each thing it is for", () => {
    expect(footers("x", '<DialogFooter><Button variant="primary">Save</Button><Button>Cancel</Button></DialogFooter>')).toHaveLength(1);
    expect(footers("x", '<DialogFooter className="max-sm:flex-col-reverse"><Button>Cancel</Button></DialogFooter>')).toHaveLength(1);
    expect(footers("x", '<DialogFooter><Button>Cancel</Button><Button variant="primary">Save</Button></DialogFooter>')).toEqual([]);
    expect(backLinks("x", '<Link to="/notes" className="a">\n  <ChevronLeft aria-hidden /> Notes\n</Link>')).toHaveLength(1);
    expect(names("x", '<p className="a">Save to</p>')).toHaveLength(1);
    expect(names("x", "<FilePlus2 aria-hidden /> Save as a note")).toHaveLength(1);
    expect(names("x", "// A tinted panel for a note")).toEqual([]);
    expect(separators("x", "const Slash = () => <span>/</span>;")).toHaveLength(1);
    expect(emptyStates("x", '<p className="rounded-panel border border-border px-4">No loads yet.</p>')).toHaveLength(1);
    expect(jumpLinks("x", '<nav aria-label="Parts"><ul><li><a href={`#' + "id`}>x</a></li></ul></nav>")).toHaveLength(1);
    expect(radios("x", '<RadioGroup.Item value="a" className="grid size-[18px] rounded-full">')).toHaveLength(1);
    expect(toastIcons("x", 'toast.success("Saved", { icon: <Check /> });')).toHaveLength(1);
    expect(emoji("x", 'icon: "🎒",')).toHaveLength(1);
  });

  it("puts a dialog's buttons in one row, the main one last", () => holds(footers));

  it("leads back from a screen with one link, one glyph and one look", () =>
    holds(backLinks, {
      "features/library/document-page.tsx": "teammate C: the reader's toolbar (an icon button; may stay, as the reader's own bar)",
      "features/notes/note-top-bar.tsx": "the slim bar over a page being written: the arrow and the parent's name, as a breadcrumb",
      "features/kept/kept-note-screen.tsx": "the same slim bar, on a page kept on this device",
      "features/chat/conversation-screen.tsx": "the slim bar over a conversation, as the notes' one",
      "features/reader/reader-page.tsx": "the reader's own toolbar: an icon button back to the collections",
    }));

  it("calls each thing by one name", () => holds(names));

  it("separates facts about a thing with one separator", () => holds(separators));

  it("says a list is empty with the one empty state", () => holds(emptyStates));

  it("links to the sections of a screen in one way", () =>
    holds(jumpLinks, {
      "features/solar-clock/recovery-tab.tsx": "outside builder: the parts of clock recovery",
      "features/understand/understand-page.tsx": "a long stepped page with a contents column at the side on a wide screen (may stay)",
    }));

  it("draws a radio one way", () => holds(radios));

  it("shows a toast as words, with an icon only for an error", () => {
    holds(toastIcons);
    const main = fs.readFileSync(path.join(web, "main.tsx"), "utf8");
    expect(main).toMatch(/icons=\{\{[^}]*success: null/);
  });

  it("uses line icons, never emoji, for Outpost's own things", () => {
    holds(emoji);
    const templates = fs.readFileSync(path.join(repo, "apps/server/src/modules/notes/templates.ts"), "utf8");
    expect(templates.search(EMOJI)).toBe(-1);
  });
});
