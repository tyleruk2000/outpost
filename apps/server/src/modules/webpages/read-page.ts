/**
 * From the bytes of a page to the article in it: decode, find, convert, and say plainly
 * when there is nothing to keep.
 *
 * This is the part of saving a page that costs processor time and memory in proportion
 * to somebody else's HTML, so it runs in a worker thread (`webpage.worker.ts`), away
 * from the thread that answers requests. It is a plain function so that it can also be
 * tested without one.
 */
import { AppError } from "../../core/errors.ts";
import { type ConvertedArticle, convertArticle } from "./convert.ts";
import { decodePage } from "./fetch.ts";
import { type Article, findArticle } from "./readable.ts";

/** Fewer characters of text than this and there is no article to speak of. */
export const MIN_TEXT = 200;

/**
 * The most elements a page may have. What reading a page costs follows the number of
 * its elements, not its size in bytes: half a million empty tags fit in 5 MB and would
 * take gigabytes to hold as a tree. Long real articles have a few tens of thousands.
 */
export const MAX_ELEMENTS = 100_000;

export const NO_BROWSER =
  "Outpost has no browser inside it and does not run a page's scripts, so it can only keep what is written in the page itself.";

export interface PageRead {
  article: Omit<Article, "content">;
  converted: ConvertedArticle;
}

function noReadableText(article: Article | undefined): AppError {
  const why =
    article?.hint === "sign-in"
      ? "It appears to ask you to sign in, and Outpost does not sign in to sites."
      : article?.hint === "script"
        ? "It appears to be drawn by a script after it loads, which is common on sites that work like an app."
        : "It may ask you to sign in, or it may be drawn by a script after it loads.";
  return new AppError("unsupported", `No readable text was found on this page. ${why} ${NO_BROWSER}`, { reason: "no-text" });
}

/** Opening tags in a page, not counting what is inside its scripts and styles, which is one piece of text each. */
export function countElements(html: string): number {
  const opening = /<([a-zA-Z][a-zA-Z0-9]*)/g;
  const closing = { script: /<\/script/gi, style: /<\/style/gi };
  let count = 0;
  for (let match = opening.exec(html); match; match = opening.exec(html)) {
    count += 1;
    const tag = match[1]!.toLowerCase();
    if (tag !== "script" && tag !== "style") continue;
    // Skip to the closing tag: "<" inside a script is code, not an element.
    const close = closing[tag];
    close.lastIndex = opening.lastIndex;
    if (!close.exec(html)) break;
    opening.lastIndex = close.lastIndex;
  }
  return count;
}

/** Throws `AppError`, in words for a person, for every page that cannot be kept. */
export function readPage(bytes: Buffer, contentType: string | null, url: string): PageRead {
  const html = decodePage(bytes, contentType);
  const elements = countElements(html);
  if (elements > MAX_ELEMENTS) {
    throw new AppError(
      "too_large",
      `This page is made of more parts than Outpost reads: about ${elements.toLocaleString("en")} elements, and the most is ${MAX_ELEMENTS.toLocaleString("en")}. It was not saved.`,
      { elements, maxElements: MAX_ELEMENTS },
    );
  }
  let article: Article | undefined;
  let converted: ConvertedArticle | undefined;
  try {
    article = findArticle(html, url);
    if (article) converted = convertArticle(article.content);
  } catch (error) {
    throw new AppError(
      "unsupported",
      "This page could not be read. Its HTML is not something Outpost can make sense of (it may be nested far deeper than a page a person wrote).",
      { reason: "unreadable", cause: error instanceof Error ? error.name : "unknown" },
    );
  }
  if (!article || !converted || converted.text.length < MIN_TEXT) throw noReadableText(article);
  const { content: _content, ...about } = article;
  return { article: about, converted };
}
