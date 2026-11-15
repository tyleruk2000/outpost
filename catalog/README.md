# The Outpost catalogue

This folder holds the catalogue that Explore shows: lists of freely available content
that Outpost can download on request, and a few reference sheets that ship with
Outpost. A manifest describes content and says where it comes from. It never contains
the content itself, and nothing is fetched until a person asks for it.

```
catalog/
  manifests/                 one JSON file per manifest
  bundled/                   files that ship with Outpost (its own reference sheets)
  schema/manifest.schema.json   the format, generated from the server's code
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
  `reference`, `maps`.
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

## Rules for entries

1. **Official endpoints only.** An entry points at the publisher's own distribution
   service, or one the publisher endorses (such as Kiwix for the projects it packages).
   No re-uploads, link shorteners or personal mirrors.
2. **State the licence honestly.** Write the licence you have checked at the source.
   If you have not been able to check it, write `"license": "See source"` and add a
   `licenseNote` saying so. Do not guess.
3. **No one else's content in this repository.** Manifests carry descriptions and
   sources, never the content. The only files in `bundled/` are sheets written for
   Outpost itself: original compilations of facts, each ending with the date it was
   checked, its sources with their addresses, and what it does not cover. Do not put a
   copy of a publisher's document there, whatever its licence; list it with an `http`
   source instead.
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
`HEAD`, it asks for the first byte of the file instead.

The offline check also confirms that every bundled entry's file is present, is UTF-8
text that opens with its title, and carries a version, and that nothing sits in
`bundled/` unlisted. Bundled entries need no online check: there is nobody to ask.

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
