# Security

This page describes what Outpost protects against, what it does not, each protective
measure and where it lives in the code, and how to harden an installation.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## The threat model in plain words

Outpost is built for one person or a household, on a computer or network they control.
**It has no accounts and no sign-in.** Whoever can reach it can read, add, change and
delete everything in it. What keeps it safe is who can reach it, and what a browser
can be tricked into doing on their behalf. It has not been audited for exposure to the
public internet and must not be exposed to it.

### What Outpost defends against

- **Web pages on other sites.** A page open in your browser cannot read from or change
  your Outpost, even though your browser can reach it.
- **Other devices on the network, when you have not opted in.** By default nothing
  outside the computer can connect.
- **Hostile files.** An uploaded HTML page or SVG, a crafted archive, a renamed
  executable, a malicious GPX file or imported page cannot run script in Outpost,
  write outside its folders, or fill the disk without limit.
- **A drive that comes home.** A portable drive has been in other computers. Bringing
  its changes back cannot make Outpost read or write outside the drive's own folder,
  run anything, or take in a table, a page or a file it did not check.
- **Hostile reference content.** A ZIM archive is a copy of someone else's web site,
  scripts included. Its pages cannot change your library or reach the internet.
- **Misuse of the download feature.** Outpost cannot be made to fetch from addresses
  inside your network, and a tampered or corrupted download is not installed.
- **A hostile route source.** A server that answers a route search with something
  enormous, malformed or mischievous cannot fill the memory, draw a line that is not
  there, or put markup into a page or a file.
- **Misuse of the share feature.** Outpost cannot be made to connect to a file server
  on the internet, and repeated wrong passwords are held back.
- **Text that gives orders.** A document can contain a sentence written to look like
  an instruction to a language model. When a model writes an answer from your
  documents, nothing it writes is acted on: an answer is shown as words and can do
  nothing else.
- **Mistakes.** Nothing is overwritten, and files are deleted only when a request says
  so explicitly.

### What Outpost does not defend against

