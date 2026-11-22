# Security

What Outpost protects against, what it does not, each protective measure, and how to
make an installation safer. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## The threat model in plain words

Outpost is built for one person or a household, on a computer or network they control.
**It has no accounts and no sign-in.** Whoever can reach it can read, add, change and
delete everything in it. What keeps it safe is who can reach it, and what a browser can
be tricked into doing on their behalf. It has not been audited for exposure to the
public internet and must not be exposed to it.

### What Outpost defends against

- **Web pages on other sites.** A page open in your browser cannot read or change your
  Outpost, even though your browser can reach it.
- **Other devices on the network, unless you opt in.** By default nothing outside the
  computer can connect.
- **Hostile files and web pages.** An uploaded HTML page, SVG, archive, EPUB, GPX file or
  saved web page cannot run script in Outpost, write outside its folders, reach into your
  network, or fill the disk without limit.
- **A drive that comes home.** Bringing a portable drive's changes back cannot make
  Outpost read or write outside the drive, run anything, or take in anything unchecked.
- **Hostile reference content.** A ZIM archive's pages cannot change your library or
  reach the internet.
- **Misuse of downloads, route search and network shares.** Outpost cannot be made to
  fetch from inside your network or connect to a file server on the internet; a tampered
  download is not installed; a hostile answer cannot fill memory or inject markup.
- **Text that gives orders.** Nothing a language model writes is acted on.
- **Mistakes.** Nothing is overwritten, and files are deleted only when a request says so.

### What Outpost does not defend against

