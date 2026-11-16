# Storage

This page explains where Outpost keeps things, how to use external drives and network
shares, what happens when a drive is unplugged, and how collections are moved and
checked.

## Two kinds of place

**The data directory** holds what Outpost itself owns. It is one folder
(`OUTPOST_DATA_DIR`; `/data` in Docker, the `outpost-data` volume).

**Storage locations** hold content: the files you add and download. A location is a
folder you choose. You can have several, on different drives.

| Lives in the data directory | Lives in a storage location |
| --- | --- |
| The database `outpost.db`: notes, tags, library records, settings, markers and tracks, the search index, place names, vectors, job and download history | Original documents: `documents/<id>/<file name>` |
| Note attachments: `attachments/` | Reference collections (ZIM archives): `collections/zim/` |
| Text extracted from documents: `extracted/` | Other catalogue files: `collections/files/` |
| Your own catalogue manifests: `catalog/` | Map regions: `collections/maps/`, terrain: `collections/terrain/` |
| `models/`: not used any more (the built-in embedding model is part of the app); files put there for earlier builds can be cleared from Leftovers | Downloaded place-name files: `collections/places/` |
| Cached programs for portable drives: `runtimes/` | Files still arriving: `*.part`, and `documents/.incoming/` |
| The copy of a portable drive's database, while its changes are being brought back: `merges/` | |
| `secret.key`, used to sign links to reference content | The marker file `.outpost-location.json` |

Outpost never writes anything but content and the marker file to a storage location.

### Why the database stays on a local disk

The database uses SQLite in write-ahead-log mode, which depends on file locking that
network shares do not provide reliably. A database on NFS or SMB can be corrupted.
Keep the data directory on a disk that is physically part of the machine and always
attached. Content has no such restriction.

## Storage roots and storage locations

A **storage root** is a folder the person running the server has made available for
content. Roots are set when the server starts (`OUTPOST_STORAGE_ROOTS`, comma
separated) and cannot be changed from the browser. In Docker the single root is
`/storage`; everything you mount under `/storage` is available.

A **storage location** is a folder inside a root that you have added in Outpost. The
server refuses any folder outside the roots, whoever asks.

On first start Outpost creates one location, "Internal storage", so there is somewhere
for uploads and downloads to go. In Docker it is `/storage/internal` (the
`outpost-library` volume).

## Adding a location

