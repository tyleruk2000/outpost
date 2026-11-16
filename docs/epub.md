# Reading EPUB books

An EPUB added to the library is read in Outpost itself: its contents page, one chapter
at a time, with its pictures. This page says what the reader does, what it leaves out,
and what it refuses.

## Using it

Add the book like any other document (**Library**, **Add documents**). Opening it
shows the front of the book:

- the cover, title and author, as the book's own package file gives them;
- **Start reading**, or **Continue reading** with the chapter you were in;
- the table of contents, from the book's navigation document (EPUB 3) or its NCX
  file (EPUB 2). A book with neither lists its chapters in reading order.

A chapter is shown the way a chapter of the bundled guides is: the book's name above
the text (it leads back to the contents) with how far through you are, and
**Previous**, **Next** and the contents below it. The button at the top left goes back
to the contents too.

Chapters come in the book's reading order (its spine). That order includes pages a
table of contents often leaves out, such as a cover or a title page, and pages the book
marks as outside the main reading order, such as a file of notes. A chapter the table
of contents does not name goes by its first heading, or failing that by its place
("Section 3").

### Links

- A link to another chapter, or to a place inside a chapter, opens it in the reader.
- A link to the book's own table of contents opens the contents page.
- A link to the web (`http`, `https`) or to a mail address opens in a new tab, as from a
  Markdown document. Nothing is fetched until you press it.
- Any other link (`javascript:`, `file:`, a file that is not in the book) is shown as
  its words.

### Your place