- **Anyone on a network you shared it with.** With LAN access on, everyone there can read
  and change everything, start downloads, download a backup, and remove library items.
  From another device they cannot [erase everything](#erasing-everything), restore,
  delete stored backups or set the backup passphrase
  ([Backup and restore](#backup-and-restore)). There are no permissions or audit log. A
  [household PIN](#the-household-pin) keeps changes to devices it was entered on.
- **Reading other people's details.** Everyone can read and export every contact
  ([Contacts](#contacts)).
- **Other programs or people on the same computer.** Anything that can connect to
  `127.0.0.1:8080` has the same access.
- **Physical access to a disk.** The database, attachments, documents and portable drives
  are unencrypted, except what a person encrypted ([Encryption](#encryption), protected
  backups). Copies kept on a phone are protected only by the phone's lock
  ([What is kept in the browser](#what-is-kept-in-the-browser)).
- **An untrusted network.** Outpost speaks plain HTTP unless
  [HTTPS on the home network](#https-on-the-home-network) is on and the `https` address is
  used.
- **A compromised helper.** Outpost trusts kiwix-serve and the embedding and model servers
  you point it at; the model server is sent your questions and passages.
- **A wrong answer.** A model can misread or miscite. Outpost labels generated text, flags
  citations that match nothing and shows the passages.
- **Denial of service.** There is no general rate limiting.

## The controls

### Network exposure

- **Local by default**: the server listens on `127.0.0.1`; Docker publishes on
  `127.0.0.1` unless `OUTPOST_BIND` says otherwise.
- **LAN access is a start-up decision** (`OUTPOST_LAN_ACCESS`), not a browser setting.
  Without it the server refuses to start on an address others can reach.
- **Host allow-list** against DNS rebinding: always `localhost`, `127.0.0.1`, `::1` and
  `OUTPOST_ALLOWED_HOSTS`; with LAN access also any IP address, one-word name, and names
  ending `.local`, `.lan`, `.home`, `.internal` or `.home.arpa`. Any other dotted name must
  be listed.
- **kiwix-serve is never exposed**: reached only through Outpost's proxy.

### The household PIN

Off unless set under **Settings → Who can use this library**. With a PIN, every device
still reads everything (including `/mcp` and CardDAV), but changes only once the PIN has
been entered on it; until then it is a guest, told so on every screen. Entering it unlocks
that browser for a year of disuse or until **Lock this device**.

- A change is any `/api/` request but `GET`, `HEAD`, `OPTIONS`, decided in one place. A
  few question-only `POST`s (an answer, a download size, a prediction) are open to guests.
- Any device may set a PIN while there is none. Changing or removing it needs an unlocked
  device and the PIN. A new PIN, or **Lock every other device**, locks the rest.
- Wrong PINs per address (IPv6 per /64): five, then one a minute. 4 to 12 digits.
- Stored as a salted scrypt hash; unlocked devices as the SHA-256 of a token in an
  `HttpOnly`, `SameSite=Strict` cookie (`Secure` over HTTPS). Restore keeps this
  installation's PIN; drives carry none; erase everything removes it.
- Forgotten: add `OUTPOST_FORGET_PIN=true` to `.env`, restart, then take the line out.

It keeps changes to people who know it. Four digits fall in about a week from one
address, and over plain HTTP the PIN and cookie can be read off the network. It hides
nothing.

### HTTPS on the home network

Off by default; **Settings → HTTPS on your network** gives a secure address (needed for
location, service workers and cryptography) without a public domain. How to use it:
[deployment.md](deployment.md#https-on-your-network).

- Listens on `OUTPOST_HTTPS_PORT` (8443) and hands every request to the HTTP handler, so
  all checks are the same. TLS 1.2+, HTTP/1.1. No redirect and no
  `Strict-Transport-Security`, so a bad certificate never locks anyone out of `http`.
- **Its own authority**, made here: RSA 3072, SHA-256, ten years, with critical name
  constraints (private and loopback address blocks; names under `local`, `lan`, `home`,
  `internal`, `home.arpa`, `localhost`; the one-word host names known then), path length
  0, server authentication only.
- **Server certificate**: ECDSA P-256, 398 days, new key each time, meeting Apple's rules
  for user-added roots; re-issued when addresses change or 30 days before expiry.
- **Keys** in `tls/` (folder `0700`, keys `0600`; on Windows protect the folder
  yourself), unencrypted so the server can re-sign unattended, and untouched by backups,
  drives and erase-everything. Only public certificates are served
  (`/api/https/outpost-authority.crt`/`.pem`, `/api/https/own-root.crt`/`.pem`).
- **Your own certificate** (`tls/own/fullchain.pem`, `privkey.pem`) is checked before use
  (key matches, chain, dates, SAN names, key and hash, purpose, a working TLS context),
  never served, logged, backed up or copied, and never replaced by Outpost's authority
  if it expires or breaks.
- **Uploading a key** is accepted from the computer itself or over HTTPS. From another
  device over plain http it is accepted only after the person ticks that anyone listening
  could copy it (`acceptKeyOverPlainHttp=yes`). PKCS#12 files are read by a bounded reader
  (256 KB; implausible key-derivation counts refused); the password is used once.
- **From the computer itself only**: replacing or deleting the authority, deleting your
  own certificate, or replacing one in `tls/own` (as for
  [erasing everything](#erasing-everything)). Turning HTTPS on or off and adding names are
  open to every device.

#### What trusting the certificate means

A device that trusts the authority believes anything it signed. The risk is its key being
copied from the data directory. What a copied key can fake depends on whether the device
honours the name constraints:

| Where | Honours the limits? | Basis |
| --- | --- | --- |
| iPhone, iPad, Mac (macOS 10.15+, iOS 13+) | Yes | Apple's [`SecPolicyServer.c`](https://github.com/apple-oss-distributions/Security/blob/main/trust/trustd/SecPolicyServer.c) |
| Chrome and Edge 112+ on computers | Yes | [Chromium](https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Miscellaneous/EnforceLocalAnchorConstraintsEnabled.yaml), [Microsoft](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/enforcelocalanchorconstraintsenabled) |
| Firefox on a computer | Yes | Its source; an [independent test](https://alexsci.com/blog/name-non-constraint/) |
| Chrome and apps on Android | No | Chromium and Conscrypt source |
| Other Windows programs, Firefox for Android | Not known | No primary source |

Where honoured, a copied key fakes only local names and private addresses; on Android,
any site. If the key may have been copied, make a new authority (at the computer itself)
and remove the old certificate from each device. With your own certificate, a copied
`privkey.pem` lets its holder pass as this server until it expires.

The certificate is first fetched over plain HTTP: compare the SHA-256 fingerprint Settings
shows, or carry the file from the computer itself. Browsers apply fewer rules to a
user-added root (no Certificate Transparency in
[Chrome](https://chromium.googlesource.com/chromium/src/+/main/net/docs/certificate_lifetimes.md);
Apple's 398-day limit does not apply, [102028](https://support.apple.com/en-us/102028),
its [825-day limit](https://support.apple.com/en-us/103769) does). Apple devices and
Android ignore the server-authentication-only limit. HTTPS does not hide the plain address.

### Requests from other sites

Every changing request under `/api/` must carry `X-Outpost-Request: 1`, must not be
marked cross-site by `Sec-Fetch-Site` (another port counts as `same-site` and is refused),
and any `Origin` must match `Host` (`Origin: null` is refused). Another site cannot add the
header without a CORS preflight, and Outpost sends no CORS headers. This applies to every
changing request without exception.

A `GET` never changes anything. A few reach a place fixed by settings or the network:
`/api/answers/models`, `/api/chat/models`, `/api/semantic/status` (at most once a minute
unless `fresh=1`) and `/api/storage/shares/discover` (Mac). Another site can trigger them
but not read the answers. CardDAV is the one other set of routes, and it is read-only.

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Opener-Policy: same-origin` and `X-Frame-Options: SAMEORIGIN`; API answers
`Cache-Control: no-store`. (On plain `http://` at a LAN address browsers ignore the
opener policy and Chrome logs a line; the header is still sent.)

### Content Security Policy

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;
frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

The browser refuses to load code from, or send data to, anywhere else.

### What is kept in the browser

Over HTTPS or on the computer itself, a service worker (`/sw.js`) lets the app open out of
reach and keep chosen things ([offline.md](offline.md#a-phone-out-of-reach-of-the-server)).

- Pages are always asked of the server first. Under `/api/` only kept
  `/api/attachments/…`, `/api/maps/tiles/…` and `/api/maps/terrain/…` are ever answered
  from a cache, and only when the server does not answer. `/kiwix/` and changing requests
  are never touched. The worker has its own policy (`connect-src 'self'`) and never
  writes to a cache; kept copies are written by the page when a person pressed **Keep**.
- A kept copy is never sent back. The one exception, ticks on a kept emergency plan, is
  merged by a rule that cannot undo work done elsewhere and touches only that plan's ticks.
- Kept copies (pages, routes, places with notes, a plan's people and numbers) are
  unencrypted in the browser profile. **On this phone** lists and removes them.
- Medical sheets are kept only when asked, after a question naming the sheets that would be
  readable. An encrypted sheet is kept as its OpenPGP message and opened on the phone with
  its passphrase in memory only; nothing decrypted is written to the browser.
- Kept attachments keep their `sandbox` header and are never answered for a page or frame.

### Files people upload

- **Type by content**: extension on the list **and** first bytes matching; the MIME type
  comes from Outpost's table.
- **Sandboxed**: originals, attachments and GPX exports are sent with
  `Content-Security-Policy: sandbox; default-src 'none'`. Only PDFs, raster images, audio
  and plain text show in place; HTML, SVG and EPUB originals are downloads.
- **Size**: `OUTPOST_MAX_UPLOAD_MB` per document (2048 by default), 50 MB per attachment,
  20 MB per GPX. Streamed to disk.
- **Markdown is drawn, not rendered**: parsed on the server into plain values and drawn by
  the app's own elements. HTML becomes words, pictures descriptions; links survive only as
  `http`, `https` or `mailto` (new tab, `noopener noreferrer`). Links to a heading or an
  `outpost:entry/…` are matched exactly and turned into ids the app builds addresses from.
  The only pictures shown are ones the file carries in its closing lines
  (`outpost-picture-<n>`, as saved web pages keep them), sent only if their bytes are PNG,
  JPEG, GIF or WebP, at most 12 MB.
- **Diagrams** (`mermaid`) are drawn in strict mode without HTML labels, stripped of
  script, links and outside references, and shown as an `<img>`; **figures** (`viz`) are
  JSON read field by field and drawn by Outpost.
- **EPUBs are drawn, not rendered**: chapters become the same plain tree; stylesheets,
  fonts, scripts, forms, frames and media are never sent. Links survive as web, in-chapter
  or other-chapter links; anything else is words. Pictures are served from inside the
  archive only by a checked path, at most 16 MB, as the type their bytes show; SVG only as
  a sandboxed file for `<img>`, and refused if it holds script, `foreignObject`, event
  handlers or entities. Bounds: 20,000 entries, 512 MB read, 2,000 chapters, 2 MB and
  120,000 tags a chapter; nothing unpacked to disk. Copy-protected books are not opened.
- **Reading and listening places** stay in the browser's `localStorage`. The LibriVox shelf
  is links; Outpost asks nothing of LibriVox or the Internet Archive.
- **Repeater lists**: one file of 16 MB and 100,000 rows, read in memory; CSV as text, JSON
  taking only simple values; every value a number, fixed word or cut string. Exported CSV
  cells starting `=`, `+`, `-` or `@` get an apostrophe. A **fetched list** comes only from
  a source declared as `fetch` in `catalog/repeater-sources.json` (or the administrator's
  own file), named by id, held to its host, 16 MB and two minutes, then treated as a
  stranger's file and shown before anything is kept. Hosts are not asked again within
  their stated wait (ten seconds at least). Merging duplicates deletes nothing.
- **GPX, KML, KMZ, GeoJSON**: a DOCTYPE or entity declaration is refused unread; badly
  formed XML is refused. The reader builds no tree and keeps only positions, times, names
  and descriptions, in a worker thread. Limits: 1,000,000 points, 20,000 waypoints, 10,000
  tracks and routes, 100,000 segments; 64 deep, 64 attributes; 1,000,000 characters a
  text; names cut at 2,000. A KMZ is held to 20 MB unpacked; GeoJSON is counted before
  parsing (1,500,000 values, 64 deep). Two files at a time, six waiting. Links to other
  files are never followed. A recording saved from the map is checked the same way and
  held to tracks with times, 150,000 points; until saved it sits in the browser's
  IndexedDB.

### PDFs made in Outpost and added to the library

The app makes PDFs itself (map pages, predictions, plans, paper aids, the contacts
emergency sheet, sun times; [library.md](library.md)). **Add to library** is an ordinary
upload, checked like any other, and sends only to this Outpost. What is added is readable
and searchable by everyone and goes into backups and drives. A one-time pad
([library.md](library.md#paper-aids-a-pad-asks-first)) and the emergency sheet
([library.md](library.md#the-emergency-sheet-asks-first)) ask first; the sheet is a copy of
other people's details that does not change when a contact does, so delete it when you
remove a contact it holds. A "Made in Outpost from" link back is followed only if it is a
path inside Outpost. Text in the PDF is escaped, and unusual scripts are written as hex
codes.

### Reference (ZIM) content

Pages from ZIM archives are served through `/kiwix/open/…` with a policy containing
`sandbox` **without** `allow-same-origin` and `default-src` limited to Outpost. A page runs
in an origin of its own: it cannot read Outpost's storage or API, make a changing request
Outpost accepts, or load anything from the internet. Only a book's pages and icon can be
reached. A small script of Outpost's at the top of each page reports which page is shown,
its links, and when a video ended; it listens for nothing, and the reader checks every
field and acts only on a press.

**Archives that are small web apps.** A sandboxed page (origin `null`) is refused its own
archive's module scripts, fonts and data unless the server allows them. Allowing that at
the plain address would let any site read the library, so the reader frames pages at
`/kiwix/<word>/content/…`, where `<word>` is 32 random characters made once
(`reader-token` in the data folder). Only there, and only to `Origin: null`, may answers be
read. The word is given only to Outpost's screens; an archive's own scripts can see it, so a
hostile archive could leak it and let another site read your archives (not notes or the
API). Delete `reader-token` and restart to make a new one.

**Archives that need storage** (such as nautilus collections like the Post Disaster
Resource Library) cannot use it in the sandbox, which is not loosened. The server instead
reads their `database.js` with a parser that accepts only a literal list of strings,
numbers, arrays and objects and runs nothing, bounded to 4 MB, 20,000 documents and 50
files each, with names cut and checked so a file cannot leave its archive. The reader draws
the list as text. Sizes are asked by `HEAD`; **Add all** is one job per collection, one
file at a time, stopping before the location has under 256 MiB free.

### Learning progress

For each learner, archive and page: address, title, first and last opened, seconds on
screen, and done or watched; and seconds per archive per day ([learning.md](learning.md)).
No device or address. Everyone who can reach Outpost can see it; a learner is a name, not
proof. It is in backups and drives, not in search or sent to a model. Pages can lie only
within bounds (links inside the same book, a video counts at nine tenths played). Limits:
50 learners, 20,000 pages each, two minutes per write, 2,000 link lists an archive.

### Downloads (the SSRF guard)

Outpost cannot be tricked into fetching inside your network:

1. A catalogue download's first request may go only to a host in a catalogue manifest
   (plus `OUTPOST_DOWNLOAD_HOSTS`).
2. Every connection and redirect must land on a public address, checked on the address
   actually connected to. Loopback, private, link-local and reserved ranges are blocked.

Only `http` and `https`, no credentials in addresses, at most eight redirects.
`OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true` turns rule 2 off for a mirror on your network.

Integrity comes from the publisher's checksum: a Kiwix download without a SHA-256 is
refused, and a mismatch is deleted. Files are written as `.part`, renamed only when
verified, and never overwrite. A download stops once more arrives than stated (plus a
tenth and 1 MB) or at 8 GB with no size. There is no overall time limit; a connection
silent for 60 seconds is retried.

**Saving a link or a web page**
([notes-and-imports.md](notes-and-imports.md#saving-a-web-page)) fetches from a host no
manifest lists, so: rule 2 on every hop; private literals and `localhost` refused before
sending; `User-Agent: Outpost (self-hosted offline library)`, no cookie, referrer or
credentials; one page per press, nothing it links to except pictures in the article when
asked. Limits: 5 MB after decompression and 20 seconds; 30 pictures, 5 MB each, 20 MB in
all. Only HTML is read, in a worker ended after 20 seconds, refused over 50,000 elements;
pictures must be PNG, JPEG, GIF or WebP by their bytes. The article is cleaned with an
allow-list and kept as Markdown, which can run nothing. A saved link is checked by content
(a sign-in page named `.pdf` is discarded), 200 at a time. An address already saved is
refused (`409`) until the person says keep both or replace. The site sees the computer's
address and the request.

**Route sources** (Find a route): only hosts in `catalog/route-sources.json` or the
administrator's own `route-sources.json`, `https` when shipped, `POST` with no redirects.
Sent: the name typed, the view's edges to five decimals, and "Outpost", its version and the
project's address (shown beside **Search**). What is typed can only match names: every
character but letters, digits, spaces, apostrophes and hyphens becomes a wildcard. Answers
are cut at 6 MB (search) and 24 MB (route); ids, positions and a few tags are checked and
cut; a route may hold 10,000 ways and 200,000 points. One question at a time; a busy source
is left for 30 seconds. Nothing is stored until a person adds a route. A route is only as
right as OpenStreetMap.

**Satellite imagery and aerial photographs** ([maps.md](maps.md#satellite-imagery)), only
on **Find pictures**, **Continue**, **Fetch** or **Download**:

- Hosts fixed in code: `earth-search.aws.element84.com` (search),
  `e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com` (scenes),
  `assets.science.nasa.gov` (the world); for New Zealand
  `nz-imagery.s3.ap-southeast-2.amazonaws.com`; for the United States
  `planetarycomputer.microsoft.com` (search and an account-less token, never stored) and
  `naipeuwest.blob.core.windows.net`. Every hop is checked.
- Sent: the area's box and dates, and byte ranges, under the plain client name. Only a
  scene a search here returned in the last hour can be fetched, by a server-made key; only
  `206` answers are accepted; a build stops at 110% of the bytes shown. Large areas are
  refused or need confirming. Four requests at once; `429`/`503` waited out, three retries.
- Files are read by Outpost's own bounded GeoTIFF reader. The buckets are public and not
  requester-pays; nothing is billed.

Not through the guarded client: the embedding and model servers (held to your own network
instead, [below](#answers-from-a-language-model)), kiwix-serve, listing a share's folders
([Network shares](#network-shares)) and the network scan
([Devices on this network](#devices-on-this-network)). All are listed under
[No telemetry](#no-telemetry).

### Reference layers

([reference-layers.md](reference-layers.md)) Fetched only on **Show the size** or
**Download**, through the guarded client, only from:

| Host | What | Terms |
| --- | --- | --- |
| `raw.githubusercontent.com` | Natural Earth GeoJSON, v5.1.2 | Public domain |
| `davidmegginson.github.io` | OurAirports' airports and frequencies | Public domain |
| `ovp.dresel.systems`, or a server in your route source file | One Overpass question per layer and country | The operator's; private.coffee excluded |
| `download.geofabrik.de` | The region index, a region's `.osm.pbf` and its `.md5` (held to this host; checked before reading) | ODbL |
| `query.wikidata.org` | One count and one query, after you agree to the client name | CC0 |
| `data.worldpop.org` | One country's population GeoTIFF | CC BY 4.0 |
| `data.geo.admin.ch` | Swiss emergency meeting points | Open use, source given |
| `environment.data.gov.uk` | Flood zones for a box up to about 20 km | Open Government Licence |
| `api.ratings.food.gov.uk` | Food retailers round the area on screen | Open Government Licence |

Overpass and Wikidata are sent "Outpost", its version and the project's address, shown
first; **Show the size** stays off until you tick "Send this name to …", and the server
refuses without that agreement. Others get the plain client name. Answers are capped
before reading (up to 160 MB), positions checked to be on Earth, text cleaned and shown as
text. Links in a card open in a new tab with `rel="noreferrer"`.

### The HF propagation engine

VOACAP (as `hfcast`) compiled to WebAssembly, treated as untrusted code: it is handed only
an in-memory map of its own data files and the antenna files Outpost writes, so it cannot
read or write anything real; it runs in a worker with a memory limit, ended after a minute
or on a trap; inputs are held to ranges and station names cut to twenty characters. The
engine, its 29 data files and its 15 coefficient files are checked against SHA-256 at every
load. Two requests, each on a press: a newer solar cycle table from
`services.swpc.noaa.gov` (1 MB, every row checked), and the coefficients, which Outpost
does not ship: 15 files from `raw.githubusercontent.com` at a pinned commit, each length
and checksum known in advance.

### The second HF model (ITU P.533)

ITURHFProp, compiled to WebAssembly on your computer from the ITU's source at a pinned
commit, checked by tree checksum, in a network-less container from pinned images; the
server uses it only if its SHA-256 matches. It has its own sandbox (it may write only its
report, up to 32 MB; memory 128 MB), its own worker, and input written from checked
numbers. Its maps come from `raw.githubusercontent.com`, checked by SHA-256.

**Build the P.533 engine** does the same as a job, fetching 39 source files from
`raw.githubusercontent.com` and the wasi-sdk compiler from `github.com` (and
`release-assets.githubusercontent.com`). **This is the one place Outpost runs a program it
downloaded.** The compiler is unpacked and run only if its SHA-256 is the one recorded for
this kind of computer, as the server's user, with fixed arguments, in a folder deleted
afterwards, and the result is installed only if it is byte for byte the recorded engine.
It is not cut off from the network while compiling; the pinned checksums stand in for that.

### Coverage maps, plans and the contact log

Same engine, no new way out. A coverage map is at most 2,304 runs, one at a time with three
waiting; a plan 56 runs; a log comparison 500. The ADIF importer takes 64 MB and 200,000
records, never written to disk, runs and follows nothing, and looks nothing up. Exports are
made in the browser. Links to notes hold an id only.

### Supplies and the barcode scanner

([supplies.md](supplies.md)) A barcode is matched only against the supplies; nothing is
looked up. The camera starts only after **Use the camera**, only on a secure page, and
stops when a code is read or the dialog closes; frames and photos stay in the browser. CSV
import: 2 MB, 5,000 rows, every value checked, preview first. Export protects against
spreadsheet formulas. Limits: 5,000 stock rows, 40 members, 500 shopping lines.

### QR codes

Codes are made in the browser. What is typed (a Wi-Fi password, a contact) is not sent,
stored, logged or kept; autocomplete is off. Anyone who scans a Wi-Fi code learns the
password. **Add to library** asks first, since the library is readable by everyone and the
sheet holds the password. See [tools-qr-and-network.md](tools-qr-and-network.md#qr-codes-toolsqr).

### Devices on this network

The scan covers only the private and link-local networks the computer is on, worked out
from its own interfaces (never a range from the request, at most a /24). It sends one ping
per address and, if none comes back, tries ports 80 then 443 and closes at once: at most
20 a second, one scan at a time. No other probing, logging in or special rights
([details](tools-qr-and-network.md#devices-on-this-network-toolsnetwork)).

Anyone who can reach Outpost may scan, since any device on the network can do the same.
That is weaker if Outpost is reached from elsewhere (a VPN, a routed guest network), or on
a managed network that forbids scanning: then start Outpost with
`OUTPOST_NETWORK_SCAN_LOCAL_ONLY=true`, and only the computer itself can start one.

Device names can be people's names. The list is in the database and backups, shown only
on its own screen, not searched or logged, and leaves only by **Copy the list**,
**Save as CSV**, a backup or a drive. Names are cleaned and shown as text. The makers'
registry is fetched only on a press from the IEEE's host, capped at 20 MB.

### Weather and hazards

([weather.md](weather.md))

| Host | When | What is sent |
| --- | --- | --- |
| `api.open-meteo.com` | **Update now**, or opening the screen with the tick on | Each place's position to two decimals (about 1 km) |
| `www.metoffice.gov.uk` | The same | Nothing about you: one UK feed |
| `environment.data.gov.uk` | The same; **Fetch the last 3 days** on a station | A place's position to two decimals and a distance; then stations' measures |
| `power.larc.nasa.gov`, `re.jrc.ec.europa.eu` | **Fetch the averages for this place** | A place's position to two decimals |
| `www.gdacs.org`, `earthquake.usgs.gov` | **Fetch alerts** under Worldwide | Nothing about you: world feeds |
| `feeds.meteoalarm.org` | The same, when the country for national warnings is one of its 38 | The country |
| `api.weather.gov` | The same, when it is in the US NWS area | Home's position to two decimals, and the generic client name |
| `api.weather.gc.ca` | The same, when it is Canada | A box 0.02° across round Home's position to two decimals |
| `alerts.metservice.com` | The same, when it is New Zealand | Nothing about you: the feed, then each alert it lists (at most 40) |
| `www.data.jma.go.jp` | The same, when it is Japan | Nothing about you: one feed for Japan |
| `services.swpc.noaa.gov` | **Fetch today's conditions** under HF propagation | Nothing about you |

Only on a press: the routes are `POST`s and nothing runs on a timer. **Also update when I
open this screen** is off by default; ticked, **every opening on every device sends the
requests above**. Hosts are built in code and held at every hop; answers are at most 2 MB
(12 MB for a MeteoAlarm feed, 16 MB for JMA's) and 30 seconds, every figure checked, feeds read by the strict
XML reader, words shown as text, links kept only on the publisher's host. Home's country is
worked out on this computer. The device's position is asked only after **Use this device's
position**, on a secure page. Copies are in the database and backups, cleared by
**Manage and clean up → Leftovers**.

### Emergency plans

([emergency-plans.md](emergency-plans.md)) Contacts and places are linked by id, not
copied. Medical words go only on that person's wallet card. **Add to library** asks first,
because the cards hold other people's details. No outbound requests. Limits: 200 plans; a
plan 120 steps, 30 people, 30 contacts, 12 places.

### The household board (Messages)

([messages.md](messages.md)) Messages, check-ins (with a position only if ticked) and sent
files (under `board/`, 7 days by default) are in backups, not on drives. Everyone can read
them; a name proves nothing; anyone can change or remove anything, and a removal leaves a
line saying who. Nothing is encrypted and there are no private messages. Words are shown as
text, only `http:`/`https:` become links. A sent file is never opened on the server and is
served only as a sandboxed download (as a picture only if its bytes are PNG, JPEG, GIF or
WebP). Limits: 10,000 characters a message; 30 posts a minute and 30 files an hour per
address; 200 MB a file, 100 files and 4 GB kept. Not searched; sent to a model only if
model tools and their "Messages on the board" area are both on, and then only the
household channel's words, names and times. No push notifications.

### The mesh radio link

([mesh-radio.md](mesh-radio.md)) Off until set up.

- **Only from the computer itself** can a way in be set up, a serial device chosen or the
  broker port opened (`403` elsewhere), unless Outpost was started with
  `OUTPOST_ALLOW_REMOTE_SETTINGS` (or `OUTPOST_ALLOW_REMOTE_ERASE`; needed in a container).
  The `/mcp` switch follows the same rule. Every device may read the status and send a
  test message.
- **The broker port** (MQTT, 1883) closes any connection not from this computer or a
  private home-network address. Plain TCP: the password and messages cross the network in
  the clear. Do not forward the port. Bounded: 64 KiB packets, 8 connections, 20 publishes
  a second, 5 wrong passwords a minute; nothing retained.
- **Passwords** are in `<data>/mesh/secrets.json` (0600), not in the database or backups,
  never logged or returned; the broker's as a scrypt hash.
- **Serial devices** come only from the server's own list in `/dev`.
- **Radio channels are not private**: anyone on the channel reads them, and a radio name
  proves nothing.

### Paths

Content is recorded as *(storage location, relative path)*; locations can be created only
inside the storage roots set at start-up. Every path from a request goes through
`resolveInside`; `safeFileName` reduces any name to one safe segment. Whether a folder is
inside the roots is checked as written and again with links followed (on a Mac
`/Volumes/Macintosh HD` links to `/`). A file read from a location may be a link to
another place under the roots, never elsewhere.

### Archives

Archives are never trusted to say where contents go or how large they are. A restore
unpacks only `manifest.json`, `outpost.db` and three known folders (500,000 entries, 64 GB)
and overwrites nothing. An EPUB is read in memory only. A ZIP import refuses the whole
archive if a name climbs out, creates no links or device files, and caps entries, sizes and
compression ratio. An audiobook zip is unpacked into its own incoming folder (5,000
entries) and keeps only real audio files. A runtime for a portable drive is checked against
its publisher's checksum (SHA-256 for Node, MD5 for Kiwix's reader) before one named file
is extracted.

### Notes, Markdown and HTML

Nothing is stored or served as raw HTML. A page is a document of node types, marks and
attributes from a fixed list; anything from the browser, an import or a template is
sanitised into it, with links only `http`, `https`, `mailto` or relative (small inline
raster images are the one `data:` exception). 5 MB and 40 levels a page. Imported files are
converted in a child process, one at a time, a minute and 1 GB each; a file that exceeds
either becomes an empty page that says so. Search snippets reach the browser as plain text.

### Contacts

Everyone who can open Outpost can read, change, delete and export every contact
(`GET /api/contacts/export.vcf`); the screen says so. They go into backups (unencrypted
without a [backup passphrase](#backups-protected-by-a-passphrase)), onto drives unless
turned off, and into search (and so to an embedding server if one is used), but **not** to a
language model. A contact's link opens only if `http` or `https`. Erasing removes them all
and compacts the database.

vCard files are read by Outpost's own reader, which runs and fetches nothing: 50 MB and
20,000 cards a file, 500 properties a card; a card over a limit is listed, never read in
part; pictures and keys are skipped. An import shows a preview and changes another contact
only when the person merges or replaces it. Every change names the version it was made
from and is refused if the contact changed since.

#### The address book for phones (CardDAV)

Off by default; on (`contacts.carddav`), Outpost answers CardDAV under `/dav/` and
`/.well-known/carddav`, never from a portable drive.

- **Read-only**: every writing method answers `403`, and no code path writes; that is why
  it needs no `X-Outpost-Request`. Another site cannot read the answers.
- **No password** is checked or stored: it would protect nothing the browser does not
  already expose, and would be sent in the clear. Use any password and the user name
  `outpost`. Turning it on lets any device that can reach Outpost fetch every contact.
- Over plain http the contacts cross the network unencrypted; Apple devices are reported
  to refuse it without TLS.
- Request bodies go through the strict XML reader (no DOCTYPE, 2 MB).

### Encryption

The one place Outpost keeps something from people who can reach it
([encryption.md](encryption.md)).

**In the browser only.** Passphrases, unlocked keys and plaintext never reach the server,
which has no OpenPGP library. Browsers allow the cryptography only on a secure origin, so
at a plain `http://` LAN address the feature is **not available**, and the screen points
to HTTPS. Nothing falls back to the server.

**What the server holds**: public keys (readable by everyone); a private key only if its
owner chose "on this device and on Outpost", still encrypted, so anyone can download it and
guess its passphrase offline; encrypted pages, likewise. Never passphrases, unlocked keys,
plaintext or "checked" marks. The server reads each key's packets and refuses a "public"
key with secret parts, a private key with any part in the clear or an unstretched
passphrase, a key under the wrong fingerprint, and anything it does not know. Passphrases
for anything kept on Outpost must be 20 characters with 10 different ones, or one Outpost
made (80 bits). **On this device only** is the default.

**The server is not trusted for keys.** Anyone on the network can add, replace or delete
keys; the browser believes only a key's bytes, and "checked" marks are kept in each
person's browser by fingerprint, so a swapped key shows as unchecked. Someone can delete
your keys but not read or forge them. Keep a copy of any private key that matters.

**In the browser**: private keys kept "on this device" (protected, in `localStorage`) and
checked marks. Unlocked keys and decrypted text are in memory only, forgotten 5 minutes
after last use, on leaving the screen or closing the tab. Anyone at an unlocked device, or
an extension that can read the page, sees what is decrypted.

**Encrypted pages**: the content is one OpenPGP message; title, tags and dates stay plain.
No preview, links or search text are kept. Ciphertext is saved only after the browser has
decrypted it again and compared. Text cannot replace ciphertext by accident. The replaced
text is erased from the database files, not just unlinked. Pages with attachments cannot be
encrypted. It does not reach earlier copies: backups, drives, exports, offline copies,
other tabs, unused database space, the disk
([encryption.md](encryption.md#what-happens-to-the-old-text)).

**The library** is OpenPGP.js 6.3.2, unchanged, served from Outpost's own origin and
loaded only by these screens. Outpost's use of it has not been audited. The classical
ciphers on the screen are not security measures; one-time pad letters come from
`crypto.getRandomValues` without bias and are never sent or stored.

### Answers from a language model

**What is sent**: fixed rules, the passages found and the question, only on **Answer from
my library** or **Test** (or opening Settings' Answers section, which asks for the model
list), never in the background, and nothing when no passage was found. **Where**: the one
address in `answers.endpoint`, by default `http://127.0.0.1:11434/v1`; plain HTTP unless
it is `https`; no API key.

Because anyone can change a setting, the address is held to **your own network**: private
ranges, link-local, `100.64.0.0/10` (Tailscale and similar) and loopback. A name is looked
up before every request and refused if any address is public;
`OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true` at start-up lifts this. The same holds for the
embedding server (`search.semantic.endpoint`), which receives every passage when an index
is built. Only `http`/`https`, no credentials, no redirects, one answer at a time, closed
when the reader leaves, off by default. Settings says in words where the address is.
Anyone who can open Outpost can still point it at a server of their own.

**Nothing of an answer is kept**: not in the database, a file or the log.

#### Answers, and text that gives orders

Any document can contain a sentence addressed to a model (prompt injection), and no prompt
is proof against it. The sources are fenced between marker lines carrying a random code
per request, and the model is told not to obey what is inside. That lowers the risk. What
holds anyway: **nothing in an answer is acted on** (no tools, memory or second turn); it is
drawn as plain text, emphasis and citation markers, with no links but citations Outpost
builds from its own record to routes inside Outpost; a citation that matches nothing is
struck through; private reasoning (`<think>`) is dropped. The worst a planted instruction
can do is make the answer wrong, under a heading saying a model wrote it, above the
passages. Read the passages.

#### Conversations

**Chat** goes through the same guard. Differences:

- **Anyone who can open Outpost can read, continue, rename and delete every
  conversation.** The screen says so.
- Sent: the instructions, recent messages that fit, the message and any passages. Opening
  Chat asks for the model list. **Look for Ollama on this computer** tries only
  `answers.endpoint`, `127.0.0.1:11434` and `host.docker.internal:11434`; **Try it**
  (`POST /api/chat/setup/try`) accepts only those.
- Kept: every message, the model and passages, in backups; removed from portable drives;
  never logged.
- A reply runs on the server: **Stop**, deleting, shutting down or a time limit ends it.
  Limits: 16,000 characters a message; 1,024 tokens a reply; 10 minutes in all.
- **A reply is untrusted text**: drawn from a plain tree, never HTML; links shown as words
  with the address beside them (a model can be told to write a link that carries your
  library out); pictures never fetched; diagrams shown as code. A reply saved as a page
  loses links and pictures.

#### Tools a model can call

**Let the model look things up in Outpost** (off by default) gives a tool-capable model
read-only tools ([ai.md](ai.md#looking-things-up-in-outpost)), the same as `/mcp`.

- **They only read.** None changes anything, queues work or reaches the network, except
  that `search_library` sends search words to an embedding server if one is used.
- **Never readable**: contacts, keys and encryption, encrypted pages, board files, share
  credentials, secret settings, the network scan.
- Run on the server after checking the name and arguments; a tool not offered is refused
  as unknown. Answers go to the model server, so to another machine if that is where it
  is; Settings says so.
- Bounded: 3,000 characters an answer, three calls a round, four rounds a reply.
- Words in a tool's answer can only steer the model's words.

#### The MCP endpoint

`/mcp` serves the same tools to Model Context Protocol programs ([mcp.md](mcp.md)).

- **Off by default**, switched only from the computer itself (`PUT /api/tools/mcp`);
  erasing or resetting settings turns it off.
- With it on, **whatever an MCP program is connected to receives the answers**: a desktop
  assistant using a cloud model sends your supplies and plans there.
- Its own rules: the Host check; `Origin` must be this server's exact scheme, host and
  port; `Sec-Fetch-Site` only `same-origin` or `none`; body `application/json`; only
  loopback, private, link-local or unique-local sources, no forwarding headers, no
  `100.64.0.0/10`; 20 at once and 60 a minute per address.
- **No tokens or accounts**: anyone who can reach it while it is on can use it.

### Backup and restore

A restore is unpacked under the [archive limits](#archives) and checked: an Outpost
manifest, a database that passes SQLite's integrity check and is not from a newer Outpost,
every file matching its checksum. It is applied at the next start, keeping the replaced
data in a dated folder. It restores the database, attachments, extracted text and board
files only. Catalogue manifests in it are ignored; unfinished jobs and remembered shares
are deleted; the mesh set-up is replaced by this one's. So a backup from elsewhere cannot
start work, connect to a server or broker, or open a radio or port. The mesh passwords and
`reader-token` are never in a backup.

#### Who may restore and who may delete backups

From the computer itself only, as for [erasing everything](#erasing-everything), unless
Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`:

| Refused from another device | Allowed from any device |
| --- | --- |
| Restoring (`POST /api/backup/restore`, `…/stored/:name/restore`) | **Back up now** (`POST /api/backup/run`), downloads |
| Deleting a stored backup | Changing the schedule, except lowering `keep` |
| Lowering `keep` in the schedule | Cancelling a staged restore |
| Setting or removing the passphrase | Checking the database |
| Reclaiming database space; restarting the server | |

Manual and scheduled backups rotate separately, so **Back up now** cannot push the
scheduled ones out.

#### Backups kept on a storage location

Written only to `outpost-backups` in the chosen location, after checking its marker file
(so an empty mount point is not written into), never through a link, and skipped if the
location is missing. Each is read back whole and checked; a failure is kept, marked and
reported, only the newest two failures are kept, and a failing schedule backs off up to a
day. Outpost deletes only plain files in that folder with its backup name that still read
as its backups, never the newest verified one. Requests name a backup by file name only.

**A backup is not encrypted unless a passphrase is set.** Otherwise anyone who can read the
folder can read your notes, and anyone who can reach Outpost can download one. The
`.verified.json` beside it says it was sound when written, not that nobody replaced it.

#### Backups protected by a passphrase

Off by default; set in **Settings → Backup**. File format:
[development/storage-and-https.md](development/storage-and-https.md#the-protected-backup-file).

- **No secret on the server.** The passphrase makes an X25519 key pair; Outpost keeps the
  public key and the private key wrapped under the passphrase (scrypt), and forgets the
  passphrase. Each backup is encrypted to the public key, so the server can make protected
  backups but not open them. The wrapped key is in each backup's header, so a file and its
  passphrase restore onto a fresh installation.
- **The passphrase is its only defence** against offline guessing. scrypt is tuned to about
  a second on this computer (32 MiB to 512 MiB). The screen warns under twelve characters
  and offers a random one (80 bits).
- X25519, HKDF-SHA-256, ChaCha20-Poly1305 in 64 KiB chunks, each tagged and numbered, from
  Node's own `crypto`. Any change, reordering or truncation fails; a wrong passphrase and
  damage are reported apart.
- **Set, changed or removed only by a request that may restore**, and a passphrase from
  another device only over HTTPS. Changing makes a new key pair; old backups open with
  their old passphrase. Switching off decrypts nothing.
- Restoring decrypts in memory; the only decrypted bytes on disk are the unpacked files
  in `restore-pending`. A restore keeps this installation's protection, not the backup's.

It does not protect the data directory or the network, hide a backup's date or size,
recover a lost passphrase, stop anyone downloading a (protected) backup or turning
automatic backups off, or sign backups: anyone with the public key can make a file that
opens with your passphrase, so restore only files you trust.

### Bringing a drive back

A drive that comes home is untrusted ([portable.md](portable.md#bringing-changes-back-from-a-drive)).
It is never written to: its database is copied and read from the copy, read-only, with
SQLite's defences for untrusted schemas, and only the tables a merge needs are read, after
checking they are real tables with the expected columns; views and triggers are never run.
A drive from a newer Outpost is refused. Every row is checked; bad rows are counted and left
out. Limits: 100,000 pages, documents and places, 20,000 tracks, 200,000 attachments, a
32 GB database. Paths must stay inside the drive's `library` or `attachments` folder after
links are followed; files are checked against their checksums and then like uploads; page
content is sanitised; tracks are rebuilt and read by the GPX reader. Nothing at home is
removed unless ticked and confirmed by name, and anything changed at home since the preview
is left alone.

### Removing in bulk

**Storage → Manage and clean up** shows what each action will do and asks first. Removal
goes item by item through the Library's own rules (nothing on a disconnected location is
deleted). Only `collections/` and `documents/` in a location are touched; a library file
elsewhere is forgotten, not deleted. Leftover files are offered only if nothing claims them
and they have not changed for ten minutes, and are checked again when cleared; links are
never followed. Requests name items by id. Never touched: locations and their marker files,
shares and Keychain items, catalogue manifests. Deleting the files of several items a person
added themselves, in one request, follows the erase rule below; downloaded content can be
removed in bulk from anywhere.

#### Erasing everything

**Erase everything** destroys what a person made: notes, documents, contacts,
conversations, places and routes, repeaters, radio plans and logs, power plans, supplies,
weather places and readings, emergency plans, nuclear scenarios, the device list, keys and
game saves, and compacts the database so nothing is left readable. Without accounts,
Outpost asks "where from?":

- The request must come from **the computer Outpost runs on**: not through a proxy, and
  either LAN access is off, or it comes from loopback (`127.0.0.0/8`, `::1`) or, outside a
  container, one of the computer's own addresses (a browser on the computer at
  `http://192.168.1.20:8080` counts). Link-local addresses never count.
- `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host` or `X-Real-IP` make a request remote.
- Elsewhere the button is hidden and the server answers `403`.
  `OUTPOST_ALLOW_REMOTE_ERASE=true` at start-up allows every device.
- The request must carry the phrase "erase everything".

No other device can complete a TCP connection from this computer's own address (the reply
is delivered locally, and sequence numbers are random, RFC 6528), so that address can be
believed. It cannot where something on the same computer relays connections without a
forwarding header (a reverse proxy, `socat`, `rinetd`, an SSH tunnel, a relaying VPN, a
rootless container network): make it send `X-Forwarded-For`, or start Outpost with
`OUTPOST_OWN_ADDRESS_IS_LOCAL=false`. In a container (detected from
`OUTPOST_IN_CONTAINER`, `/.dockerenv`, `/run/.containerenv`, the `container` variable,
`KUBERNETES_SERVICE_HOST`, or engine paths in `/proc/self/cgroup` or `/proc/self/mountinfo`)
only loopback and LAN-access-off count; so in Docker with LAN access on, erasing needs
`OUTPOST_ALLOW_REMOTE_ERASE=true`. The same rule guards the HTTPS key upload and the backup
passphrase.

It is not authentication: anyone at the computer can erase. Where Settings and Storage say
an action is "offered here because", they name the rule ("connected from its own address
192.168.1.232", "from its loopback address", "Outpost is not open to the network"); a phone
that sees its own address there has found a set-up the rule does not fit
([reverse proxies](deployment.md#behind-a-reverse-proxy)).

### No telemetry

Outpost sends no usage data and makes no outbound request unless a person starts one of
the actions in [offline.md](offline.md#what-needs-a-connection). Every connection the
server opens:

| What starts it | Where it goes |
| --- | --- |
| Catalogue **Refresh**, adding or downloading an entry, installing a pack | `opds.library.kiwix.org`; the manifests' `downloadHosts` and the public mirrors they redirect to |
| Map regions; place names | `build-metadata.protomaps.dev`, `build.protomaps.com` or the `maps.tileSource` / `maps.terrainSource` archives (terrain `download.mapterhorn.com` unless changed); `download.geonames.org` |
| Place names for Great Britain | `api.os.uk`, then its redirect to `omseprd1stdstordownload.blob.core.windows.net` only, checked against the MD5 `api.os.uk` gives |
| Satellite imagery and aerial photographs | The fixed hosts under [Downloads](#downloads-the-ssrf-guard) |
| Find a route | The declared route sources |
| Reference layers | The hosts under [Reference layers](#reference-layers) |
| Saving a link or web page | The address's host and its redirects |
| **Get the list** for a repeater source | The source's host |
| Weather **Update now**; climate averages | `api.open-meteo.com`, `www.metoffice.gov.uk`, `environment.data.gov.uk`; `power.larc.nasa.gov`, `re.jrc.ec.europa.eu` |
| **Fetch alerts** | `www.gdacs.org`, `earthquake.usgs.gov`; one of `feeds.meteoalarm.org`, `api.weather.gov`, `api.weather.gc.ca`, `alerts.metservice.com`, `www.data.jma.go.jp` |
| HF conditions; a newer solar cycle table | `services.swpc.noaa.gov` (`OUTPOST_SOLAR_TABLE_URL`) |
| VOACAP coefficients; P.533 maps | `raw.githubusercontent.com` |
| **Build the P.533 engine** | `raw.githubusercontent.com`, `github.com`, `release-assets.githubusercontent.com` |
| **Fetch the registry from the IEEE** | `standards-oui.ieee.org` (`OUTPOST_IEEE_OUI_URL`) |
| Satellites: **Get orbital elements**; **Read about it on Wikipedia** | `celestrak.org`, `db.satnogs.org`; `en.wikipedia.org`, sent the satellite's names |
| A portable drive for another kind of computer | `nodejs.org`, `download.kiwix.org` |
| Answers, Chat, **Test**, **Look for Ollama**, model lists | `answers.endpoint`; `127.0.0.1:11434`, `host.docker.internal:11434` |
| Indexing new passages with an embedding server; **Test** | `search.semantic.endpoint` |
| **Scan** under Devices on this network | Private addresses on the computer's networks |
| Connecting or listing a share; on a Mac, reconnecting a remembered one at start and every five minutes | The file server's checked private address |
| Reference pages; starting the server | kiwix-serve on this computer |
| The mesh radio link, while set up | The household's MQTT broker or MeshCore radio at the address typed; a serial radio in `/dev` |

Each is started by a `POST`, except the `GET`s under
[Requests from other sites](#requests-from-other-sites). Three run without a press at the
moment, because a person set them up: indexing new passages (contacts, places and catalogue
entries included), reconnecting a remembered share, and the mesh link reconnecting. A
download running at shutdown resumes at start.

## Network shares

On a Mac run directly, Storage can connect an SMB share. **Anyone who can open Outpost can
use this.**

- **Home network only**: the server must resolve to `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, `169.254.0.0/16`, `fc00::/7` or `fe80::/10`, and Outpost connects to
  the address it checked. (Loopback only with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.)
- **Strict names**, and no shell: programs run with `execFile` and fixed paths; what you
  typed reaches the mount helper as data on standard input.
- **The password is never kept or shown** (database, files, logs, errors, process
  arguments). If you ask, it is remembered in your login Keychain as "Outpost network
  share", and read there by the helper when reconnecting.
- **Wrong passwords are held back**: after five for one user on one server, tries are
  refused for a minute, doubling to an hour, counted by the server's address. This stops
  guessing through Outpost and locking you out of the NAS.
- **A sign-in is checked, never borrowed**: Outpost checks the password itself and makes
  macOS sign in afresh, because macOS otherwise reuses an existing sign-in.
- **Listing shares** uses Outpost's own SMB client on the checked address (only an NTLMv2
  response goes on the wire); every field of the reply is checked.
- **Already connected** lists only volumes inside a storage root. No prompts on the Mac;
  time limits on every program; disconnects are never forced.

It does not protect against others on your network connecting or disconnecting shares
with credentials they know (they cannot read a remembered password back); other programs
running as you asking `osascript` for the Keychain item (turn **Remember the password** off
if that matters); tampering with the share list on a hostile network (Outpost does not
check the server's signatures; the mount itself is macOS's); or a server that lets guests
in.

In Docker and on Linux, Outpost does not connect shares; it writes out instructions without
asking for the password. `NAS_USER` and `NAS_PASSWORD` in the Compose examples are read by
Docker and not passed into the container. Keep `.env`, or the credentials file in
`/etc/fstab`, readable only by you ([storage.md](storage.md#connecting-a-network-share)).

## Hardening advice

1. **Leave LAN access off unless you need it**, and only on a network where you trust
   everyone.
2. **Never expose Outpost to the internet.** Do not forward its port; use a VPN. A reverse
   proxy is safe only if it requires sign-in
   ([deployment.md](deployment.md#behind-a-reverse-proxy)).
3. **Back up** to somewhere other than the device. If backups sit on a NAS, shared folder or
   travelling drive, set a backup passphrase and keep it written down elsewhere.
4. **Encrypt drives that leave the house** (BitLocker, FileVault, LUKS, VeraCrypt). Outpost
   does not encrypt anything at rest.
5. **Protect the data directory.** It holds the database and, with HTTPS on, keys your
   devices trust (`tls/`). On a shared computer make it readable only by Outpost's account.
6. **Keep Outpost updated**, and kiwix-serve at the version in `compose.yaml`.
7. **Add catalogue manifests only from people you trust**: a manifest decides which hosts
   downloads may start from.

The project's checks are run before a change is accepted
([CONTRIBUTING.md](../CONTRIBUTING.md)); the browser test suite fails if the app tries to
reach any other host.
