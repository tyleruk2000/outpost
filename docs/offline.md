# Working offline

This page says what works with no internet connection, what needs one, how Outpost
keeps itself from reaching out, and what to check before you leave a connection behind.

"Offline" here means the Outpost server has no route to the internet. Your browser
still needs to reach the Outpost server, on the same computer or over your own network.

There is one exception, and it is a different thing with its own words. A phone carried
out of the house cannot reach the server at all. Outpost calls that **out of reach**,
and can keep chosen pages, routes and map areas on the phone for it. That is described
under [A phone out of reach of the server](#a-phone-out-of-reach-of-the-server).

## What works with no internet

Everything you have already installed or written:

- reading and searching documents, notes and installed reference collections,
  including web pages you saved while you had a connection;
- opening a PDF that is inside a reference collection, and adding PDFs and e-books
  from a collection to your documents (they are copied from the archive on your disk);
- listing, searching and opening the documents of a collection that is a set of files
  and not a web site;
- keyword search, and semantic search if its index is built: the built-in model needs
  no connection, and neither does a local embedding server on your own machine (see
  [search.md](search.md));
- answers written from your library, if you have set up a language model and its
  server runs on your own machine or network (see [ai.md](ai.md));
- writing and organising notes, uploading documents, importing files;
- viewing installed map regions, searching installed place names, markers, drawing
  routes, GPX import and export, and every route already on the map, however it got
  there;
- moving and checking collections, backup and restore;
- writing a portable drive, once the programs it needs are cached (see below);
- the list of frequencies to listen to (see [radio-frequencies.md](radio-frequencies.md)),
  which ships with the app; its sources are plain links that your browser follows only if
  you press one;
- the Morse trainer, every tab of it (see [morse-trainer.md](morse-trainer.md)). Its one
  link out, to the Reverse Beacon Network's page, is your browser following a link you
  pressed; Outpost itself asks the network nothing.

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
| **Search** in "Find a route" on the Maps screen, and choosing one of its results | The route source named beside the search: one of the hosts in `catalog/route-sources.json` (as shipped, `ovp.dresel.systems` or `overpass.private.coffee`) or in your own `<data directory>/catalog/routes/route-sources.json`. It is sent the name you typed and, when you search the map view, the edges of the view. A redirect to another host is refused. See [maps.md](maps.md#finding-a-known-route). |
| **Get the list** (or **Get it again**) for a source on the Repeaters screen, and **Bring up to date** on a list that was fetched | The publisher named beside the source: one of the hosts in `catalog/repeater-sources.json` whose kind is `fetch` (as shipped, `www.irts.ie` and `hearham.com`) or in your own `<data directory>/catalog/repeaters/repeater-sources.json`. One request for the one file. Nothing is sent but the plain client name every download uses ("Outpost (self-hosted offline library)"). A redirect to another host is refused. Opening a publisher's page from the same screen is your browser following a link, not Outpost. See [radio.md](radio.md#where-to-get-a-list). |
| **Save to library** on a link in a reference page, or adding a page's linked files that are only on the internet | The host named in the link, and whatever it redirects to. This is the one place Outpost fetches from a host that no catalogue manifest lists. The address must be `http` or `https`, must end in a kind of file the library keeps, and must not be on this computer or a private network (unless the server was started with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`). |
| **Look at the page** and **Save page** under "Save a web page" | The host in the address you pasted, and whatever it redirects to: one request for the page. If you asked for its pictures, one request for each, to the hosts the preview names. Nothing a page links to is followed. The address must be `http` or `https` and must not be on this computer or a private network (unless the server was started with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`). See [notes-and-imports.md](notes-and-imports.md#saving-a-web-page). |
| **Show the size** and **Download** under Offline maps → Reference data for the map | The source chosen: `raw.githubusercontent.com` (Natural Earth), `davidmegginson.github.io` (OurAirports), `ovp.dresel.systems` or an Overpass server you declared (OpenStreetMap), `download.geofabrik.de`, `query.wikidata.org`, `data.worldpop.org` or `data.geo.admin.ch`. It is sent the country or the edges of the area on screen, and Outpost's name and address. See [reference-layers.md](reference-layers.md). |
| **Update now** on Weather and hazards, or opening that screen with "also update when I open this screen" ticked (off by default); **Fetch the averages for this place** under its Climate tab | `api.open-meteo.com`, `www.metoffice.gov.uk` and `environment.data.gov.uk` for an update; `power.larc.nasa.gov` and `re.jrc.ec.europa.eu` for averages. Each place's position goes to them rounded to two decimal places (the Met Office is sent none). See [weather.md](weather.md) and [security.md](security.md#weather-and-hazards). |
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
(to install dependencies and fetch map fonts and the small model for search by
meaning). Running it does not.

## How Outpost guarantees it

- **The browser enforces it.** Every page of the app is sent with a Content Security
  Policy of `default-src 'self'` and `connect-src 'self'` (`APP_CSP` in
  `apps/server/src/app.ts`). The browser refuses to load a script, font, style or
  image from another origin, and refuses to send a request to one.
- **Fonts are bundled.** The interface fonts are npm packages compiled into the app
  (`apps/web/src/styles/base.css`). Map label fonts and icons are fetched once at build
  time by `scripts/fetch-map-assets.mjs` and served from `/map-assets/`. The model for
  search by meaning is fetched the same way by `scripts/fetch-embedding-model.mjs`, and
  nothing in it or in the program that runs it can reach the network. PDF viewer
  resources are copied into the build and served from `/pdfjs/`
  (`apps/web/vite.config.ts`).
- **Reference content is sealed in.** Pages from ZIM archives are served with a policy
  that only allows loading from Outpost's own origin, so an archived page cannot fetch
  from the live web (`apps/server/src/modules/kiwix/index.ts`). A link that leaves the
  archive is not followed: the reader shows where it goes, and fetching the file it
  points at is a button you press.
- **The server calls out only on request.** Outbound requests for downloads,
  catalogue look-ups and route searches go through one guarded client
  (`apps/server/src/core/http.ts`), used by the catalogue, downloads, maps and
  portable modules. A file saved from a link is an ordinary download through the same
  client, and a saved web page and its pictures are fetched through it too. Nothing is
  scheduled: there is no update check, no background refresh and no telemetry. A saved
  page is never fetched again.
- **Imports never download.** A picture at a web address in an imported page is kept
  as a link, not fetched.
- **A saved page is sealed too.** What is kept of a web page is its words and, if you
  asked, its pictures, held in your library. Opening it loads nothing from the site it
  came from: a picture that was not brought along is shown as its description.

## How the test suite checks it

The browser tests in `e2e/` run with the internet cut off. `e2e/tests/fixtures.ts`
installs a guard on every test: any request the page makes to a host other than
`localhost` or `127.0.0.1` is aborted and recorded, and the test fails if the record
is not empty. A stray CDN font or analytics call anywhere a test goes fails the suite.

`e2e/tests/shell.spec.ts` also checks the policy header itself, that the interface
font loaded from the bundle, and that the page raises no errors. The suite runs
against the packaged app, the same bundle that ships.

The app's service worker (see [below](#a-phone-out-of-reach-of-the-server)) is
switched off for these tests, because a worker answers some requests itself and would
hide them from the guard. The one spec that tests the worker, `kept.mobile.spec.ts`,
puts the same guard on the whole browser context, which sees the worker's own requests
too, and fails the same way.

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
- **Find a route:** "No connection. Outpost could not reach ovp.dresel.systems.
  Finding a route needs an internet connection; the routes already on your map do
  not." The view says before any search that searching needs the internet. Routes
  already added are drawn, opened, exported and printed with no connection.
- **Search:** if reference collections cannot be searched, results still appear and a
  note says which source is missing and why.

If the browser cannot reach the Outpost server itself, the status line reads "Server
not responding", and notes you are editing wait and retry saving. Where the app is kept
on the device (see the next section), a line above the screen also says the server is
out of reach, and the next screen you open comes from what is kept on the device.

## A phone out of reach of the server

Outpost runs on a computer at home and is used from a phone. In the field the phone
cannot reach it. Two things make the phone still useful there:

- **The app keeps itself.** A service worker stores the app's own files in the browser
  the first time the phone opens Outpost over HTTPS, so the app opens anywhere. In the
  build this was written against that is 88 files and 4.5 MB: the app's entry, the
  notes reader, the map engine, styles, fonts and the outline of the world. The PDF
  viewer, the diagram renderer and the screens that only talk to the server are not
  kept, because out of reach there is nothing for them to show.
- **You choose what it can show.** Nothing of your library is copied to the phone until
  you ask. What can be kept:

| What | Where to keep it | What comes with it |
| --- | --- | --- |
| A page of notes | The page's menu (the three dots), **Keep on this phone** | Every page inside it, however deep, and the pictures and attached files those pages hold. At most 300 pages as one; a file over 50 MB is left out and counted. |
| A route or recorded track | Its panel on the map, **Keep on this phone** | Its line, heights and waypoints. |
| Saved places | Under the list of places, **Keep on this phone** | All of them, as a set. |
| An emergency plan | At the foot of its **Use now** (`/prepare/plans/:id/use`), **Keep on this phone** | The plan as "Use now" shows it: the steps, the emergency number, who to call with their numbers, the places to meet, and the plan's ticks. Not the cards to print. See [below](#an-emergency-plan). |
| An area of the map | Maps, **Offline maps**, "Map areas on this phone" | Every tile of the part of the map in view, from the coarsest zoom to the one you choose, the lettering those tiles use, the map's icons, and terrain if you tick it. |

The words follow the device: on a tablet the button reads "Keep on this tablet", on a
laptop "Keep on this computer".

**On this phone** (in the sidebar, and in the phone's More sheet) lists what is kept,
with the size and date of each copy, and removes copies. Removing a copy never touches
the server.

### An emergency plan

A plan's "Use now" is what a household needs when the server is out of reach, so it can
be kept like a page. The copy is the server's answer for the plan
(`GET /api/emergency-plans/:id`, with the names and numbers of linked contacts and the
positions of linked places as they were), filed in the plan's own cache through the
same store as everything else, and listed on **On this phone** under "Emergency plans".
A plan holds people's names and numbers: the keep action says, before it is pressed,
that a copy of them will be on this device, readable by anyone who can open the
browser. At a plain http address it says that it needs HTTPS and links to the setting,
as the other keep actions do.

Out of reach, `/prepare/plans/:id/use` opens the kept copy in the same view, with a
line saying how old the copy is. A press on a number still calls it; a place opens the
kept map if an area there is kept. **The steps can be ticked.** This is the one
exception to "kept copies are for reading": the ticks are not written into the copy but
kept beside it, as a list of what was ticked and unticked and when, and sent to the
server when it is back in reach (`POST /api/emergency-plans/:id/ticks/merge`). The
server applies them by one rule, so that nothing done elsewhere meanwhile is
overwritten:

- **A tick is added with the time it was made. Where the step was ticked elsewhere
  too, the earlier time is kept** (the union of the ticks, earliest time).
- An untick made on the phone takes a tick away only if the server still has that very
  tick (the same time). A step ticked again elsewhere stays ticked.
- If the plan was **reset** on the server since the phone's copy, what the phone did
  before the plan was started again is dropped: the reset wins.
- A tick for a step taken out of the plan meanwhile is dropped. A tick dated later
  than the server's clock is taken as made now.

A message says when ticks were sent, and how many were dropped by the rule. Ticks wait
on the phone, with a count beside the copy, for as long as the server is out of reach;
removing the copy first asks, and says that unsent ticks go with it. A plan deleted at
home is marked "No longer on the server" and its ticks stay unsent. The copy is
brought up to date each time the phone has Outpost open within reach, and a few
seconds after any plan changes. "Reset for next time" and "Start using this plan" are
not offered out of reach (a first tick starts the plan, as in reach). If the server goes
out of reach while "Use now" is open, that screen stays as it is and a tick there fails
with a message; the kept copy takes over from the next screen opened.

### A map area

The map is drawn from tiles the server cuts out of its installed regions. Keeping an
area copies the tiles for a box from the server to the phone: nothing is downloaded
from the internet, and an area can only be as detailed as the region installed on the
server.

1. Move the map so the area is in view. Open **Offline maps** and find "Map areas on
   this phone".
2. Choose the detail, and whether terrain comes too. Press **Measure the area in
   view**. The server adds up the tiles from its archives' own indexes and answers
   with the exact number of tiles and bytes. Tiles are stored on the phone still
   compressed, as the archive holds them, so the size shown is the size stored, plus up
   to about 2 MB of lettering and icons.
3. Press **Keep this area**. The phone fetches the tiles six at a time. Keep Outpost
   open until it says the area is kept. If it is interrupted, "On this phone" shows
   the area as not finished and offers **Carry on**, which fetches only what is missing.

One area holds at most 12,000 map tiles and 12,000 terrain tiles, and at most 400 MB.
Past that the box is refused with a message; zoom in, or choose less detail. An area is
also refused if the browser reports less room than it needs.

Outside a kept area the map still draws, from the coarse tiles that came along (every
zoom from 0 up covers the box, and the low zooms cover a great deal around it) and from
the outline of the world that is part of the app. Contour lines and hill shading work
in a kept area if terrain was kept: they are drawn on the phone from the terrain tiles,
as they are at home. The phone's own position works, because it comes from the phone.

If the regions installed on the server change after an area was kept, "On this phone"
says so and offers **Fetch again**. Areas are not fetched again by themselves: they are
large.

Fetching again never takes the copy you have away first. Each tile replaces the one
kept in its place as it arrives, and tiles the area no longer has are removed only when
every tile has arrived. If it is interrupted (you walk out of range, the server
restarts, you press **Stop**), the area is still whole and still draws: the tiles that
arrived are new and the rest are the copy that was there. "On this phone" says that it
stopped part of the way and offers **Fetch again**, which starts from the first tile.
If the server no longer has any map for the area, the copy on the phone is kept as it
was.

### What out of reach looks like

- A line across the top: "The server is out of reach. Showing what is kept on this
  phone, for reading only." It has a **Try again** button; the app also asks the server
  again every ten seconds, when the phone reports a network, and when the app comes
  back to the front, and returns to normal by itself.
- The navigation holds only what works: **On this phone**, **Maps**, and the kept pages.
- A kept page opens as it is at home, with writing switched off. A page that was not
  kept says "This page is not kept on this phone". A screen that lives on the server
  (Library, Search, Settings and the rest) says it needs the server. Nothing spins and
  nothing shows an error for being out of reach.
- **Nothing can be changed**, except ticking the steps of a kept emergency plan (see
  [An emergency plan](#an-emergency-plan)). There is no editing out of reach in this
  version. A kept copy is only ever replaced by the server's version; it is never sent
  back, so a stale copy cannot overwrite a page. Documents and reference collections
  cannot be kept.

If the server goes out of reach while a screen is open, that screen is left exactly as
it is, because you may be half-way through writing. The notes editor holds unsaved
changes until the server answers, as it always has. The kept copies take over from the
next screen you open.

### Keeping copies up to date

Kept pages, routes, places and plans are compared with the server whenever the phone has
Outpost open within reach of it: when the app starts, when the server comes back, and
a few seconds after anything changes. Only what changed is fetched. A phone that is not
running Outpost learns nothing, so **open Outpost on the phone once before you leave**.
Each copy shows its date.

If a kept page or route has since been deleted at home, the copy stays on the phone,
marked "No longer on the server", until you remove it.

### Updates to Outpost

A phone must never be left on an old copy of the app. Three rules see to that
(`apps/web/src/sw/rules.ts`):

- A page of the app is always asked of the server first. The kept copy of the app is
  used only when the server does not answer within four seconds (a second and a half
  if it did not answer a moment ago). So within reach, a reload always gets the build
  the server is serving, whatever the phone holds.
- A new build is a different service worker script, served with `Cache-Control:
  no-cache`. The browser installs it beside the old one. As soon as a page running the
  new build is open, that page tells the new worker to take over, and the old copy of
  the app is deleted. A tab still running the old build keeps its files until it is
  reloaded; the "Outpost has been updated" notice asks for that.
- Nothing under `/api/` or `/kiwix/` is ever stored by the worker or answered from a
  cache, except the pictures of kept pages and the tiles and lettering of kept map
  areas, and for those the server is still asked first.

### It needs HTTPS

Browsers allow service workers, their caches and installing only on a secure origin:
HTTPS, or `localhost` on the computer itself (MDN, "Service Worker API", read
16 November 2026: "Service workers are only available in secure contexts"). A phone
opening `http://192.168.1.20:8080` is not one. Over plain HTTP Outpost works as before
while the server is in reach, "On this phone" explains why nothing can be kept, and
points to **Settings → HTTPS on your network**.

We found no browser documentation that says whether a service worker registers on an
HTTPS address whose certificate the phone does not trust, after the warning has been
clicked through. Do not count on it: make the phone trust the certificate.

### What the browser may do with kept copies

Kept copies live in the browser's own storage (Cache Storage), in the browser's own
profile on the phone. They are not encrypted beyond what the phone does for all its
storage, and anyone who can open that browser can read them. Outpost has no accounts,
so there is nothing private per person on the server either; the difference is only
that the copies leave the house with the phone.

The browser, not Outpost, decides how much may be stored and when it is cleared. What
follows was read from the browsers' own documentation on 16 November 2026. It was not
tested on devices.

**Safari on iPhone and iPad**

- *Seven days.* With cross-site tracking prevention on (the default), Safari deletes
  everything a site has stored from script, service worker and caches included, "after
  seven days of Safari use without user interaction on the site". The days are days on
  which Safari is used, not calendar days. (WebKit blog, "Full Third-Party Cookie
  Blocking and More", 24 March 2020; still described on webkit.org/tracking-prevention
  and by MDN, "Storage quotas and eviction criteria", modified 5 January 2026.) A phone
  that uses Safari daily for other things and does not open Outpost for a week loses
  the kept app and every kept copy.
- *The Home Screen changes that.* A site added to the Home Screen "is exempt from ITP's
  7-day cap on all script-writeable storage", and its days of use count only when the
  Home Screen app itself is used (same sources). **For anything you rely on, add
  Outpost to the Home Screen** (Share, then Add to Home Screen).
- *The Home Screen app has storage of its own.* Its website data "is kept isolated from
  Safari" (webkit.org/tracking-prevention); only cookies are copied when it is added
  (WebKit blog, "WebKit Features in Safari 17.2", 11 December 2023). What you kept in a
  Safari tab is not in the Home Screen app. Keep things from the Home Screen app.
- *How much.* From Safari 17, one site may use up to about 60% of the disk in a browser
  and in a Home Screen app alike, and a write past the limit fails (WebKit blog,
  "Updates to Storage Policy", 10 August 2023). Before Safari 17 a site started with a
  limit of 1 GB.
- *Short of room.* WebKit may delete whole sites, least recently used first, when the
  device is under storage pressure; a site whose storage is in persistent mode "might
  be excluded" (same post). WebKit grants that mode by itself, "based on heuristics
  like whether the website is opened as a Home Screen Web App". The button "Ask the
  browser to keep this data" on "On this phone" makes the request and reports the answer.
- Other browsers on iPhone use the same engine and the same rules, except in the EU
  where a browser may bring its own (MDN, as above).

**Chrome on Android**

- One site may use up to 60% of the disk (web.dev, "Storage for the web", updated
  23 September 2024).
- Chrome clears data only when the device runs out of room: whole sites, least recently
  used first, skipping sites it has granted persistent storage. It grants that without
  asking, to sites it judges important: much used, installed or bookmarked, or allowed
  to send notifications (web.dev, "Persistent storage", 12 May 2020).
- Installing (the menu, then Add to Home screen or Install app) needs HTTPS and the
  manifest Outpost ships. We found no documentation that installing changes how much
  may be stored; it is one of the things that makes Chrome willing to keep the data.

**Firefox**

- A site may use the smaller of 10% of the disk and 10 GiB; with persistent storage,
  up to half the disk. Firefox asks the person before granting persistent storage, and
  otherwise clears least recently used sites when the disk fills (MDN, as above).
- On Android, Firefox adds a shortcut that opens the site in Firefox with the same
  storage, not a separate app (MDN, "Making PWAs installable", modified 6 October
  2026). We could not confirm this from a Mozilla page.

In every browser the figures that "On this phone" shows for room in use and room
allowed are the browser's own estimates, rounded and deliberately imprecise. The limit
is an upper bound, not room that is promised.

### What has and has not been tested

Tested, in Chromium, by `e2e/tests/kept.mobile.spec.ts`, which stops the server process
to take it out of reach: keeping a page with a page inside it, a route, saved places
and a small map area; opening all of them with the server gone; a page that was not
kept saying so; a changed page replacing its kept copy when the server returns; a new
build replacing the kept app; removing a kept area.

Kept emergency plans are tested in the web suite (`features/kept/plan-copy.test.ts`,
`kept-screens.test.tsx`) with a stand-in for the browser's storage, and the rule for
ticks on a real test server (`apps/server/test/emergency-plans.test.ts`); not end to
end with the server stopped.

Not tested: a real iPhone or Android phone; adding to the Home Screen on any device;
Safari and Firefox at all; what any browser does with the storage over days; a phone
that has a network but no route to the server (the test server refuses connections at
once, where a phone on mobile data may wait; the four-second limit is there for that
case and no test exercises it); areas of thousands of tiles;
Safari older than 16.4, which cannot unpack compressed tiles and is given unpacked
ones instead, two to three times the size the server measured.

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
6. **If you use semantic search,** make sure the index is built. With the built-in
   model there is nothing else to check; with a local embedding server, make sure it
   starts without a connection.
7. **If you will make portable drives while away,** make one now for each kind of
   computer, so the programs are cached.
8. **If you will be out of reach of the server,** keep what you need on the phone
   (see [above](#a-phone-out-of-reach-of-the-server)), then open "On this phone" and
   check the dates. On an iPhone, do this from the Home Screen app.
9. **Save a backup** (Settings → Backup) and keep it somewhere other than this device.
10. **Charge and pack the drives**, and eject them properly before unplugging.

See also [maps.md](maps.md), [portable.md](portable.md) and
[troubleshooting.md](troubleshooting.md).
