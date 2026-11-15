/**
 * The server describes map credits as small pieces of HTML holding nothing but text and
 * links. Rather than put HTML it did not write into the page, the web app reads those
 * strings into parts and builds the links itself.
 */
export type AttributionPart = { text: string; href?: string };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&copy;": "©" };
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39|copy);/g, (entity) => ENTITIES[entity] ?? entity);

function safeHref(value: string): string | undefined {
  try {
    const url = new URL(decode(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Text and links from a credit string. Any other markup is dropped; a link that is not http(s) becomes plain text. */
export function parseAttribution(html: string): AttributionPart[] {
  const parts: AttributionPart[] = [];
  const pushText = (raw: string) => {
    const text = decode(raw.replace(/<[^>]*>/g, ""));
    if (text) parts.push({ text });
  };
  const link = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let cursor = 0;
  for (let match = link.exec(html); match; match = link.exec(html)) {
    pushText(html.slice(cursor, match.index));
    const label = decode(match[3]!.replace(/<[^>]*>/g, ""));
    const href = safeHref(match[1] ?? match[2] ?? "");
    if (label) parts.push(href ? { text: label, href } : { text: label });
    cursor = match.index + match[0].length;
  }
  pushText(html.slice(cursor));
  return parts;
}