1. Make the drive or share visible inside a storage root. On a Mac a plugged-in drive
   is already there, and a NAS share can be connected from the Storage screen (see
   [Connecting a network share](#connecting-a-network-share)). Elsewhere, see the
   examples below.
2. Open **Storage** and choose **Add location**.
3. Pick the folder in the folder browser. You can make a new folder there.
4. Give it a name and a kind: external drive, network share, internal or Docker volume.
   The kind is used for labels only.
5. Optionally turn on **Use for new downloads** to make it the default.

Outpost checks that it can write to the folder, then writes the marker file. A folder
cannot be added if it overlaps a location you already have.

The Storage screen lists the roots of your installation at the bottom, under "Where
Outpost can look".

### The default location

One location is the default. New uploads and downloads go there unless you choose
another when you start them. Change it with **Make default** in the location's menu on
the Storage screen.

### Renaming and removing

Renaming changes only the name shown. Removing a location makes Outpost forget the
folder: nothing in it is deleted, and the marker file stays. Outpost refuses to remove
a location that still holds documents or collections, and refuses to remove the last
one.

## The marker file and reconnecting

Every location has a small file at its root, `.outpost-location.json`, holding the
location's id. Outpost records content as *(location id, path inside the location)*,
never as an absolute path. This has these consequences:

- **A drive that comes back somewhere else is found.** If the marker is not where it
  was, Outpost looks for it inside every storage root, up to three folders deep, and
  carries on from the new path.
- **A different drive at the old path is not used.** If the folder exists but its
  marker is missing or has another id, the location is shown as disconnected with the
  note "The folder is there but is not this Outpost location."
- **A location can be adopted.** If you add a folder that already has a marker from
  another Outpost, or from before a database restore, it keeps its id, so records that
  refer to it line up again.

- **A folder outside the storage roots is not used.** The roots can change between
  starts. A location whose recorded folder is no longer inside any of them is treated
  like a drive that has moved: Outpost looks for its marker inside the roots and
  carries on from there. If it is not there, the location is shown as disconnected with
  the note that its folder is outside the folders Outpost is allowed to use
  (`OUTPOST_STORAGE_ROOTS`). Its records are kept, and nothing is moved or deleted.
- **Two folders with the same marker are never chosen between.** If the search finds a
  location's marker in two places (a copy and its original, both inside the roots),
  the location is shown as disconnected and both folders are named. Remove the copy you
  do not want, or the marker file inside it, and choose **Check drives**. While a
  location is where it was recorded, inside the roots, a stray copy elsewhere changes
  nothing: the recorded folder is used and no search is made.

Do not delete or edit the marker file, except to settle which of two copies is the
real one.

Locations are checked every 30 seconds (the `storage.checkIntervalSeconds` setting,
5 to 3600), when Outpost starts, and whenever someone chooses **Check drives** on the
Storage screen.

### Moving a library to another disk or folder

To move a whole storage location, as opposed to one collection or the documents (for
those, see further down):

1. Stop Outpost.
2. Copy the location's folder to the new place, **with its marker file**
   `.outpost-location.json` (it is a hidden file; copy the folder itself, not just what
   you can see in it).
3. Make sure the new place is inside a storage root. If it is not, set
   `OUTPOST_STORAGE_ROOTS` to include it. If the old place should no longer be used,
   leave it out of the roots, or delete or rename the old folder once you have checked
   the copy.
4. Start Outpost. It finds the marker at the new place and carries on from there; the
   Storage screen shows the new path.

If both the old and the new folder are inside the roots, Outpost goes on using the old
one for as long as it is there. Take the old one out of the roots, or remove it, to
switch over.

## What happens when a drive is unplugged

- The location shows as **disconnected**, and the status line at the foot of the
  sidebar says so.
- Nothing is removed. Documents and collections on the drive stay in the library,
  marked as unavailable.
- Search still finds documents on the drive, because their extracted text is in the
  data directory. Opening the original file gives: `"<name>" is not connected.
  Reconnect it and try again.`
- Reference collections on the drive disappear from kiwix-serve's library until the
  drive returns.
- A download writing to the drive stops with the message that the drive was
  disconnected. The partial file stays on the drive, and the download continues by
  itself when the drive is connected again.
- Deleting a file on a disconnected drive is refused. You can remove only Outpost's
  record of it and leave the file where it is.
- Collections are not marked "missing" while their drive is away. A collection is
  "missing" only when its location is connected and the file is not on it.

Unplug a drive only when nothing is being written to it. Eject it in the operating
system first.

## Connecting a network share

**Storage → Network shares → Connect a network share.** What that button can do
depends on where Outpost runs, and the screen says which applies.

| Where Outpost runs | What happens |
| --- | --- |
| Directly on a Mac | Outpost connects the share itself and keeps it connected. |
| In Docker | Outpost cannot: a container only sees what Docker gives it. The same form writes out the Compose lines to add. |
| Directly on Linux | Outpost cannot: mounting needs root. The same form writes out the `/etc/fstab` line and the credentials-file steps. |
| Windows, or from a portable drive | Nothing is offered. Mount the share with the operating system, inside a storage root. |

### On a Mac

Nothing has to be typed but a user name and a password. The dialog walks through four
steps:

1. **Server.** Pick the NAS or computer. File servers that announce themselves on the
   network (Bonjour) are listed, and its name (`nas.local`) or address can be typed
   instead. Network volumes that are **already connected on this Mac**, from the Finder
   for instance, are listed first: choosing one skips straight to step 4, with no
   password and nothing mounted again.
2. **Sign in.** Enter the user name and password for the server, or choose **Try
   without a password (guest)** for a server that allows guests.
3. **Shared folder.** Outpost asks the server which shared folders that account can
   see and lists them. Choose one and Outpost asks macOS to connect it, the way the
   Finder does. It appears under `/Volumes`, which is a storage root.
4. **Folder to use.** The folder browser opens on the share. A folder of its own,
   `Outpost`, is suggested (made if it is not there, opened if it is); choose another,
   or the top of the share, if you prefer. **Add as storage location** finishes.

About the list in step 3:

- Only shares that can hold files are shown. Printers, and the shares a server keeps
  for its own running (`IPC$`, `print$`, `ADMIN$`, `C$` and the like), are left out.
- Shares whose names end in `$` are hidden by convention. They are kept behind **Show
  hidden shares**.
- A share's name can always be typed instead (**Not in the list? Type its name**):
  some servers keep shares out of the list altogether.
- Outpost reads the list itself, over one connection to the server's checked address,
  using SMB 2 or 3 with an NTLM sign-in. A server that insists on encryption for every
  connection, or accepts only Kerberos, cannot be listed; the dialog says so and goes
  on to typing the name, and connecting such a share still works, because macOS does
  the connecting.
- Looking at the list with a typed password is a try at that password. Wrong tries
  are counted per server and user, across looking and connecting together: after five,
  further tries are refused for a minute, then two, doubling up to an hour, and the
  dialog shows the wait.

- **SMB only.** That is the file sharing every NAS offers. NFS and AFP shares are not
  connected from here; mount those yourself and add the folder with **Add location**.
- **Only servers on your own network.** The server must have a private or link-local
  address (see [security.md](security.md#network-shares)).
- **A guest's share** has no user name or password. Outpost reconnects it by itself
  like a share with a remembered password.
- **The password is never kept by Outpost.** With **Remember the password** on, it is
  stored in the macOS Keychain of the account that runs Outpost (an item named
  "Outpost network share") and read back from there. With it off, nothing is kept and
  you are asked again next time. The database holds the server, the share and the user
  name only.
- **Reconnecting.** Shares with a remembered password are connected again when Outpost
  starts, and every five minutes after that while their server cannot be found (a NAS
  that starts more slowly than the Mac). **Reconnect** does it at once. Outpost stops
  trying after the server refuses the password, so that a changed password does not
  lock the account on the NAS; enter the new one to carry on.
- **Disconnect** unmounts the share and leaves it disconnected until you ask. If
  something is being written there (a download, a move), Outpost names it and asks
  before going ahead, and macOS itself refuses while a program has files open on the
  share. Outpost never forces it.
- **Forget this share** disconnects it, deletes the Keychain item and removes the
  share from the list. Files on the share are not touched, and a storage location on
  it stays in Outpost, shown as disconnected, until you remove that too.

States shown: connected, not connected, wrong password, server not found, share not
found, password needed.

If the share is already connected on the Mac (from the Finder, say), Outpost uses that
connection rather than making a second one, and tells you that the password you typed
was not checked or saved. A share used this way has no remembered password, so after
it is next disconnected Outpost asks for the password to connect it again.

Keychain access needs someone to be logged in at the Mac. If Outpost is started before
anyone logs in, remembered shares stay disconnected until **Reconnect** is used with
the password.

### In Docker and on Linux

The form asks for the server, the share and the user name (or, for NFS, the exported
folder), **not** the password, and writes out the text to use, each block with a copy
button. The share's name is typed here: listing a server's shares needs a sign-in, and
this form never asks for the password. They are instructions: nothing changes until you make the changes yourself.
What it writes has the same shape as the examples in the next section. For Docker: the
`.env` lines, the Compose volume, and the lines for the `outpost` and `kiwix` services.
For Linux: the credentials file, the `/etc/fstab` line and the commands to run.

What has been tried and what has not:

- The Docker SMB volume and service lines were tried with Docker Desktop against a test
  Samba server, with stand-in containers in place of the real services.
- The Linux `/etc/fstab` lines and both NFS variants were written from the examples
  below and have **not** been tried on a real system.
- Nothing here has been tried against a real NAS.

## NAS set-up examples

Outside a Mac, Outpost does not connect shares itself and has no place to enter a share
password. The operating system or Docker mounts the share; Outpost sees a folder.
**Credentials stay with the operating system or Docker and are never stored by
Outpost.** (On a Mac, see [Connecting a network share](#connecting-a-network-share).)

Whatever you mount for the `outpost` service must also be mounted, at the same path
and read-only, for the `kiwix` service. kiwix-serve opens archives by the path Outpost
wrote into its library file.

Keep the database off the share (see above). Mount shares for content only.

### A share mounted by the host, then bind-mounted

Mount the share on the host first.

NFS, in `/etc/fstab`:

```
192.168.1.20:/volume1/outpost  /mnt/nas/outpost  nfs  rw,nfsvers=4.1,soft,timeo=150,nofail  0  0
```

SMB, in `/etc/fstab`, with the password in a file only root can read:

```
//192.168.1.20/outpost  /mnt/nas/outpost  cifs  credentials=/root/.outpost-smb,uid=1000,gid=1000,file_mode=0664,dir_mode=0775,vers=3.0,nofail  0  0
```

`/root/.outpost-smb` (mode `600`):

```
username=your-nas-user
password=your-nas-password
```

Then, in `compose.yaml`:

```yaml
services:
  outpost:
    volumes:
      - /mnt/nas/outpost:/storage/nas
  kiwix:
    volumes:
      - /mnt/nas/outpost:/storage/nas:ro
```

The folder must be writable by uid 1000, the user the server runs as. For SMB the
`uid=1000,gid=1000` mount options do this. For NFS, set ownership or permissions on
the NAS.

### A share mounted by Docker

`compose.yaml` carries these as commented examples. Docker mounts the share when the
container starts.

NFS:

```yaml
volumes:
  nas-library:
    driver: local
    driver_opts:
      type: nfs
      o: "addr=192.168.1.20,rw,nfsvers=4.1,soft,timeo=150"
      device: ":/volume1/outpost"
```

SMB / CIFS:

```yaml
volumes:
  nas-library:
    driver: local
    driver_opts:
      type: cifs
      o: "addr=192.168.1.20,username=${NAS_USER},password=${NAS_PASSWORD},uid=1000,gid=1000,file_mode=0664,dir_mode=0775,vers=3.0"
      device: "//192.168.1.20/outpost"
```

`NAS_USER` and `NAS_PASSWORD` come from `.env` (keep that file readable only by you).
They are used by Docker to mount the volume and are not passed to Outpost.

Use the volume in both services:

```yaml
services:
  outpost:
    volumes:
      - nas-library:/storage/nas
  kiwix:
    volumes:
      - nas-library:/storage/nas:ro
```

After `docker compose up -d`, add `/storage/nas` on the Storage screen and choose
"Network share" as its kind.

## External USB drives

The pattern is always the same: make the drive appear under a storage root, add it on
the Storage screen, and mount it into the `kiwix` service too if you use Docker.

| System | Where the drive appears | In `compose.yaml` |
| --- | --- | --- |
| Linux | Wherever you mount it, for example `/mnt/usb-ssd` | `- /mnt/usb-ssd:/storage/usb-ssd` |
| macOS | `/Volumes/<name>` | `- /Volumes/FieldSSD:/storage/field-ssd` |
| Windows, from WSL 2 | `/mnt/<letter>/...` | `- /mnt/d/outpost:/storage/drive-d` |
| Raspberry Pi | As Linux | As Linux |

Notes:

- On Linux and Raspberry Pi the folder must be writable by uid 1000. For exFAT, FAT32
  and NTFS drives use the mount options `uid=1000,gid=1000`.
- Running without Docker and without `OUTPOST_STORAGE_ROOTS`, Outpost already treats
  `/Volumes` (macOS) and `/media/<user>`, `/run/media/<user>` and `/mnt` (Linux) as
  roots, so a plugged-in drive can be added directly. If you set `OUTPOST_STORAGE_ROOTS`
  yourself on a Mac, include `/Volumes`, or shares connected from the Storage screen
  cannot be added as locations.
- With Docker, a drive that was not mounted when the containers started may not be
  visible inside them. If a location stays disconnected after you plug its drive back
  in, restart the stack with `docker compose restart`.
- [deployment.md](deployment.md#platform-notes) has the Windows path forms and more on
  each platform.

## Moving a collection to another location

Open the collection in **Library** and choose **Move**, or call
`POST /api/collections/:id/move`. Collections are the installed archives: reference
collections, map regions, terrain, and other catalogue files. The move runs as a
background job you can follow under **Downloads**.

What the move guarantees:

1. Before starting, Outpost checks that the target is connected, has room for the
   collection plus a 256 MB reserve, and has no file at the same path. It never
   overwrites.
2. The original is copied to `<name>.part` on the target. The original is only read.
3. If a checksum was recorded at install time, the bytes read from the original must
   match it; otherwise the move stops and the collection is not moved.
4. The copy is read back from the target and compared with what was read from the
   original. A mismatch discards the copy and leaves the original untouched.
5. Only then is the copy renamed into place and Outpost's record switched to the new
   location.
6. Only after that is the original deleted. If it cannot be deleted, the move still
   succeeds and the job says the original is still at its old place.

Stopping at any point before step 5 (an error, pause, cancel, shutdown or unplugged
drive) removes the partial copy and leaves everything as it was. The collection stays
readable from its original place throughout.

Folders that contain symbolic links or special files are not moved.

## Moving documents to another location

Documents are moved together, not one by one. **Move documents here** in a location's
menu on the Storage screen (`POST /api/documents/move`) moves **every document that is
not already there**. It runs as a
background job ("Move documents to …").

For each document:

1. The original is copied to `<name>.part` on the target while its SHA-256 is computed.
2. That checksum must equal the one recorded when the document was added. If it does
   not, the copy is discarded and the document stays where it is.
3. The copy is renamed into place and Outpost's record is pointed at it. The document
   keeps its id, so links, tags and search results are unaffected.
4. Only then is the original deleted, along with its folder if that is now empty.

A document that cannot be moved (its drive is disconnected, the file is missing, the
target fills up) is left exactly where it was and listed in the job's result with the
reason. Before starting, Outpost checks that the target has room for all of them plus
the 256 MB reserve. Unlike a collection move, the copy is not read back from the
target a second time.

New documents go to the default location, or to the one you pick when uploading.

## Checking a collection (verify)

**Check files** on a collection's page, or `POST /api/collections/:id/verify`, reads the whole file
and compares its SHA-256 with the one recorded when it was installed. For a collection
that is a folder, the digest covers every file and its path.

| Outcome | Meaning |
| --- | --- |
| `ok` | The file matches its recorded checksum. |
| `recorded` | No checksum was known, so there was nothing to compare with. One is recorded now for future checks. |
| `damaged` | The file no longer matches. Download it again or restore it from a backup. |
| `missing` | The location is connected but the file is not on it. |

Downloads from the catalogue are checked against the checksum published by the source
before they are installed, so a freshly installed collection has already been verified
once.

## What is taking the space

The Storage screen shows, for each location, its capacity and free space, and how much
each kind of content uses: documents, reference collections, maps, terrain, place
names and other files. The same numbers are in `GET /api/storage/locations` under
`usage`.

Outpost always leaves 256 MB free on a location. A download, upload or move that would
go past that is refused before it starts, with the space needed and the space free.

For everything else that takes space (the database, extracted text, caches, part files
and files nobody recorded), and for removing things, see the next section.

## The database

The Storage screen has a **Database** section for the one SQLite file
(`outpost.db` in the data directory) that holds everything Outpost keeps that is not a
file: notes, library records, the search index, vectors for search by meaning, saved
places and routes, contacts, chat, repeaters, the radio log, settings and the history
of work. It shows:

- **Where:** the file's path, as the screen shows the folders of storage locations, and
  the free space on the drive it is on. Below 256 MB free (the reserve Outpost keeps
  on every location) it says the drive is nearly full.
- **Size:** the file, and the write-ahead log beside it (recent changes not yet folded
  into the file).
- **What is in it:** counts named as the rest of the app names them (documents,
  passages in the search index, passages read for search by meaning, pages of notes,
  saved places, routes, place names, contacts, chat conversations, repeaters,
  communication plans, logged contacts, profiles, saved predictions), and where the
  bytes go in seven groups: search index, search by meaning, library records, notes,
  maps, radio, everything else, plus the unused pages.
- **State:** how many of the layout changes (migrations) this version of Outpost knows
  have been made, the SQLite version, the journal mode, and the last backup written to
  a storage location, scheduled or with **Back up now**. A backup downloaded from
  Settings is not recorded anywhere, so it is not shown.

### How the figures are measured, and what it costs to look

Opening the screen reads the file's size, a few numbers from its header (page count,
unused pages, journal mode) and two small tables. On a 306 MB test database with
80,000 passages and vectors, `GET /api/database` answered in 5 to 13 ms.

The counts and the sizes need every page read. That is done by SQLite's `dbstat`
table, on a separate read-only connection in a worker thread, so the server goes on
answering; it took 0.1 to 0.5 seconds on that database with the file in the system's
cache, and will take longer from a cold disk or an SD card. It is worked out the first
time anyone looks after the server starts, kept with the time it was worked out, and
worked out again only when someone presses **Work out again** or space has been
reclaimed. Every page of the file belongs to one table or index or is unused, so the
groups and the unused space add up to the size of the file exactly. A build of SQLite
without `dbstat` shows the counts only and says so; nothing is estimated.

### Checking the database

**Check the database** runs SQLite's `quick_check`, which reads every page and checks
that each is well formed. **Run the full check** runs `integrity_check`, which also
checks that every index holds exactly the rows of its table. Both are jobs on a queue
of their own (`database`), run in a worker on a read-only connection; Outpost carries
on as usual meanwhile. On the test database the quick check took 0.4 seconds and the
full one 0.4 to 1.8 seconds (the higher figures with other work on the machine). A
check that finds problems shows SQLite's own first ten lines, and points to restoring
the newest backup that passed its check. Anyone who can open Outpost may start a
check: it only reads.

Neither check looks inside the full-text index's own structures (FTS5 has a separate
`integrity-check` command, which needs a writable connection); that is not checked.

### Reclaiming unused space

When things are removed, SQLite keeps their pages in the file for reuse rather than
giving them back to the drive. **Reclaim unused space** runs `VACUUM`, which rewrites
the whole file without them. It is offered when at least 1 MB is unused, and its costs
are stated beside it:

- **Room.** SQLite builds the rewritten database in its temporary folder, then copies
  it back through the write-ahead log, so the drive needs room for two copies of what
  is in use, plus the 256 MB reserve (one copy on each drive when the temporary folder
  is on another). On the test database (306 MB, 266 MB in use) the files peaked at
  533 MB beside the temporary copy. Without the room it is refused, and the screen
  says how much is needed.
- **Nothing can be saved while it runs.** It holds the database's write lock from
  start to finish. Reading goes on: on the test database, pages kept answering in 1 to
  11 ms throughout. Every request that would change something is refused with a
  message saying why, and work that would write waits: no job starts on any other
  queue (a scheduled backup is made at the next minute after), and a backup cannot
  take its copy of the database. It took 1.4 seconds on an idle machine and 3.9
  seconds under load for the 306 MB file; expect a few times as long as the full check.
- **It is refused while any job is running** (a backup, an import, an index build, a
  download, a move), naming what is running; pause it or wait for it to finish.
- **It lets changes already under way finish first.** A request that may write, on
  any path (an upload still arriving, a form being saved, a write to the phones' address
  book under `/dav/`), and a reply the model is writing are counted from when they
  start until they have finished. Once a reclaim begins, new changes are refused with
  the reason, and the reclaim waits up to 30 seconds for those under way; if one is
  still going then, the reclaim stops without changing anything and says what it was
  waiting for. While it waits and while it runs, work that is not a request holds
  back: the backup timer, jobs on other queues (downloads, a kept area's refresh), the
  storage check and the semantic index's own catching up wait for it to finish.
- **A write that meets the lock anyway** (one that reads with `GET`, or another
  program holding the database) is answered `409` with the reason, never as a fault.
- **It cannot be stopped part way,** because stopping would undo it. If the server
  stops while it runs, the rewrite is rolled back when the database is next opened:
  nothing is lost but the time.

Reclaiming is accepted only from the computer Outpost runs on, or from anywhere when
Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`, the rule that restarting
Outpost follows. It changes nothing a person keeps, but while it runs nobody on the
network can save anything, and with no accounts any device could otherwise do that
as often as it liked.

Code: `apps/server/src/modules/database/`, `apps/web/src/features/storage/database-section.tsx`.

## Managing and cleaning up

**Storage → Manage and clean up** (`/storage/manage`) is one place to see everything
Outpost is storing, remove what is not wanted, and clean up. It is also linked from
Downloads and Explore (**Manage what is downloaded**), from Settings, from the command
palette, and from the warnings shown when a drive is too full (**Free up space**). It
has four views.

Nothing on this screen happens by itself. Every removal is something you choose, is
shown to you first as counts and sizes, and has to be confirmed. That is the one
exception Outpost makes to "never delete a person's files": you asked, in so many
words.

### Space

What is taking the space, by kind and by location, with free space.

| Figure | Where it comes from |
| --- | --- |
| Reference archives, maps, terrain, place names, catalogue sheets and books, your documents | Outpost's records of what was installed. Available at once, and for a location that is not connected. |
| Pictures and files in notes, text read from documents, programs for portable drives, search model files, data set aside by a restore, unfinished downloads, files no record refers to, the database file | Measured from the files. |
| Search passages and semantic vectors | Estimates. Both live inside the database file, so their share can only be worked out: vectors are counted and multiplied by their size; passage text is summed and half as much again is added for the word index. They are shown as part of the database, not added to the total twice. |

Measuring means walking folders, which on a network share with thousands of documents
takes a while. So it runs in the background, never more than one at a time, and the
screen says when the figures were taken and when a new count is under way. A row that
has never been counted says "Counting" rather than showing a guess. **Count again**
starts a count now; otherwise a count is at most five minutes old, and a new one starts
when you look after something has changed.

A location that is not connected shows what Outpost last knew (how much of its own was
there, the free space when it was last seen, and when that was) and says it is
disconnected. Nothing on it can be measured or deleted until it is back.

### Installed

Every collection and document in one list, with its kind, location, size and the date
it was added. Filter by name, kind, location, or whether it was downloaded or is your
own; sort by size, date, name, kind or location.

A catalogue sheet or book is listed once. It is one file with two records, an entry in
your collections and a document in your library, and the two are removed and moved
together.

Tick one or many, then:

- **Remove.** The dialog shows what the selection adds up to, by kind and by location,
  how many of the items are your own and cannot be downloaded again, and anything that
  will be left alone and why. You choose whether the files are deleted or only
  Outpost's records are removed. The rules are the ones the Library already has:
  - a catalogue item and its document go together;
  - a file on a location that is not connected cannot be deleted. It is left alone, in
    your library, unless you tick **Forget it anyway**, which removes Outpost's record
    and leaves the file on the drive;
  - anything being moved or checked is refused, and named.
- **Move** to another location. This starts the same checked moves as the Library: one
  job per collection, and one for all the documents chosen. The copy is verified before
  the original is removed. Room is checked for the whole selection before anything
  starts, and whatever cannot be moved is named with the reason.

Removing runs as a job with progress and a **Stop** button. When it finishes, or is
stopped, the screen says what was deleted, what was only forgotten, what was left as it
was, and what could not be removed and why, with the path of every file that was not
deleted.

### Leftovers

What is on disk or in the records that no longer serves anything. Each group says what
its things are and what clearing them does. Nothing is cleared that you did not tick.

| Leftover | What clearing it does |
| --- | --- |
| Downloads that did not finish | Deletes the partial file (`<name>.part`, and for a map region the plan and progress files beside it) and takes the download off the Downloads screen. |
| Records whose file has gone | The file is no longer on its location, which is connected. Removes the record and its text in search. There is no file to delete. A catalogue item can be downloaded again from Explore. |
| Files no record refers to | A file inside `collections/` or `documents/` in a storage location that no collection, document, download or move lays claim to, and that has not changed for ten minutes. Deletes that file. |
| Uploads that did not finish | Parts of uploads more than a day old in `documents/.incoming/`. Deletes them. |
| Things that can be fetched or worked out again | Programs fetched for portable drives (fetched again, 50 to 100 MB per kind of computer, when a drive is next written); search model files left in `models/` by earlier builds (not used any more: the built-in model is part of the app); text kept for documents that are no longer in the library; database copies left by a backup that was cut off. |
| Data set aside by a restore | The `before-restore-<time>` folders. Deleting one means that restore can no longer be undone by hand. |
| History | The lists of finished work and finished downloads. A failed download keeps its entry so that it can still be retried. |

Outpost only ever looks inside the two folders it makes in a storage location,
`collections/` and `documents/`. Anything else you keep on the same drive is never
listed, measured or deleted, and symbolic links are never followed. Before a file is
deleted it is checked again: still inside one of those folders, still a plain file,
still not used by anything.

### Clean up

Three clean-ups, in order of how much they take.

**1. Remove all downloaded content.** Everything that came from the catalogue or a
download and can be fetched again.

- Removes: reference archives, maps, terrain, place names, catalogue sheets and books
  (with the documents they are in your library), and downloads still under way or left
  unfinished, with their partial files.
- Keeps: documents you added, notes, contacts, chat conversations, repeaters, radio
  plans and logged contacts, saved places and routes, archives and maps of your own
  that you pointed Outpost at, settings, storage locations and network shares.
- Content on a location that is not connected is left behind and stays in your
  library. The summary lists it; tick **Forget them as well** to remove Outpost's
  records and leave the files on the drive.

**2. Clear and rebuild search data.** What Outpost works out from your library. You
tick which:

- *Clear semantic vectors.* Search by meaning finds nothing until the index is built
  again from Settings, which runs every passage through the model once more.
- *Read the text of every document again.* Rebuilds extracted text and search passages
  from the original files, one document at a time. Each document stays searchable by
  its old text until the new text is in. Text read by OCR is kept. Documents on a
  location that is not connected are skipped.
- *Compact the database.* Deleting things leaves empty space inside the database file;
  this hands it back to the disk. Outpost stops answering while it runs, about a second
  for every 100 MB, and it needs free space equal to the size of the database.

Nothing you keep is lost by any of these. The keyword index is not cleared separately:
it is rebuilt from the extracted text, which the second option does.

**3. Erase everything and start again.** The only clean-up that destroys things that
cannot be downloaded again.

- Removes: everything the first clean-up removes; documents you added, files and all;
  notes and their attachments; saved places and routes; contacts; every chat conversation
  with its messages; every repeater, both the lists you imported and the entries you
  added or changed; what the HF planner keeps for you (communication plans, the contact
  log, radio and antenna profiles, saved predictions and coverage maps, and every
  answer worked out); settings; search data; the history of downloads and other work; and
  the copies of earlier data that a restore set aside (they hold the same notes). The
  summary shown before it starts counts each of these.
- Keeps: storage locations and their marker files; network shares and any password
  remembered in the Keychain; catalogue manifests of your own; programs fetched for
  portable drives and search model files (clear those from Leftovers); the catalogue's
  last answers, so Explore still reads offline; and the kiwix-serve program, which is
  not Outpost's.
- Leaves alone, and says where they are: any file outside the folders Outpost made (an
  archive of your own that you pointed Outpost at), and everything on a location that
  is not connected. Outpost forgets them; delete them by hand if you want them gone.
- Does not delete backups kept on a storage location by automatic backups. They hold
  the notes that are being erased; delete them from **Settings → Automatic backups**
  first, or by hand from the `outpost-backups` folder, if you want them gone.
- Needs the words "erase everything" typed, and offers a backup first. A backup holds
  notes, attachments, saved places, routes, contacts, chat conversations, repeaters,
  radio plans, logged contacts and equipment profiles, and settings. It does **not**
  hold the files
  of documents you added: copy those from the `documents` folder of each storage
  location if you want to keep them.
- Can only be started on the computer Outpost runs on, unless Outpost was started with
  `OUTPOST_ALLOW_REMOTE_ERASE=true`. From any other device the screen says so and does
  not offer the button. See [security.md](security.md#erasing-everything).

Content is deleted through the same code as removing one item at a time, then the
database is emptied in place and compacted. No restart is needed, and no folder is
deleted wholesale in a storage location.

Each clean-up runs as a job with progress and can be stopped. Only one runs at a time.
A stopped clean-up leaves what it had already removed removed, and reports what it had
and had not reached.

## One location per item

Each document and each collection lives on exactly one location. Outpost does not
combine drives into a pool, mirror content across drives, or split a collection
between them. Storage pools are a possible future extension; nothing in this version
implements them.

## Backing up

**Settings → Backup** saves one `.zip` with the database, note attachments, extracted
text and your own catalogue manifests. It does not include documents, collections or
maps: those stay on their storage locations, and the backup records where.

A backup is not encrypted unless you set a passphrase for backups (see
[Protecting backups with a passphrase](#protecting-backups-with-a-passphrase)). Without
one it holds your notes, contacts, saved places and settings as they are, and anyone
who can open the file can read them: keep it on storage you trust, and on an encrypted
disk if it leaves the house.

Restoring replaces the database, attachments and extracted text after a restart. The
data they replace is kept in the data directory in a folder named
`before-restore-<time>`. After a restore, add the same storage locations again (their
marker files are recognised) to bring the content back.

Restoring can only be done on the computer Outpost runs on, unless Outpost was started
with `OUTPOST_ALLOW_REMOTE_ERASE=true`: it replaces everything at once, as erasing
does. From another device the screen says so and does not offer it. See
[security.md](security.md#backup-and-restore).

### Protecting backups with a passphrase

**Settings → Backup → Protect backups with a passphrase** is off to begin with. Set a
passphrase, typed twice, and every backup made from then on is encrypted: the ones made
on the schedule, the ones started with **Back up now**, and the download from Settings.
A protected backup is named `….zip.enc`, and restoring one asks for the passphrase.

**A protected backup cannot be opened without the passphrase, and Outpost cannot recover
it.** The screen says so before the passphrase is set. Outpost does not keep it: what it
keeps is a public key, which can only lock, and the matching private key locked under
the passphrase. That is why a backup can be made at three in the morning with nobody
there, and why nothing on the computer can read one back afterwards. Write the
passphrase down and keep the paper somewhere other than with the backups.

- **Any passphrase is accepted.** There are no rules about length or kinds of
  character. One shorter than twelve characters is said to be short, because anyone
  who gets a backup file can try passphrases against it for as long as they like;
  **Suggest one** makes five random words of five letters, which is 80 bits.
- **Changing it** applies to backups made afterwards. The ones already made are not
  touched: each still opens with the passphrase that was set when it was made, so keep
  the old one for as long as you keep them. The old passphrase is not asked for when
  you change it, so a forgotten one does not stop you protecting what comes next. The
  list of stored backups shows for each whether it is protected, and marks the ones
  that open with an earlier passphrase.
- **Switching it off** makes the backups made from then on plain zips again. It
  decrypts nothing: protected backups stay protected.
- **Where it can be set.** Setting, changing and removing the passphrase are accepted
  only where restoring is: at the computer Outpost runs on, or from other devices when
  Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`. Otherwise anyone on the
  network could set a passphrase of their own and lock you out of every backup made
  from then on. And a passphrase is never accepted from another device over plain
  `http`, whatever that option says, because it would cross the network where anyone
  could copy it: from another device, open Outpost at its `https` address
  ([deployment.md](deployment.md)). The same goes for the passphrase typed to restore.
- **Restoring.** Choose the file, or **Restore this one** in the list, and give the
  passphrase. A wrong passphrase is said to be wrong; a file that has been damaged,
  altered or cut short is said to be that, and nothing of it is restored. The backup is
  decrypted in memory as it is unpacked; no decrypted copy of the file is written. On a
  fresh installation the file and the passphrase are all that is needed, and the
  restored Outpost goes on protecting its backups with that same passphrase.
- **After restoring an older backup onto an Outpost that protects its backups**, the
  passphrase in use stays the one in use: the older backup's passphrase does not come
  back with it.
- **A portable drive** carries the setting, so a backup made from the drive is
  protected with the same passphrase.

**What protection does not hide.** The file's name and its header say when the backup
was made, which version of Outpost made it and how large it is; the small
`.verified.json` file beside a stored backup says the same. Nothing about what is in
the notes can be read from them. And the passphrase is all that stands between the file
and whoever holds it: a short or guessable one can be found by trying. Deriving the key
is made slow on purpose (about a second, and 32 to 512 MiB of memory, on the computer
that set the passphrase) so that each guess costs that much.

**What it does not protect.** Outpost itself: anyone who can open it on your network
can still read the notes there. The data directory, which is not encrypted. Backups
made before a passphrase was set. Storage locations (documents, collections, maps),
which are not in a backup at all.

**A protected backup is checked after it is written like any other.** The run that
wrote it still holds the key of that one file in memory, reads the whole file back with
it, and then discards it. After that only the passphrase opens the file.

**What it costs.** Measured on 16 November 2026 on an Apple M-series Mac with 32 GB
(Node 24.15), three runs each, while other work was running on the machine, so the
times are rough. "Small" is a new library with one note and a 300 kB attachment;
"large" is 500 MB of attachments, half of them bytes that do not compress, which makes
a 251 MB backup. A backup is timed from **Back up now** to the end of its check; a
restore from the request to the backup being staged. Memory is the most the whole
server process held, which idles at about 310 MiB.

| | Plain | Protected |
| --- | --- | --- |
| Small, back up | 0.06 to 0.07 s, 322 to 330 MiB | 0.06 to 0.08 s, 332 to 349 MiB |
| Small, restore | 0.02 to 0.03 s, 321 to 329 MiB | 1.06 to 1.07 s, 819 to 824 MiB |
| Large, back up | 5.8 to 6.3 s, 430 to 446 MiB | 6.5 to 10.5 s, 472 to 488 MiB |
| Large, restore | 0.7 to 0.9 s, 415 to 430 MiB | 2.3 to 2.9 s, 815 to 829 MiB |

Making a protected backup costs little more than making a plain one: no passphrase is
involved, and the encryption is far quicker than the compression. Restoring one costs
the second and the memory that deriving the key is meant to cost (here 512 MiB, the
most Outpost ever asks), and reads the file twice: once to check every chunk, once to
unpack it. A computer with less memory chooses a smaller cost when the passphrase is
set there; a backup made on a large computer and restored on a small one needs the
memory its header asks for, and the restore says so if it is not there.

#### The protected backup file

Written out so that another program can read one. Version 1; integers are big-endian.
Code: `apps/server/src/modules/backup/sealed.ts`. A test
(`apps/server/test/backup-protection.test.ts`) opens a backup with a reader written
from this section alone.

The file is a header followed by the zip that an unprotected backup would have been,
encrypted in chunks.

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 8 | The ASCII letters `OPBACKUP`. |
| 8 | 1 | Format version: `1`. |
| 9 | 4 | `H`, the length of the header in bytes: `210 + M`. |
| 13 | 4 | `C`, the bytes of zip in each chunk but the last. Outpost writes 65,536. |
| 17 | 32 | The public key the backup is encrypted to (X25519, the 32 raw bytes). |
| 49 | 32 | The public key made for this one file (X25519, raw). |
| 81 | 1 | scrypt cost: `N` is 2 to the power of this byte, 15 to 20. Outpost writes 15 to 19. |
| 82 | 1 | scrypt `r`: `8`. |
| 83 | 1 | scrypt `p`: `1`. |
| 84 | 32 | scrypt salt. |
| 116 | 12 | Nonce of the wrapped private key. |
| 128 | 48 | The wrapped private key: 32 encrypted bytes, then a 16-byte tag. |
| 176 | 2 | `M`, the length of the manifest in bytes, at most 16,384. |
| 178 | `M` | The backup's `manifest.json`, as UTF-8 text, in the clear. |
| 178 + `M` | 32 | SHA-256 of every byte of the header before this one. |

Then, from offset `H` to the end of the file, the chunks, one after another. Each is
its encrypted bytes followed by a 16-byte tag. Every chunk but the last holds exactly
`C` bytes of the zip; the last holds what is left, between 1 and `C` bytes (0 only when
the zip itself is empty). So the number of chunks is the length of the rest of the file
divided by `C + 16`, rounded up.

To open one:

1. **The passphrase's bytes** are its UTF-8 encoding after Unicode normalisation to
   NFC. Nothing is trimmed.
2. **The wrapping key** is `scrypt(passphrase bytes, salt, N, r, p)`, 32 bytes.
3. **The private key** is the wrapped private key decrypted with ChaCha20-Poly1305
   (RFC 8439) under the wrapping key and the nonce beside it, with the ASCII text
   `outpost-backup-v1 key` followed by the 32 bytes at offset 17 as associated data. If
   the tag does not match, the passphrase is wrong. The X25519 public key of the result
   must equal the bytes at offset 17.
4. **The shared secret** is X25519 of that private key and the public key at offset 49.
5. **The file key** is HKDF-SHA-256 (RFC 5869) of the shared secret, 32 bytes long,
   with salt the 32 bytes at offset 49 followed by the 32 bytes at offset 17, and info
   the ASCII text `outpost-backup-v1 file` followed by the 32-byte SHA-256 that ends
   the header.
6. **Each chunk** is decrypted with ChaCha20-Poly1305 under the file key, with no
   associated data and a 12-byte nonce: the chunk's number, counting from 0, as an
   11-byte integer, then one byte that is `1` for the last chunk of the file and `0`
   for every other. A chunk whose tag does not match means the file is damaged,
   altered or cut short, and the whole file is refused.

The last byte of the nonce is what makes a file cut off exactly between two chunks fail:
its last chunk was not written as the last. The numbering is what makes chunks that
have been swapped, dropped or repeated fail. The checksum in the header catches
accidental damage there before a passphrase is tried, so that damage is not reported as
a wrong passphrase; because it also goes into the file key, a header altered on purpose
with its checksum put right opens nothing. One case cannot be told apart: a salt or
wrapped key altered that way looks the same as a wrong passphrase.

The manifest in the header is what lets Outpost list a protected backup, with its date
and version, without the passphrase. It is the same text as `manifest.json` inside, and
a restore reads the one inside.

Outpost reads `N` up to 2 to the power 20 (1 GiB of memory) and refuses a header that
asks for more, a chunk size below 4 KiB or above 4 MiB, and any other `r` or `p`.

### Automatic backups

**Settings → Automatic backups** makes the same backup on a schedule and keeps it on a
storage location. It is off until you choose a location.

- **Where.** Any storage location that is connected, a network share included. Backups
  go into a folder named `outpost-backups` at the top of that location, and nowhere
  else. The files are named
  `outpost-backup-<date and time, UTC>-scheduled.zip` (or `-manual.zip` for one started
  with **Back up now**), ending `.zip.enc` when backups are protected with a passphrase. Outpost writes through the folder the location is mounted at;
  it does not read or store anything about a share's sign-in for this.
- **When.** Every day, or every week on a day you choose, at a time you choose, by the
  clock of the computer Outpost runs on. The first one is made at the next such time
  after you choose, not at once. **Back up now** makes one whenever you like and does
  not change the schedule.
- **How it is made.** Each backup is a job (it shows under Downloads with the other
  background work). The database is copied with SQLite's online backup, which gives one
  consistent state even while notes are being saved. The file is written as
  `<name>.zip.part` and flushed to the disk. Then it is read back from the location
  from start to finish: every file in it must match the checksum the archive recorded,
  and the database inside must pass SQLite's integrity check. Only then is it recorded
  as verified, in a small file beside it, `<name>.verified.json`, and given its own
  name; so a backup is not listed while it is being checked.
- **If the check fails.** The job fails and says why, the screen reports it, and the
  file is kept, shown as **Not verified**. It is never counted towards the number to
  keep and never replaces a good backup. A scheduled backup that failed is tried again
  after an hour, then after two, four and eight, the wait doubling up to a day until
  one succeeds; the screen says when the next try is. The next scheduled time is always
  tried when it comes.
- **Backups that failed their check do not pile up.** Outpost keeps the newest two
  archives whose check failed or was cut short (the fault may be in the checking, not
  in the file) and removes older ones as each new one is written. It tells them by a
  small file it writes beside each, `<name>.failed.json`, and removes one only while it
  is still the size that run wrote. A verified backup, a backup with no such file
  beside it (one you copied in by hand, say) and anything that is not Outpost's are
  never removed this way.
- **If the location is not connected.** The backup is skipped. Nothing is written
  anywhere else: not to another location, not to the data directory. The screen says
  when the last backup was, which one is owed, and that the location is not connected.
  The backup is made as soon as the location is seen again, or when the server next
  starts and finds it. However many times were missed, one backup is made.
- **How many are kept.** Seven by default. The newest seven scheduled backups and the
  newest seven started by hand are kept, counted separately, so that pressing **Back up
  now** several times cannot push the scheduled ones out. Older ones are deleted after
  each successful backup. Outpost deletes a file only if it has the name Outpost gives
  its backups, is an ordinary file (not a link), sits directly in `outpost-backups`,
  and still reads as an Outpost backup when it is opened. Anything else in the folder
  is left alone, and the newest verified backup is never deleted this way.
- **The list.** Each stored backup is shown with its date, size, the version of Outpost
  that made it, and whether it verified. From there you can download one, restore one
  (**Restore this one** checks it again and stages it, exactly as an uploaded backup
  is), or delete one after confirming.
- **Who may do what.** Any device that can reach Outpost can choose a location, change
  the schedule, start a backup and download one. Restoring, deleting a stored backup
  and lowering the number to keep (which deletes older ones at the next backup) can
  only be done on the computer Outpost runs on, unless Outpost was started with
  `OUTPOST_ALLOW_REMOTE_ERASE=true`.

Switching automatic backups off, removing the location from Outpost, or **Erase
everything** does not delete the backups already made: they stay in `outpost-backups`
until you delete them. "Erase everything" resets settings, so it also switches
automatic backups off. The schedule is not copied to a portable drive.

Not tried: a share that drops part-way through a write on a real NAS. The tests stand
in for it with a folder that is moved away and an empty folder left in its place, which
is what an unmounted share looks like on Linux.

Three things a restore deliberately does not carry over:

- **Catalogue manifests.** They are in the backup for safe keeping, but they decide
  which hosts Outpost will download from, so a backup file is not allowed to change
  them. Copy your own manifests back by hand from the `catalog` folder inside the zip.
- **Network shares.** The shares the other machine had connected are not remembered
  here; connect them again from the Storage screen.
- **Unfinished work.** Downloads and other jobs that were queued or running when the
  backup was made do not start on the machine it is restored to.

Back up the storage locations themselves with whatever you use for files: they are
ordinary folders.

The `before-restore-<time>` folders can be deleted from **Storage → Manage and clean up
→ Leftovers** once you are sure a restore was right.

See also [security.md](security.md) and [troubleshooting.md](troubleshooting.md).
