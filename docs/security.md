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
- **Hostile reference content.** A ZIM archive is a copy of someone else's web site,
  scripts included. Its pages cannot change your library or reach the internet.
- **Misuse of the download feature.** Outpost cannot be made to fetch from addresses
  inside your network, and a tampered or corrupted download is not installed.
- **Misuse of the share feature.** Outpost cannot be made to connect to a file server
  on the internet, and repeated wrong passwords are held back.
- **Mistakes.** Nothing is overwritten, and files are deleted only when a request says
  so explicitly.

### What Outpost does not defend against

- **Anyone on a network you have shared it with.** With LAN access on, every person
  and device on that network can read and change everything, connect and disconnect
  network shares, start downloads, restore a different database and delete the library.
  There are no permissions, no per-person views and no audit log. Share it only with a
  network where you trust everyone.
- **Other programs or people on the same computer.** Anything that can connect to
  `127.0.0.1:8080` has the same access. The cross-site protections stop browsers, not
  local programs.
- **Physical access to an unencrypted drive.** The database, attachments, documents
  and portable drives are stored unencrypted. Anyone holding the disk can read them.
- **An untrusted network.** On its own Outpost speaks plain HTTP. On a network you do
  not trust, content (and a share password as it is typed) can be observed and altered.
- **A compromised helper.** Outpost trusts the kiwix-serve program and the embedding
  server you point it at.
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
| GPX is checked before parsing | Files with a DOCTYPE or entity declarations are refused. | `apps/server/src/modules/maps/gpx.ts` |

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

Two outbound paths do not use this client, because their address is a setting: the
embedding server for semantic search, and kiwix-serve.

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
