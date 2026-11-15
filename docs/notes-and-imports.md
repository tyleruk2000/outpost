# Notes and imports

This page describes the notes workspace (pages, blocks, links, templates, trash,
attachments and Markdown export) and how to import existing notes, including an export
from Notion.

## The notes workspace

### Pages and hierarchy

Notes are **pages** arranged in a tree. Any page can have sub-pages, to any depth.
Each page has a title, an optional icon, an optional cover picture, tags and content.

- Pages are ordered by hand among their siblings, and can be moved to another parent
  or to the top level. A page cannot be moved inside itself.
- A page can be duplicated, with or without its sub-pages. The copy is named
  "… (copy)".
- Tags are shared with the document library, and "Water" and "water" are the same
  tag. A page can have up to 50 tags.
- Pages are found by the app-wide search, by title, tags, parent titles and text.
- Opening a page records it for the list of recent pages.

### Blocks

A page's content is made of blocks. The complete list is in
`packages/shared/src/notes.ts`; nothing outside it can be stored.

| Block | Notes |
| --- | --- |
| Paragraph | |
| Heading | Levels 1 to 3 |
| Bulleted list, numbered list | Can be nested; a numbered list can start at any number |
| Task list | Items with a tick box |
| Quote | |
| Code block | With an optional language |
| Divider | |
| Table | With a header row; cells can hold blocks, and can be merged |
| Image | A picture stored as an attachment |
| Callout | Four kinds: info, warning, success, danger |
| Toggle | A summary line that opens to show its content |
| Document embed | A block link to a document in the library |

Within text: **bold**, *italic*, ~~strikethrough~~, `code`, underline, highlight,
links, line breaks, and **page links**, which are inline links to another page.

A page can hold up to 5 MB of content and 40 levels of nesting.

### Links and backlinks

A page link points at another page by its id, so it keeps working when the target is
renamed or moved. Every page lists its **backlinks**: the pages whose content links to
it. Backlinks are worked out from the content each time a page is saved; pages in the
trash are left out.

### Favourites and templates

- **Favourites.** Star a page to list it under Favourites. Starring is not an edit:
  it does not change the page's "last changed" time.
- **Built-in templates.** Five ship with Outpost: Meeting notes, Trip plan, Kit list,
  Reference card and Daily log. Creating a page from a template copies its title,
  icon and content.
- **Your own templates.** Any page without sub-pages can be turned into a template. A
  template lives outside the page tree, is not listed in search, and cannot have
  sub-pages. Turning it back makes it an ordinary top-level page.

### Saving, and editing in two places

