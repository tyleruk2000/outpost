# Working offline

This page says what works with no internet connection, what needs one, how Outpost
keeps itself from reaching out, and what to check before you leave a connection behind.

"Offline" here means the Outpost server has no route to the internet. Your browser
still needs to reach the Outpost server, on the same computer or over your own network.

## What works with no internet

Everything you have already installed or written:

- reading and searching documents, notes and installed reference collections;
- opening a PDF that is inside a reference collection, and adding PDFs and e-books
  from a collection to your documents (they are copied from the archive on your disk);
- keyword search, and semantic search if its index is built and your embedding
  provider runs locally (see [search.md](search.md));
- answers written from your library, if you have set up a language model and its
  server runs on your own machine or network (see [ai.md](ai.md));
- writing and organising notes, uploading documents, importing files;
- viewing installed map regions, searching installed place names, markers, GPX import
  and export;
- moving and checking collections, backup and restore;
- writing a portable drive, once the programs it needs are cached (see below).

The web app itself is served by Outpost: its scripts, styles, fonts, PDF viewer
resources, map fonts and map icons are all local files.

## What needs a connection

Only actions that fetch something new. Each happens because a person pressed a button.

| Action | Contacts |
| --- | --- |
| **Refresh** on Explore (the catalogue) | The Kiwix library feed, `opds.library.kiwix.org`. Publishers of individual documents are not contacted when the manifest already records the file's size and checksum, which every shipped entry does; a manifest of your own without them causes one small request to the host it names. |
| Starting a catalogue download | The hosts listed in the manifests' `downloadHosts`; mirrors they redirect to |
| Estimating or downloading a map region | `build-metadata.protomaps.dev` and `build.protomaps.com`, or the archive in the `maps.tileSource` setting; for terrain, the `maps.terrainSource` archive |
| Downloading place names | `download.geonames.org` |
| **Save to library** on a link in a reference page, or adding a page's linked files that are only on the internet | The host named in the link, and whatever it redirects to. This is the one place Outpost fetches from a host that no catalogue manifest lists. The address must be `http` or `https`, must end in a kind of file the library keeps, and must not be on this computer or a private network (unless the server was started with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`). |
| Making a portable drive for a kind of computer for the first time | `nodejs.org` for the Node runtime; `download.kiwix.org` for the reference-collection reader |

Once fetched, the Node runtimes and the reader are cached in the data directory, so
later drives can be made offline.

One more connection is yours to choose: with semantic search set to a "local embedding
server", Outpost sends passage text and search queries to the address in the
`search.semantic.endpoint` setting. The default is `http://127.0.0.1:11434/v1`, on the
same machine. Point it at another machine and the text goes there.

The same goes for answers: with "Answers from your library" switched on, pressing
**Answer from my library** sends your question and the passages found for it to the
address in the `answers.endpoint` setting, and to no other. The default is also
`http://127.0.0.1:11434/v1`. Outpost never downloads a language model; you fetch one
with your model server's own tool, which does need a connection, once.

Building Outpost from source, or building the Docker image, also needs a connection
(to install dependencies and fetch map fonts). Running it does not.

## How Outpost guarantees it

- **The browser enforces it.** Every page of the app is sent with a Content Security
  Policy of `default-src 'self'` and `connect-src 'self'` (`APP_CSP` in
  `apps/server/src/app.ts`). The browser refuses to load a script, font, style or
  image from another origin, and refuses to send a request to one.
- **Fonts are bundled.** The interface fonts are npm packages compiled into the app
  (`apps/web/src/styles/base.css`). Map label fonts and icons are fetched once at build
  time by `scripts/fetch-map-assets.mjs` and served from `/map-assets/`. PDF viewer
  resources are copied into the build and served from `/pdfjs/`
  (`apps/web/vite.config.ts`).
- **Reference content is sealed in.** Pages from ZIM archives are served with a policy
  that only allows loading from Outpost's own origin, so an archived page cannot fetch
  from the live web (`apps/server/src/modules/kiwix/index.ts`). A link that leaves the
  archive is not followed: the reader shows where it goes, and fetching the file it
  points at is a button you press.
- **The server calls out only on request.** Outbound requests for downloads and
  catalogue look-ups go through one guarded client (`apps/server/src/core/http.ts`),
  used by the catalogue, downloads, maps and portable modules. A file saved from a
  link is an ordinary download through the same client. Nothing is scheduled: there is
  no update check, no background refresh and no telemetry.
- **Imports never download.** A picture at a web address in an imported page is kept
  as a link, not fetched.

## How the test suite checks it

The browser tests in `e2e/` run with the internet cut off. `e2e/tests/fixtures.ts`
installs a guard on every test: any request the page makes to a host other than
`localhost` or `127.0.0.1` is aborted and recorded, and the test fails if the record
is not empty. A stray CDN font or analytics call anywhere a test goes fails the suite.

`e2e/tests/shell.spec.ts` also checks the policy header itself, that the interface
font loaded from the bundle, and that the page raises no errors. The suite runs
against the packaged app, the same bundle that ships.

The guard covers the screens the tests visit (see the spec files in `e2e/tests/`), not
every screen of the app. The server-side tests use local fixtures and never reach the
internet either.

## What the interface says when offline

- The status line at the foot of the sidebar reads **Ready offline** when nothing is
  running and every drive is connected. It describes the library, not the internet
  connection: Outpost does not probe for one.
- **Explore, Refresh:** "The catalogue was not refreshed: there is no connection". The
  list still shows the last known details, and sizes marked "about" are estimates.
- **Starting a download:** "This download could not be started because there is no
  connection. Try again when the network is back."
- **A download in progress:** "No connection. This download will resume when the
  network is back." It retries with growing pauses. If it uses up its attempts: "No
  connection. Outpost has stopped trying for now. Choose Retry when the network is
  back; the part already downloaded is kept."
- **Map regions:** "Outpost could not reach the map source. Downloading a map region
  needs an internet connection."
- **Search:** if reference collections cannot be searched, results still appear and a
  note says which source is missing and why.

If the browser cannot reach the Outpost server itself, the status line reads "Server
not responding", and notes you are editing wait and retry saving.

## Before you leave: a checklist

1. **Download what you need.** Reference collections from Explore, map regions, and
   place names for the areas you will be in.
2. **Wait for the queue to empty.** Downloads shows nothing running, and the status
   line reads "Ready offline". Documents you added have finished "Reading text".
3. **Check large collections.** Use **Check files** on anything you could not replace
   on the road.
4. **Open one of each.** An article from each reference collection, a PDF, a map at the
   zoom level you will use, a place search.
5. **Test with the cable out.** Disconnect the server from the internet and try the
   things you rely on.
6. **If you use semantic search,** make sure the index is built and the embedding
   server starts without a connection.
7. **If you will make portable drives while away,** make one now for each kind of
   computer, so the programs are cached.
8. **Save a backup** (Settings → Backup) and keep it somewhere other than this device.
9. **Charge and pack the drives**, and eject them properly before unplugging.

See also [maps.md](maps.md), [portable.md](portable.md) and
[troubleshooting.md](troubleshooting.md).
