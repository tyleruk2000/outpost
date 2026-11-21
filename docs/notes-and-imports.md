# Notes and imports

## The notes workspace

Notes are **pages** in a tree; any page can have sub-pages. A page has a title, an
optional icon and cover picture, up to 50 tags (shared with the library; "Water" and
"water" are one tag) and its content. Search finds pages by title, tags, parent titles
and text. A page can be duplicated, with or without its sub-pages.

### Moving pages

- **With a mouse**, drag a page in the tree: onto the middle of a row to put it inside,
  onto the top or bottom edge to put it before or after.
- **With a finger**, press and hold until the page lifts, then drag; a label says where
  it will land.
- **Without dragging**, the page's **…** menu has **Move to…**, **Move up** and **Move
  down**. Alt with an arrow key moves the focused page; Shift+F10 opens its menu.

Every move offers **Undo**.

### Writing

A page is made of blocks: paragraphs, headings (three levels), bulleted, numbered and
task lists, quotes, code blocks, dividers, tables (cells can hold blocks and be merged),
pictures, callouts (info, warning, success, danger), toggles, and embeds of a library
document. Text can be bold, italic, underlined, struck through, highlighted, code or a
link. A page holds up to 5 MB.

- Type `/` on an empty line for the block menu, and keep typing to filter it.
- Markdown shortcuts work as you type: `#` to `###`, `-`, `1.`, `[]`, `>`, three
  backticks, `---`.
- Type `[[` or `@` to link to another page. A page link survives renaming and moving,
  and each page lists its **backlinks**.
- Select text for the formatting bar. The grip beside a block drags it or opens its
  menu. In a list the grip moves one item; hold Alt (Option) as you drag, or choose
  **Whole list**, to move the list. Alt+Shift+↑/↓ moves a block; ⌘/Ctrl+Shift+D
  duplicates it.
- **On a phone or tablet** the formatting bar sits above the keyboard, with **Add a
  block** and **Block actions** at its left and **Undo** and **Redo** at its right. List
  items are not dragged by touch.

### Favourites and templates

Star a page to list it under **Favourites**. Five templates come with Outpost (Meeting
notes, Trip plan, Kit list, Reference card, Daily log). Any page without sub-pages can be
turned into a template of your own; templates live outside the tree and are not
searched.

### Saving, and editing in two places

Pages save as you type. There is no live co-editing: if the page was changed elsewhere
since you opened it, your save is refused and nothing is overwritten; choose **Keep my
version** or **Load the other version**.

If the server cannot be reached, changes are kept in the tab and retried; after a reload
the page offers **Restore my changes**.