Pages save as you type. Each save says which version it was based on. If the page was
changed in another tab or on another device in the meantime, the save is refused and
nothing is overwritten: "This page was changed somewhere else after you opened it".
There is no live co-editing; see
[the limits table](architecture.md#limits-and-trade-offs).

If the server cannot be reached, unsaved changes are kept and retried until it
answers.

### Trash

Deleting a page moves it, and its sub-pages, to the trash. Nothing is lost.

- A page in the trash keeps everything and can be restored. Its sub-pages come back
  with it. If its old parent is gone, it returns to the top level.
- A page in the trash cannot be edited or moved, and is not found by search.
- **Deleting for good** is a separate step, only possible from the trash, and needs an
  administrator. It removes the page, its sub-pages in the trash, and any attachments
  that no remaining page uses.
- The trash is not emptied automatically.

### Attachments

Files attached to pages are stored in the data directory, next to the database, and
are included in backups.

- Accepted: pictures (PNG, JPEG, GIF, WebP, SVG), PDF, text (TXT, Markdown, CSV, JSON),
  GPX tracks and ZIP archives, up to 50 MB each.
- A file must be what its name says: the first bytes are checked against the
  extension.
- Attachments are served in a sandbox, so an SVG or other file can never run script
  inside Outpost.
- An attachment can only be deleted once no page uses it, as content or as a cover.

### Markdown export

One page can be exported as a `.md` file, and the whole workspace as a `.zip`
(`GET /api/notes/:id/export.md`, `GET /api/notes/export.zip`).

The workspace export mirrors the tree: a page with sub-pages becomes `Title.md` next
to a folder `Title/`. Links between pages are rewritten to relative paths, and
pictures and files that pages mention are copied to `_attachments/`, so the export
reads correctly offline and outside Outpost. Your own templates go to `_templates/`.
Pages in the trash are not exported.

The output is GitHub-flavoured Markdown. Constructs Markdown has no syntax for are
written the way GitHub renders them, and Outpost reads all of them back:

| In Outpost | In the export |
| --- | --- |
| Callout | An alert blockquote: `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, `> [!CAUTION]` |
| Toggle | `<details>` with a `<summary>` |
| Underline, highlight | `<u>…</u>`, `<mark>…</mark>` |
| Page link | An ordinary link to the other page's file |
| Document embed | A link to `/library/documents/<id>` |

#### What does not survive

The round trip is exact for every block type (the test suite checks each one), with
these known exceptions:

- **Empty paragraphs** and spaces or line breaks at the very end of a paragraph are
  dropped.
- **Table cells are flattened to one line.** Several paragraphs, lists or pictures in
  a cell are joined with `<br>`, a code block in a cell becomes inline code, and
  merged cells and column widths are not written.
- **Toggle summaries** keep their formatting, but a page link in a summary becomes
  plain text.
- **Page properties are not in the file.** Tags, icon, cover picture and the favourite
  mark are not exported. The title is written as the first heading.
- **Document embeds** point at an address that only works inside the Outpost they came
  from. The document itself is not included.
- **Links to pages that are not in the export** (pages in the trash) keep their
  in-app address.
- **Attachments nobody mentions** are not included: only files a page links to or
  shows.

For a complete copy of your notes, including everything above, use **Settings →
Backup**.

## Imports

Importing brings existing notes into the workspace as pages. It works in fixed steps,
and nothing is written to your notes until you have seen exactly what will be created.

### What can be imported

| File | Becomes |
| --- | --- |
| `.md`, `.markdown` | A page. `title` and `tags` in front matter are used. |
| `.html`, `.htm` | A page. Anything that could run is removed first. |
| `.txt` | A page of plain paragraphs, titled by its file name. |
| `.csv` | A page holding one table. |
| `.pdf` | A document in the library (or left out, your choice). |
| `.zip` | Unpacked, then everything inside is treated as above. |

Up to 500 files can be uploaded at once; for more, put them in a ZIP. Each file may be
as large as the server's upload limit (`OUTPOST_MAX_UPLOAD_MB`).

An import never downloads anything. A picture at a web address stays a link.

### The steps

1. **Upload.** Choose files or a ZIP (`POST /api/imports`).
2. **Analysis.** Outpost unpacks and reads the files and builds a **plan**: every page
   it would create, in a tree, with titles, sizes, warnings, and which pages already
   exist. Your notes are not touched.
3. **Your choices.** Where to put the pages (under an existing page or at the top
   level), what to do with pages that already exist, and whether PDFs go to the
   library.
4. **Commit.** A background job creates the pages. One page failing does not stop the
   rest.
5. **Report.** What was created, updated, skipped and failed, with reasons.

You can cancel while it is analysing or importing, and discard an import you have not
committed, which removes its uploaded files. Uploads that are never finished are
cleared after a week.

### How files become a tree of pages

- A file `X.md` with a folder `X/` beside it is the parent of what is in the folder.
- A folder with a `README.md` or `index.md` gets that file as its page.
- Any other folder that holds pages becomes an empty page named after the folder.
- A folder that holds only pictures and other files is not a page.
- Pages are created in the order a file manager would list them ("2" before "10").
- Hidden and system files (`.DS_Store`, `__MACOSX`, folders starting with a dot such
  as `.obsidian`) are passed over.

A page's title comes from its front matter, or from its first heading when that
heading is the first thing in the file, or from the HTML title, or otherwise from the
file name.

### What is reconstructed

- **Hierarchy**, as above.
- **Links between imported pages.** A relative link to another file in the import
  becomes a page link to the page made from it, whether it points forward or back.
- **Pictures and files.** Those inside the import are stored as attachments and the
  page points at them. Files over 50 MB, or of a kind pages cannot attach, are left
  out and listed.
- **PDFs.** Added to the document library, where their text is read for search. A page
  that links to a PDF beside it then links to the library copy. If you leave PDFs out
  of the library, such a PDF is attached to the page instead.
- **Tags** from front matter.
- **Callouts and toggles** in HTML (`<aside>`, `<details>`) and in Markdown (GitHub
  alerts) become Outpost's own blocks.
- **Tables from CSV.** Up to 500 rows and 30 columns are shown in the page. A longer
  or wider table is cut, the cut is reported, and the complete CSV is attached to the
  page so nothing is lost.

### What does not come across intact

The plan lists these before you commit, with a count and an example file:

| Found in the source | What happens |
| --- | --- |
| Equations (`$…$`, `$$…$$`) | Kept as their LaTeX text |
| A database shown inside a Notion page | Becomes a link to the database's own page |
| Embedded media (`<iframe>`, `<video>`, `<audio>`, `<embed>`, `<object>`) | Left out |
| HTML the page model cannot hold | The tags are removed and the words kept |
| HTML comments | Left out |
| Notion columns (in an HTML export) | Their content follows one after another |
| Footnotes | Kept as ordinary paragraphs |
| `[[Wiki links]]` | Kept as text |
| Pictures at a web address | Kept as links |
| Links to files that are not in the import | Kept as text |
| Links with a disallowed address such as `javascript:` | The link is removed, the words kept |
| Files of a kind Outpost does not import | Skipped and listed |

### Importing from Notion

Notion's **Markdown & CSV** export is the format Outpost's tests cover.

1. In Notion, open the page or workspace you want, and choose **Export** from its
   menu.
2. Choose the format **Markdown & CSV**, and include sub-pages. These names are
   Notion's and may change.
3. Notion gives you a `.zip`. Upload it to Outpost as it is. Do not unpack it: large
   exports arrive as a ZIP holding several ZIPs, and Outpost unpacks those itself.

What Outpost does with it:

- **Names.** Notion ends every file and folder name with a 32-character id. Outpost
  removes it from titles and uses it to recognise the same page in a later import.
- **Hierarchy.** Sub-pages are folders beside their parent's file, which is the layout
  described above.
- **Databases.** A Notion database arrives as a CSV plus a folder of row pages. It
  becomes a table page whose first column links to the row pages. Where Notion
  exports two CSV files for one database, the fuller one is used and listed once.
- **Pictures** are stored as attachments.
- **Callouts** are kept; **equations** are kept as text; the other cases are in the
  table above.

### Pages that already exist

Outpost recognises two kinds of existing page:

| Kind | Meaning |
| --- | --- |
| Imported before | A page made by an earlier import of the same source. |
| Same content | A page with the same title and text that did not come from this source, most likely written by hand. |

You choose one policy for the import:

| Policy | Imported before | Same content |
| --- | --- | --- |
| **Skip** | Left untouched, nothing new created | Left untouched |
| **Copy** | A second page is created | A second page is created |
| **Replace** | Updated in place from the new files | Left untouched: hand-written pages are never overwritten |

Replace overwrites pages, so it is refused until you confirm it (`replaceConfirmed`).
Pages in the trash do not count as existing. New sub-pages of a skipped page are put
under the existing page.

### If an import stops part-way

An import that fails, is cancelled or is cut short by a restart can be committed
again. What it already created is kept and not made twice; only what is missing is
imported. The report of the first attempt is kept.

### Safety

A ZIP is unpacked without trusting it. An entry that tries to write outside its
folder (`../`, an absolute path, a drive letter) refuses the whole archive. Links and
device files are never created. Password-protected archives are refused. Limits: at
most 50,000 files and 8 GB unpacked, including archives inside the archive; a file
that inflates more than 200 times is treated as a zip bomb; a single file over the
upload limit is left out and the rest imported. See [security.md](security.md#archives).

### What importing does not do

- It does not import into the document library, except PDFs. To add documents, upload
  them in the Library.
- It does not read Word (`.docx`), OneNote or Evernote (`.enex`) files.
- It does not merge two workspaces or sync with the source afterwards.
