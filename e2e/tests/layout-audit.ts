/**
 * Measures a screen as it stands in the browser and lists what is wrong with where
 * things are: two things lying over each other, a thing cut off or off the screen, a
 * touch target under 44 px, text smaller than the smallest size DESIGN.md sets, and
 * anything that scrolls sideways.
 *
 * `auditLayout` runs inside the page (hand it to `page.evaluate`), so it uses nothing
 * from outside itself. It reads geometry only: it cannot tell whether a thing is
 * pleasant to look at, and it has never seen a real phone.
 *
 * What it takes for one "thing":
 *
 * - a control (a button, link, field, tab, anything with a role that is pressed);
 * - a piece of text that is not inside a control;
 * - a mark on the map that is drawn in the page rather than on the canvas: a pin, the
 *   cross at the centre, a handle of a box, the scale bar.
 *
 * Two things overlap when the parts of them that can be seen share more than 2 px each
 * way and neither is inside the other. Where a dialog is open only the dialog is
 * measured: what is under it cannot be reached. Toasts and tooltips come and go and are
 * left out.
 */

export type FindingKind = "overlap" | "cut-off" | "small-target" | "small-text" | "sideways-scroll";

export interface Finding {
  kind: FindingKind;
  /** The thing, or the two things, named as a person would know them. */
  what: string;
  detail: string;
  /** True when the thing belongs to the app's own bars (the top bar, the bar of screens at the bottom), not to the screen between them. */
  shell?: boolean;
}

export interface AuditOptions {
  /** The least a touch target may measure either way, in CSS pixels. */
  minTarget?: number;
  /** The smallest text size allowed, in rem: `micro` in DESIGN.md. */
  minTextRem?: number;
  /** Selectors of regions that are meant to be out of sight just now (the body of a lowered sheet). */
  folded?: string[];
  /** A selector for the one part of the screen to measure, when it is not the whole of it. */
  scope?: string;
  /** Selectors of the app's own bars. What is wrong inside them is marked as theirs; what lies over them is the screen's. */
  shell?: string[];
}