A page can be kept on a phone, from its menu, with its sub-pages, to read out of reach of
the server; that copy cannot be edited and is never sent back
([offline.md](offline.md#a-phone-out-of-reach-of-the-server)).

### Earlier versions

Each save that changes a page's title or words keeps what it said before. **Earlier
versions** in the page's menu lists them; choose one to see it beside the page as it is
now, and **Restore this version** to make it the newest (the version it replaces is kept
too). Every save is kept for an hour, then the last of each hour for a day, then the last
of each day. Tags, icon, cover and favourites are not versioned.

**Clear earlier versions** under Storage erases them all. Encrypting a page erases its
plain-text versions.

### Encrypted pages

**Encrypt this page…** in the page's menu replaces its text with a copy only its
passphrase or key can open, in the browser. Title, tags, icon and cover stay readable;
pictures and files are not allowed; the text leaves search. It locks after five idle
minutes and needs HTTPS or the computer Outpost runs on. Backups, drives and exports made
before still hold the text. See [encryption.md](encryption.md#pages-of-notes).

### Trash

Deleting a page moves it and its sub-pages to **Trash** (foot of the Notes screen). From
there it can be restored, with its sub-pages, or deleted for good, which also removes
attachments no other page uses. The trash is never emptied by itself.

### Attachments

Pictures (PNG, JPEG, GIF, WebP, SVG), PDF, text, Markdown, CSV, JSON, GPX and ZIP files,
up to 50 MB each. A file must be what its name says. Attachments are shown in a sandbox,
so none can run script, and are in backups. One can be deleted only once no page uses it.

### Markdown export

Export one page as `.md`, or the whole workspace as a `.zip` that mirrors the tree, with
links rewritten to relative paths, pictures and files in `_attachments/` and your
templates in `_templates/`. It is GitHub-flavoured Markdown: callouts become `> [!NOTE]`
alerts, toggles `<details>`, underline and highlight `<u>` and `<mark>`. Outpost reads
all of it back.

Lost on the way: empty paragraphs and trailing spaces; table cells are flattened to one
line; a page link in a toggle's summary becomes text; tags, icon, cover and favourite;
document embeds (they only work in the Outpost they came from); pages in the trash and
attachments no page mentions. For a complete copy, use **Settings → Backup**.

## Imports

An import brings existing notes in as pages. Nothing is written until you have seen
exactly what will be created.

| File | Becomes |
| --- | --- |
| `.md`, `.markdown` | A page; `title` and `tags` in front matter are used. |
| `.html`, `.htm` | A page, with anything that could run removed. |
| `.txt` | A page of paragraphs, titled by its file name. |
| `.csv` | A page holding one table (up to 500 rows and 30 columns shown; the full CSV is attached). |
| `.pdf` | A document in the library, or left out. |
| `.zip` | Unpacked, and its contents treated as above. |

Up to 500 files at once; for more, put them in a ZIP. An import never downloads
anything: a picture at a web address stays a link.

1. **Upload** the files or a ZIP.
2. Outpost reads them and shows the **plan**: every page in a tree, with warnings and
   which pages already exist.
3. **Choose** where the pages go, what to do with pages that exist, and whether PDFs go
   to the library. The plan says in sentences what will happen.
4. **Import.** One page failing does not stop the rest. You can leave the screen.
5. The **report** lists what was created, updated, skipped and failed, and why.

You can cancel, or discard an import not yet committed. One that failed or was cut short
can be run again; it adds only what is missing.

Folders become the tree (a folder's `README.md` or `index.md`, or `X.md` beside `X/`, is
its page); hidden files are passed over. Links between imported files become page links,
and pictures and files inside the import become attachments.

The plan lists what does not come across intact, with an example of each: equations stay
LaTeX text, embedded media is left out, footnotes become paragraphs, `[[wiki links]]` and
links to files not in the import stay as text.

### Importing from Notion

In Notion, choose **Export**, format **Markdown & CSV**, with sub-pages, and upload the
`.zip` as it is, without unpacking it. Outpost strips Notion's 32-character ids from
titles and uses them to recognise the same page next time. A Notion database becomes a
table page whose first column links to its row pages.

### Pages that already exist

Outpost recognises a page **imported before** from the same source, and a page with the
**same content** (same title and text, most likely written by hand).

| Policy | Imported before | Same content |
| --- | --- | --- |
| **Skip** | Left untouched | Left untouched |
| **Copy** | A second page is made | A second page is made |
| **Replace** | Updated from the new files (except a page encrypted since) | Left untouched |

**Replace** overwrites changes made since the last import and asks you to confirm.

### Limits

Password-protected ZIPs are refused, and an archive is limited to 50,000 files and 8 GB
unpacked ([security.md](security.md#archives)). A file over 4 MB, or one too slow to
convert, comes in as an empty page saying why.

Imports do not read Word, OneNote or Evernote files, and do not sync with the source
afterwards. To add other documents, use the Library.

## Saving a web page

Paste the address of a page and Outpost keeps a readable copy of the article in the
library, without its menus and adverts, searchable and readable offline. It is under
**Library → Save a web page**, on the Import screen, and in the command palette.

1. Paste the address and choose **Look at the page**. Outpost fetches that one page and
   shows its title, author, site, word count, opening lines, how many pictures it has and
   where from, and whether you already have it. Nothing is kept yet. The opening lines
   show when a page is only a sign-in notice or a cookie banner.
2. Tick the box to keep the pictures, or leave it to keep their descriptions.
3. **Save page.**

It fetches one page each time you ask: it follows no links and never refreshes a saved
page. A save not carried out within fifteen minutes is dropped.

**It is a copy for your own reading.** It goes into backups, and onto a portable drive if
documents are copied there ([portable.md](portable.md#what-a-drive-contains)).

**The same address again.** Choose **Keep both**, or **Replace the earlier copy** (the new
one is saved first; the old one is deleted after you confirm).

**What is kept.** The article's text, with headings, lists, tables, code and links, under
"Saved from *address* on *date*", and its PNG, JPEG, GIF and WebP pictures if asked.
Scripts, forms, video, menus, comments and cookie notices are removed. The copy is one
Markdown file (**Download the original**).

| Limit | Value |
| --- | --- |
| The page | 5 MB of HTML, 50,000 elements, 20 seconds to arrive, 20 seconds to read |
| Pictures | 30 to a page, 5 MB each, 20 MB in all |
| Redirects | 8 |

A picture over a limit is left out and listed; SVG is never fetched.

### What cannot be saved, and what Outpost says

| The address… | What you are told |
| --- | --- |
| is not `http` or `https`, holds a user name or password, or is more than one address | What is wrong with it. Nothing is fetched. |
| is on this computer or a private network, or redirects to one | "Outpost only fetches from the public internet." See [security.md](security.md#downloads-the-ssrf-guard). |
| is not a web page (a PDF, a picture) | What it is, and to add it in the Library instead. |
| is over 5 MB or 50,000 elements, or takes over 20 seconds | Which limit stopped it. |
| answers with an error (404, 403, 500…) | The number and what it usually means. |
| has no readable text | "No readable text was found on this page". |

Outpost runs no page scripts, does not sign in and sends no cookies, so it sees what a
stranger would. A site that draws its content with a script, or asks you to sign in, has
nothing to keep; a paywalled page is saved as the site shows it to a non-payer.

The article is found by rules, so an unusual layout can lose part of it; check the word
count and opening lines. Some sites refuse their pictures or the page to anything that
is not a browser, and Outpost does not pretend to be one.

## Notes written on a portable drive

Pages written on a portable drive come home through **Storage → Bring back changes from a
drive**, not an import ([portable.md](portable.md#bringing-changes-back-from-a-drive)).

- **New pages** arrive with sub-pages, tags, pictures and files, and links keep working.
- **A page edited only on the drive** updates the home page; the home version is kept in
  the record of the merge, and undoing the merge puts it back.
- **A page edited on both sides** is never settled for you: both are kept unless you
  choose, the drive's as "… (from drive <name>, <date>)". Compare them side by side first
  if you like.
- **A page deleted on the drive** stays at home unless you tick it; ticked, it goes to the
  trash.
- **A page moved on the drive** is moved at home, unless it was moved at home too.
- Not brought back: favourites on existing pages, the order of pages among siblings, and
  the drive's trash.
