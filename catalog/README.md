# The Outpost catalogue

This folder holds the catalogue that Explore shows: lists of freely available content
that Outpost can download on request, and the reference sheets and books that ship
with Outpost. A manifest describes content and says where it comes from. It never
contains the content itself, and nothing is fetched until a person asks for it.

```
catalog/
  manifests/                 one JSON file per manifest
  bundled/                   what ships with Outpost: its own reference sheets (radio/)
                             and the books generated from LogBook73 (logbook73/)
  schema/manifest.schema.json   the format, generated from the server's code
  packs.json                 named sets of entries
  map-regions.json           ready-made map regions (generated; see docs/maps.md)
  route-sources.json         the servers "Find a route" may ask (see below)
  repeater-sources.json      where lists of repeaters can be had, and which Outpost may fetch
```

People running Outpost can add their own manifests, in the same format, to
`<data directory>/catalog/`, with any files of their own that those manifests bundle
in `<data directory>/catalog/bundled/`. Manifests shipped here are read first, so a
later file cannot replace one of their entries.

## The format

A manifest follows [`schema/manifest.schema.json`](schema/manifest.schema.json). Point
your editor at it with `"$schema": "../schema/manifest.schema.json"`.

```json
{
  "schemaVersion": 1,
  "id": "my-manifest",
  "name": "My manifest",
  "description": "What this list is for.",
  "maintainers": ["Who looks after it"],
  "downloadHosts": ["opds.library.kiwix.org", "lb.download.kiwix.org"],
  "entries": [
    {
      "id": "kiwix.wikipedia-en-100",
      "name": "Wikipedia 100",
      "description": "What a person gets, in a sentence or two.",
      "category": "encyclopedias",
      "publisher": "Wikipedia",
      "language": "en",
      "format": "zim",
      "license": "CC BY-SA 4.0",
      "attribution": "Wikipedia contributors. Packaged as a ZIM archive by the Kiwix project.",
      "lastVerified": "2026-11-15",
      "sizeBytes": 333000000,
      "source": { "type": "kiwix", "name": "wikipedia_en_100", "flavour": "" }
    }
  ]
}
```

- `id` is unique across every manifest: lower-case words joined by dots or hyphens.
- `category` is one of: `survival`, `medicine`, `food`, `agriculture`, `engineering`,
  `repair`, `radio`, `navigation`, `preparedness`, `encyclopedias`, `science`,
  `reference`, `reading` (literature, poetry, plays, music and books read for pleasure),
  `maps`.
- `sizeBytes` is an estimate shown until Outpost has asked the source for the real size.
- `downloadHosts` lists every host the first request for an entry may go to. Outpost
  refuses to contact any host that no manifest lists. It may be empty when every entry
  in the manifest ships with Outpost.

There are three kinds of `source`:

- `{ "type": "kiwix", "name": "...", "flavour": "..." }` names a book in the
  [Kiwix library](https://library.kiwix.org). `flavour` is `maxi`, `nopic`, `mini` or
  the empty string for books published in a single edition. Outpost looks the book up
  in the library's feed right before downloading and takes the address, exact size and
  SHA-256 checksum from there. Never write the address of a `.zim` file into a
  manifest: Kiwix rebuilds most books every month or two and removes old builds.
- `{ "type": "http", "url": "https://...", "sha256": "...", "sizeBytes": 0, "version": "..." }`
  is a file at a fixed https address. Give the `sha256` and `sizeBytes` of the file as
  you downloaded and checked it. Without the checksum Outpost cannot tell a damaged or
  altered file from a good one; with both, a catalogue refresh takes the details from
  the manifest and never contacts the publisher. Entries shipped in this repository
  must have both.
- `{ "type": "bundled", "file": "radio/uk-amateur-bands.md", "version": "2026-11-15" }`
  names a file in the `bundled` folder beside the manifests: a path of lower-case names
  joined by `/`. Explore shows the entry as "Included with Outpost", and adding it copies
  the file into the document library, where it is indexed and opened like any other
  document. No network is involved, so it works offline. The file must be Markdown, PDF,
  EPUB or HTML, and `format` must say which (`markdown`, `pdf`, `epub`, `html`). Give a
  `version` (the day the file was last checked is a good one): when a later release
  ships a corrected file under a higher version, people who added the old one are
  offered the update. The shipped file is never changed or moved by adding it.

  A bundled source can instead be a **book**: a folder of Markdown chapters that are
  read in order. It names a `book` in place of a `file` (exactly one of the two):

  ```json
  "source": {
    "type": "bundled",
    "version": "2026-11-12",
    "book": {
      "folder": "logbook73/g90",
      "sections": [
        {
          "title": "Introduction",
          "chapters": [
            {
              "key": "overview",
              "number": "00",
              "title": "Why the G90 still earns its place",
              "summary": "What this radio is and who it suits.",
              "file": "00-overview.md"
            }
          ]
        }
      ]
    }
  }
  ```

  `folder` is a path inside `bundled`; each chapter's `file` is a lower-case `.md` name
  inside it. `sections` are the book's named parts, in reading order, each with its
  chapters in reading order. A chapter's `key` (lower-case words joined by hyphens,
  unique in the book) is its name in links between chapters and must stay the same
  from one version to the next; `number` is what is printed in the contents ("00",
  "05A") and `summary` is one line for the contents page. The entry's `format` is
  `markdown`. Explore shows the entry as "Book, N chapters". Adding it copies the
  chapters into one folder of the library (`collections/books/<entry id>`) and records
  one document per chapter, so search lands on the chapter; the book's page lists its
  contents. Removing the book removes its chapters, and a higher `version` is offered
  as an update, as for a single file.