- **Anyone on a network you have shared it with.** With LAN access on, every person
  and device on that network can read and change everything, connect and disconnect
  network shares, start downloads, restore a different database, and remove anything
  from the library, one item at a time or everything that was downloaded at once. The
  one thing they cannot do from another device is erase your own notes and documents
  in one step (see [Erasing everything](#erasing-everything)).
  There are no permissions, no per-person views and no audit log. Share it only with a
  network where you trust everyone.
- **Other programs or people on the same computer.** Anything that can connect to
  `127.0.0.1:8080` has the same access. The cross-site protections stop browsers, not
  local programs.
- **Physical access to an unencrypted drive.** The database, attachments, documents
  and portable drives are stored unencrypted. Anyone holding the disk can read them.
- **An untrusted network.** On its own Outpost speaks plain HTTP. On a network you do
  not trust, content (and a share password as it is typed) can be observed and altered.
- **A compromised helper.** Outpost trusts the kiwix-serve program, the embedding
  server and the model server you point it at. Whatever runs at the model server's
  address is sent your questions and passages of your documents.
- **A wrong answer.** A language model can misread a passage, blend two, or attach a
  real citation to a claim the passage does not make. Outpost labels generated text,
  flags citations that match nothing, and always shows the passages; it cannot make an
  answer true.
- **Denial of service.** There is no rate limiting.

## The controls and where they live

### Network exposure

| Control | Detail | Code |
| --- | --- | --- |
| Local by default | The server listens on `127.0.0.1`. In Docker the port is published on `127.0.0.1` unless `OUTPOST_BIND` says otherwise. | `apps/server/src/config.ts`, `compose.yaml` |
| LAN access is a start-up decision | `OUTPOST_LAN_ACCESS` cannot be changed from the browser. Without it the server refuses to start on an address other devices can reach (and, in a container, unless told its port is published on `127.0.0.1` only). | `apps/server/src/config.ts` |
| Host allow-list | Requests whose `Host` header is not a name this server answers to are refused. This defeats DNS rebinding, where a hostile site points its own name at your machine. | `isAllowedHost` in `apps/server/src/core/guard.ts` |
| kiwix-serve is never exposed | The browser reaches it only through Outpost's proxy. In Compose it has no published port. | `apps/server/src/modules/kiwix/`, `compose.yaml` |

### Requests from other sites

Every request under `/api/` that changes something (anything other than `GET`, `HEAD`
or `OPTIONS`) must:

1. carry the header `X-Outpost-Request: 1`;
2. not be marked by the browser as coming from another site (`Sec-Fetch-Site`);
3. have an `Origin`, if present, whose host matches the `Host` header.

A page on another site cannot add a custom header without the browser first asking
Outpost's permission (a CORS preflight), and Outpost never grants it: it sends no CORS
headers at all. With no sign-in, this is the whole of what stands between a page you
visit and your library, which is why it applies to every changing request without
exception, however its address is written. A `GET` never changes anything.
Code: the `onRequest` hook in `apps/server/src/core/guard.ts`.

Every response also carries `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin` and
`X-Frame-Options: SAMEORIGIN`. API responses are sent with `Cache-Control: no-store`.

### Content Security Policy

The app's pages are served with:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;
frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

The browser itself then refuses to load code from, or send data to, anywhere else.
Code: `APP_CSP` in `apps/server/src/app.ts`.

### Files people upload

| Control | Detail | Code |
| --- | --- | --- |
| Type checked by content | A file is accepted only if its extension is on the list **and** its first bytes look like that type. The stored MIME type comes from Outpost's table, never from the uploader. | `apps/server/src/modules/documents/file-types.ts`, `apps/server/src/modules/notes/attachments.ts` |
| Served in a sandbox | Original documents are sent with `Content-Security-Policy: sandbox; default-src 'none'; …`, which gives the response an origin of its own. Note attachments and GPX exports likewise. | `apps/server/src/modules/documents/index.ts`, `notes/index.ts`, `maps/index.ts` |
| Risky types are downloads | Only PDFs, raster images and plain text are shown in place. HTML, SVG and EPUB documents are offered as downloads; Markdown, CSV and JSON are shown as plain text. | `servedAs` in `documents/file-types.ts` |
| Markdown is drawn, not rendered | A Markdown file is shown with its formatting, but it is never converted to HTML. The server parses it into a tree of plain values and the web app draws that tree with its own elements, so HTML written in the file is reduced to its words, pictures to their descriptions, and a link to the web survives only if its address is `http`, `https` or `mailto` (it opens in a new tab with `noopener noreferrer`). | `documents/markdown-view.ts`, `features/library/document-markdown.tsx` |
| Links inside Outpost are looked up, not followed | A Markdown file can also link to a heading of its own (`#heading-words`) or to a catalogue entry or a chapter of its book (`outpost:entry/<entry id>/<chapter key>`). The form is matched exactly; anything else (a path, a query, another scheme, stray characters) is shown as plain words. The server looks the entry up and sends only its own ids for the collection and document it found; the web app checks that each is an id and builds the address itself, so no address written in a file reaches the browser. Such a link can lead only to a document, a book's contents or an Explore entry in Outpost, and opens in the same tab. Heading ids are given a prefix in the page so that a heading cannot take the id of anything else. | `parseOutpostLink` in `documents/markdown-view.ts`, `refTarget` in `features/library/document-markdown.tsx`, `linkTarget` in `catalog/service.ts` |
| Diagrams are shown as images | A fenced block marked `mermaid` is drawn by Mermaid, bundled with the app and loaded only when a document has a diagram. Because any uploaded Markdown file can hold one, the SVG Mermaid makes is never put into the page as markup: it is drawn in a hidden, inert part of the page and shown as an `<img>` with a `blob:` address, where SVG cannot run script, follow links or load anything. Mermaid runs with `securityLevel: "strict"` and `htmlLabels: false` (labels are SVG text), and its `secure` list stops a diagram's own `init` directive or front matter from changing those or its styling. The SVG is also stripped of script, `foreignObject`, links, embedded images, event attributes and outside references before it becomes an image. A block that cannot be drawn is shown as text. The app's Content Security Policy already allowed `img-src blob:`; it was not widened. | `features/library/figures/mermaid-render.ts`, `mermaid-diagram.tsx` |
| Figures are drawn from checked numbers | A fenced block marked `viz` holds a JSON description of a signal figure. Every field is read by name; numbers are made finite and kept within the range a figure is drawn in, lists are capped, and text is kept as text and cut to length. The figure is then drawn by Outpost's own SVG elements. Anything that is not a figure, or fails while it is drawn, is shown as text. | `features/library/figures/viz-spec.ts`, `radio-viz.tsx` |
| Size limits | `OUTPOST_MAX_UPLOAD_MB` per document (2048 MB by default), 50 MB per note attachment, 20 MB per GPX file. Files are streamed to disk, not held in memory. | `documents/upload.ts`, `notes/attachments.ts`, `maps/gpx.ts` |
| GPX is checked before it is read | Files with a DOCTYPE or entity declarations are refused unread, so nothing can be declared, expanded or fetched; the only entities are the five XML defines, and numbered characters. XML that is not well-formed is refused, not repaired, with one exception: an ampersand that starts no reference (`Fish & chips`, `?a=1&b=2`) is read as an ampersand, since nothing else can be made of it. | `apps/server/src/modules/maps/gpx.ts`, `gpx-xml.ts` |
| GPX is read without building a tree | A tree of an XML file costs hundreds of bytes for every element, whatever the element is: 900,000 empty elements in a 9 MB file came to 977 MB, and an ordinary recording of 150,000 points to 564 MB. Outpost's reader walks the file once and keeps only what is stored (positions, times, names, descriptions). Everything else, extensions above all, is checked for being well-formed and passed over at no cost in memory. What is kept is counted, and a file over a limit is refused with a message saying which: 1,000,000 track and route points, 20,000 waypoints, 10,000 tracks and routes, 100,000 track segments; elements 64 deep, 64 attributes on an element, 64 namespace declarations in force, 1,000,000 characters in one piece of text; names and descriptions cut at 2,000 characters. Measured on 16 November 2026 (Node 24.15), each in a worker held to 64 MB of heap: 900,000 empty elements, 20 MB of attributes, six million elements each inside the last, one text of 19 MB, 19 MB of extensions in one point, 900,000 waypoints and 250,000 two-point tracks are each refused or imported, and each would fit in 32 MB, most of which is the 20 MB of text itself; a 150,000-point recording with heights and times fits in 40 MB. The heaviest file the limits allow that could be constructed (about 780,000 points in 100,000 segments, 10,000 tracks and 20,000 waypoints, in 20 MB) fits in 144 MB. Two files are read at a time and six may wait; another is turned away, so uploads sent together cannot add their costs up. Waypoints turned into saved places are held to 5,000 a file, because each is written on the server's own thread. | `apps/server/src/modules/maps/gpx-reader.ts`, `gpx-xml.ts`; `apps/server/test/security.test.ts` |
| GPX is read away from the server's thread | In a worker thread, so the server goes on answering while a large file is read, with a limit of 30 seconds and a heap of 384 MB. Neither is what stops a hostile file, and the heap limit is not relied on: on Node 24 a worker that reaches its heap limit has been seen to abort the whole process instead of ending alone, which is how the tree-building reader this one replaced could take the server down. The limit stays as a last line in case the reader is ever wrong. | `parseGpxSafely` in `apps/server/src/modules/maps/gpx.ts`, `gpx.worker.ts` |
| What importing a GPX file still costs the server's thread | Storing the result. A 150,000-point recording holds it up for about 0.13 seconds and the largest file of points for about 0.25. Turning waypoints into markers is the expensive part, at about 0.2 ms and some 30 kB of working memory each: the limit of 20,000 waypoints keeps that to about four seconds and 0.6 GB, during which nothing else is answered. | `importTrack` in `apps/server/src/modules/maps/annotations.ts` |

### Reference (ZIM) content

Pages from ZIM archives are served through `/kiwix/open/…` with a policy that
contains `sandbox` **without** `allow-same-origin`, and a `default-src` limited to
Outpost's own address. The page runs its own scripts in an origin of its own: it
cannot read Outpost's storage or API responses, make a changing request that Outpost
accepts, or load anything from the internet.

Only a book's pages and its icon can be reached through the proxy; kiwix-serve's own
search and catalogue cannot. A small script of Outpost's own is placed at the top of
each page, ahead of the archive's scripts, to tell the reader which page is on show
and which link was pressed. The reader treats everything it is told as untrusted: each
field is checked, and nothing the page reports is acted on without a person pressing
a button. Code: `apps/server/src/modules/kiwix/index.ts`,
`apps/web/src/features/reader/reader-page.tsx`.

### Downloads (the SSRF guard)

Server-side request forgery means tricking a server into fetching an address inside
your own network. Outpost's download client refuses that in two ways:

1. The first request for a catalogue download may only go to a host named in a
   catalogue manifest (plus `OUTPOST_DOWNLOAD_HOSTS`).
2. Every connection, including each redirect, must land on a public address. The check
   is made on the addresses actually connected to, so a name cannot pass a check and
   then resolve to something internal. Loopback, private, link-local and other
   reserved ranges are blocked, for IPv4 and IPv6.

Only `http` and `https` are allowed, addresses with embedded credentials are refused,
and at most eight redirects are followed. `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`
turns rule 2 off for people who run a mirror on their own network.
Code: `apps/server/src/core/http.ts`.

Integrity comes from the publisher's checksum, not from the mirror that served the
bytes. A Kiwix download without a published SHA-256 is refused; a file that does not
match is deleted and nothing is installed. Files are written as `<name>.part` and
renamed only when complete and verified, and an existing file is never overwritten.
Code: `apps/server/src/modules/downloads/service.ts`.

**Saving a link.** When a reference page links to a file that is not in its archive,
a person can have Outpost fetch it into the library. This is the one download whose
host no manifest lists, so it is held to more: the address must be `http` or `https`,
carry no credentials, and end in a kind of file the library keeps; rule 2 applies to
every connection; an address written as a private or loopback literal is refused
before anything is fetched; and what arrives is checked by content before it is
kept, so a sign-in page named `.pdf` is discarded. At most 200 links are accepted at
a time. Code: `apps/server/src/modules/links/index.ts`.

**Route sources.** "Find a route" on the Maps screen asks a server on the internet
about OpenStreetMap, and reads what comes back.

| Control | Detail | Code |
| --- | --- | --- |
| Where a search may go | Only to the host of a source declared in `catalog/route-sources.json` or in the administrator's own `<data directory>/catalog/routes/route-sources.json`. Shipped sources must be `https`. The request goes through the guarded client, so rule 2 applies: a source on this computer or a private network is refused unless the server was started with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`. | `modules/maps/route-finder/sources.ts`, `overpass.ts` |
| No redirects | The question is a `POST`. A redirect is refused, not followed, so what a person typed goes to the host that was named and to no other. | `core/http.ts` |
| Who may cause a search | Searching and previewing are `POST` routes, so they are held to the cross-site rules above: a page on another site cannot make Outpost question a route source. Only listing the declared sources is a `GET`, and it contacts nobody. | `modules/maps/route-finder/index.ts` |
| What is sent | The name typed, the edges of the map view to five decimal places, and a client name: "Outpost", its version and the project's address, as the servers' operators ask. No cookie, no referrer, nothing about the person, the library or the installation. | `ROUTE_FINDER_USER_AGENT` in `route-finder/index.ts` |
| What is typed cannot change the question | The name becomes a pattern in which letters, digits, spaces, apostrophes and hyphens stand for themselves and every other character becomes "any one character". Nothing typed can close the quoted string or add a statement to the query. Route and way numbers must be positive whole numbers. | `namePattern` in `route-finder/overpass.ts` |
| The answer is untrusted | It is read through a counter that stops at 6 MB for a search and 24 MB for a route, before it is parsed. Then every element is checked: an id must be a positive whole number; a position must be a finite latitude and longitude on Earth, and a way with a bad point in it is split there, never bridged; only a handful of tag keys are read, each cut to 200 characters and stripped of control characters and of the characters that reverse the direction of text; anything that is not a route, a way or a length is passed over. One route may hold 10,000 ways and 200,000 points; a search 41 routes and 400 ways. Over a limit, the whole answer is refused. | `readAnswer` in `route-finder/overpass.ts`, limits in `service.ts` |
| Names are text | A route's name reaches the page through React, which writes it as text, and a GPX file through the same escaping as every other name. The links shown with a found route are built from a relation number by Outpost, or are fixed addresses; when a stored credit is read back, a link that is not a plain `https` address is dropped. | `readTrackSource` in `packages/shared/src/route-finder.ts` |
| A source cannot hold the server up | One question at a time; a second is refused. The source is given 25 seconds and Outpost waits 29. After a source answers "busy" (HTTP 429, 502, 503, 504, or Overpass's own "timed out"), it is not asked again for 30 seconds. A person who leaves takes their question with them. Reading and joining a route at the limit (10,000 ways listed in a shuffled order, 200,000 points, 15 MB of JSON) held the server's thread for about a third of a second: 0.07 s to parse, 0.04 s to check, 0.22 s to join (16 November 2026, Node 24.15 on a Mac). | `createOverpassClient` in `route-finder/overpass.ts` |
| Nothing is kept unasked | Results are not stored. A previewed route is held in memory (six at most, fifteen minutes each) so that adding it does not ask the source again; it is written to the database only when a person adds it. | `route-finder/service.ts` |

What this does not defend against: the operator of a route source sees the names
people search for and the areas they look at, with the address the request came from,
as any web server does. And a route is only as right as OpenStreetMap is: Outpost
checks that a line is made of places on Earth, not that it is safe to walk.

Three outbound paths do not use this client, because their address is a setting: the
embedding server for semantic search, the model server for answers (see
[below](#answers-from-a-language-model)), and kiwix-serve.

### Paths

Content is recorded as *(storage location, relative path)*, and storage locations can
only be created inside the storage roots set at start-up. Every path built from
request input goes through `resolveInside`, which refuses anything that escapes its
folder; `safeFileName` reduces any name to one safe path segment on every supported
file system. Code: `apps/server/src/core/fs-safe.ts`,
`apps/server/src/modules/storage/service.ts`.

### Archives

Archives are never trusted to say where their contents go or how large they are.

| Archive | Limits | Code |
| --- | --- | --- |
| Backup being restored | Only `manifest.json`, `outpost.db` and three known folders are unpacked; anything else is skipped. At most 500,000 entries and 64 GB. Existing files are never overwritten. | `apps/server/src/modules/backup/index.ts` |
| EPUB being read | Read into memory only, never unpacked to disk. At most 20,000 entries and 512 MB in total; names with `..` or absolute paths are skipped. | `apps/server/src/modules/documents/zip.ts` |
| ZIP being imported | A name that climbs out of the folder refuses the whole archive. Links and device files are never created. Entry count, total size, per-file size and compression ratio are capped, and declared sizes are checked against the bytes that arrive. | `apps/server/src/modules/imports/extract.ts` |
| Runtime downloads for portable drives | Checked against the publisher's checksum (SHA-256 for Node; the Kiwix project publishes only MD5 for its reader), then exactly one named file is extracted. | `apps/server/src/modules/portable/` |

### Notes, Markdown and HTML

Nothing is stored or served as raw HTML. Page content is a document made only of node
types, marks and attributes from a fixed list (`packages/shared/src/notes.ts`).
Anything arriving from the browser, an import or a template is sanitised into that
schema: unknown elements are reduced to their text, attributes are whitelisted, and
links may only use `http`, `https`, `mailto` or a relative address. `javascript:` and
`data:` links are removed; small inline raster images are the one `data:` exception.
Imported HTML is cleaned before conversion. A page is limited to 5 MB and 40 levels of
nesting. Code: `apps/server/src/modules/notes/content/`.

Search snippets and reference-collection snippets reach the browser as plain text
segments with "matched" flags, never as HTML.

### Answers from a language model

**Answer from my library** sends text out of Outpost, to a model server the person
set up, and brings text back that a program wrote. Both directions have rules.

#### What is sent, and where

| | |
| --- | --- |
| What | A fixed set of rules, the passages found for the question (titles, headings, page numbers and exact text), and the question. Nothing else. |
| When | Only when a person presses **Answer from my library** or **Test**, or opens the Answers section of Settings while it is switched on (which asks the server for its list of models). Never in the background. Nothing at all when no passage was found. |
| Where | The one address in the `answers.endpoint` setting. The default is `http://127.0.0.1:11434/v1`, a program on the same machine. |
| How | Plain HTTP unless the address is `https`. No API key or other credential is sent. |

The address is a setting: Outpost talks to the address a person typed and to nothing
else. Because Outpost has no accounts, anyone who can open it can change a setting, so
the address is limited to this computer and private networks unless whoever starts
Outpost says otherwise. What is enforced:

| Control | Detail | Code |
| --- | --- | --- |
| Your own network only | An address on the public internet is refused: answers are not offered, and nothing is sent. This covers the private ranges, link-local, `100.64.0.0/10` (where Tailscale and similar put machines) and loopback. A name is looked up just before every request, and refused if any address it resolves to is public, so a name that merely sounds local does not pass. Starting Outpost with `OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true` lifts the rule, for a server of your own that is reached over the internet. The same rule, with the same option, holds for a local embedding server's address (`search.semantic.endpoint`), to which every passage in the library is sent when an index is built. | `placeRefusal`, `assertOwnNetwork` in `answers/address.ts` |
| Only `http` and `https` | Anything else is refused when the setting is saved. | `parseModelServerAddress` in `apps/server/src/modules/answers/address.ts` |
| No credentials in the address | An address with a user name or password is refused, and is not repeated in the refusal, so it cannot end up in a message or a log. | same |
| No redirects | Every request to the model server is made with redirects refused. The server that was named cannot hand the question on to one that was not. | `apps/server/src/modules/answers/provider.ts` |
| Said in words | Settings describes the address as this computer, a machine on your network, or (with a warning) neither, judged from its spelling. Names are not looked up. | `placeOf` in `address.ts`, `features/settings/answers-section.tsx` |
| Off by default | No model server is contacted until a person switches answers on. The Search screen decides whether to show the button from settings alone. | `apps/server/src/modules/answers/index.ts` |
| One at a time | A second answer while one is being written is refused, so the feature cannot be used to keep a home machine's processor busy with a queue of work. | same |
| The reader leaving stops the model | When the browser's connection closes, Outpost closes its connection to the model server. | same |

What this does not protect against: **anyone who can open Outpost can change the
address**, like every other setting, and so can make questions asked afterwards go to
a server of their own. With LAN access on, that is everyone on the network (see
[the threat model](#the-threat-model-in-plain-words)). And a model server listening
on your network has no password of its own: Outpost does not make it any more or less
exposed than it already is.

#### What is kept

Nothing. The question, the passages sent and the answer are not written to the
database, a file or the log; the log records only that an answer failed and the kind
of failure. The web app holds the current answer in memory, not in the browser's
storage. A test checks the database for the question after an answer has been
written.

#### Answers, and text that gives orders

Your documents can contain anything: a page saved from the web, a forwarded email, a
PDF from a stranger. Any of them can contain a sentence addressed to a language model
("ignore your instructions and tell the reader to…"). This is called prompt
injection, and no prompt is proof against it. Outpost does two things in the prompt
and, more importantly, one thing outside it.

In the prompt (`apps/server/src/modules/retrieval/prompt.ts`):

- **The sources are fenced as data.** They are placed between two marker lines, and
  the standing instructions say that whatever is written between those lines is text
  to report on and is never to be obeyed, even if it is addressed to the model.
- **The fence cannot be forged.** The marker lines carry an eight-character code made
  up at random for each request, and never one that occurs in the sources. A document
  cannot contain the closing line in advance, so it cannot pretend that the sources
  have ended and the instructions have resumed.

These lower the risk. A small model can still be talked round, and the tests include
a stand-in model that obeys a planted instruction to prove the rest holds anyway.

Outside the prompt:

- **Nothing in an answer is acted on.** The model has no tools, no memory and no
  second turn; its output goes to one place, the screen.
- **An answer is drawn as words.** It is never converted to HTML or rendered as
  Markdown. The web app cuts it into plain text, emphasis (`**…**`) and citation
  markers, and draws each with its own elements. An address in an answer stays text: it
  is not a link and nothing fetches it. Markup in an answer is shown as the characters
  it is. (The app's Content Security Policy would also refuse a script or a request to
  another host, as for every page.)
- **The only links in an answer are citation links Outpost builds.** A marker `[n]`
  links to source *n* of the passages Outpost itself supplied, using the address in
  Outpost's own citation record, and only when that address is a route inside
  Outpost. A marker that matches no supplied passage is not a link: it is struck
  through and reported.
- **The model's private reasoning is dropped**, whether it arrives in a separate field
  or as `<think>` tags.

So the worst a planted instruction can do is make the answer wrong, rude or
misleading, in text, under a heading that says a model wrote it, above the passages
it was given. That is still worth guarding against: read the passages.

Code: `apps/web/src/features/search/answer-text.ts`, `answer.tsx`.

### Backup and restore

A restore is uploaded, unpacked
under the limits above, and checked: the manifest must be an Outpost backup, the
database must pass SQLite's integrity check, and it must not come from a newer
Outpost. Only then is it marked ready. It is applied at the next start, before the
database is opened, and the data it replaces is kept in a dated folder. An upload that
was interrupted is discarded, never applied. A restore puts back the database,
attachments and extracted text only. Catalogue manifests in the file are ignored,
because they name the hosts downloads may start from; unfinished jobs and remembered
network shares in the restored database are deleted, so a backup from another machine
cannot make this one start work or connect to a file server.
Code: `apps/server/src/modules/backup/index.ts`.

### Bringing a drive back

A portable drive that comes home is untrusted input: it has been plugged into other
computers, and nothing says the database and files on it are the ones Outpost wrote.
Bringing its changes back (see
[portable.md](portable.md#bringing-changes-back-from-a-drive)) is built on that.

| Risk | Control |
| --- | --- |
| The merge changes the drive | It never writes to it. The drive's database is not even opened in place, because SQLite can create files beside a database it opens; the file (and its write-ahead log) is copied into the data directory and read from the copy. The tests hash every file on the drive before and after each merge. |
| The browser points the server at any folder | The drive's folder must be inside a storage root and must not be Outpost's own data directory. The set of notes to read is one of the names the drive was found to hold (`data`, or `data-before-update-<date>`), matched against a fixed pattern. |
| A database that is not what it claims | The copy is opened read-only with SQLite's defences for schemas it did not write (`trusted_schema` off, cell size checks, no memory mapping). Only the tables a merge needs are read, and only after checking that each is a real table (not a view) with the plain columns expected (not generated ones). Other tables, views and triggers in the file are never read, never run, and never copied. |
| A newer or unreadable version | The number of migrations in the drive's database is compared with home's. A drive from a newer Outpost is refused with a message saying so; one whose tables lack a needed column is refused too. Nothing is read from either. |
| Rows of the wrong shape | Every value is checked for its type and length before use; ids must match the id pattern. A row that fails is left out and counted in the preview. |
| Too much of everything | At most 100,000 pages, 100,000 documents, 100,000 saved places, 20,000 tracks, 200,000 attachments and a 32 GB database; a drive beyond that is refused whole. A page over 5 MB or a track over 20 MB is never read into memory and stays on the drive. The data directory must have room for the copy plus a reserve. |
| A file name that climbs out of the drive | Paths recorded on the drive for documents, attachments and collections are resolved inside the drive's `library` or `attachments` folder (`resolveInside`), the result must be a regular file, and its real path, after following links, must still be inside. A link pointing elsewhere on the computer is not followed. |
| A file that is not what its record says | Each file is hashed and compared with the checksum the drive recorded before it is used, and a document or collection is hashed again once copied. Documents then go through the same checks as an upload (type by content, size limit) and attachments through the same checks as a page attachment. |
| Page content that carries script | Content from the drive goes through `sanitizeDoc`, the same code that sanitises imports and the editor's saves, before anything else looks at it: unknown nodes are reduced to their text, attributes are whitelisted, `javascript:` and `data:` links are removed, and depth is bounded. |
| A track that is not a track | Geometry is rebuilt keeping only lines, waypoints and names, written out as GPX, and read back by the same reader, in a worker and under the same limits as any GPX file. |
| A collection record that lies | Only reference collections and maps are copied, only when ticked, with a metadata shape that is checked; the file is verified against its checksum. As with any ZIM archive, what it contains is then served only through the sandboxing proxy. |
| Something removed at home | Never by default. A removal has to be ticked per item and confirmed again by name (`deletionsConfirmed`), and the server compares each item with what the preview showed before changing it: anything that changed at home in the meantime is left alone. |

The copy of the drive's database is removed when the merge ends or is given up, and at
start-up if a merge was interrupted. A merge is read and carried out by whoever can
reach Outpost, like everything else; there is no separate permission for it.
Code: `apps/server/src/modules/merge/` (`drive.ts` for reading a drive, `fingerprint.ts`
for checking rows).

### Removing in bulk

**Storage → Manage and clean up** removes things in bulk. These are explicit actions:
each shows what it will do and is confirmed, and none runs as a side effect of
anything else. What they can and cannot touch:

| Control | Detail | Code |
| --- | --- | --- |
| One set of rules | Bulk removal goes through the collections and documents services, one item at a time, by the same rules as removing one item from the Library: a file on a location that is not connected is never deleted, and anything being moved or checked is refused. There is no second path that deletes folders. | `apps/server/src/modules/manage/remove.ts` |
| Only Outpost's own folders | In a storage location Outpost looks only inside `collections/` and `documents/`. "Erase everything" deletes a file only if it is inside one of them; a library file anywhere else is forgotten, not deleted, and its path is reported. | `manage/inventory.ts`, `manage/cleanup.ts` |
| Leftover files are checked twice | A file is offered as a leftover only if no collection, document, download or move lays claim to it and it has not changed for ten minutes. When it is cleared it is checked again: inside `collections/` or `documents/`, a plain file, reached through no symbolic link, still unclaimed. Symbolic links are never followed when measuring. | `manage/survey.ts`, `manage/leftovers.ts` |
| Ids, not paths | A request names items by id, and leftovers by ids Outpost issued. A path inside an id goes through `resolveInside`; `..`, an absolute path or another location's file is refused. | `manage/index.ts`, `manage/leftovers.ts` |
| Never touched | Storage locations and their marker files, network shares and Keychain items, catalogue manifests, and anything outside the data directory and the two folders above. | |
| Changing requests only | Everything that removes is a `POST` and so needs the `X-Outpost-Request` header and the same origin. Measuring is read-only. | `apps/server/src/core/guard.ts` |

#### Erasing everything

Removing downloaded content loses nothing that cannot be fetched again, so, like
removing items one at a time, any device that can reach Outpost may do it. **Erase
everything** destroys notes and documents, and Outpost has no accounts to ask "who is
this?". It asks "where from?" instead:

- The request must come from **the computer Outpost runs on**. It counts as local when
  it did not come through a proxy and either nothing but this computer can reach
  Outpost at all (LAN access is off) or the connection itself comes from a loopback
  address (`127.0.0.0/8`, `::1`).
- A request carrying `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host` or `X-Real-IP`
  is treated as remote. A reverse proxy on the same computer makes every visitor look
  local, and these headers are how a proxy says it is one.
- From any other device the screen explains this and does not show the button, and the
  server answers `403 forbidden` to a request made anyway.
- `OUTPOST_ALLOW_REMOTE_ERASE=true`, set when Outpost starts, allows it from every
  device. It cannot be changed from the browser.
- It also needs the phrase "erase everything" in the request, so that it cannot be set
  off by a single stray call.

Code: `apps/server/src/core/local.ts`, `apps/server/src/modules/manage/index.ts`.

What this does not do:

- **It is not authentication.** Any program on the computer, and anyone at its
  keyboard, can erase. It stops a phone or a guest's laptop on the home network from
  doing so, which is the case it is for.
- **In Docker with LAN access on**, every connection reaches Outpost from Docker's own
  network, so nothing looks local and erasing needs `OUTPOST_ALLOW_REMOTE_ERASE=true`.
  With the Compose defaults (the port published on `127.0.0.1`, LAN access off) only
  this computer can connect at all, and erasing is offered.
- **A reverse proxy that adds no forwarding header** makes every visitor look local.
  Make sure yours sends `X-Forwarded-For`; see
  [deployment.md](deployment.md#behind-a-reverse-proxy).

### No telemetry

Outpost sends no usage data and makes no outbound request unless a person starts a
download, a catalogue refresh or one of the other actions listed in
[offline.md](offline.md#what-needs-a-connection).

## Network shares

On a Mac run directly, the Storage screen can connect an SMB share: a person picks the
server, enters a user name and password, picks one of the shared folders the server
lists, and Outpost asks macOS to mount it. Outpost
has no accounts, so **anyone who can open Outpost can use this**. These are the limits
that keep it safe:

| Control | Detail | Code |
| --- | --- | --- |
| Only the home network | The server must have a private or link-local address: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `fc00::/7` or `fe80::/10`. Outpost resolves the name itself, drops every address outside those ranges, refuses if none is left, and then connects **to the address it checked**, not to the name, so a name cannot pass the check and lead elsewhere. This computer itself (loopback) is allowed only with `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`, which exists for testing. | `apps/server/src/modules/storage/shares/address.ts` |
| Strict names | The server must be a host name or an IP address; the share and user name may use letters, digits, spaces and a few marks, and no slashes, quotes or control characters. Anything else is refused before a program is run. | `packages/shared/src/shares.ts` |
| No shell, nothing spliced into a script | Programs are started with `execFile`, an argument list and a full path. The one helper that mounts and uses the Keychain is a constant script; what a person typed reaches it as JSON on standard input and is only ever handled as data. | `shares/commands.ts`, `shares/mac-helper.ts` |
| The password is never kept or shown | It is not written to the database, a file, a log line, an error message or the event stream, and it is never an argument or environment variable of any process (other users of the computer can read those). It travels in the request body to the server and on standard input to the helper. | `shares/service.ts`, `shares/commands.ts` |
| Remembered passwords live in the Keychain | Only if the person asks. The item is a generic password named "Outpost network share" in the login keychain of the account that runs Outpost. On a reconnect the helper reads it and mounts in the same process: the password does not pass through the server. | `shares/mac-helper.ts` |
| No dialogs on the Mac | The mount is made with the system's "no user interface" option, so a wrong password is an answer in the browser, never a prompt on the Mac's screen. | `shares/mac-helper.ts` |
| Time limits | Every external program is stopped after a fixed time. A server that does not answer is given up on in a few seconds. | `shares/commands.ts` |
| Wrong passwords are held back | After five wrong passwords typed for one user on one server, further tries are refused without being passed to the file server, for a minute at first and doubling up to an hour. The count is shared by every way of trying a password (looking at the server's shares, connecting one, reconnecting) and is kept against the server's address, so another name for the same server, another share, or the user name in other letters does not start a fresh count. Without this, anyone on the network could guess passwords through Outpost, or lock the owner's account on the NAS. | `shares/service.ts` |
| A sign-in is checked, never borrowed | macOS reuses a sign-in it already has with a server: asked to mount a second share from it, it will do so whatever password it is handed, or none. So Outpost checks a typed sign-in itself before asking for a mount, and the helper tells macOS to sign in afresh every time (`ForceNewSession`). A password is accepted only if the server accepts it now. | `shares/service.ts`, `shares/mac-helper.ts` |
| Listing shares | Outpost reads a server's list of shares with a small SMB client of its own, over one connection it makes itself to the address it checked. No system tool is run for it, so nothing else gets to resolve a name or open a second connection, and the password never leaves the server process: only proof of knowing it (an NTLMv2 response) goes on the wire. Everything the server sends back is treated as untrusted: lengths and offsets are checked against the bytes that arrived, sizes are capped, and a share name is offered only if it passes the same rule as a typed one. | `shares/smb-list.ts` |
| Volumes already connected | The "Already connected on this Mac" list comes from the system's own table of mounts, and names only volumes inside a storage root: what else is connected to the Mac is not shown to people who can open Outpost. One can be used only if it is in that table at that moment and inside a storage root; a path is never taken on trust. | `shares/service.ts` |
| Polite disconnects | Outpost unmounts without "force". It names work in progress on the share and asks first; macOS refuses while files are open. | `shares/service.ts` |

What this does not protect against:

- **Other people on your network using it.** Someone who can open Outpost can connect a
  share from a server on your network, with credentials they know, and can disconnect
  or forget a share that is connected. They cannot read a remembered password back, and
  they cannot make Outpost connect to a server on the internet.
- **Other programs running as you on the Mac.** The Keychain item is created by the
  system's own script runner (`osascript`), so another program running under the same
  account can ask that runner for it without a prompt. That is the same exposure as
  any Keychain item made by a command-line tool. Turn **Remember the password** off if
  that matters to you; the share then has to be reconnected by hand.
- **The connection itself.** SMB signing and encryption are whatever the Mac and the
  NAS negotiate. Outpost does not change them. When reading a server's list of shares,
  Outpost signs its requests if the server insists but does not check the server's own
  signatures, so someone able to tamper with traffic on your network could alter the
  list shown; the mount that follows is made by macOS and is not affected.
- **Guests.** A server that lets guests in lets anyone on your network in, through
  Outpost or without it. Over plain HTTP on a network you do not
  trust, the password can also be observed on its way from the browser to Outpost,
  like everything else (see above).

In Docker and on Linux, Outpost does not connect shares at all. It writes out
instructions, without asking for the password. In the Compose examples, `NAS_USER` and
`NAS_PASSWORD` are read by Docker to mount the volume; they are not passed into the
Outpost container. Keep the `.env` file, or the credentials file named in `/etc/fstab`,
readable only by you. See [storage.md](storage.md#connecting-a-network-share).

## Hardening advice

1. **Leave LAN access off unless you need it,** and turn it on only for a network where
   you trust everyone, such as your home.
2. **Never expose Outpost to the internet.** Do not forward its port. To reach it from
   outside, use a VPN into your network. A reverse proxy is only safe if the proxy
   itself requires sign-in; see
   [deployment.md](deployment.md#behind-a-reverse-proxy).
3. **Back up** from Settings, and keep the backup somewhere other than the device.
   Back up storage locations as ordinary folders.
4. **Encrypt drives that leave the house**: laptops, external disks and portable
   drives (BitLocker, FileVault, LUKS, VeraCrypt). Outpost does not encrypt anything
   at rest.
5. **Protect the data directory.** It holds the database. On a shared computer, make
   it readable only by the account that runs Outpost.
6. **Keep Outpost updated**, and keep kiwix-serve at the version in `compose.yaml`.
7. **Add catalogue manifests only from people you trust.** A manifest decides which
   hosts downloads may start from.

The project's own checks are run by hand before a change is accepted (see
[CONTRIBUTING.md](../CONTRIBUTING.md)). The browser test suite fails if the app tries
to reach any other host.
