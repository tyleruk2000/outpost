# Storage

## Two kinds of place

**The data directory** holds what Outpost owns: the database (notes, library records,
settings, the search index), attachments, text extracted from documents, your own
catalogue manifests and `secret.key`. It is `OUTPOST_DATA_DIR`; in Docker, `/data`.
**Keep it on a disk that is part of the machine and always attached**: a database on a
network share can be corrupted.

**Storage locations** hold content: documents, reference collections, maps and other
downloads. Each is a folder you choose, on any drive or share, inside a **storage root**
(`OUTPOST_STORAGE_ROOTS`, set by whoever runs the server; `/storage` in Docker; the
Storage screen lists them under "Where Outpost can look"). Outpost starts with one,
"Internal storage", and writes nothing to a location but content and its marker file,
`.outpost-location.json`. Each document and collection lives on exactly one location;
nothing is mirrored across drives.

## Adding a location

1. Make the drive or share visible inside a storage root. On a Mac a plugged-in drive
   already is, and a NAS can be [connected from Storage](#connecting-a-network-share).
2. **Storage → Add location**, and pick or make the folder.
3. Name it and choose its kind (a label only). **Use for new downloads** makes it the
   default.

A folder that overlaps another location cannot be added.

- **The default location** (**Make default**) receives uploads and downloads unless you
  choose another.
- **Where new things go** sets a location per kind (maps, terrain, place names, map
  layers, collections, documents), for new downloads only. If that location is not
  connected, the download is refused rather than sent elsewhere.
- **Removing** a location makes Outpost forget the folder; nothing in it is deleted. A
  location that still holds documents or collections, or the last one, cannot be
  removed. Removing the automatic backups' location stops them until another is chosen.

## The marker file and reconnecting

Outpost records content by location and path inside it, and finds a location by its
marker file. Do not edit or delete it except to settle two copies.

- **A drive that comes back elsewhere is found**, by searching every storage root up to
  three folders deep.
- **A different drive at the old path is not used**: "The folder is there but is not
  this Outpost location."
- **A folder with another Outpost's marker** (or from before a restore) is adopted, so
  records line up again.
- **Two folders with the same marker**: the location is shown disconnected with both
  named. Remove the copy, or its marker, and press **Check drives**.

Locations are checked every 30 seconds (**Settings → Storage**), at start and on
**Check drives**.

### Moving a library to another disk or folder

1. Stop Outpost.
2. Copy the location's folder itself, **with its hidden marker file**.
3. Put the new place inside a storage root, and the old one outside (while both are
   inside, the old one is used).
4. Start Outpost. It finds the marker at the new place.

## What happens when a drive is unplugged

The location shows as **disconnected**. Nothing is removed: its documents stay listed
and searchable but cannot be opened, its reference collections leave the reader, and a
download writing to it stops and resumes when it is back. Files on it cannot be deleted;
you can only remove Outpost's record.

Eject a drive in the operating system first, and only when nothing is being written.

### A network share whose server is switched off

A location that does not answer its check within 5 seconds is marked "The location is
not answering", and everything on it fails at once with a plain message while the rest
of Outpost carries on. It is picked up again within a check or two of answering.

### Keeping the map on the device and the library on a NAS

So that the map works with the NAS off: **Storage → Manage and clean up → Installed**,
choose **Maps**, tick **Select everything shown**, likewise **Terrain**, **Place names**
and **Map layers**, and **Move** them to the device's own location. Then under **Where
new things go**, set those four to the device and the rest to the NAS.

## Connecting a network share

**Storage → Network shares → Connect a network share** connects the share itself on a
Mac. In Docker or on Linux it writes out the lines to add. On Windows or a portable
drive, mount the share yourself inside a storage root.

### On a Mac

Pick or type the server (volumes already connected in the Finder skip straight to the
folder), sign in or **Try without a password (guest)**, choose the shared folder
(**Show hidden shares**, or **Not in the list? Type its name**), then the folder to use,
and **Add as storage location**.

- **SMB only**, on private addresses only. Mount NFS and AFP yourself and use **Add
  location**. A server that requires encryption or Kerberos cannot be listed, but its
  share can still be typed.
- **Outpost never keeps the password.** With **Remember the password**, it is in the
  macOS Keychain; otherwise you are asked each time. Remembered shares reconnect at start
  and every five minutes while their server is away (or on **Reconnect**), and stop
  after the server refuses the password, so a changed password does not lock the NAS
  account. The Keychain needs someone logged in at the Mac.
- After five wrong passwords, tries are refused for a minute, doubling up to an hour.
- **Disconnect** asks first if anything is being written. **Forget this share** also
  deletes the Keychain item; files and the location stay.

### In Docker and on Linux

The form asks for the server, share and user name (or the NFS export), **not** the
password, and writes out the Compose or `/etc/fstab` lines to copy; nothing changes
until you do. An IPv6 link-local address needs its interface (`fe80::1%eth0`).

## NAS set-up examples

Outside a Mac, the operating system or Docker mounts the share; Outpost sees a folder.
Whatever is mounted for `outpost` must be mounted at the same path, read-only, for
`kiwix`. Never put the database on the share.

### A share mounted by the host, then bind-mounted

On a Raspberry Pi or other Debian system, `deploy/pi/nas-share.sh` does this for SMB
([deployment.md](deployment.md#6-bring-your-library-across); `--help` says what it
changes and how to undo it). If you write the lines yourself, copy what it does: mount
**one folder** of the share, end the `/etc/fstab` line `nofail,_netdev,x-systemd.automount`
so the computer starts with the NAS off, and give the containers the folder **above** the
mount point (`bind: propagation: rslave`) so a share mounted later still appears. Use the
system's Docker, not a rootless one.

For NFS, a line in `/etc/fstab` such as:

```
192.168.1.20:/volume1/outpost  /mnt/nas/outpost  nfs  rw,nfsvers=4.1,soft,timeo=150,nofail  0  0
```

then mount `/mnt/nas/outpost` as `/storage/nas` in `outpost` and, read-only, in `kiwix`.
The folder must be writable by uid 1000; for NFS, set that on the NAS. **Connect a
network share** writes out the SMB lines, credentials file included.

### A share mounted by Docker

`compose.yaml` has commented-out lines for a volume Docker mounts from the NAS itself
(SMB or NFS), with `NAS_USER` and `NAS_PASSWORD` from `.env` (keep it private; they are
not passed to Outpost). Uncomment them, run `docker compose up -d`, and add
`/storage/nas` as a **Network share**.

## External USB drives

Make the drive appear under a storage root and add it on the Storage screen. In Docker,
mount it into both services, as [deployment.md](deployment.md#platform-notes) shows for
each platform; a drive plugged in after the containers started may need
`docker compose restart`. Without Docker and without `OUTPOST_STORAGE_ROOTS`, the places
drives appear are already roots; if you set the roots yourself on a Mac, include
`/Volumes`.

## Moving collections and documents

**Move** on a collection in **Library**, or **Move documents here** in a location's menu,
runs as a task under **Downloads and tasks**. It never overwrites. Each file is copied and checked
before the original is deleted; anything stopped part-way leaves the original as it
was. What cannot be moved is listed with the reason.

## Checking files

**Check files** on a collection's page compares it with the checksum recorded at
install: `ok`; `recorded` (none was known, one is recorded now); `damaged` (download it
again or restore it); `missing` (the location is connected, the file is not).

### What is written is read back

A drive or share can silently lose part of what is written, so Outpost reads each
download back as it arrives and fetches a damaged stretch again. The check reads from the
drive or share itself, not from what the device still remembers writing, so a share that
lost part of a file cannot pass it. After three times it
stops, deletes the file and says the storage is not keeping what is written. Files you
copied in and later damage are not covered (**Check files** finds that). It guards
against accidents, not tampering.

## The database

**Storage → Database** shows the database's size, free space, what takes the room, and
the last backup.

- **Earlier versions of pages**: **Clear earlier versions** erases them, leaving the
  pages ([notes-and-imports.md](notes-and-imports.md#earlier-versions)).
- **Check the database** runs SQLite's quick check; **Run the full check** also checks
  every index. Both only read. If problems are found, restore the newest backup that
  passed its check.
- **Reclaim unused space** rewrites the file smaller. It needs room for two copies and
  no job running; while it runs nothing can be saved, and it cannot be stopped part way.
  Only at the computer Outpost runs on, or with `OUTPOST_ALLOW_REMOTE_ERASE=true`.

## Managing and cleaning up

**Storage → Manage and clean up** shows everything Outpost stores and removes what you
choose. Nothing happens by itself: every removal is shown first as counts and sizes and
must be confirmed.

**Space** shows what takes room, by kind and location. **Installed** lists every
collection and document to filter, sort and tick.

- **Remove** shows the total and which items are your own and cannot be fetched again.
  Choose whether files are deleted or only records removed. Files on a disconnected
  location are left unless you tick **Forget it anyway**.
- **Move** starts the same checked moves as the Library.

**Leftovers** lists what serves nothing any more, to tick and clear: unfinished
downloads, records whose file has gone, unclaimed files, things that can be fetched
again, the `before-restore-<time>` folders (a restore can then no longer be undone by
hand), and finished history.

### Clean up

1. **Remove all downloaded content**: everything from the catalogue, and unfinished
   downloads. Keeps everything you made or added yourself, settings and locations.
2. **Clear and rebuild search data**: clear semantic vectors, read every document's
   text again (OCR text kept), or compact the database. Nothing you keep is lost.
3. **Erase everything and start again**: everything Outpost holds that is yours, files
   of documents you added included. It **keeps** storage locations, network shares, your
   own catalogue manifests, cached programs and the catalogue's last answers; it
   **leaves** files outside Outpost's folders and on disconnected locations, and
   automatic backups. Type "erase everything" to confirm. It offers a backup first,
   which does not hold your documents' files. Only at the computer Outpost runs on, or
   with `OUTPOST_ALLOW_REMOTE_ERASE=true` ([security.md](security.md#erasing-everything)).

Each runs as a job that can be stopped; what it already removed stays removed.

## Backing up

**Settings → Backup** saves one `.zip` with the database, attachments, extracted text
and your own catalogue manifests. It does **not** include documents, collections or
maps; back those up as ordinary folders. Unless protected with a passphrase, anyone with
the file can read it.

Restoring happens at the next restart: the dialog lists what is replaced, the backup is
checked first, and **Cancel restore** drops it until then. What it replaces is kept as
`before-restore-<time>` in the data directory. Add the same storage locations again
afterwards; their markers are recognised. A restore does not bring back catalogue
manifests (copy them from `catalog` in the zip), network shares, or unfinished jobs. It
is allowed only at the computer Outpost runs on, or with
`OUTPOST_ALLOW_REMOTE_ERASE=true` ([security.md](security.md#backup-and-restore)).

### Protecting backups with a passphrase

**Settings → Backup → Protect backups with a passphrase.** Every backup from then on is
encrypted as `….zip.enc`.

**Without the passphrase a protected backup cannot be opened, and Outpost cannot recover
it**: nothing on the computer can read it back. Write the passphrase down and keep it
apart from the backups.

- **Changing it** or **switching it off** affects later backups only; keep the old
  passphrase as long as its backups. **Suggest one** gives five random words.
- It can be set, changed or removed only where restoring can, and from another device
  **only over `https`**, as can the passphrase typed to restore.
- On a fresh install, the file and passphrase are all you need. Restoring an older
  backup does not bring back its older passphrase.

The file's name and header still show when it was made and its size. It does not
protect the data directory, older backups, or storage locations. The format is in
[development/storage-and-https.md](development/storage-and-https.md#the-protected-backup-file).

### Automatic backups

**Settings → Automatic backups** makes the same backup on a schedule onto a storage
location, in a folder `outpost-backups`.

- **When**: daily or weekly at a time you choose, by the server's clock. **Back up now**
  makes one any time.
- **Checked**: each is read back whole before it is listed as verified. One that fails
  is kept as **Not verified**, never used to replace a good one, and tried again later.
- **Location not connected**: the backup is made once the location is back.
- **How many**: seven scheduled and seven by hand. Outpost deletes only its own backup
  files there, and never the newest verified one.
- **Test a restore** checks a stored backup in a scratch folder, changing nothing; the
  result shows on **Settings → Server status** ([device.md](device.md)).
- **Who may**: any device can set the schedule, back up, test and download; restoring,
  deleting and keeping fewer need the computer Outpost runs on, or
  `OUTPOST_ALLOW_REMOTE_ERASE=true`.

Turning it off, removing the location or erasing everything leaves existing backups in
place.

## Taking everything out

**Settings → Take everything out** makes a `.zip` of your things in formats other
programs read: pages as Markdown with their attachments, contacts as vCard 4.0, places
as GPX and GeoJSON, supplies and the barometer log as CSV, the radio log as ADIF 3.1.8
and CSV, plans and weather places as JSON and GeoJSON, medical sheets and the
keeping-in-touch plan as JSON (locked sheets stay locked, as OpenPGP), communication and
power plans as JSON, the households, their people and the household book's answers as
JSON, the household board as plain text, and documents as the original files. With
several households, each has a folder of its own for its supplies, plans and papers. Its `README.md` says what was
left out (documents on disconnected locations, the bin, collections, maps, settings).
**Download to this device**, or write it to a storage location's `outpost-exports`,
which Outpost never deletes from. The zip is not encrypted.

Weather places, communication plans and power plans go back in from their own screens;
to put a whole Outpost back, use a backup.
