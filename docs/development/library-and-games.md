# Library, notes and games: how they work

Routes are in [api.md](../api.md). This page holds what the guides leave out.

## Games

- Server state: `game_saves`, one row per game (JSON state up to 64 KB, a version per
  write). Results: `POST /api/games/:game/results`, sent once when a game ends.
- Browser state: `localStorage` `outpost.games.<game>`, read in `try`/`catch` and checked
  field by field; written a moment after a move and on page hide; tabs follow each other
  through the `storage` event.
- Allotment engine: `packages/shared/src/games/allotment/` (`advance(state, now,
  hemisphere)`, pure actions, numbers in `numbers.ts`, almanac words in `notes.ts`).
  Growth is integrated exactly over months and moist stretches, so one large step equals
  many small ones. A wet UTC day is a hash of the day number against the month's chance.
  The server applies actions with its own clock, clamped so time never runs back; `GET`
  works the plot out without writing. Plot `v: 1` is read into `v: 2` on load.
- Steading: flows are steady between events, so state is worked out from time exactly.
- Draughts searches 6 plies alpha-beta (man 100, king 160); chess 1 to 4 plies with
  quiescence. Both run in a Web Worker started per reply.
- Sudoku: full grid by randomised search, cells emptied while the answer stays unique.

## Notes and imports

- Block types: `packages/shared/src/notes.ts`; nothing outside it is stored.
- Saves carry the version they were based on; a stale save is refused. Unsaved changes
  are also kept in the tab.
- Markdown, HTML and text are converted in a child process (4 MB input, one minute, 1 GB).
- Replace needs `replaceConfirmed`. Upload size: `OUTPOST_MAX_UPLOAD_MB`.

## Audiobooks

- Tags and running times: `apps/server/src/modules/documents/audio-tags.ts` (ID3 1 to
  2.4, Xing/Info/VBRI frame counts or CBR bitrate, MP4 atoms, Vorbis comments, WAV
  INFO). Reads the first 4 MB and last 128 KB; an MP4's `moov` up to 16 MB.
- Unpacked under `documents/.incoming/`, filed to `collections/audiobooks/<title>/` as
  `001 <name>`; a book is a collection with `book_chapters` and `meta.audiobook`.
- The player is a plain `<audio>` on the file route (byte ranges), the next chapter from
  `ended`, Media Session where present. Place: `outpost.audiobooks.places`.
- Module: `apps/server/src/modules/audiobooks/`; shelf data `catalog/audiobooks.json`;
  web `apps/web/src/features/audiobooks/`.

## PDFs made in Outpost

- Writer: `apps/web/src/features/maps/print/pdf.ts` (Helvetica and Courier, not
  embedded). **Add to library** posts to `POST /api/documents` with `title` and
  `source`; category choice in `outpost.library.madeCategory`.
- A map page's words are text in rendering mode 3 (`map-words.ts`). Other scripts are
  drawn by `lettering.ts` at 300 dpi, with the words in an invisible Type 3 font with a
  ToUnicode map. Embedding the shipped WOFF2 fonts was rejected: it needs a Brotli
  decoder and subsetter and still lacks most scripts.
- The rule that every PDF goes through the shared actions: `apps/web/src/lib/made-pdf-rule.test.ts`.
- Actions: `apps/web/src/features/library/made/`.

## EPUB reader

- `apps/server/src/modules/documents/epub-package.ts` (container, package, spine,
  contents, DRM detection by `META-INF/rights.xml`, `license.lcpl`, `sinf.xml` or a
  non-font `encryption.xml`), `epub-view.ts` (XHTML to `MarkdownBlock` via parse5),
  `epub-reader.ts` (routes, limits; nothing unpacked to disk; 16 books' metadata cached).
- Chapter address `?chapter=N#h-<id>`; ids normalised by `anchorId`. Parsing is
  synchronous, one chapter at a time.

## Learning progress

- Tables `learning_pages`, `learning_days`, `learning_topics`. Writes are capped to the
  time since the last write plus five seconds, two minutes at most.
- The Kiwix proxy's `BRIDGE` script (`apps/server/src/modules/kiwix/index.ts`) posts
  video ends and same-archive links (up to 600) to the reader; the sandbox is unchanged.
  A topic's lessons are its links less the archive's first page's links.
- Code: `apps/server/src/modules/learning/`, `apps/web/src/features/learning/`; test
  archive `apps/server/test/course-archive.ts`.
