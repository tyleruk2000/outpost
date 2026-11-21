# Reading EPUB books

## Using it

Add the book like any other document (**Library → Add documents**). Opening it shows the
cover, title and author, **Start reading** (or **Continue reading**), and the table of
contents (or, if the book has none, its chapters in reading order).

Each chapter has **Previous**, **Next** and the contents below it. Chapters follow the
book's reading order, which can include a cover, title page or notes that the contents
leave out; an unnamed chapter goes by its first heading or its place ("Section 3").

Links to other chapters open in the reader; links to the web open in a new tab, only when
pressed; any other link is shown as words.

Your place is remembered per book on this device (up to 200 books), not on the server.
Clearing the browser's site data forgets it.

Search reads a book chapter by chapter, and a result opens the chapter (not the
paragraph). If two chapters start with the same heading, it opens the first. For a book
added before this version, **Read text again** in its details makes results open the
right chapter.

## What you see, and what you do not

Chapters are drawn in Outpost's own type, not the book's pages, which is what keeps a
book from running script or loading anything from the internet.

Kept: headings, paragraphs, bold, italic, superscripts, code, lists, quotations,
tables, footnotes and sidebars (with links to and back from the note), pictures inside
the book with captions, definition lists and ruby text.

| Not supported | What happens |
| --- | --- |
| The book's fonts, colours and layout | Left out; formatting made only by its stylesheet is lost. |
| Fixed-layout books | Words and pictures shown in order, without the layout. |
| Audio, video, scripts, forms | Not played or run; the chapter says so. |
| MathML | Its alternative text, or its symbols in order. |
| Inline SVG drawings | Not drawn, except one that only places a picture. |
| Pictures on the web or as `data:` | Their description stands in. |
| Table cells spanning rows or columns | One cell each. |
| Print page numbers, bookmarks | Not offered. |
| Copy-protected (DRM) books | Not read; see below. |

**Download the original** is always there.

## Limits

| | Limit | Beyond it |
| --- | --- | --- |
| Chapters | 2,000 | Only the first 2,000 can be read. |
| One chapter | 2 MB, 120,000 tags | "This chapter cannot be shown"; the others still open. |
| One picture | 16 MB (2 MB for SVG) | Its description stands in. |
| Package, navigation, NCX files | 4 MB each | "This book could not be opened". |
| Table of contents | 5,000 lines, six levels | The rest left out. |
| The archive | 20,000 files | Refused as damaged. |

A large chapter takes a moment to open (about 0.3 seconds for 2 MB on a fast Mac, longer
on a Raspberry Pi), and the server answers nothing else meanwhile.

## Books that cannot be read

**Copy-protected books** are stored and can be downloaded, nothing more: Outpost does not
read, index or unlock them. A book with only obfuscated fonts reads normally.

**Damaged books** (no `container.xml` or package file, or a reading order naming no file
in the archive) say so; **Show its plain text** shows any text read for search before. A
broken table of contents does not stop a book being read.

Right-to-left and vertical text get only what the browser does with the characters.

How it works, for developers:
[development/library-and-games.md](development/library-and-games.md).