## Rules for entries

1. **Official endpoints only.** An entry points at the publisher's own distribution
   service, or one the publisher endorses (such as Kiwix for the projects it packages).
   No re-uploads, link shorteners or personal mirrors.
2. **State the licence honestly.** Write the licence you have checked at the source.
   If you have not been able to check it, write `"license": "See source"` and add a
   `licenseNote` saying so. Do not guess.
3. **No one else's content in this repository.** Manifests carry descriptions and
   sources, never the content. `bundled/` holds two things only. `radio/` holds sheets
   written for Outpost itself: original compilations of facts, each ending with the
   date it was checked, its sources with their addresses, and what it does not cover.
   `logbook73/` holds the handbook and radio guides written by this project's own
   author for LogBook73, under its MIT licence, generated by a script and never edited
   by hand (see [docs/radio.md](../docs/radio.md#the-handbook-and-the-radio-guides)).
   Do not put a copy of a publisher's document there, whatever its licence; list it
   with an `http` source instead.
4. **Describe plainly.** Say what a person gets. Where a book comes in several
   editions, each edition is its own entry and the name says what differs
   ("without images").
5. **https only**, and every host must be in `downloadHosts`.
6. **Names are unique** across the whole catalogue, so two entries can be told apart
   in a list.
7. **Go gently.** Read the publisher's terms and `robots.txt` before adding a file.
   Do not list a source whose terms forbid automated or stored copies, and do not
   crawl or search a site to find files: take addresses from the publisher's own
   listing. A `"See source"` licence note must contain the words "not been verified".

## Links into the catalogue

A Markdown document in the library can link to a catalogue entry, or to a chapter of
the book an entry adds:

```
[the handbook](outpost:entry/logbook73.handbook)
[Decibels](outpost:entry/logbook73.handbook/decibels)
[the 3 dB rule](outpost:entry/logbook73.handbook/decibels#the-3-db-rule)
```

The form is exact: `outpost:entry/`, an entry id, optionally `/` and a chapter `key`,
optionally `#` and a heading (the heading's words in lower case with hyphens for
spaces, as most Markdown tools write them). When the entry is in the library the link
opens the chapter, or the book's contents; when it is not, the link keeps its words and
leads to the entry in Explore. Anything that is not exactly this form, or names an
entry the catalogue does not list, is shown as plain words. The bundled books use these
links between their chapters; a file of your own can use them too. They can lead
nowhere except a document, a book or an Explore entry inside Outpost
(see [docs/security.md](../docs/security.md)).

## Packs

A pack is a named list of entries that are usually wanted together: "Home
preparedness", "Amateur radio in the UK". It holds nothing itself; every item in it is
an ordinary entry in a manifest, with its own source, licence and checksum. Explore
lists packs first, and fetching one queues whatever is not installed yet.

Packs live in `packs.json` beside this file (a person's own go in
`<data directory>/catalog/packs.json`):

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "first-things",
      "name": "First things",
      "description": "What it is for, in a sentence or two, written for the person choosing.",
      "entries": ["ready.emergency-supply-list", "who.basic-emergency-care"]
    }
  ]
}
```

- `id` is lower-case words joined by hyphens; `name` must be unique.
- `entries` are entry ids, in the order they should be listed. An id the catalogue
  does not list is reported by the validator, and left out of the pack in the app.
- Keep a pack to what someone would fetch in one go on a home connection. The shipped
  packs hold nothing larger than about 1.5 GB; the complete Wikipedia and the video
  collections stay as single entries for people who want them.
- Say what the pack is for, not how large it is: the app works the size out.

## Repeater sources

`repeater-sources.json` declares where a list of amateur radio repeaters can be had,
country by country, and what Outpost may do about each: fetch its file when a person
asks (`fetch`), give its page and the steps to download it by hand (`link`), or say
there is nothing (`none`). It plays the part for repeater lists that `downloadHosts`
plays for downloads: a list is fetched from the address a `fetch` source names and
from nowhere else.

A source is `fetch` only when its publisher's terms and `robots.txt` were read and
nothing in them forbids an application fetching the file when a person asks; the
reading goes in `why`, `termsUrl`, `termsNote` and `termsRead`, and at length in
[docs/sources.md](../docs/sources.md#repeater-lists). When in doubt it is `link`. A
shipped source must be `https` and leave at least ten seconds between requests. The
format, and how to keep a file of your own, are in
[docs/radio.md](../docs/radio.md#changing-the-sources). `pnpm catalog:validate` checks
the file.

## Route sources

`route-sources.json` declares the servers that the Maps screen's "Find a route" may
send a search to. It plays the part for route searches that `downloadHosts` plays for
downloads: a search goes to the host of a source listed here and to no other.

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "private-coffee",
      "name": "Private.coffee",
      "type": "overpass",
      "endpoint": "https://overpass.private.coffee/api/interpreter",
      "operator": "Private.coffee, a non-profit association in Austria",
      "coverage": "The whole world",
      "bbox": null,
      "termsUrl": "https://overpass.private.coffee/",
      "termsNote": "What the operator's terms say, and where they say it.",
      "lastVerified": "2026-11-16"
    }
  ]
}
```

