/** Small helpers for lists of inline nodes, shared by the sanitiser and the converters. */
import type { PMMark, PMNode } from "./schema.ts";

function sameMarks(a: PMMark[] | undefined, b: PMMark[] | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Appends an inline node, joining it to the previous text node when the marks match. */
export function pushInline(out: PMNode[], node: PMNode): void {
  const last = out.at(-1);
  if (node.type === "text" && last?.type === "text" && sameMarks(last.marks, node.marks)) {
    last.text = `${last.text ?? ""}${node.text ?? ""}`;
    return;
  }
  out.push(node);
}

const isCode = (node: PMNode): boolean => node.marks?.some((mark) => mark.type === "code") ?? false;

/**
 * Removes spaces and line breaks from both ends of a paragraph's content. Markdown
 * cannot express them (they would have to be written as character references), and
 * they mean nothing to a reader. Code is left exactly as typed. Returns new nodes.
 */
export function trimInline(nodes: PMNode[]): PMNode[] {
  const out = nodes.map((node) => ({ ...node }));
  while (out.length > 0) {
    const first = out[0]!;
    if (first.type === "text" && !isCode(first)) first.text = first.text?.trimStart();
    if (first.type === "hardBreak" || (first.type === "text" && !first.text)) out.shift();
    else break;
  }
  while (out.length > 0) {
    const last = out.at(-1)!;
    if (last.type === "text" && !isCode(last)) last.text = last.text?.trimEnd();
    if (last.type === "hardBreak" || (last.type === "text" && !last.text)) out.pop();
    else break;
  }
  return out;
}
