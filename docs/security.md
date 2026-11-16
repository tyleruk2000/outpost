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
- **Hostile files.** An uploaded HTML page or SVG, a crafted archive, an EPUB book, a
  renamed executable, a malicious GPX file or imported page cannot run script in Outpost,
  write outside its folders, or fill the disk without limit.
- **Hostile web pages.** A page someone saves from the web cannot run script in
  Outpost, load anything when it is opened, hold up the server while it is read, or
  be used to reach into your network.
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
  network shares, start downloads, download a backup of your notes, and remove anything
  from the library, one item at a time or everything that was downloaded at once. What
  they cannot do from another device is erase your own notes and documents in one step
  (see [Erasing everything](#erasing-everything)), replace them all by restoring a
  backup, or delete the backups kept on a storage location (see
  [Backup and restore](#backup-and-restore)).
  There are no permissions, no per-person views and no audit log. Share it only with a
  network where you trust everyone.
- **Reading other people's details.** Contacts are information about other people, and
  they are no more private than anything else here: everyone who can open Outpost can
  read, change and export every contact, in a browser or, if that is turned on, in a
  contacts app. See [Contacts](#contacts).
- **Other programs or people on the same computer.** Anything that can connect to
  `127.0.0.1:8080` has the same access. The cross-site protections stop browsers, not
  local programs.
- **Physical access to an unencrypted drive.** The database, attachments, documents
  and portable drives are stored unencrypted. Anyone holding the disk can read them.
  The exception is what a person has encrypted themselves: an encrypted page of notes is
  ciphertext wherever it is copied (see [Encryption](#encryption) for exactly what that
  covers).
- **A phone that holds kept copies.** Pages, routes, places and map areas a person
  chose to keep on a phone sit in that phone's browser storage, protected only by the
  phone's own lock and encryption. Anyone who can open that browser can read them, with
  or without the server. See [What is kept in the browser](#what-is-kept-in-the-browser).
- **An untrusted network.** On its own Outpost speaks plain HTTP. On a network you do
  not trust, content (and a share password as it is typed) can be observed and altered.
  [HTTPS on the home network](#https-on-the-home-network) protects a device that
  trusts Outpost's certificate and uses the `https` address; the `http` address stays
  open beside it.
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

### HTTPS on the home network

Optional, off by default, turned on in **Settings → HTTPS on your network**. Its
purpose is to give a home network a secure address, which browsers require for
location, service workers and the like, without a public domain or the internet. How to
use it is in [deployment.md](deployment.md#https-on-your-network). It does not add
accounts: everyone who can reach Outpost can still use all of it, over either address.

| Control | Detail | Code |
| --- | --- | --- |
| A second listener, the same handler | HTTPS answers on its own port (`OUTPOST_HTTPS_PORT`, 8443) on the address the HTTP server listens on. Each request is handed to the HTTP server's own handler, so the Host check, the `X-Outpost-Request` rule, the origin checks, the security headers and the Content Security Policy are the same code on both. TLS 1.2 or later; HTTP/1.1 only. | `startListener` in `apps/server/src/modules/https/service.ts` |
| No lock-in | Nothing redirects HTTP to HTTPS and no `Strict-Transport-Security` header is sent, so a device that does not trust the certificate, or a day when the certificate is wrong, never locks anyone out of the `http` address. A test asserts the header is absent on both. | `apps/server/test/https.test.ts` |
| An authority of its own, per installation | Made on this server the first time HTTPS is turned on: RSA 3072, SHA-256, valid ten years. Nothing is shared between installations and nothing is fetched. | `createAuthority` in `modules/https/certificates.ts` |
| The authority is limited | Critical name constraints permit only private and loopback address blocks, names under `local`, `lan`, `home`, `internal`, `home.arpa` and `localhost`, and the one-word host names known when it was made. Path length 0: it cannot make further authorities. Key usage is certificate signing only; extended key usage is server authentication only. Outpost itself refuses to sign for anything outside the limits. | `PRIVATE_BLOCKS`, `PRIVATE_SUFFIXES` in `modules/https/names.ts`; `permitsName` |
| The server certificate | ECDSA P-256, signed with SHA-256, 398 days from start to end, a new key each time. The names are in the subject alternative name; it carries the server-authentication usage. That meets Apple's published requirements for certificates from a root a person adds (SHA-2, names in the SAN, the `serverAuth` usage, 825 days or fewer; RSA keys of 2048 bits or more). Re-issued when the server's addresses change or 30 days before it runs out. | `issueServerCertificate`; `ensureCertificates` in `service.ts` |
| Where the keys are | `tls/` in the data directory, mode `0700`, with `ca.key` and `server.key` at `0600` (on Windows these modes mean nothing; protect the folder yourself). They are not encrypted: the server has to sign a new certificate unattended when its address changes. The folder is not one of those a backup, a portable drive or erase-everything touches. | `modules/https/store.ts` |
| No route serves a key | The only thing read from `tls/` for a browser is the authority's public certificate (`GET /api/https/outpost-authority.crt`). A test asks for the keys by a list of guessed addresses over both listeners, and checks the backup archive. | `modules/https/index.ts`, `apps/server/test/https.test.ts` |
| Certificates are checked before use | Outpost lays certificates out itself (Node cannot write one) and has Node sign them. Each one is then read back by Node and its signature, issuer and kind verified before it is saved or served. | `certificates.ts` |
| Who may do what | Turning HTTPS on or off and listing another name are ordinary settings, open to every device: neither breaks anything that cannot be put back. Replacing or deleting the authority stops every device that trusted it from trusting Outpost, so those two are accepted only from the computer Outpost runs on, on the same terms as [erasing everything](#erasing-everything), including the `OUTPOST_ALLOW_REMOTE_ERASE` option. An authority that cannot be read is reported, never silently replaced. | `authorityRight` in `modules/https/index.ts`, `core/local.ts` |

#### What trusting the certificate means

A device that trusts the authority will believe any server holding a certificate the
authority signed. Only this server has the authority's key, so in practice that is this
Outpost. The risk is the key being copied: by someone with access to the data
directory, or from a disk that leaves the house. Whoever has it can sign certificates
of their own, and what those are good for depends on whether the device holds the
authority to the limits written into it:

| Where | Holds the authority to its limits? | How this is known |
| --- | --- | --- |
| iPhone, iPad, Mac (Safari and apps using the system's TLS; macOS 10.15 onwards by Apple's source, and by inference the iOS of the same year, iOS 13) | Yes | Apple's published source sets the permitted names from a trusted root's own constraints ([`SecPolicyServer.c`](https://github.com/apple-oss-distributions/Security/blob/main/trust/trustd/SecPolicyServer.c)). Checked here on macOS 15.6: `security verify-cert` accepts Outpost's chain and refuses a certificate for `www.example.com` or `8.8.8.8` signed by the same key. Not tried on an iPhone or iPad. |
| Chrome and Edge on Windows, macOS and Linux, version 112 onwards | Yes | Chromium's policy note for [EnforceLocalAnchorConstraintsEnabled](https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Miscellaneous/EnforceLocalAnchorConstraintsEnabled.yaml): "Starting in Google Chrome 112, such constraints in certificates loaded from the platform certificate store will now be enforced." Microsoft says the same of [Edge 112](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/enforcelocalanchorconstraintsenabled). Not tried. |
| Firefox on a computer | Yes | Its certificate code checks the name constraints of every issuer, roots included (`pkixbuild.cpp`); an [independent test](https://alexsci.com/blog/name-non-constraint/) found the same on Firefox 108. Not tried. |
| Chrome on Android | No | Chromium's source adds roots a person installed on Android as plain trust anchors, without the flag that enforces constraints (`net/cert/internal/trust_store_android.cc`). Read from source, not tried. |
| Android itself (other apps that opt in to user certificates) | No | Conscrypt builds its trust anchors with no name constraints (`new TrustAnchor(cert, null)`), and Chromium's own tests expect Android to accept a certificate outside a root's constraints. Read from source, not tried. |
| Windows itself (programs other than Edge and Chrome), Firefox for Android | Not known | No primary source found. |

So on Apple devices and in desktop browsers, a copied key is good only for addresses on
a private network and local names: someone already on your network could pass off
another device on it, or this Outpost, as genuine. On an Android phone that trusts the
authority, a copied key is good for any site, to someone in a position to intercept
that phone's traffic. The answer in both cases is the same: keep the data directory
private, and if the key may have been copied, make a new authority (Settings, at the
computer Outpost runs on) and remove the old certificate from each device.

Other things to know:

- **The certificate is fetched over plain HTTP** the first time, on the network you are
  trying to protect. Someone on that network at that moment could hand over a
  certificate of their own. Settings shows the authority's SHA-256 fingerprint so it can
  be compared with what the device shows before trusting it; download it at the
  computer Outpost runs on and carry it over if you cannot trust the network even once.
- **Browsers apply fewer rules to a root a person adds** than to public ones: Chrome
  does not ask for Certificate Transparency or apply its lifetime limits
  ([Chromium, certificate lifetimes](https://chromium.googlesource.com/chromium/src/+/main/net/docs/certificate_lifetimes.md)),
  and Apple's 398-day limit "will not affect certificates issued from user-added or
  administrator-added Root CAs" ([Apple, 102028](https://support.apple.com/en-us/102028)),
  while its 825-day limit and the rest of
  [its requirements](https://support.apple.com/en-us/103769) apply.
- **The purpose limit on the authority** (server authentication only) is honoured by
  Chrome, Edge and Firefox and ignored by Apple devices and Android, by the same
  sources as above.
- **Apple's documentation names RSA keys** for a certificate a person installs, and no
  iPhone was available to try another kind, which is why the authority's key is RSA.
- **HTTPS does not hide Outpost.** The plain address answers as before, to everyone who
  could reach it before.

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
The one set of routes outside `/api/` that is not the web app's own files is the
address book for phones, which cannot change anything by any method; see
[Contacts](#the-address-book-for-phones-carddav).
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

### What is kept in the browser

Over HTTPS (or on the computer itself) the app registers a service worker, `/sw.js`,
so that it opens when the server is out of reach, and lets a person keep chosen things
in the browser. The reasons and the behaviour are in
[offline.md](offline.md#a-phone-out-of-reach-of-the-server); what matters here:

- **What the worker may answer for is a short, fixed list**, in
  `apps/web/src/sw/rules.ts`, with tests beside it. A page of the app is always asked
  of the server first. The app's own fingerprinted files are answered from the copy
  installed with the build. Under `/api/` only three kinds of address are ever answered
  from a cache, and only when a person kept the thing and the server does not answer:
  `/api/attachments/…`, `/api/maps/tiles/…` and `/api/maps/terrain/…`. Nothing under
  `/kiwix/` is touched, so reference content never enters the app's origin through a
  cache. Requests that change anything are never touched.
- **The worker never writes to a cache after it is installed.** Kept copies are written
  by the page, from answers the server gave to ordinary same-origin `GET` requests, and
  only when a person pressed "Keep" or a kept copy is being brought up to date.
- **A kept copy is never sent back.** Out of reach the app is read-only. There is no
  queue of changes and no sync, so a stale copy on a phone cannot overwrite anything.
- **The worker script is served with its own policy,** `default-src 'self';
  connect-src 'self'`, and `Cache-Control: no-cache` (`apps/server/src/app.ts`). It can
  reach nothing but this server, and a browser always sees a new one.
- **Kept copies are as private as the phone.** They are stored unencrypted in the
  browser's profile. They hold what the person chose: the text and pictures of the
  pages, the lines of the routes, the saved places with their notes. There are no
  accounts, so nothing on the phone is any more private than it is on the server; it
  has simply left the house. "On this phone" says this where things are listed, and
  removes copies.
- **A kept upload cannot run in the app's origin.** Attachments are files people
  uploaded, and the server sends them with `Content-Security-Policy: sandbox`. A kept
  copy is filed with the same headers, and the worker never answers with a kept copy
  when the address is opened as a page or in a frame: only as a picture or a file
  inside a page that is already drawn.

### Files people upload

| Control | Detail | Code |
| --- | --- | --- |
| Type checked by content | A file is accepted only if its extension is on the list **and** its first bytes look like that type. The stored MIME type comes from Outpost's table, never from the uploader. | `apps/server/src/modules/documents/file-types.ts`, `apps/server/src/modules/notes/attachments.ts` |
| Served in a sandbox | Original documents are sent with `Content-Security-Policy: sandbox; default-src 'none'; …`, which gives the response an origin of its own. Note attachments and GPX exports likewise. | `apps/server/src/modules/documents/index.ts`, `notes/index.ts`, `maps/index.ts` |
| Risky types are downloads | Only PDFs, raster images and plain text are shown in place. HTML, SVG and EPUB documents are offered as downloads; Markdown, CSV and JSON are shown as plain text. | `servedAs` in `documents/file-types.ts` |
| Markdown is drawn, not rendered | A Markdown file is shown with its formatting, but it is never converted to HTML. The server parses it into a tree of plain values and the web app draws that tree with its own elements, so HTML written in the file is reduced to its words, pictures to their descriptions, and a link to the web survives only if its address is `http`, `https` or `mailto` (it opens in a new tab with `noopener noreferrer`). | `documents/markdown-view.ts`, `features/library/document-markdown.tsx` |
| Pictures a Markdown file carries are checked and served by Outpost | The one picture a Markdown document shows is one the file itself holds, in its closing lines, under a label of the form `outpost-picture-<number>` (a saved web page keeps its pictures this way). A picture written any other way, at a web address or as a `data:` address in the text, is still only described, and nothing is ever loaded from another site. The tree sent to the browser carries the picture's number and nothing else; the web app builds the address from the document's id and that number, both checked. The server decodes the picture, looks at its first bytes, and sends it only if it is a PNG, JPEG, GIF or WebP image, with the type those bytes show (never the type the file claims, and never SVG), `nosniff`, and the same sandbox policy as an original file. Only the closing run of such lines counts, so a line of the same shape quoted in the middle of a file is text. The lines are megabytes long, so they are never given to the Markdown parser: the text is read without them, and a picture is read from its place in the file, at most 12 MB of encoded data. A file ending in millions of empty lines is looked through for at most 12,000 lines. | `documents/embedded-pictures.ts`, `documents/index.ts`; `apps/server/test/documents-embedded-pictures.test.ts` |
| Links inside Outpost are looked up, not followed | A Markdown file can also link to a heading of its own (`#heading-words`) or to a catalogue entry or a chapter of its book (`outpost:entry/<entry id>/<chapter key>`). The form is matched exactly; anything else (a path, a query, another scheme, stray characters) is shown as plain words. The server looks the entry up and sends only its own ids for the collection and document it found; the web app checks that each is an id and builds the address itself, so no address written in a file reaches the browser. Such a link can lead only to a document, a book's contents or an Explore entry in Outpost, and opens in the same tab. Heading ids are given a prefix in the page so that a heading cannot take the id of anything else. | `parseOutpostLink` in `documents/markdown-view.ts`, `refTarget` in `features/library/document-markdown.tsx`, `linkTarget` in `catalog/service.ts` |
| An EPUB is drawn, not rendered | A book's chapters are XHTML pages with their own styles and sometimes scripts. None of that reaches the browser. The server parses a chapter and reads it into the same tree of plain values as a Markdown file, naming every element it keeps; an element it does not name keeps its words and nothing else, and no attribute is copied across. The book's stylesheets, fonts, scripts, forms, frames, audio and video are never sent, in any form. The original file is still only ever a download. | `documents/epub-view.ts`, `features/library/document-markdown.tsx`; `apps/server/test/documents-epub-reader.test.ts` |
| Links and pictures in a book are looked up | A link survives as one of three things: a web or mail address (`http`, `https`, `mailto`), opened in a new tab with `noopener noreferrer`; a place in the same chapter, kept only if the chapter has that id; or another chapter of the same book, sent as its number in the reading order. Everything else (`javascript:`, `data:`, `file:`, a path that leaves the archive) is shown as its words. A picture is sent as its path inside the archive, and only when the archive holds that file; a picture on the web is never fetched, and its description stands in. The web app checks each number, id and path again and builds every address itself; ids from a book are given a prefix in the page, so they cannot take the id of anything else. | `lookupsFor` in `documents/epub-reader.ts`, `features/library/epub-data.ts` |
| Pictures from a book are checked by content | `GET /api/documents/:id/epub/file` takes a path inside the archive. The path must already be in its simplest form, relative, with no `..`, backslash, NUL or scheme, and must name an entry the archive reader listed (it never lists an entry whose own name climbs out). The entry is read into memory, at most 16 MB, and sent only if its bytes are a PNG, JPEG, GIF, WebP or SVG, under the type the bytes say with `nosniff`; a chapter, the package file, a font or a page named `.png` is refused. Every response carries `Content-Security-Policy: sandbox; default-src 'none'; …`. | `archivePath`, `pictureType` in `documents/epub-reader.ts` |
| SVG from a book is never able to act | As elsewhere in Outpost, an SVG is not trusted. A drawing from a book is sent as a download with the sandbox policy, so the only way it is seen is through an `<img>`, where a browser runs no script and loads nothing for it; opened directly it is a file to save. On top of that, a drawing that holds a `script` or `foreignObject` element, an event-handler attribute, a `javascript:` address or declared entities is refused outright. That scan is a second line: it looks for the plain forms, and the sandbox and the `<img>` are what the guarantee rests on. Drawings written into a chapter (inline SVG) are not drawn at all. | `ACTIVE_SVG` in `documents/epub-reader.ts`, `drawing` in `documents/epub-view.ts` |
| A hostile book costs a bounded amount | The archive limits apply (20,000 entries, 512 MB read per opening, declared and real sizes both checked, encrypted entries refused) and nothing is ever unpacked to disk. On top of them: 2,000 chapters; 2 MB and 120,000 tags for a chapter, since every element costs memory whatever it holds; a chapter nested too deeply to walk is refused rather than read; 4 MB for the package file and the table of contents; 5,000 lines of contents. A chapter is parsed in one go on the server's thread (as a Markdown file is), so two are never in memory being parsed at once. A book that breaks a limit is explained to the person in words; the server carries on. | `documents/epub-reader.ts`, `epub-package.ts`, `zip.ts` |
| Copy protection is not touched | A book with a rights file, or an `encryption.xml` covering anything but obfuscated fonts, is not opened by the reader and its text is not read for search. Nothing in Outpost decrypts a book. | `isProtected` in `documents/epub-package.ts` |
| The reading place stays on the device | How far a person has read is kept in the browser's `localStorage` (book id, chapter number, block number), not on the server. It is read back field by field. | `features/library/epub-data.ts` |
| Diagrams are shown as images | A fenced block marked `mermaid` is drawn by Mermaid, bundled with the app and loaded only when a document has a diagram. Because any uploaded Markdown file can hold one, the SVG Mermaid makes is never put into the page as markup: it is drawn in a hidden, inert part of the page and shown as an `<img>` with a `blob:` address, where SVG cannot run script, follow links or load anything. Mermaid runs with `securityLevel: "strict"` and `htmlLabels: false` (labels are SVG text), and its `secure` list stops a diagram's own `init` directive or front matter from changing those or its styling. The SVG is also stripped of script, `foreignObject`, links, embedded images, event attributes and outside references before it becomes an image. A block that cannot be drawn is shown as text. The app's Content Security Policy already allowed `img-src blob:`; it was not widened. | `features/library/figures/mermaid-render.ts`, `mermaid-diagram.tsx` |
| Figures are drawn from checked numbers | A fenced block marked `viz` holds a JSON description of a signal figure. Every field is read by name; numbers are made finite and kept within the range a figure is drawn in, lists are capped, and text is kept as text and cut to length. The figure is then drawn by Outpost's own SVG elements. Anything that is not a figure, or fails while it is drawn, is shown as text. | `features/library/figures/viz-spec.ts`, `radio-viz.tsx` |
| Size limits | `OUTPOST_MAX_UPLOAD_MB` per document (2048 MB by default), 50 MB per note attachment, 20 MB per GPX file. Files are streamed to disk, not held in memory. | `documents/upload.ts`, `notes/attachments.ts`, `maps/gpx.ts` |
| A repeater list is read as text and kept as values | `POST /api/repeaters/import` takes one CSV file of at most 16 MB and 100,000 rows, read in memory and never written to disk. It is parsed by `csv-parse` as rows of text, a few hundred at a time so that a large file does not hold the server up; a file with control characters at its start is refused as not being text. Every value is read into a number, one of a fixed set of words, or a string cut to a length, and stored in columns; nothing from the file is run, fetched or used as a path, and the web app draws every value as text. Two imports cannot run at once. An exported CSV is sent as a download with the same sandbox policy as other files, and a text cell that starts with `=`, `+`, `-` or `@` is written with an apostrophe before it, so that a spreadsheet does not take a callsign or a note from somebody else's list as a formula. | `apps/server/src/modules/repeaters/formats.ts`, `export.ts`, `index.ts`; `apps/server/test/repeaters.test.ts` |
| GPX is checked before it is read | Files with a DOCTYPE or entity declarations are refused unread, so nothing can be declared, expanded or fetched; the only entities are the five XML defines, and numbered characters. XML that is not well-formed is refused, not repaired, with one exception: an ampersand that starts no reference (`Fish & chips`, `?a=1&b=2`) is read as an ampersand, since nothing else can be made of it. | `apps/server/src/modules/maps/gpx.ts`, `gpx-xml.ts` |
| GPX is read without building a tree | A tree of an XML file costs hundreds of bytes for every element, whatever the element is: 900,000 empty elements in a 9 MB file came to 977 MB, and an ordinary recording of 150,000 points to 564 MB. Outpost's reader walks the file once and keeps only what is stored (positions, times, names, descriptions). Everything else, extensions above all, is checked for being well-formed and passed over at no cost in memory. What is kept is counted, and a file over a limit is refused with a message saying which: 1,000,000 track and route points, 20,000 waypoints, 10,000 tracks and routes, 100,000 track segments; elements 64 deep, 64 attributes on an element, 64 namespace declarations in force, 1,000,000 characters in one piece of text; names and descriptions cut at 2,000 characters. Measured on 16 November 2026 (Node 24.15), each in a worker held to 64 MB of heap: 900,000 empty elements, 20 MB of attributes, six million elements each inside the last, one text of 19 MB, 19 MB of extensions in one point, 900,000 waypoints and 250,000 two-point tracks are each refused or imported, and each would fit in 32 MB, most of which is the 20 MB of text itself; a 150,000-point recording with heights and times fits in 40 MB. The heaviest file the limits allow that could be constructed (about 780,000 points in 100,000 segments, 10,000 tracks and 20,000 waypoints, in 20 MB) fits in 144 MB. Two files are read at a time and six may wait; another is turned away, so uploads sent together cannot add their costs up. Waypoints turned into saved places are held to 5,000 a file, because each is written on the server's own thread. | `apps/server/src/modules/maps/gpx-reader.ts`, `gpx-xml.ts`; `apps/server/test/security.test.ts` |
| GPX is read away from the server's thread | In a worker thread, so the server goes on answering while a large file is read, with a limit of 30 seconds and a heap of 384 MB. Neither is what stops a hostile file, and the heap limit is not relied on: on Node 24 a worker that reaches its heap limit has been seen to abort the whole process instead of ending alone, which is how the tree-building reader this one replaced could take the server down. The limit stays as a last line in case the reader is ever wrong. | `parseGpxSafely` in `apps/server/src/modules/maps/gpx.ts`, `gpx.worker.ts` |
| A recording made on the map is an upload like any other | `PUT /api/maps/recordings/:id` takes GPX the browser built from a recording. It is not trusted for that: it goes through the same checks, the same reader in the same worker, and the same limits as an imported file, and is then held to what a recording is (tracks only, a time at every point, at most 150,000 points). The id in the address is chosen by the device and becomes the track's id, so it is held to 26 characters of the alphabet the server's own ids use, and a track that exists under it is never changed: the request answers with what is there. Until it is saved, a recording is kept in the browser's own storage for Outpost's address (IndexedDB), where anyone using that browser profile can read where its owner walked; nothing of it is sent anywhere but to Outpost. | `saveRecording` in `apps/server/src/modules/maps/annotations.ts`; `apps/web/src/features/maps/recording/`; `apps/server/test/maps-recording.test.ts` |
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

**What the sandbox costs, and what was done about it.** A page without an origin of
its own is refused storage by the browser: `indexedDB.open` and `localStorage` throw.
An archive whose page needs storage to draw itself therefore draws nothing. This was
seen with the Post Disaster Resource Library, made with openZIM's nautilus: its page
builds its list of 108 documents in IndexedDB (through PouchDB) from a script,
`database.js`. In the sandbox the first thing its script does, opening that database
(`new PouchDB(…)`), throws `SecurityError: Failed to execute 'open' on 'IDBFactory':
access to the Indexed Database API is denied in this context`, and nothing after it
runs: `database.js` is never asked for. Seen in Chromium on 16 November 2026, with the
archive's page opened under Outpost's policy and again inside the reader's frame.

The sandbox was not loosened. Three ways round it were weighed:

- *Adding `allow-same-origin`.* Refused. It would give every archive's scripts
  Outpost's own origin, and with it the API: the reason the sandbox exists.
- *Giving archive pages a stand-in for storage*, by having the script Outpost adds to
  each page define an `indexedDB` that lives in memory. Not done: PouchDB needs a full
  IndexedDB (stores, indexes, cursors, transactions), which means shipping a library
  of that size into every archive page, and the result would be the archive's list in
  the archive's layout, rebuilt on every visit, with none of it known to Outpost's
  viewer, library or search.
- *Serving archives from a second origin*, where storage would work and
  `allow-same-origin` would be harmless. Not done: Outpost is one address and one
  port, reached by IP address on a home network where there are no subdomains to be
  had, so a second origin is a second port, to be opened, mapped in Docker, put behind
  a proxy and documented. It may yet be worth it for archives that are whole
  applications; it is too much for a list.

What was done instead is to read the list on the server and draw it in the reader.
The list is JavaScript from an archive of unknown origin, so:

| Control | Detail | Code |
| --- | --- | --- |
| The list is never run | `database.js` is fetched as bytes and read by a parser written for it. It accepts `var DATABASE = [ … ];` where each value is a string in single or double quotes, a plain decimal number, an array, or an object with quoted names, and nothing else: no identifier, call, operator, comment, template string, regular expression or second statement. Anything else refuses the whole file. Nothing from the archive is passed to `eval`, `Function`, `JSON.parse` or a script engine. | `apps/server/src/modules/kiwix/literal.ts` |
| Names cannot reach into the server | Objects are read into `Map`s, so an entry named `__proto__`, `constructor` or `toString` is a name like any other. | same |
| Size is bounded before and after reading | The file is refused over 4 MB, by its declared length or by the bytes that arrive. Values may sit six deep and number a million. At most 20,000 documents are kept, 50 files to a document; a title or author is cut at 300 characters, a description at 2,000, and a file whose name is over 500 characters is left out. Measured on 16 November 2026 (Node 24.15, Apple M2 Max), files of the full 4 MB built to be slow to read took at most 0.15 seconds, on the server's own thread: one string, 16 ms; a million numbers, 80 ms; a string made only of escapes, 145 ms; 322,000 smallest entries, 138 ms. The real list of 108 documents takes 4 ms. What is read is held in memory and not written anywhere: 12.7 MB for a list of 20,000 documents, and no more than 50,000 documents across all collections, the list used longest ago being let go first. | `literal.ts`, `nautilus.ts`, `document-lists.ts` |
| Every string is text | Titles, authors, descriptions and file names are stripped of control characters and sent as JSON; the reader draws them as text. Nothing from the list is ever put into the page as markup or used as an address without being escaped. | `nautilus.ts`, `apps/web/src/features/reader/document-list.tsx` |
| A file name cannot leave the collection | nautilus stores each file at `files/` followed by its name. A name is refused if it is empty, starts with a slash, holds a backslash, a control character or two dots together, or has an empty or `.` part. The path built from it is then escaped part by part wherever it becomes an address, so `%2e%2e` in a name stays those six characters; the proxy refuses any address holding `..`; and adding a file to the library goes through the same check as any other file inside an archive. The furthest a crafted name can reach is another entry of the same archive. | `nautilusFilePath` in `nautilus.ts`, `parseArchivePath` in `files.ts` |
| Only the page and the list are fetched | To recognise such an archive the server asks kiwix-serve for the book's first page (at most 2 MB is looked at, for the list element and the script tag nautilus writes) and then for `database.js` beside it. Redirects are followed only inside the same book. The archive's scripts are not fetched. | `document-lists.ts`, `followInsideBook` in `files.ts` |
| Files open where archive content always opens | A PDF opens in Outpost's viewer, read through the proxy. A recording or film is given to the browser's own `<audio>` or `<video>` element. Any other kind is a link to the proxy's address that opens in a new tab with `noopener noreferrer`, where the response's `sandbox` policy applies as it does in the frame, so an HTML file posing as a document still runs without Outpost's origin. | `apps/web/src/features/reader/` |

Tested in `apps/server/test/nautilus.test.ts` (hostile and odd lists, path names, the
route, limits), `apps/web/src/features/reader/document-list.test.tsx` and
`e2e/tests/reader.spec.ts`, which also shows the archive's own page being refused
storage inside the frame.

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

**Saving a web page.** A person can paste the address of any page and have Outpost
keep a readable copy (see [notes-and-imports.md](notes-and-imports.md#saving-a-web-page)).
Like saving a link, this fetches from a host no manifest lists, and it reads what
comes back, so it is held to more.

| Control | Detail | Code |
| --- | --- | --- |
| Every request goes through the guarded client | The page and each of its pictures: `http` and `https` only, no credentials in the address, at most eight redirects, and rule 2 on every connection and every redirect, so neither a name that resolves to a private address nor a redirect to one is followed. Nothing in this feature looks names up or decides what is private for itself. An address written as a private or loopback literal, or as `localhost`, is refused before anything is sent, so that the person is told why. A picture whose address is such a literal is not fetched or counted. | `core/http.ts`, `modules/webpages/address.ts`, `fetch.ts` |
| What is sent | `User-Agent: Outpost (self-hosted offline library)`, an `Accept` header naming HTML (or, for a picture, PNG, JPEG, GIF and WebP), and what the HTTP library adds to every request: `Host`, `Connection`, `Accept-Encoding`, `Accept-Language: *` and `Sec-Fetch-Mode`. No cookie, no referrer, no `Authorization`, nothing about the person, the library or the page a picture was found on. There is no cookie jar: a cookie set by a redirect or a page is not sent on the next request. The test suite asserts the exact list of headers on every request. Outpost does not pretend to be a browser. What a site does learn is the address of the computer Outpost runs on, that the page was asked for and when, and the same for each picture's host. | `modules/webpages/fetch.ts`, `pictures.ts`; `apps/server/test/webpages.test.ts` |
| One page per action | The routes take one address. A list of addresses, or any field asking to follow links, is a `400`. Nothing a page links to is fetched: not its stylesheets, scripts, frames, fonts or linked pages, and pictures only from inside the article and only when the request asks. Nothing is scheduled or fetched again later. A save that has waited more than fifteen minutes (a restart, a pause) fails without fetching. One page is saved at a time. | `modules/webpages/index.ts` |
| Limits | 5 MB for the page, counted as it arrives and after decompression (so a small compressed answer that unpacks large is cut off at 5 MB), and 20 seconds; 30 pictures, 5 MB each, 20 MB in all, 20 seconds each and three minutes together. A size the server states is only a reason to stop early. | `fetch.ts`, `pictures.ts` |
| Only a web page is read | The answer must be `text/html` or `application/xhtml+xml` and look like text, or carry no type and begin like HTML. Anything else is refused with what it is. A picture must be a PNG, JPEG, GIF or WebP by its first bytes, whatever its address or its server says; SVG is never fetched. | `assertIsPage` in `fetch.ts`, `pictureTypeOf` in `documents/embedded-pictures.ts` |
| The page is read away from the server's thread | Finding the article means parsing somebody else's HTML into a tree and converting it, which costs time and memory in proportion to the page. It happens in a worker thread that is ended after 20 seconds, one page at a time, with six allowed to wait and another turned away. What bounds memory is the limit on size and a limit of 50,000 elements, counted before the page is parsed: 700,000 empty elements fit in 5 MB, and reading such a page took about 2 GB of memory before it failed. The one long encyclopedia article tried by hand had about 3,000 elements. Nesting too deep to walk is refused. Measured on 16 November 2026 (Node 24.15, Apple M2 Max, the machine busy with other work), each in a process of its own, which uses 130 MB before reading anything: the heaviest pages the limits allow (49,000 elements of table cells, of links, of one-word spans, or spread through 5 MB; and 5 MB of plain paragraphs) took between 0.2 and 1.5 seconds and peaked between 294 and 579 MB. The worker's heap limit of 768 MB is a last line behind those limits and is not relied on (see the note on GPX above). | `modules/webpages/read-page.ts`, `read-host.ts`, `webpage.worker.ts` |
| Shapes the converter is slow at are taken away first | The library that turns HTML into Markdown joins neighbouring pieces of text one pair at a time and looks through the joined text again after each, so its time grows with the square of their number: 4,000 empty `<i>` elements in a row took it 53 seconds, and 16,000 one-word `<span>`s 3 seconds. Before it is given the article, elements with nothing in them are removed, inline elements Markdown has no mark for are opened, and neighbouring text is joined once. The same shapes then take under a second at the element limit. The time limit is what covers any shape not thought of. | `prepare` in `modules/webpages/convert.ts`; `apps/server/test/webpages-readable.test.ts` |
| Nothing of the page can run or load once kept | The article is cleaned with an allow-list before it is converted (scripts, styles, frames, forms, embedded media and every attribute but a link's address and a picture's address and description are dropped), converted to a Markdown tree that has no node for raw HTML, and written as a Markdown file. It is then shown by the Markdown view like any uploaded Markdown file, which is the control that matters: a tree of plain values, links only to `http`, `https` and `mailto` addresses, and no picture but one the file carries. The page's structured description (`application/ld+json`) is read as data for the title, writer and date and is never run. | `modules/webpages/readable.ts`, `convert.ts`, `documents/markdown-view.ts` |
| Nothing is replaced unasked | Saving an address that is already in the library is refused with `409` until the request says to keep both or names the copy to replace. The copy to replace must be a Markdown document recorded as coming from that address **and** whose own file says Outpost saved it from there; a document that merely carries the address as its source is refused. The new copy is added before the old one is deleted. | `modules/webpages/index.ts` |

What this does not defend against: a person saving a page that is itself misleading
(the copy is faithful to what the site sent, and is labelled with where and when); a
site showing Outpost something other than what it shows a browser; and the site, or
anyone on the path to it over plain `http`, seeing that the page was asked for. Like
every route, these are open to anyone who can reach Outpost, so on a shared network
anyone can make it fetch a public page, as they can already start a download.
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
| Names are text | A route's name reaches the page through React, which writes it as text, and a GPX file through the same escaping as every other name. The links shown with a found route are built from a relation number by Outpost, or are fixed addresses. A stored credit is checked again when it is read back, because a route can arrive on a drive that has been elsewhere: its links can only be OpenStreetMap's copyright page, the licence's own page and a relation's page on openstreetmap.org, and a credit with anything else in their place is not shown as a credit. | `readTrackSource` in `packages/shared/src/route-finder.ts` |
| A source cannot hold the server up | One question at a time; a second is refused. The source is given 25 seconds and Outpost waits 29. After a source answers "busy" (HTTP 429, 502, 503, 504, or Overpass's own "timed out"), it is not asked again for 30 seconds. A person who leaves takes their question with them. Reading and joining a route at the limit (10,000 ways listed in a shuffled order, 200,000 points, 15 MB of JSON) held the server's thread for about a third of a second: 0.07 s to parse, 0.04 s to check, 0.22 s to join (16 November 2026, Node 24.15 on a Mac). | `createOverpassClient` in `route-finder/overpass.ts` |
| Nothing is kept unasked | Results are not stored. A previewed route is held in memory (three at most, fifteen minutes each) so that adding it does not ask the source again; it is written to the database only when a person adds it. | `route-finder/service.ts` |

What this does not defend against: the operator of a route source sees the names
people search for and the areas they look at, with the address the request came from,
as any web server does. And a route is only as right as OpenStreetMap is: Outpost
checks that a line is made of places on Earth, not that it is safe to walk.

Three outbound paths do not use this client, because their address is a setting: the
embedding server for semantic search, the model server for answers (see
[below](#answers-from-a-language-model)), and kiwix-serve.

### The HF propagation engine

Predictions are worked out by a third party's program (VOACAP, as the `hfcast`
translation) compiled to WebAssembly, and its inputs come from whoever can reach
Outpost. It is treated as untrusted code doing arithmetic:

- **It has no access to the computer.** A WebAssembly module can only call what it is
  handed. Outpost hands it twelve functions (`modules/propagation/voacap/wasi.ts`) that
  answer from a map of file names to bytes held in memory: the engine's own data files
  and the two antenna files Outpost writes for a request. There is no path from a
  request to a real file: a name that climbs out (`../../etc/hosts`) or is absolute is
  simply not in the map, and nothing can be created or written. Node's own WASI
  support, which would give the module a real folder, is not used.
- **It runs in a worker thread** with a memory limit, away from the HTTP server. A trap
  inside the engine (a Rust panic) ends that copy of it, never the server, and the
  next request gets a fresh copy. A request that gets no answer in a minute ends the
  worker.
- **Its inputs are checked first** (`modules/propagation/index.ts`): positions,
  dates, power, frequency and every antenna figure are held to ranges by zod, and
  antenna files are written by Outpost from those numbers, never from text a person
  supplied. Station names are cut to twenty characters and only ever printed.
- **Its files are checked every time it is loaded**: the engine and all 44 data files
  against SHA-256 checksums recorded when they were built. A file that does not match
  is refused by name and no prediction is made from it.
- **The one outbound request** is fetching a newer solar cycle table from NOAA
  (`services.swpc.noaa.gov`), only when a person presses the button, through the
  download manager and its public-address rule. What arrives is at most 1 MB, parsed as
  JSON and accepted only if every row is a month with a sunspot number between 0 and
  500; anything else is discarded and the table already installed stays in use.

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

### Contacts

Contacts are the one kind of content here that is mostly about people other than the
person keeping it. Nothing about how they are held is different from notes, and that is
the point to be clear about.

**Who can read them.** Everyone who can open Outpost: there are no accounts, so there
is no per-person privacy and no "private" contact. The Contacts screen says this once,
above the list. With LAN access on that is every person and device on the network, who
can also change, delete and export them all as one file (`GET /api/contacts/export.vcf`).

**Where they travel.**

- **Backups** hold them all, unencrypted, like the rest of the database.
- **Portable drives** carry them unless the person turns Contacts off when making the
  drive; a drive is unencrypted. The setting that shares the address book with phones is
  never copied to a drive.
- **Search.** Names, numbers, addresses and notes of contacts are in the search index
  with everything else. If search by meaning is on and set to an embedding server the
  person runs, that text is sent to that server as any other passage is. Contacts are
  **not** among the passages given to a language model for answers: retrieval offers
  only documents and notes.
- **The browser.** A `tel:`, `sms:` or `mailto:` link hands a number or address to
  whatever app the device uses for it. A link kept with a contact opens only if it is a
  web address (`http` or `https`), in a new tab that is told nothing about where it came
  from; anything else a card called a link (`javascript:`, `data:`, `file:`) is shown as
  the text it is.
- **Paper.** The emergency sheet is a list of people and numbers that whoever finds it
  can read.
- **Erasing.** "Erase everything" removes every contact with its tags, links and place
  in search, and compacts the database so that they are not left readable in the file.

**Files from a phone** are untrusted text. The vCard reader
(`apps/server/src/modules/contacts/vcard.ts`) is Outpost's own; it runs nothing,
fetches nothing and follows nothing in a card. Limits: a file of 50 MB and 20,000
cards, 500 properties and 400,000 characters a card, 100,000 characters a line; past a
limit a card is listed as unreadable, or the file is refused, never read in part.
Embedded pictures, sounds and keys are passed over without being decoded. Every value
is kept and shown as text: React escapes it on the screen, and nothing from a contact
is ever written into HTML, a file name on disk or a database statement as text.
A card whose field is longer than Outpost keeps is left out whole and listed, not cut.
A file is read into a preview that changes nothing; the preview is held in memory for
half an hour, at most four at a time, and is gone after a restart.

**Nothing changes a contact but a person.** A change names the version it was made
from and is refused if the contact has changed since. A file adds what is new and
leaves every other contact alone unless the person chooses, contact by contact, to
merge or replace it after seeing the two side by side.

#### The address book for phones (CardDAV)

Off by default. Turned on (`contacts.carddav`, an ordinary setting), Outpost answers
CardDAV clients under `/dav/` and at `/.well-known/carddav`. It is never offered from a
portable drive. Code: `apps/server/src/modules/contacts/dav.ts`.

- **It can be read and cannot be written.** `PUT`, `DELETE`, `POST`, `PATCH`,
  `PROPPATCH`, `MKCOL`, `MOVE` and `COPY` are answered `403` and change nothing. There
  is no code path from these routes to anything that writes. That is what lets them sit
  outside `/api/` without the `X-Outpost-Request` header that every changing request
  under `/api/` must carry: a contacts app cannot send that header, and here there is
  nothing for a page on another site to make a browser change. Such a page cannot read
  the answers either: `PROPFIND` and `REPORT` need a CORS preflight that is never
  approved, and the answer to a plain `GET` is opaque to it.
- **The Host check applies** as everywhere, so a rebinding page's own domain is refused.
- **No user name or password is checked, and none is stored.** A password would protect
  nothing: the same devices can read the same contacts in a browser with none. It would
  only add a secret that a phone might send in the clear over `http`, and a hash to
  keep. A client insists on a user name, so one is given to type (`outpost`); whatever
  is sent in an `Authorization` header is ignored and never written anywhere. The server
  never answers `401`, so a client that behaves never sends a password at all. This is
  not a back door to accounts: there is no credential, so there is nothing to reuse
  elsewhere in the app. The cost is stated on the screen: turning this on lets any
  device that can reach Outpost fetch every contact with a contacts app, which it could
  already do with a browser.
- **Over plain http the contacts cross the network unencrypted,** exactly as they do
  when the Contacts screen is opened at an `http` address. Apple's devices are reported
  to refuse a CardDAV account without TLS; the screen lists `https` addresses first.
- **Request bodies** are read as XML by the strict reader the GPX import uses
  (`maps/gpx-xml.ts`): a DOCTYPE is an error, so no entity is ever declared, expanded
  or fetched, and a body may be at most 2 MB. Addresses of cards in a request are
  matched against one fixed pattern and never used as paths.
- **What is served** is generated from the database for each request. ETags and the
  CTag are hashes of the cards themselves.
- **Not tested with a phone.** It has been tested with a client library (tsdav) and a
  sync program (vdirsyncer) on a computer; see [contacts.md](contacts.md#what-has-been-tested-and-what-has-not).

### Encryption

The Encryption screen and encrypted pages of notes are the one place where Outpost
keeps something from the people who can reach it. Everything else on this page still
applies around them: there are no accounts, and everyone on the network can open every
screen. [encryption.md](encryption.md) describes the feature; this is its model.

#### Where the cryptography runs

In the browser, and only there. A passphrase, an unlocked private key, and the text or
file being encrypted or decrypted never reach the server: not in a request body, not in
an address, not in a log. The server has no OpenPGP library and could not decrypt
anything if asked.

This was chosen because the alternative is worse in exactly the setting Outpost is used
in. If the server did the work, every passphrase and every plaintext would cross the
home network, usually over plain HTTP, and the server would hold unlocked keys in
memory for anyone to ask it to use.

What it costs: browsers allow the cryptography this needs (`crypto.subtle`) only on a
secure origin, which is HTTPS or the computer itself (`localhost`). The library used
here will not even load without it. So on `http://<address>:8080`, keys, text, files
and encrypted pages are **not available**, and the screen says why and points to
Settings, HTTPS on your network. Nothing falls back to the server. Tested in Chromium
against the packaged app.

That refusal is also the honest one. On plain HTTP the page itself arrives unprotected,
and anyone able to alter traffic on the network could change the script before it runs.
Cryptography in such a page protects against someone who only listens, not someone who
interferes, and a person typing the passphrase of their private key cannot tell which
they face.

#### What the server holds

| | Held as | Who can read it |
| --- | --- | --- |
| Public keys | Armoured text in `pgp_keys` | Everyone, which is what a public key is for. |
| A private key, **only if its owner chose "on this device and on Outpost"** | The armoured key, still encrypted under its passphrase | Everyone can download it and guess at its passphrase offline, without limit. |
| Encrypted pages | An OpenPGP message in the page's content | Everyone can download it and guess at its passphrase offline, if it has one. |
| Passphrases, unlocked keys, plaintext | Not held | |
| Which keys a person has checked with their owner | Not held: kept in that person's browser | |

The server enforces the second row itself rather than trusting the browser.
`modules/encryption/packets.ts` reads the packets of every key it is given (the framing
only; it does no cryptography) and refuses:

- anything offered as a public key that contains a secret-key packet, whatever its
  armour says;
- a private key any of whose secret parts is in the clear, is protected by a checksum
  rather than a hash, or uses a passphrase that is not stretched (only iterated and
  Argon2 are accepted);
- a private key filed under a fingerprint that is not its own (the server works the
  fingerprint out from the key, for version 4 and version 6 keys);
- a key in a version, algorithm or form it does not know, since it could not check it.

It fails closed. The tests feed it keys made by OpenPGP.js and by GnuPG, in the clear and
protected, in both encodings of Curve25519, RSA 4096 and version 6, and check that its
fingerprints agree with theirs. Keys are at most 100 kB and there are at most 500.

Because of the second and third rows, a passphrase that protects anything kept on
Outpost has to be strong on its own: at least 20 characters with 10 different ones, or
one that Outpost made at random (80 bits). The private key is locked with the highest
passphrase-stretching count the format allows, but that is repeated SHA-256, which is
fast to compute, so it slows guessing by a constant and no more. "On this device only"
is the default.

#### What the server is not trusted for

The key shelf can be changed by anyone on the network: keys added, replaced, deleted.
So the browser believes nothing about a key except its bytes. Names, fingerprints,
expiry and revocation are worked out from the key itself by the OpenPGP library, and a
key the server files under a fingerprint that is not its own is shown as unreadable.

Whether a key really belongs to the person it names cannot be worked out from anything.
A person establishes it by comparing fingerprints, and their "checked" mark is kept in
their own browser, by fingerprint. A key swapped on the server for another with the
same name has a different fingerprint and shows as not checked. A signature check says
which of the three it is: your own key, a key you checked, or a key that only claims a
name.

Someone on the network can therefore deny (delete your public key from the shelf, or a
private key you kept only there) but cannot read, and cannot make a forged key pass as
checked. Keep a copy of any private key that matters.

#### What is kept in the browser

- **Private keys**, passphrase-protected, in `localStorage`, for keys kept "on this
  device". Anything able to read the browser's storage (the device's owner, another
  person at the same browser profile, malware) gets the protected key and can guess at
  its passphrase.
- **"Checked" marks.**
- **Unlocked keys and decrypted text**: in memory only, never in storage. An unlocked
  key is forgotten 5 minutes after its last use, on leaving the screen, and when the tab
  goes away; an open encrypted page locks itself after 5 idle minutes. JavaScript cannot
  guarantee that memory is wiped, and cannot overwrite a passphrase that was typed.

A person at an unlocked device, or an extension that can read the page, sees whatever is
decrypted on it. Nothing here defends against that.

#### Encrypted pages

An encrypted page is an ordinary page whose whole content is one armoured OpenPGP
message (`encryptedNoteArmor` in `packages/shared/src/encryption.ts`). Its title, icon,
tags, cover, position, dates and the fact of its encryption are plain.

- **Nothing derived from an encrypted page holds its text.** The server keeps no
  preview text, no links and no search passages for it, so there is nothing to embed
  either; the page is indexed by title and tags only.
- **Ciphertext is saved only after it has been proved.** The browser encrypts the page,
  decrypts the result again with the same passphrase or key, and compares it with what
  was written before sending anything (`sealPage`). A failure anywhere leaves the page
  as it was.
- **Text and ciphertext cannot replace each other by accident.** A save from a browser
  that would do either must name the version it was made from, and one that would put
  text over ciphertext must also say so (`removeEncryption`). A tab left open from
  before a page was encrypted cannot write the old text back; it is refused.
- **The replaced text is erased, not just unlinked.** For that one save the database
  overwrites freed pages with zeros, the full-text index removes deleted passages
  instead of marking them, and the write-ahead log is folded in and emptied
  (`scrubbing` in the search service). A test reads the database files afterwards.
- **No pictures or files.** Attachments are separate files served to anyone; a page
  with any cannot be encrypted, and an encrypted page will not take one.

What it does not reach is stated to the person before they confirm, and listed in
[encryption.md](encryption.md#what-happens-to-the-old-text): backups, portable drives,
the record of a merge, exports, a copy kept for offline use, a draft in another tab,
earlier wordings in unused database space until it is compacted, and the disk itself.
Encrypting a page protects it from now on. It does not recall what was already copied.

#### The library

OpenPGP.js 6.3.2, loaded at run time from a file of its own
(`/vendor/openpgp/openpgp.min.mjs`) by the Encryption screen and by encrypted pages, and
by nothing else. It is the file its authors publish, unchanged. It is served from
Outpost's own origin and is covered by the same Content Security Policy as the rest of
the app, which already forbids loading script from anywhere else. Anyone who can write
to the installation's `web/vendor` folder can replace it, as they can replace any other
file of the app.

Outpost's use of the library has not been audited. It is tested against itself and
against GnuPG 2.5.18 in both directions.

#### Ciphers by hand

The classical ciphers on the same screen are not security measures and the screen says
so for each. One-time pad letters come from `crypto.getRandomValues`, with the top of
each byte's range discarded so that no letter is favoured; they exist only in the page
and on the paper. Nothing typed into that part of the screen is sent or stored.

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

Of an answer, nothing (a conversation in Chat is kept: see
[Conversations](#conversations)). The question, the passages sent and the answer are
not written to the database, a file or the log; the log records only that an answer
failed and the kind of failure. The web app holds the current answer in memory, not in the browser's
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

#### Conversations

**Chat** uses the same model server as answers, and everything in the table above
holds for it without exception: the same address, the same own-network rule looked up
before every request, no credentials, no redirects, one thing written at a time. Chat
reaches the model server through the answers module and has no way round it
(`answers.providerFor`, `answers.guard`). What is different is listed here.

| | |
| --- | --- |
| **Anyone who can open Outpost can read every conversation.** | Outpost has no accounts, so there is nobody for a conversation to belong to. Conversations are kept in the database so that they are on every device; every person who can reach this Outpost can read, continue, rename and delete all of them. The Chat screen says so under its title. Per-person privacy was not built and is not implied. |
| What is sent | When a person sends a message: the standing instructions, the recent messages of that conversation that fit the budget, the message, and, with the library on, the passages found for it. Nothing in the background: no generated title, no summary. |
| Requests that carry nothing | Opening Chat asks the model server for its list of models, and, when the address ends in `/v1`, asks `/api/tags` on the same host (Ollama's own list). Both go through the same guard. |
| "Look for Ollama on this computer" | One press, one look: `127.0.0.1:11434`, then `host.docker.internal:11434`, both of which are this computer, both through the same guard. The addresses are fixed in the code and cannot be supplied by a request, so the route cannot be used to probe other hosts. It saves nothing; using what it found is a second, separate press. |
| What is kept | The conversation: every message, which model wrote each reply, and for a reply from the library the passages it was given. In backups. Not on portable drives (`modules/portable/database.ts` removes them from the drive's copy). Never in the log: a test checks that a failed reply logs the kind of failure and not the message. |
| Stopping | A reply belongs to the server, not to a browser tab, so closing a tab does not stop it (unlike an answer). **Stop**, deleting the conversation, shutting Outpost down, or a time limit does: each closes the connection to the model server. A test checks that the stand-in sees its caller go away. |
| Limits | A message is at most 16,000 characters; a reply at most 1,024 tokens and 24,000 characters; a turn at most twice the context budget; 3 minutes to the first sign of life, 1 minute of silence, 10 minutes in all. |

**A reply is untrusted text**, exactly as an answer is, and in a conversation with the
library on it may have been steered by a planted sentence in a document. It is shown
with its formatting, which an answer is not, so how that is done matters:

- **It is never HTML and never rendered Markdown.** The server reads the reply with the
  same reader a Markdown document goes through (`modules/documents/markdown-view.ts`)
  into a tree of plain values, and the web app draws each value with an element of its
  own (`features/chat/reply-body.tsx`). There is no `dangerouslySetInnerHTML`. Raw HTML
  in a reply is reduced to its words; a reply that is nothing but HTML is shown as the
  characters it is.
- **A link in a reply is not a link.** Its words are shown with the address beside
  them as text. A document's Markdown may link to the web; a reply may not, because a
  model can be told what address to write, and a link that carried a piece of your
  library in its address would only need a click.
- **A picture in a reply is never fetched.** Only what was written about it is shown.
- **A code block's copy button copies text.** Diagram and figure blocks are shown as
  code, not drawn.
- **The only links are Outpost's own**: citation markers and the list of passages,
  which lead to routes inside Outpost taken from Outpost's own record of what it sent.
- **A reply saved as a note** keeps its headings, lists, tables and code, and loses its
  links and pictures in the same way (`modules/chat/note.ts`): a page of notes would
  otherwise fetch a picture the moment it was opened. It is always a new page.

The end-to-end suite has the stand-in write a reply containing a link, a picture, a
`<script>` tag and an image with an `onerror` handler, and checks that the reply holds
no link, picture or script element and that nothing ran.

Code: `apps/server/src/modules/chat/`, `apps/web/src/features/chat/`.

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
cannot make this one start work or connect to a file server. Each file unpacked must
match the checksum the archive recorded for it, so a backup damaged where it was kept
is refused whole.
Code: `apps/server/src/modules/backup/restore.ts`.

#### Who may restore and who may delete backups

Restoring replaces every note, saved place and library record at once. That is at least
as serious as erasing them, so it follows the same rule as
[Erasing everything](#erasing-everything): the request must come from the computer
Outpost runs on, unless Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`. The
one option covers both, because it is one decision: whether every device on the network
may do what cannot be taken back.

| Request | From another device |
| --- | --- |
| `POST /api/backup/restore` (an uploaded file) | Refused with `403` before any of the file is read. |
| `POST /api/backup/stored/:name/restore` | Refused. |
| `DELETE /api/backup/stored/:name` | Refused. |
| `PATCH /api/backup/schedule` with a lower `keep` | Refused: fewer kept means older backups deleted at the next run. |
| `PATCH /api/backup/schedule` otherwise, `POST /api/backup/run`, downloads | Allowed, as reading and adding are everywhere in Outpost. |
| `DELETE /api/backup/restore` (cancel a staged restore) | Allowed: it keeps what is here. |
| `POST /api/system/restart` | Refused. Its one use is applying a staged restore, which only the computer itself can stage; left open, any device could stop the server for everyone as often as it liked, cutting off uploads and replies being written. |

The screen says why on a device that is refused, and what to do: open Outpost on the
computer it runs on, or start it with the option. The limits of the rule are the same
as for erasing: it is not authentication, in Docker with LAN access on nothing looks
local, and a reverse proxy must send a forwarding header.

Backups started by hand and scheduled ones are counted separately when old ones are
removed, so a device that may only press **Back up now** cannot rotate the scheduled
backups away. It can still change the schedule from weekly to daily, which makes old
backups leave sooner; and it can switch automatic backups off. Neither deletes anything
at once. Code: `apps/server/src/modules/backup/right.ts`, `automatic.ts`.

#### Backups kept on a storage location

| Control | Detail |
| --- | --- |
| One place only | A backup is written to `outpost-backups` in the chosen location and nowhere else. The location is checked for its marker file immediately before writing and again before the file takes its final name, so a share that has gone, leaving an empty folder where it was mounted, is not written into. If `outpost-backups` is a link or a file, the backup fails instead of following it. |
| Skipped, not redirected | A location that is not connected means no backup. There is no fallback folder. |
| Checked after writing | The file is read back whole from where it was written: every entry against its checksum, and the database through SQLite's integrity check. A backup that fails is kept, marked not verified, never counted, and reported. Only the newest two that failed are kept, and a scheduled backup that goes on failing is tried after one hour, then two, four, eight, up to a day, so a fault that lasts cannot fill the location. |
| What may be deleted | Only a file directly in `outpost-backups` that has Outpost's backup name, is an ordinary file reached through no link, and reads as an Outpost backup when opened again at that moment; and the record file beside it. One exception, because damage can leave an archive unreadable: the archive of a run that failed its check is recognised by the record that run wrote beside it (`<name>.failed.json`) and by still being the size that run wrote, and is removed once two newer ones that failed are there. Never the newest verified backup, and never a file with a record of having passed. Nothing else in the folder is listed, counted or touched. |
| Names, not paths | A request names a stored backup by its file name, which must match the pattern Outpost uses; anything else is `404`. The path is built with `resolveInside`. |
| No share credentials | This feature reads and stores nothing about a network share's sign-in. It writes into the mounted folder like any other location. |

**A backup is not encrypted.** It is a zip of the database and attachments: the notes
are in the clear, and so is everything else in the database. Anyone who can read the
`outpost-backups` folder, on the NAS or wherever it is, can read them, and anyone who
can reach Outpost can download one. The screen says so where the location is chosen.
Encryption is not built in this version; put the backups on storage you trust, or on an
encrypted volume. The record of a check (`.verified.json`) is a plain file on the same
storage, so it tells you a backup was sound when written, not that nobody has replaced
it since: restoring checks the file again from scratch and does not rely on it.
Code: `apps/server/src/modules/backup/automatic.ts`, `stored.ts`, `archive.ts`.

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
everything** destroys notes, contacts, chat conversations, repeaters and documents, and
Outpost has no accounts to ask "who is this?". It asks "where from?" instead:

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
3. **Back up** from Settings, and keep the backup somewhere other than the device, or
   turn on automatic backups to a storage location on another disk. Backups are not
   encrypted. Back up storage locations as ordinary folders.
4. **Encrypt drives that leave the house**: laptops, external disks and portable
   drives (BitLocker, FileVault, LUKS, VeraCrypt). Outpost does not encrypt anything
   at rest.
5. **Protect the data directory.** It holds the database and, once HTTPS has been
   turned on, the key of a certificate authority your devices trust (`tls/`). On a
   shared computer, make it readable only by the account that runs Outpost.
6. **Keep Outpost updated**, and keep kiwix-serve at the version in `compose.yaml`.
7. **Add catalogue manifests only from people you trust.** A manifest decides which
   hosts downloads may start from.

The project's own checks are run by hand before a change is accepted (see
[CONTRIBUTING.md](../CONTRIBUTING.md)). The browser test suite fails if the app tries
to reach any other host.
