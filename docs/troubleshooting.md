# Troubleshooting

Real problems, the messages Outpost shows for them, and what to do. The messages are
quoted from the code, so you can search this page for the words on your screen.

Start with the log. It usually says more than the screen does.

```bash
docker compose logs --tail 200 outpost     # Docker
docker compose logs --tail 200 kiwix
```

Without Docker, the log is whatever the server prints in its terminal.

## Starting and reaching Outpost

### The server refuses to start, naming OUTPOST_LAN_ACCESS

With Docker: "Outpost does not know that its port is published only to this computer…"
Without Docker: "OUTPOST_HOST is …, which other devices can reach, but
OUTPOST_LAN_ACCESS is not set."

The port would be reachable from your network, and Outpost will not allow that unless
you have chosen it. There are no accounts, so everyone who can reach Outpost can
change and delete what is in it.

- To keep it private to this computer, set `OUTPOST_BIND=127.0.0.1` in `.env` (or
  `OUTPOST_HOST=127.0.0.1` without Docker). These are the defaults.
- To share it with everyone on your network, also set `OUTPOST_LAN_ACCESS=true`. Read
  [deployment.md](deployment.md#letting-other-devices-use-it-lan-access) first.

If you start the image with plain `docker run`, the server cannot see how the port was
published: pass `-e OUTPOST_PUBLISHED_ADDRESS=127.0.0.1` when you publish it with
`-p 127.0.0.1:8080:8080`.

### The port is already in use

Without Docker the server stops with an `EADDRINUSE` error. With Docker,
`docker compose up` reports that the port is already allocated. Something else is
using port 8080. Choose another port and restart:

```ini
OUTPOST_PORT=8090
```

With Compose this goes in `.env` and changes the port on the host; then open
`http://localhost:8090`. A portable drive moves to the next free port by itself and
prints the address it is using.

### "This address is not one Outpost answers to. Add it to OUTPOST_ALLOWED_HOSTS to use it."

You opened Outpost by a name or address the server does not recognise as its own.

- From another device, you need LAN access on: `OUTPOST_LAN_ACCESS=true` (and, with
  Docker, `OUTPOST_BIND=0.0.0.0`). Without it only `localhost`, `127.0.0.1` and `::1`
  are accepted.
- With LAN access on, IP addresses, single-word names and names ending in `.local`,
  `.lan`, `.home`, `.internal` or `.home.arpa` are accepted. Any other name, such as
  `outpost.example.net`, must be listed:

  ```ini
  OUTPOST_ALLOWED_HOSTS=outpost.example.net
  ```

- Behind a reverse proxy, make sure the proxy passes the original `Host` header on.

Restart after changing either setting.

### The browser says the HTTPS address is not private

The device has not been told to trust Outpost's certificate, or the address in the
address bar is not one the certificate lists. Open **Settings → HTTPS on your network**
at the `http` address, which always works: it lists the addresses the certificate
covers and gives the steps for each kind of device. After **Make a new certificate
authority**, every device has to trust the new one. See
[deployment.md](deployment.md#https-on-your-network).

### "Port 8443 is already in use on this computer, so HTTPS could not start."

Something else has the HTTPS port. Start Outpost with `OUTPOST_HTTPS_PORT` set to a
free one. Plain HTTP is not affected.

### "This request did not come from the Outpost app."

A script or tool called a state-changing API route without the required header. Add
`-H "X-Outpost-Request: 1"`. See [api.md](api.md#the-x-outpost-request-header).

### "The server is not responding"

The web app loaded but cannot reach its server. If you just started or restarted
Outpost, wait a few seconds. Otherwise check that the service or container is running
(`docker compose ps`) and read the log. Behind a reverse proxy, also check that the
proxy does not buffer `/api/events`.

### "The server is out of reach. Showing what is kept on this phone, for reading only."

The app opened from the copy kept in the browser, and the server did not answer within
a few seconds. Away from home this is expected. At home, check that the phone is on
the same network and the server is running; the app asks again every ten seconds and
goes back to normal by itself, or press **Try again**. See
[offline.md](offline.md#a-phone-out-of-reach-of-the-server).

### "Nothing can be kept on this phone over plain HTTP"

Browsers only let a site keep itself and its data on a secure address: HTTPS, or
`localhost` on the computer itself. Give Outpost an HTTPS address (Settings → HTTPS on
your network) and open it there.

### Something kept on the phone has gone

The browser removed it; Outpost never removes a kept copy by itself. On an iPhone or
iPad, Safari deletes a site's stored data after seven days of using Safari without
visiting the site, unless the site is on the Home Screen; any browser may clear data
when the device runs short of room. Add Outpost to the Home Screen, keep things from
there, and use "Ask the browser to keep this data" on "On this phone". The details and
sources are in [offline.md](offline.md#what-the-browser-may-do-with-kept-copies).

### "The Outpost server is running, but the web app has not been built."

You are running from source and `apps/web/dist` does not exist. Run `pnpm build`, or
use `pnpm dev` for development.

### The packaged app stops at start-up mentioning "pino-pretty"

The message is `unable to determine transport target for "pino-pretty"`. Set
`NODE_ENV=production` when running `dist/app/server/outpost.mjs`. See
[deployment.md](deployment.md#the-packaged-app).

## Storage

### A storage location shows as disconnected

The detail under the location says which case it is.

- **"The folder is not reachable. The drive may be unplugged or the share not
  mounted."** Plug the drive in or mount the share. Outpost notices within about 30
  seconds, or straight away if you refresh the Storage screen. With Docker, a drive
  that was not mounted when the containers started may need
  `docker compose restart`.
- **"The folder is there but is not this Outpost location. The drive mounted at this
  path may be a different one."** The marker file `.outpost-location.json` is missing
  or belongs to another location. Check that the right drive is mounted. If the drive
  now appears at a different path inside a storage root, Outpost finds it by itself,
  up to three folders deep.

Nothing is lost while a location is disconnected. See
[storage.md](storage.md#what-happens-when-a-drive-is-unplugged).

### "…is not connected. Reconnect it and try again."

You tried to open, download to, check or delete something on a disconnected location.
Reconnect it. To remove an item whose drive is gone for good, remove only Outpost's
record and leave the file.

### "That folder is outside the storage roots this server allows."

Storage locations can only be created inside the storage roots set when the server
starts. The Storage screen lists them at the bottom. Mount the drive or share under a
root (with Docker, under `/storage` in `compose.yaml`), or add its path to
`OUTPOST_STORAGE_ROOTS`.

### "Outpost cannot write to that folder. Check its permissions."

Also: "That folder could not be created: … permission denied".

In Docker the server runs as user id 1000. The folder must be writable by that user.

```bash
sudo chown -R 1000:1000 /mnt/usb-ssd/outpost
```

- exFAT, FAT32 and NTFS drives have no Unix ownership: mount them with
  `uid=1000,gid=1000`.
- SMB shares: add `uid=1000,gid=1000` to the mount options.
- NFS shares: set ownership or permissions on the NAS, and check the export is
  read-write.
- A mount written with `:ro` in `compose.yaml` is read-only. Only the `kiwix` service
  should have `:ro`.

### "…does not have enough free space for this."

Outpost always leaves 256 MB free on a location, so the space needed is the size of
the item plus that reserve. Free some space or choose another location. **Storage →
Manage and clean up** shows what is taking the space, lists unfinished downloads and
stray files that can be cleared, and removes what you no longer want.

### "Erasing everything can only be started on the computer Outpost runs on."

Outpost has no accounts, so the one action that destroys notes and documents is tied to
where the request comes from. Open Outpost on the computer it runs on, or start it
with `OUTPOST_ALLOW_REMOTE_ERASE=true`. In Docker with `OUTPOST_LAN_ACCESS=true`, or
behind a reverse proxy, no request looks local, so the option is the only way. See
[security.md](security.md#erasing-everything).

### "Restarting Outpost can only be done on the computer Outpost runs on."

A restart stops Outpost for everyone using it, and its one use from the browser is
switching to a restored backup, which is itself only offered at that computer. Open
Outpost there and press **Restart now**, restart it by hand (`docker compose restart`,
or stop and start the program), or start it with `OUTPOST_ALLOW_REMOTE_ERASE=true` to
allow restoring and restarting from every device.

### The database file did not get smaller after removing things

SQLite keeps the freed space inside the file for reuse. **Storage → Manage and clean
up → Clean up → Compact the database** hands it back to the disk.

### "…still holds N items. Move or remove them first."

A storage location cannot be removed while documents or collections are recorded on
it. Move them (see [storage.md](storage.md)) or remove them, then try again.

### A collection shows as "missing" or "damaged"

- **Missing:** the location is connected but the file is not there. Put the file back
  at the same path, or download the collection again.
- **Damaged:** the file no longer matches its recorded checksum. Download it again or
  restore it from a backup of the drive. Run **Check files** again afterwards.

## Downloads

### A download says "No connection" and does not move

- "No connection. This download will resume when the network is back." It is retrying
  by itself, with longer pauses each time. Nothing to do but restore the connection.
- "No connection. Outpost has stopped trying for now. Choose Retry when the network is
  back; the part already downloaded is kept." It used up its attempts (8 by default;
  **Settings → Downloads → Attempts before giving up**). Press **Retry** once you are
  online. The download continues from where it stopped.

Outpost itself runs offline by design, so check the server's own connection, not just
your browser's: in Docker, the container must be able to reach the internet.

### "The downloaded file does not match its published checksum…"

The file was corrupted on the way or altered. Outpost deleted it and installed
nothing. Press **Retry** to download it again. If it fails the same way, press
**Refresh** on Explore so that Outpost has the source's current details, then start
the download afresh.

### "… is not a download source listed in any catalogue manifest."

Downloads may only start from hosts named in a manifest. If you run your own mirror,
add its host to `OUTPOST_DOWNLOAD_HOSTS`. With Docker Compose this variable must also
be passed into the container; see
[deployment.md](deployment.md#read-by-composeyaml-only).

### "Downloads from … are blocked because it is not a public address."

The address is on a private network. This protects your own network from being probed
through Outpost. If the address is a mirror you run, start the server with
`OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.

### "…was disconnected during this download."

The drive it was writing to went away. The partial file is still on the drive, and
the download continues by itself when the drive is connected again.

### "…is full. Free some space on it, then retry; the part already downloaded is kept."

Free space on that drive, then press **Retry**.

### The catalogue will not refresh

"The catalogue was not refreshed: there is no connection" is normal offline. Explore
keeps working from the last known details. A different message names the source that
failed; try again later.

### "No readable text was found on this page."

Saving a web page keeps what is written in the page's own HTML. A page that is drawn
by a script after it loads (most sites that work like an app), or that only asks you
to sign in, has nothing in it to keep: Outpost has no browser inside it, runs no
page's scripts, and does not sign in to sites. Look for a plain or printable version
of the page, or save it as a PDF from your browser's Print menu and add that to the
Library. The other things Outpost says when a page cannot be saved are listed in
[notes-and-imports.md](notes-and-imports.md#what-cannot-be-saved-and-what-outpost-says).

### A saved web page is missing a part, or some of its pictures

The article is found by rules, and a page laid out in an unusual way can lose a part.
Pictures are left out when they are over a limit, are not PNG, JPEG, GIF or WebP, or
when their host refuses to serve them to anything but its own pages; the report after
saving lists each one and why. The address at the top of the saved page leads back to
the original while you have a connection.

## Reference collections

### "Reading reference collections needs the kiwix-serve program, which this installation does not have."

Outpost was started without `OUTPOST_KIWIX_URL` or `OUTPOST_KIWIX_BIN`. With Docker,
use the `kiwix` service in `compose.yaml`. Without Docker, see
[deployment.md](deployment.md#reference-collections-without-docker).

### "The Kiwix server at … is not answering. Check that its container is running."

```bash
docker compose ps
docker compose logs --tail 100 kiwix
docker compose up -d kiwix
```

The `kiwix` container starts only after `outpost` is healthy, so it comes up a little
later.

### "The kiwix-serve program was not found at …" or "kiwix-serve stopped (code …)"

`OUTPOST_KIWIX_BIN` points at a missing file, or the program cannot run on this
machine (the wrong build for the processor, for example). Outpost restarts it with
growing pauses; the last line the program printed is included in the message.

### A collection is installed but cannot be read

- **Its drive is not mounted in the `kiwix` service.** Every `/storage/...` mount of
  the `outpost` service must be repeated, read-only and at the same path, under
  `kiwix` in `compose.yaml`. Then `docker compose up -d`.
- **"This collection is on "…", which is not connected."** Reconnect the drive.
- **"This collection is not ready to read yet."** kiwix-serve needs a moment to
  notice a newly installed archive. Wait a few seconds and reload.

### A collection opens as a list of documents

Some collections are not copies of web sites. They are a set of files (PDFs, sound
recordings, films) with a list of them, made with openZIM's "nautilus" tool; the Post
Disaster Resource Library is one. Such a collection has a single page of its own,
which draws the list in the browser from a database the browser keeps for that page.
Outpost shows every collection's pages in a sandbox where a page has no such storage,
so that page draws its header and nothing else.

Outpost reads the collection's list itself and shows it in the reader:

- The search box above it looks through titles, authors, descriptions and file names
  as you type. Each word must start a word: "pur" finds "purification".
- A PDF or e-book opens over the list, with **Add to library**; the same button is on
  each line of the list. The document takes the title the collection gives it.
- A sound recording or a film plays in the browser's own player. Which kinds play is
  up to the browser; a WAV recording and a WebM film were tried in Chromium. When a
  file cannot be played, **Open the file** hands it to the browser, which can save it.
- Any other kind of file (a spreadsheet, an archive) is a link that opens in a new tab.
- **Show the collection's own page**, under the list, shows the page as the collection
  made it. It will usually be empty, for the reason above.

If you see a line saying the collection's list could not be read:

- "…from a file that is not where Outpost looks for it." The collection was made with
  a version of nautilus older than 1.0.8 (October 2022), which laid its files out
  differently, or with a changed copy of the tool. Outpost has not been tried against
  one and shows its own page.
- "…is larger than Outpost reads (4 MB)." About 25,000 documents of ordinary length.
- "…is not written the way Outpost reads it." The list is a script, and Outpost reads
  it without running it. Anything in it beyond a plain list is refused whole.

Only the first 20,000 documents of a list are read, and at most 50 files of any one
document; the list says so when it has been cut short. An entry that names no file
inside the collection is left out, and counted under the list.

What has been tried: one real collection (Post Disaster Resource Library, May 2024,
108 PDFs, carrying the same script as nautilus 1.2.1), read through kiwix-serve; and a stand-in of the
same shape for the tests, with files in folders, several files to a document, a WAV
recording and names with awkward characters. Film was tried by hand with one WebM
clip. No collection holding real recordings or films, and none from before October
2022, was to hand.

### A link in a reference page shows a notice instead of opening

Pressing a link in a reference page does one of three things:

- A PDF or e-book that is **inside the collection** opens over the page, with **Add to
  library**. Adding it copies it out of the collection and needs no connection.
- "This file is not in the collection. It is on the internet at …" The copy of the
  site did not include that file. With a connection, **Save to library** fetches it
  and it appears under Documents when the download finishes. Without one, it cannot be
  had.
- "That link leaves your library and needs the internet: …" The link goes to a web
  page outside the collection.

Collections made from web sites carry a script that makes every link report the
address it had on the live site. Outpost reads each link before that script runs, so
a file that is inside the collection is recognised as such. If a file is still
reported as being on the internet, the page links to it at an address outside the
collection's copy of the site, and the internet is the only place Outpost can get it
from.

### A file from a reference page cannot be added to the library

- "…is not in this collection. The site it was copied from may have had it; the copy
  does not." The page links to a file that was never packed into the collection.
- "Outpost can save links to files it can keep (PDF, EPUB, Markdown, plain text and
  images). This link does not end in one of those." Web pages and other kinds of file
  are not fetched.
- "That link points at this computer or your own network, which Outpost does not fetch
  from." See the entry on blocked addresses under [Downloads](#downloads).
- The download fails with "…is named like a PDF, but its contents are not one." The
  address answered with something else, often a page asking you to log in. Outpost
  kept nothing and does not try again.

### Search results have no reference articles

A note under **In reference collections** says why. Either kiwix-serve is not running
(see above), or **Settings → Search → Search inside reference collections** is off, in
which case there is no such heading at all.

### Reference articles arrive late, or a note says a collection was not searched in time

Your own results are shown at once; archives are searched after that, three at a time,
and each collection's articles are added as it answers. On a slow drive or a network
share the first search of an archive can take several seconds, because kiwix-serve has
to read its index from the drive. A collection that takes more than 8 seconds, or is
not reached within 30, is named in a note. Search for the same words again: what was
being read is kept, so the second time is quick. See
[search.md](search.md#reference-collections-in-results).

## Maps

### The map has no labels

Roads and land are drawn but there are no place names or icons. The map fonts and
icons were not present when Outpost was built. From the repository, with a
connection:

```bash
node scripts/fetch-map-assets.mjs
```

Then rebuild whatever you run: `pnpm build` for a source installation,
`node scripts/build-app.mjs` for the packaged app, or `docker compose build` for the
image (the image build runs the fetch itself). `node scripts/fetch-map-assets.mjs
--force` fetches everything again.

### "Outpost could not reach the map source."

Estimating and downloading a region need a connection. Installed regions do not.

### "The map source is no longer available at its address."

If you set `maps.tileSource`, check the address. Otherwise the daily build was
withdrawn; try again in a few minutes, or remove the download and start the region
again.

### "Find a route" says the server is busy, or did not answer

The servers that answer route searches are run by volunteers, for everyone, with no
promise of being there. Wait a minute and try again, or choose **Ask another server**
(or **Change server** under the search). After a server says it is busy, Outpost does
not ask it again for 30 seconds. If no listed server works for you, an administrator
can declare another in `<data directory>/catalog/routes/route-sources.json`; see
[maps.md](maps.md#what-is-sent-and-to-whom). Routes already on your map are not
affected.

### "Find a route" finds nothing for a path I know exists

Names are matched as OpenStreetMap writes them: try part of the name. A path that
nobody has mapped as a route is only found when you search **This map view** with the
map over it, not **Anywhere**. A regional server knows only its region: the note under
the search says which. And some paths are simply not named in OpenStreetMap; draw the
route, or import a GPX file.

### "That area is too large to download at zoom N in one go"

Lower the maximum zoom or split the area into smaller regions. A single region is
also limited to 60 GB.

### The map is empty somewhere

Only installed regions are drawn. Zoomed out, a world overview region fills the gaps.
A region whose drive is disconnected is not drawn until it returns.

## Documents and search

### A PDF has no searchable text

"This PDF has no text of its own. Its pages appear to be scans…" The file is stored,
opens normally, and is found by its title and tags. To search inside it, choose **Read
text from the scanned pages** on the document; see
[Scanned pages and images](search.md#scanned-pages-and-images-ocr) for what that can
and cannot read. PDFs larger than 512 MB are stored but their text is not read.

### An EPUB book will not open, or looks different from the printed book

- "This book is copy-protected": the book is locked by a rights scheme (DRM). Outpost
  stores it and can hand it back, but does not read it and does not remove the lock.
- "This book could not be opened": the message says what is missing. The file is
  usually damaged or was cut short when it was copied; add a fresh copy. If its text
  was read before, **Show its plain text** still shows that.
- "This chapter cannot be shown": that one chapter is over 2 MB, or too tangled to read
  safely. The rest of the book reads normally. **Download original** to read it in
  another program.
- The book looks plainer than in another reader: Outpost shows a book's words and
  pictures in its own type and leaves the book's styling out, on purpose. Fixed-layout
  books, audio, video, mathematics and interactive pages are not supported. See
  [Reading EPUB books](epub.md).
- A search result opens the start of the book instead of the chapter: the book was
  added before chapters were recorded. Choose **Read text again** in its details.

### OCR found no text, or the wrong words

- "OCR found no text…": the page may be blank, sideways, handwritten, or in a language
  OCR has not been given. Only pictures are read, so a page whose words are drawn as
  shapes gives "…has no picture that OCR could read".
- Wrong words are normal on poor scans. **Read the scanned pages again** only helps if
  something has changed, such as the language setting.
- "Reading text from scans (OCR) is not part of this installation…": the OCR engine or
  its English data is missing from the installation. From source, run `pnpm install`;
  a packaged app should be rebuilt with `node scripts/build-app.mjs`.

### An upload is refused

- "…is larger than the N MB this server accepts per file." Raise
  `OUTPOST_MAX_UPLOAD_MB` and, behind a reverse proxy, the proxy's own limit.
- "…is a .xyz file, which the library cannot store." Only the listed types are
  accepted.
- "…is named like a PDF, but its contents are not one." The file is not what its
  extension says.
- "…is not UTF-8 text." Save the file with UTF-8 encoding and try again.

### Semantic search: "The embedding server at … is not reachable."

Check that the server is running and that the address is right from where Outpost
runs. In Docker, `127.0.0.1` is the container itself; see
[search.md](search.md#a-local-embedding-server-local-server).

### Semantic search: "The built-in model has not been fetched yet" or "…is not part of this installation"

The model's files are missing. Running from source, fetch them once with
`node scripts/fetch-embedding-model.mjs` (it needs a connection, that once). A packaged
app or image without them was built without that step: build it again after running
the script, or use a local embedding server. Ordinary search is not affected.

### Semantic search: "…does not match its checksum"

A file of the built-in model is damaged or was replaced. Install Outpost again (or,
from source, run `node scripts/fetch-embedding-model.mjs --force`).

### There is no "Answer from my library" button

It appears on the Search screen only when **Settings → Answers from your library** is
switched on and a model is chosen. Outpost does not include a language model; see
[ai.md](ai.md#setting-it-up).

### Answers: "No model server answered at …"

The model server is not running, or the address is wrong from where Outpost runs.
Start it (for Ollama, `ollama serve` or the Ollama app) and press **Test** in
Settings. In Docker, `127.0.0.1` is the container itself; see
[ai.md](ai.md#in-docker-or-with-the-model-on-another-machine). llama.cpp's server
changed its default port from 8080 to 9931: use the address it prints.

### Answers: "The model server … has no model called …"

The name must be the one the server uses, including any tag (`llama3.2:3b`, not
`llama3.2 3b`). Choose it from the list in Settings, which comes from the server, or
fetch it first (`ollama pull llama3.2:3b`).

### Answers: "… cannot write text. It is probably an embedding model…"

A model such as `nomic-embed-text` turns text into numbers for search by meaning and
cannot answer. Choose a chat model.

### Answers: "The passages and the question were too long for the model."

Lower **Context budget** in Settings, or start the model with a larger context
(`-c 8192` for llama.cpp's server). Ollama does not report this: it silently drops
what does not fit, so with Ollama keep the budget inside its context size (4,096
tokens by default; the default budget fits). See [ai.md](ai.md#with-ollama).

### Answers: "The model had not started writing after 3 minutes…"

The machine is too slow for that model with that much text. Use a smaller model or a
smaller context budget. The first answer after starting the model server is the
slowest, because the model is loaded into memory then.

### Answers: "Outpost is already writing an answer…"

One answer is written at a time, across every device using this Outpost. Wait for the
other to finish, or stop it where it was asked.

### An answer cites nothing, or cites a number that is struck through

The model did not follow its instructions. Small models do this more often. Treat the
answer as unsupported, read the passages listed beneath it, and consider a larger
model. Outpost flags this; it cannot prevent it.

## Notes

### "This page was changed somewhere else after you opened it…"

The page was saved from another tab or device after you opened it. Your changes were
not saved over the newer version. Reload to see it.

## Backup and restore

### "A restore is waiting for a restart"

A restore is applied when the server next starts. Restart it:

```bash
docker compose restart outpost
```

Without Docker, stop the server and start it again. From a portable drive or the
Compose stack, Outpost can restart itself when you ask it to. "Outpost cannot restart
itself here. Stop it and start it again to finish." means nothing is supervising the
server, which is the case when you run it from source or run the packaged app
yourself.

To change your mind before restarting, cancel the staged restore in **Settings →
Backup**.

After the restart, the data that was replaced is in the data directory in a folder
named `before-restore-<time>`. Delete it yourself when you are sure you do not need
it.

### "Restoring a backup can only be done on the computer Outpost runs on."

Restoring replaces everything at once, and Outpost has no accounts, so it is tied to
where the request comes from, as erasing everything is. The same goes for deleting a
stored backup and for keeping fewer of them. Open Outpost on the computer it runs on,
or start it with `OUTPOST_ALLOW_REMOTE_ERASE=true`. In Docker with
`OUTPOST_LAN_ACCESS=true`, or behind a reverse proxy, no request looks local, so the
option is the only way. See [security.md](security.md#backup-and-restore).

### "The backup due … has not been made"

The storage location chosen for automatic backups was not connected when the backup was
due. Nothing was written anywhere else. Connect the drive or the share (**Storage →
Check drives** looks at once); the backup is made as soon as Outpost sees the location,
and one backup covers however many were missed. If the location is gone for good,
choose another in **Settings → Automatic backups**.

### A backup is shown as "Not verified"

It was written, but there is no record that it read back correctly: the check failed
(the job's message under Downloads says how), the server stopped before the check
finished, or the file has changed size since. It is not counted towards the number to
keep. The next backup does not depend on it. If it keeps happening on one location,
the disk or the network connection to it is the first thing to suspect. Outpost keeps
only the newest two that failed their check, and tries a failing scheduled backup less
often each time (after one hour, then two, four, eight, up to a day), so a fault that
lasts does not fill the location.

### A file in `outpost-backups` is not in the list, or is never removed

Outpost lists and removes only files it named itself
(`outpost-backup-<time>-scheduled.zip` or `-manual.zip`) that read as its backups.
A backup you downloaded from Settings and copied there has a different name, so it is
left alone; restore it with **Choose backup** instead.

### "That backup was made by a newer Outpost (…). Update Outpost, then restore it."

A backup can be restored into the same or a newer version, not an older one.

### After a restore, documents and collections show as unavailable

A backup holds the database, not the content. Add the same storage locations again:
their marker files are recognised and the content lines up.

## Portable drives

### "This drive does not include Outpost for this kind of computer"

The drive was made without the runtime for this platform. Update the drive from the
Outpost that made it and tick this kind of computer.

### "…is too large for this drive's format. Reformat the drive as exFAT and try again."

The drive is FAT32, which cannot hold a file of 4 GB or more.

### Reference collections do not open from a drive on Windows

The Kiwix project publishes no Windows build of its reader at the version Outpost
uses. Everything else works. See
[portable.md](portable.md#which-computers-it-runs-on).

## Still stuck

Open an issue on the project's GitHub page with the Outpost version (**Settings →
This installation**), how you run it (Docker, source, packaged app or portable
drive), the operating system, and the relevant lines of the log. Remove anything
private from the log first. For security problems, see
[SECURITY.md](../SECURITY.md) instead.
