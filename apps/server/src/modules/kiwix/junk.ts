/**
 * Pages of an archive that are about other pages, not about anything: a Stack Exchange
 * site's lists of questions by tag ("questions/tagged/safety_page=4"), its "Highest
 * voted questions", a wiki's main page and its category pages. kiwix-serve finds the
 * question's words on them because they quote the start of every question they list, and
 * a person who opens one finds only another list. They are left out of search results;
 * the reader still opens them.
 *
 * The rules (docs/search.md, "Reference collections in results"):
 *
 *  - a list of questions or tags: an address under questions/tagged/, tags/, users/ or
 *    badges/, or the bare lists questions, tags, users, unanswered;
 *  - one page of a longer list: "_page=N" or "page=N" in the address;
 *  - a title that is a list of questions: "Highest voted questions", "Newest … questions",
 *    "Questions tagged …";
 *  - a wiki's main page, and its Category:, Portal:, Special:, Template:, Help:, Talk: and
 *    User: pages.
 */

export interface PageHit {
  title: string;
  /** The article's path inside the archive, as kiwix-serve gave it (it may be escaped once or twice). */
  path: string;
}

function decoded(path: string): string {
  let text = path;
  for (let round = 0; round < 2; round += 1) {
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch {
      break;
    }
  }
  return text.replace(/^\/+/, "").replace(/^A\//, "");
}

const LIST_ADDRESS = /^(questions\/tagged|tags|users|badges)(\/|$)|^(questions|tags|users|unanswered)$/i;
const PAGE_OF_LIST = /(^|[_?&/])page=\d+/i;
const LIST_TITLE = /^(highest voted|newest|active|frequent|hot|unanswered)\b.*\bquestions\b|^questions tagged\b/i;
const MAIN_PAGE = /^main[ _]page$/i;
const WIKI_PAGE = /^(category|portal|special|template|help|talk|user)( talk)?[:_]/i;

/** True for a page that only lists other pages (see the rules above). */
export function isJunkHit(hit: PageHit): boolean {
  const path = decoded(hit.path);
  const title = hit.title.trim();
  if (LIST_ADDRESS.test(path) || PAGE_OF_LIST.test(path)) return true;
  if (LIST_TITLE.test(title)) return true;
  if (MAIN_PAGE.test(title) || MAIN_PAGE.test(path)) return true;
  return WIKI_PAGE.test(title) || WIKI_PAGE.test(path);
}
