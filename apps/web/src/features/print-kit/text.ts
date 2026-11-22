/**
 * The words in printed content, in order, without making the PDF: for tests, and for
 * anything that needs to know what a page says before it is laid out. The words a
 * drawing writes are included.
 */
const decode = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

export function contentText(content: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === "string" || typeof node === "number") {
      out.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.svg === "string") {
      for (const match of record.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) out.push(decode(match[1] ?? ""));
      return;
    }
    for (const key of ["text", "stack", "columns", "ul", "ol", "section", "content"]) if (key in record) walk(record[key]);
    if (record.table && typeof record.table === "object") walk((record.table as { body?: unknown }).body);
  };
  walk(content);
  return out.join(" ").replace(/\s+/g, " ");
}