How far you had read is remembered for each book, on the device you were reading on
(in the browser's own storage, for up to 200 books). It is not sent to the server and
does not follow you to another device or browser. Reloading a chapter returns to the
paragraph that was at the top of the window. Clearing the browser's site data forgets
it.

### Search

The text of a book is read for search chapter by chapter, as before. A result now
opens the chapter the passage is in. Search knows a passage of a book by the first
heading of its chapter, so if two chapters open with the same heading the result opens
the first of them. It opens the chapter, not the paragraph.

Books added before this version open at the right chapter only where the chapter's
heading matches its line in the table of contents. **Read text again**, in the
document's details, records which chapter each passage came from.

## What you see, and what you do not

The reader does not show the book's own pages. Each chapter is read on the server into
headings, paragraphs and so on, and drawn in Outpost's own type (Literata, or the sans
if you chose that for reading). This is what keeps a book from running script or
loading anything from the internet; see [security.md](security.md#files-people-upload).

Kept:

- headings, paragraphs, line breaks, bold, italic, struck-through text, superscripts
  and subscripts, inline code and blocks of code;
- lists (numbered and not, nested), quotations, tables, rules;
- footnotes, endnotes and sidebars, set apart under a short rule. A note's marker jumps
  to the note and, where the book links back, the note jumps back;
- pictures from inside the book (PNG, JPEG, GIF, WebP, and SVG drawings that hold no
  script), with their captions;
- definition lists (the term in bold, the meaning beneath it) and ruby text (the
  reading follows the character in brackets).

Not supported, and said so on the page where it matters:

| | What happens |
| --- | --- |
| The book's own fonts, colours, sizes and layout | Left out. Formatting made only by the book's stylesheet (italics from a class, centred text, drop capitals, columns) is lost. |
| Fixed-layout books (pages designed as pictures of a page) | The words and pictures of each page are shown in order, without the layout. The contents page says so. |
| Audio and video | Not played. The chapter says so. |
| Scripted, interactive content | Never run. Only the words are shown, and the chapter says so. Forms and buttons are left out. |
| MathML | Not drawn. The text its author provided for it (`alttext`) is shown, or else its symbols in order, which may not read correctly. The chapter says so. |
| Drawings written into the page (inline SVG) | Not drawn. A drawing that only places a picture (a common way to set a cover) shows the picture; otherwise its title, if it has one, stands in. |
| Pictures kept on the web, or written into the page as `data:` | Not shown; the description its author gave stands in. |
| Table cells that span rows or columns | Each cell is one cell; short rows are filled out. A table of one column is treated as layout and read as ordinary text. |
| Page numbers of a print edition, text-to-speech hints, bookmarks, highlights, notes of your own | Not offered. |
| Copy-protected books (DRM) | Not read. See below. |

**Download the original** is always there for anything the reader does not do.

## Limits

| | Limit | What happens beyond it |
| --- | --- | --- |
| Chapters in a book | 2,000 | The first 2,000 can be read; the contents page says how many there are. |
| One chapter | 2 MB of markup, and 120,000 tags | "This chapter cannot be shown", with the reason. The other chapters can still be read. |
| Nesting inside a chapter | Lists and quotations 16 deep are kept; a page nested thousands deep is refused | Deeper lists are shown as plain text. |
| One picture | 16 MB (2 MB for an SVG drawing) | The picture is not shown; its description stands in. |
| Package file, navigation document, NCX | 4 MB each | "This book could not be opened", with the reason. |
| Lines in the table of contents | 5,000, six levels deep | The rest are left out; deeper lines sit at the sixth level. |
| The archive | 20,000 files, 512 MB read per request | The book is refused as damaged. |

A chapter is parsed on the server's own thread, as a Markdown file is. On an Apple M2
Max (Node 24, 16 November 2026) a 2 MB chapter of ordinary prose took about 0.3 seconds and about 150 MB of working
memory, released afterwards; parsing does not yield, so chapters are read one at a time
however many are asked for at once, and nothing else is answered meanwhile. This has not been measured on a Raspberry Pi.

The limits are constants in `apps/server/src/modules/documents/epub-reader.ts`,
`epub-package.ts` and `zip.ts`.

## Books that cannot be read

**Copy-protected books.** A book locked by a rights scheme (DRM) is stored and can be
downloaded, and that is all. Outpost does not read it, does not index it and makes no
attempt to remove the lock. A book is taken to be locked when it carries a rights file
(`META-INF/rights.xml`, `META-INF/license.lcpl` or `META-INF/sinf.xml`), or when its
`META-INF/encryption.xml` covers anything other than obfuscated fonts. Font
obfuscation (the IDPF and Adobe methods) is not a lock on the text: such a book reads
normally, and its fonts are not used.

**Damaged books.** A book without its `container.xml` or package file, or one whose
reading order names no file that is in the archive, is explained as such. If its text
was read for search before, **Show its plain text** shows that instead.

A broken or missing table of contents does not stop a book being read; the reading
order is used.

## How it works

| | |
| --- | --- |
| `apps/server/src/modules/documents/epub-package.ts` | The container, package file, reading order, table of contents and cover; whether the book is locked. Shared with text extraction (`extract-epub.ts`). |
| `epub-view.ts` | One chapter's XHTML to the tree of plain values in `packages/shared/src/documents.ts` (`MarkdownBlock`, `MarkdownInline`, `EpubInline`). Chapters are parsed with the forgiving HTML parser (parse5, through `rehype-parse`), because books in the wild are often not well-formed XML. |
| `epub-reader.ts` | The three routes (`GET /api/documents/:id/epub`, `…/epub/chapters/:position`, `…/epub/file?path=`), the limits and the refusals. Nothing is unpacked to disk: each request reads the one entry it needs into memory. |
| `apps/web/src/features/library/epub-reader.tsx`, `epub-data.ts` | The front of the book, a chapter, the addresses, the reading place. |
| `document-markdown.tsx`, `chapter-nav.tsx` | Drawing the tree, and finding your way round a book. Shared with Markdown documents and the bundled guides. |

The address of a chapter is the document's own, with `?chapter=3` (its place in the
reading order) and, for a place inside it, `#h-<id>`. Ids in books hold characters an
id in the page may not, so each of those becomes an underscore, the same way from
every chapter (`anchorId`).

## Not tested

- Against a large set of real published books. The tests build their own EPUB 2 and
  EPUB 3 files from text written for them; no published book is in the repository. The
  reader has been tried by hand only against books built the same way.
- Against a real copy-protected book. The tests add a rights file or an
  `encryption.xml` to a book of their own. The detection goes by the files Adobe
  ADEPT, Readium LCP and Apple FairPlay are known to leave in a book; no book locked by
  any of the three was available to try, and the file names were not checked against
  the schemes' own documentation while this was written.
- Right-to-left and vertical text. Nothing is done for them beyond what the browser
  does with the characters themselves.
- On a Raspberry Pi, and on Windows.