- `type` is `overpass`: an [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
  server, which answers from OpenStreetMap data under the Open Database Licence. The
  credit a found route carries follows from that and is not written here.
- `endpoint` is the server's interpreter address, `https` with no credentials or query.
- `operator` and `coverage` are shown to the person before they search.
- `bbox` (`[west, south, east, north]`) is for a server that knows only part of the
  world: a search of a view whose middle is inside it goes to that server first. Draw
  it inside what the server holds. A source with no `bbox` is asked about anywhere
  else. The person can always choose another.
- `defaultSource` (optional, and absent from the shipped file) names one source to ask
  wherever the map is, in place of that rule.

Rules, beyond those for entries:

1. **Read the operator's own terms first, on the day**, and say in `termsNote` what
   they allow and ask for. A server whose operator asks applications not to depend on
   it is not listed, however open its address. That is why the main public instance,
   `overpass-api.de`, is not here: see [docs/sources.md](../docs/sources.md#routes).
2. **One question per action by a person.** Nothing may be added that would ask a
   source on a timer, in the background, or for more than the person asked about.
3. People running Outpost add their own in
   `<data directory>/catalog/routes/route-sources.json`, in the same format, where
   `http` is also allowed and `"replaceShipped": true` leaves these out.

`node apps/server/src/cli/validate-catalog.ts` checks the file's format. It does not
contact the servers.

## How entries are verified

Each entry carries `lastVerified`: the day a maintainer last confirmed that it
resolves at its source. Before sending a change, run:

```
node apps/server/src/cli/validate-catalog.ts            # format, ids, hosts, bundled files, schema file
node apps/server/src/cli/validate-catalog.ts --online   # also asks each source
```

The online check asks one host at a time and waits ten seconds between requests to
the same host (`--delay <seconds>` changes that), because several publishers ask
automated clients for that pace. It takes a couple of minutes. Where a server refuses
`HEAD`, it asks for the first byte of the file instead. `--skip-host <host>` (as often as
needed) leaves every entry on that host unasked. The skipped entries are counted as not
checked, not reported as problems.

**Kiwix's hosts are skipped unless `--include-kiwix` is given** (a Kiwix book counts as
the feed's host, `opds.library.kiwix.org`). Since October 2026 Kiwix's `robots.txt` asks
all automated clients to stay out. Outpost itself still fetches the feed and a file when
a person presses Download, as Kiwix's own readers do; a check that walks every Kiwix
entry in the catalogue is what that rule is aimed at, so it is not run as a matter of
course. See `docs/sources.md`, "Kiwix's robots.txt".

The offline check also confirms that every bundled entry's file (or, for a book, every
chapter) is present, is UTF-8 text that opens with its title, and carries a version,
and that nothing sits in `bundled/` unlisted. Bundled entries need no online check:
there is nobody to ask.

`catalog/manifests/logbook73.json`, `catalog/bundled/logbook73/` and the packs
`radio-learning` and `radio-guides` are generated by
`pnpm catalog:import-logbook73 <path-to-LogBook73>`. Change them by changing LogBook73
or the importer, not by hand.

The offline check runs in the test suite. The online check lists every entry that no
longer resolves (a book renamed or withdrawn upstream); fix or remove those and update
`lastVerified` on the entries you checked. If you change the format in
`apps/server/src/modules/catalog/manifest.ts`, regenerate the schema file with
`--write-schema`.

For Kiwix books, the sizes, versions and availability shown in Explore do not come
from the manifests. They come from the Kiwix library when someone presses Refresh, and
are remembered so that Explore still reads well offline. For files with a pinned size
and checksum, they come from the manifest. For bundled files, the size is measured from
the file itself and the version comes from the manifest.