export function auditLayout(options: AuditOptions = {}): Finding[] {
  const minTarget = options.minTarget ?? 44;
  const minTextRem = options.minTextRem ?? 0.78125;
  const folded = options.folded ?? [];
  const shell = options.shell ?? [];
  const findings: Finding[] = [];
  const screen = { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: window.innerHeight };
  const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 1;

  interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }
  const width = (box: Box) => box.right - box.left;
  const height = (box: Box) => box.bottom - box.top;
  const round = (box: Box) => `${Math.round(box.left)},${Math.round(box.top)} ${Math.round(width(box))}×${Math.round(height(box))}`;

  const isShown = (element: Element): boolean => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (Number.parseFloat(style.opacity) === 0) return false;
      // Kept for a screen reader only: clipped away to nothing (the `sr-only` class).
      if (style.position === "absolute" && (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)")) return false;
      // `aria-hidden` hides a thing from a screen reader, not from the eye, so it does not count here.
      if ((node as HTMLElement).inert || node.hasAttribute("hidden")) return false;
      // Inside a closed <details>, all but its summary is folded away. WebKit still gives such a part a box.
      if (node !== element && node instanceof HTMLDetailsElement && !node.open) {
        const summary = node.querySelector(":scope > summary");
        if (!summary?.contains(element)) return false;
      }
    }
    return true;
  };

  /**
   * The part of an element that can be seen: its box, cut down by every ancestor that clips,
   * and by the screen. `cutBy` names an ancestor that hides part of it with no way to scroll
   * to the rest; `scrolled` says some of it is merely scrolled out of a region that scrolls.
   */
  const seen = (element: Element): { full: Box; part: Box; cutBy: string | null; scrolled: boolean } => {
    const rect = element.getBoundingClientRect();
    const full: Box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    const part: Box = { ...full };
    let cutBy: string | null = null;
    let scrolled = false;
    let fixed = getComputedStyle(element).position === "fixed";
    for (let node = element.parentElement; node && !fixed; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clip = node.getBoundingClientRect();
      for (const axis of ["x", "y"] as const) {
        const overflow = axis === "x" ? style.overflowX : style.overflowY;
        if (overflow === "visible") continue;
        const [low, high] = axis === "x" ? (["left", "right"] as const) : (["top", "bottom"] as const);
        const before = part[high] - part[low];
        part[low] = Math.max(part[low], clip[low]);
        part[high] = Math.min(part[high], clip[high]);
        if (part[high] - part[low] < before - 2) {
          const scrolls =
            (overflow === "auto" || overflow === "scroll") &&
            (axis === "x" ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight);
          if (scrolls) scrolled = true;
          else cutBy ??= name(node) || node.tagName.toLowerCase();
        }
      }
      if (style.position === "fixed") fixed = true;
    }
    const before = { w: width(part), h: height(part) };
    part.left = Math.max(part.left, screen.left);
    part.top = Math.max(part.top, screen.top);
    part.right = Math.min(part.right, screen.right);
    part.bottom = Math.min(part.bottom, screen.bottom);
    // Above or below the screen on a page that scrolls up and down is only scrolled away. Off its side never is.
    if (height(part) < before.h - 2 && pageScrolls && !fixed) scrolled = true;
    if (width(part) < before.w - 2 || (!scrolled && height(part) < before.h - 2)) cutBy ??= "the edge of the screen";
    return { full, part, cutBy, scrolled };
  };

  function name(element: Element): string {
    const label = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.getAttribute("placeholder");
    const text = (label ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
    const role = element.getAttribute("role") ?? element.tagName.toLowerCase();
    if (element.matches("[data-centre-mark]")) return "the cross at the centre of the map";
    if (element.matches(".outpost-pin")) return "the pin on the map";
    if (element.matches(".outpost-box-handle")) return "a handle of the box on the map";
    if (!text) return "";
    // Figures change with the map and the clock; the name of a thing should not.
    const steady = text.replace(/-?\d+(\.\d+)?/g, "0");
    return `${role} “${steady.length > 48 ? `${steady.slice(0, 48)}…` : steady}”`;
  }

  // ── What is measured ──

  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(isShown);
  const scope: Element = (options.scope ? document.querySelector(options.scope) : null) ?? dialogs.at(-1) ?? document.body;
  const transient = "[data-sonner-toaster], [role='tooltip'], [data-radix-popper-content-wrapper]:has([role='tooltip'])";
  const control =
    "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='tab'], [role='menuitem'], [role='menuitemcheckbox'], [role='radio'], [role='checkbox'], [role='switch'], [role='slider'], [role='option'], [role='combobox']";
  const marks = "[data-centre-mark], .outpost-pin, .outpost-box-handle, [role='img'][aria-label]";

  interface Thing {
    element: Element;
    name: string;
    kind: "control" | "text" | "mark";
    full: Box;
    part: Box;
    cutBy: string | null;
    shell: boolean;
  }
  const things: Thing[] = [];
  const inFold = (element: Element) => folded.some((selector) => element.closest(selector));
  const inShell = (element: Element) => shell.some((selector) => element.closest(selector));

  const take = (element: Element, kind: Thing["kind"]) => {
    // A part of the screen folded away on purpose (the body of a lowered sheet) is not there to be measured.
    if (element.closest(transient) || inFold(element) || !isShown(element)) return;
    const shell = inShell(element);
    const { full, part, cutBy, scrolled } = seen(element);
    // A thing 1 px across is there for a screen reader only.
    if (width(full) <= 1.5 || height(full) <= 1.5) return;
    const visible = width(part) >= 4 && height(part) >= 4;
    const label = name(element);
    if (!label) return;
    if (!visible) {
      // Scrolled out of a region that scrolls: not lost.
      if (scrolled && width(part) >= 4) return;
      findings.push({ kind: "cut-off", what: label, detail: `off the screen or wholly hidden (${round(full)})`, shell });
      return;
    }
    if (cutBy) {
      findings.push({ kind: "cut-off", what: label, detail: `partly hidden by ${cutBy}: ${round(part)} of ${round(full)} shows`, shell });
    }
    things.push({ element, name: label, kind, full, part, cutBy, shell });
  };

  // A mark on the map may take the keyboard (a handle is a slider), but it is small to look at and large to touch by its own rules.
  const controls = [...scope.querySelectorAll(control)].filter(
    (element) => !element.parentElement?.closest(control) && !element.matches(marks),
  );
  for (const element of controls) take(element, "control");
  for (const element of scope.querySelectorAll(marks)) if (!element.parentElement?.closest(control)) take(element, "mark");

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const textParents = new Set<Element>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || !node.parentElement) continue;
    textParents.add(node.parentElement);
  }
  for (const element of textParents) {
    if (element.closest("script, style, noscript, canvas, svg") || element.closest(transient) || inFold(element)) continue;
    if (!isShown(element)) continue;
    const box = element.getBoundingClientRect();
    if (box.width <= 1.5 || box.height <= 1.5) continue;
    const size = Number.parseFloat(getComputedStyle(element).fontSize);
    const part = seen(element);
    if (size < minTextRem * rootPx - 0.05 && width(part.part) >= 4 && height(part.part) >= 4) {
      findings.push({
        kind: "small-text",
        what: name(element) || element.tagName.toLowerCase(),
        detail: `${(size / rootPx).toFixed(4)}rem (${size.toFixed(1)} px); the smallest size is ${minTextRem}rem`,
        shell: inShell(element),
      });
    }
    if (!element.closest(control) && !element.closest(marks)) take(element, "text");
  }

  // ── Touch targets ──

  for (const thing of things) {
    if (thing.kind !== "control") continue;
    const style = getComputedStyle(thing.element);
    // A link in a line of text is as tall as the line: the exception WCAG 2.5.8 makes. Counted apart, by name.
    const inline = thing.element.matches("a[href]") && style.display.startsWith("inline");
    // A native range input, checkbox or radio is drawn by the browser inside a label that is the target.
    const target = thing.element.closest("label") ?? thing.element;
    const rect = target.getBoundingClientRect();
    const box = { width: rect.width, height: rect.height };
    // A control small to look at may be larger to touch: an empty ::before or ::after that reaches out past its edges.
    for (const pseudo of ["::before", "::after"]) {
      const reach = getComputedStyle(target, pseudo);
      if (reach.content === "none" || reach.position !== "absolute") continue;
      const out = (side: string) => Math.max(0, -Number.parseFloat(reach.getPropertyValue(side)) || 0);
      box.width = Math.max(box.width, rect.width + out("left") + out("right"));
      box.height = Math.max(box.height, rect.height + out("top") + out("bottom"));
    }
    if (box.width < minTarget - 0.5 || box.height < minTarget - 0.5) {
      findings.push({
        kind: "small-target",
        what: `${inline ? "link in a line of text: " : ""}${thing.name}`,
        detail: `${Math.round(box.width)}×${Math.round(box.height)} px`,
        shell: thing.shell,
      });
    }
  }

  // ── Overlaps ──

  const overlapOf = (a: Box, b: Box) => ({
    w: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    h: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  });
  const stuck = (element: Element): Element | null => {
    for (let node: Element | null = element; node && node !== scope; node = node.parentElement) {
      if (getComputedStyle(node).position === "sticky") return node;
    }
    return null;
  };
  const seenPairs = new Set<string>();
  for (let i = 0; i < things.length; i += 1) {
    for (let j = i + 1; j < things.length; j += 1) {
      const a = things[i]!;
      const b = things[j]!;
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
      // Two marks on the map itself (a pin on the cross at the centre) are where the map puts them.
      if (a.kind === "mark" && b.kind === "mark") continue;
      // A title that stays put at the top of a card while the card scrolls is meant to pass over what scrolls.
      if (
        stuck(a.element) !== stuck(b.element) &&
        (stuck(a.element) ?? stuck(b.element))?.parentElement?.contains(stuck(a.element) ? b.element : a.element)
      )
        continue;
      // On a page that scrolls, what passes under the app's bars is on its way somewhere, not lost under them.
      if (pageScrolls && a.shell !== b.shell) continue;
      const shared = overlapOf(a.part, b.part);
      if (shared.w <= 2 || shared.h <= 2) continue;
      // A unit or an icon set inside a field, on purpose: the two share a parent and one of them is not for the pointer.
      const together = a.element.parentElement === b.element.parentElement;
      const passive = (thing: Thing) => getComputedStyle(thing.element).pointerEvents === "none" && thing.kind === "text";
      if (together && (passive(a) || passive(b))) continue;
      // Words in one line of running text that wrap round each other (a link in a sentence) are one piece of text.
      const inline = (thing: Thing) => getComputedStyle(thing.element).display.startsWith("inline");
      if ((inline(a) || inline(b)) && (a.element.parentElement?.contains(b.element) || b.element.parentElement?.contains(a.element)))
        continue;
      const pair = [a.name, b.name].sort().join("  ×  ");
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      findings.push({
        kind: "overlap",
        what: pair,
        detail: `${Math.round(shared.w)}×${Math.round(shared.h)} px shared`,
        shell: a.shell && b.shell,
      });
    }
  }

  // ── Sideways scroll ──

  const page = document.documentElement;
  if (page.scrollWidth > page.clientWidth + 1) {
    findings.push({ kind: "sideways-scroll", what: "the page", detail: `${page.scrollWidth - page.clientWidth} px wider than the screen` });
  }
  for (const element of scope.querySelectorAll("*")) {
    if (element.scrollWidth <= element.clientWidth + 1) continue;
    const overflow = getComputedStyle(element).overflowX;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (!isShown(element) || element.closest(transient) || inFold(element)) continue;
    const { part } = seen(element);
    if (width(part) < 4 || height(part) < 4) continue;
    findings.push({
      kind: "sideways-scroll",
      what: name(element) || `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`,
      detail: `${element.scrollWidth - element.clientWidth} px more than fits, in a region that scrolls sideways`,
    });
  }

  return findings;
}
