# Storage

## Two kinds of place

**The data directory** holds what Outpost owns: the database `outpost.db` (notes,
library records, settings, places, the search index, vectors, history), note
attachments, text extracted from documents, your own catalogue manifests, programs
cached for portable drives, and `secret.key`. It is `OUTPOST_DATA_DIR`; in Docker,
`/data` on the `outpost-data` volume. **Keep it on a disk that is part of the machine
and always attached**: SQLite's locking is not reliable on network shares, and a
database on NFS or SMB can be corrupted.

**Storage locations** hold content: documents (`documents/`), reference collections
(`collections/zim/`), maps and terrain (`collections/maps/`, `collections/terrain/`),
place names and other catalogue files, and downloads still arriving (`*.part`). A
location is a folder you choose, on any drive or share. Outpost writes nothing to a
location but content and its marker file, `.outpost-location.json`.

## Storage roots and storage locations

A **storage root** is a folder the person running the server has made available
(`OUTPOST_STORAGE_ROOTS`, set at start, never from the browser). In Docker the root is
`/storage`, and anything mounted under it can be used. A **storage location** is a
folder inside a root that you add in Outpost; folders outside the roots are refused.
Outpost starts with one, "Internal storage" (`/storage/internal` in Docker). The
Storage screen lists the roots under "Where Outpost can look".

## Adding a location

1. Make the drive or share visible inside a storage root. On a Mac a plugged-in drive
   already is, and a NAS can be [connected from Storage](#connecting-a-network-share).
2. **Storage → Add location**, and pick or make the folder.
3. Name it and choose its kind (external drive, network share, internal, Docker volume;
   the kind is a label only). **Use for new downloads** makes it the default.

Outpost checks it can write there and writes the marker file. A folder that overlaps
another location cannot be added.

- **The default location** receives uploads and downloads unless you choose another.
  Change it with **Make default**.
- **Where new things go** sets a location per kind (maps, terrain, place names, map
  layers, collections, documents). It changes only new downloads. If that location is
  not connected, the download is refused with its name rather than sent elsewhere.
- **Renaming** changes the name shown. **Removing** makes Outpost forget the folder;
  nothing in it is deleted. A location that still holds documents or collections, or
  the last one, cannot be removed. Removing the automatic backups' location stops them
  until another is chosen.

## The marker file and reconnecting

Outpost records content by location and path inside it, never by absolute path, and
finds a location by its marker file:

- **A drive that comes back elsewhere is found**, by searching every storage root up to
  three folders deep.
- **A different drive at the old path is not used**: "The folder is there but is not
  this Outpost location."
- **A folder with another Outpost's marker** (or from before a restore) is adopted with
  its id, so records line up again.
- **A folder now outside the roots** is searched for like a moved drive; if not found,
  the location is disconnected, its records kept.
- **Two folders with the same marker** inside the roots: the location is shown
  disconnected with both named. Remove the copy, or its marker, and press **Check
  drives**.

Do not edit or delete the marker file except to settle two copies. Locations are checked
every 30 seconds (**Settings → Storage**, 5 to 3600), at start and on **Check drives**; a
disconnected one is searched for at most every ten minutes. Free space is updated once
it moves by 256 MiB.

### Moving a library to another disk or folder

1. Stop Outpost.
2. Copy the location's folder **with its hidden marker file** (copy the folder itself).
3. Make sure the new place is inside a storage root, and take the old one out of the
   roots or remove it once the copy is checked. While both are inside, the old one is
   used.
4. Start Outpost. It finds the marker at the new place.

## What happens when a drive is unplugged

- The location shows as **disconnected**, as does the status line in the sidebar.
- Nothing is removed. Its documents and collections stay listed as unavailable.
- Search still finds its documents (their text is in the data directory); opening one
  says `"<name>" is not connected. Reconnect it and try again.`
- Its reference collections leave the reader until it returns.
- A download writing to it stops, keeps its partial file, and resumes when it is back.
- Files on it cannot be deleted; you can only remove Outpost's record.
- A collection is "missing" only if its location is connected and the file is not there.

Eject a drive in the operating system first, and only when nothing is being written.

### A network share whose server is switched off

A NAS that is off still has a folder, and calls on it wait for the network. A location
that does not answer its check within 5 seconds (`OUTPOST_STORAGE_PROBE_TIMEOUT_MS`) is
marked "The location is not answering", and from then on everything on it fails at once
with a plain message while the rest of Outpost carries on. A request already waiting
may take up to 30 seconds. When the share answers again it is picked up within a check
or two.

### Keeping the map on the device and the library on a NAS

So that the map works with the NAS off: **Storage → Manage and clean up → Installed**,
choose **Maps**, tick **Select everything shown**, likewise **Terrain**, **Place names**
and **Map layers**, and **Move** them to the device's own location. Then under **Where
new things go**, set those four to the device and the rest to the NAS.

## Connecting a network share

**Storage → Network shares → Connect a network share** does what it can where Outpost
runs, and says which:

| Where Outpost runs | What happens |
| --- | --- |
| Directly on a Mac | Outpost connects the share and keeps it connected. |
| In Docker or any container | It writes out the Compose lines to add. |
| Directly on Linux | It writes out the `/etc/fstab` line and credentials-file steps (mounting needs root). |
| Windows, or a portable drive | Nothing; mount the share yourself inside a storage root. |

### On a Mac

1. **Server.** Pick a file server from the list, or type its name or address. Volumes
   already connected in the Finder are listed first and skip to step 4.
2. **Sign in**, or **Try without a password (guest)**.
3. **Shared folder.** Choose from the shares that account can see (shares ending `$`
   are behind **Show hidden shares**; **Not in the list? Type its name** for others).
   macOS connects it under `/Volumes`.
4. **Folder to use.** A folder `Outpost` is suggested; **Add as storage location**.

- **SMB only**, and only servers with a private or link-local address. Mount NFS and AFP
  yourself and use **Add location**. A server that requires encryption or Kerberos
  cannot be listed, but its share can still be typed and connected.
- **The password is never kept by Outpost.** With **Remember the password**, it is in
  the macOS Keychain ("Outpost network share"); otherwise you are asked each time.
- After five wrong passwords for a server and user, tries are refused for a minute,
  doubling up to an hour.
- **Reconnecting.** Shares with a remembered password reconnect at start and every five
  minutes while their server is away; **Reconnect** does it now. Outpost stops after the
  server refuses the password, so a changed password does not lock the NAS account.
- **Disconnect** names anything being written there and asks first; it never forces.
  **Forget this share** also deletes the Keychain item; files and the location stay.
- A share already connected in the Finder is used as it is; its password is not checked
  or saved.
- The Keychain needs someone logged in at the Mac. Started before anyone logs in,
  remembered shares wait for **Reconnect**.

### In Docker and on Linux

The form asks for the server, share and user name (or the NFS export), **not** the
password, and writes out the lines to copy, shaped like the examples below. Nothing
changes until you make the changes.

An IPv6 address starting `fe80` needs the network interface after it, such as
`fe80::1%eth0` (`ip -6 addr` shows the name). Docker wants the interface's number instead
of its name, and the Compose lines say where to put it.

## NAS set-up examples

Outside a Mac, the operating system or Docker mounts the share and keeps the
credentials; Outpost sees a folder. Whatever is mounted for `outpost` must be mounted at
the same path, read-only, for `kiwix`. Never put the database on the share.

### A share mounted by the host, then bind-mounted

On a Raspberry Pi or other Debian system, `deploy/pi/nas-share.sh` does this for SMB and
asks for the password at the keyboard (`--help` says what it changes and how to undo it):

```bash
./deploy/pi/nas-share.sh --server 192.168.1.20 --share docs --folder Outpost --user me
```

Worth copying if you write the lines yourself: it mounts **one folder** of the share;
its `/etc/fstab` line ends `nofail,_netdev,x-systemd.automount`, so the Pi starts with
the NAS off and mounts when next used; and it gives the containers the folder **above**
the mount point (`/mnt/outpost-nas` as `/storage/nas`, `bind: propagation: rslave`) so
the share appears inside a container that started before it was mounted. It needs the
system's Docker, not a rootless one.

By hand, NFS in `/etc/fstab`:

```
192.168.1.20:/volume1/outpost  /mnt/nas/outpost  nfs  rw,nfsvers=4.1,soft,timeo=150,nofail  0  0
```

SMB, with the password in `/root/.outpost-smb` (mode `600`, lines `username=…` and
`password=…`):

```
//192.168.1.20/outpost  /mnt/nas/outpost  cifs  credentials=/root/.outpost-smb,uid=1000,gid=1000,file_mode=0664,dir_mode=0775,vers=3.0,nofail  0  0
```

Then in `compose.yaml`:

```yaml
services:
  outpost:
    volumes:
      - /mnt/nas/outpost:/storage/nas
  kiwix:
    volumes:
      - /mnt/nas/outpost:/storage/nas:ro
```

The folder must be writable by uid 1000: the SMB options above do it; for NFS, set it on
the NAS.

### A share mounted by Docker

`compose.yaml` has these commented out. Docker mounts the share when the container
starts; `NAS_USER` and `NAS_PASSWORD` come from `.env` (keep it private) and are not
passed to Outpost.

```yaml
volumes:
  nas-library:
    driver: local
    driver_opts:
      type: cifs   # for NFS: type: nfs, o: "addr=192.168.1.20,rw,nfsvers=4.1,soft,timeo=150", device: ":/volume1/outpost"
      o: "addr=192.168.1.20,username=${NAS_USER},password=${NAS_PASSWORD},uid=1000,gid=1000,file_mode=0664,dir_mode=0775,vers=3.0"
      device: "//192.168.1.20/outpost"
```

Use `nas-library:/storage/nas` in `outpost` and `nas-library:/storage/nas:ro` in `kiwix`,
run `docker compose up -d`, and add `/storage/nas` as a **Network share**.

## External USB drives

Make the drive appear under a storage root, add it on the Storage screen, and in Docker
mount it into `kiwix` too.

| System | Where it appears | In `compose.yaml` |
| --- | --- | --- |
| Linux, Raspberry Pi | Where you mount it, e.g. `/mnt/usb-ssd` | `- /mnt/usb-ssd:/storage/usb-ssd` |
| macOS | `/Volumes/<name>` | `- /Volumes/FieldSSD:/storage/field-ssd` |
| Windows, WSL 2 | `/mnt/<letter>/...` | `- /mnt/d/outpost:/storage/drive-d` |

- On Linux the folder must be writable by uid 1000; exFAT, FAT32 and NTFS need
  `uid=1000,gid=1000`.
- Without Docker and without `OUTPOST_STORAGE_ROOTS`, `/Volumes`, `/media/<user>`,
  `/run/media/<user>` and `/mnt` are already roots. If you set the roots yourself on a
  Mac, include `/Volumes`.
- In Docker, a drive plugged in after the containers started may not be seen; run
  `docker compose restart`.
- [deployment.md](deployment.md#platform-notes) has more for each platform.

## Moving collections and documents

**Move** on a collection in **Library**, or **Move documents here** in a location's menu
(which moves every document not already there), runs as a job under **Downloads**. Before
starting, Outpost checks the target is connected and has room plus a 256 MB reserve, and
never overwrites. Each file is copied to `<name>.part` and checked against the checksum
recorded when it arrived (a collection's copy is also read back from the target); only
then is the record switched and the original deleted. Anything stopped part-way leaves
the original as it was, readable throughout. A document that cannot be moved is listed
with the reason. Folders with symbolic links or special files are not moved.

## Checking files

**Check files** on a collection's page reads it whole and compares it with the SHA-256
recorded at install: `ok`; `recorded` (none was known, one is recorded now); `damaged`
(download it again or restore it); `missing` (the location is connected, the file is
not). Catalogue downloads are checked against the publisher's checksum before they are
installed.

### What is written is read back

A drive or share can silently lose part of what is written. As a download arrives,
Outpost keeps a checksum of each megabyte it wrote, and compares what the storage gives
back when the file is checked at the end. A damaged stretch is fetched again from that
point (a map region, whole); after three times in one download it stops, deletes the
file and says the storage is not keeping what is written. This covers downloads and map
regions written since the server last started. It does not cover files you copied in,
pictures Outpost builds itself, or damage that happens later (**Check files** finds
that). It guards against accidents, not tampering.

## The database

**Storage → Database** shows the database's path and the free space there (warning below
256 MB), its size and the write-ahead log beside it, counts of what it holds, the space
taken by each part (search index, search by meaning, library records, notes, maps,
radio, preparedness, everything else, unused), how many migrations are applied, and the
last backup. Counting reads every page in the background, the first time anyone looks
after a start, and again on **Work out again**.

- **Earlier versions of pages** shows how many are kept and their size; **Clear earlier
  versions** erases them, leaving the pages ([notes-and-imports.md](notes-and-imports.md#earlier-versions)).
- **Check the database** runs SQLite's quick check; **Run the full check** also checks
  every index. Both only read and anyone may start them. If problems are found, restore
  the newest backup that passed its check. The full-text index's own structures are not
  checked.
- **Reclaim unused space** rewrites the file without unused pages (offered from 1 MB).
  It needs room for two copies of what is in use plus 256 MB; it is refused while any
  job runs; it waits up to 30 seconds for saves under way; while it runs nothing can be
  saved (reading carries on); and it cannot be stopped part way (a server stop rolls it
  back, losing nothing). It is allowed only at the computer Outpost runs on, or with
  `OUTPOST_ALLOW_REMOTE_ERASE=true`.

## Managing and cleaning up

**Storage → Manage and clean up** shows everything Outpost stores and removes what you
choose. Nothing here happens by itself: every removal is shown first as counts and sizes
and must be confirmed.

**Space** shows what takes room, by kind and location. Figures from records are
immediate; folders are measured in the background (**Count again**), and search passages
and vectors inside the database are estimates. A disconnected location shows what was
last known.

**Installed** lists every collection and document with kind, location, size and date,
to filter, sort and tick. A catalogue sheet or book is one item (a collection and its
document go together).

- **Remove** shows the total, which items are your own and cannot be fetched again, and
  what will be left alone and why. Choose whether files are deleted or only records
  removed. Files on a disconnected location are left unless you tick **Forget it
  anyway** (record removed, file left). Items being moved or checked are refused.
- **Move** starts the same checked moves as the Library, after checking room for the
  whole selection.

**Leftovers** lists what serves nothing any more, to tick and clear: unfinished
downloads and uploads, records whose file has gone, files in `collections/` or
`documents/` that nothing claims and that have not changed for ten minutes, things that
can be fetched or worked out again (portable-drive programs, old model files, orphaned
text, copies from a cut-off backup), the `before-restore-<time>` folders (a restore can
then no longer be undone by hand), and finished history. Outpost only ever looks inside
`collections/` and `documents/`, never follows links, and checks each file again before
deleting it.

### Clean up

1. **Remove all downloaded content**: archives, maps, terrain, place names, catalogue
   sheets and books, and unfinished downloads. Keeps your own documents, notes, contacts,
   chat, radio records, places, your own archives and maps, settings and locations.
2. **Clear and rebuild search data**, ticking which: clear semantic vectors (rebuild
   from Settings), read every document's text again (OCR text kept), compact the
   database (about a second per 100 MB, needs free space equal to its size). Nothing you
   keep is lost.
3. **Erase everything and start again**: everything Outpost holds that is yours, files
   of documents you added included, PGP keys, settings, search data and history, and on
   a portable drive its link to the library it came from. The summary counts each kind
   first. It **keeps** storage locations, network shares, your own catalogue manifests,
   cached programs, the catalogue's last answers, satellites' public data and
   kiwix-serve; **leaves** files outside Outpost's folders and on disconnected
   locations; and **does not delete** automatic backups (delete those from **Settings →
   Automatic backups** first if you want them gone). Type "erase everything" to confirm.
   It offers a backup first, which does not hold your documents' files. Only at the
   computer Outpost runs on, or with `OUTPOST_ALLOW_REMOTE_ERASE=true`
   ([security.md](security.md#erasing-everything)).

Each runs as a job that can be stopped; what it already removed stays removed.

Each document and collection lives on exactly one location: there is no pooling or
mirroring across drives.

## Backing up

**Settings → Backup** saves one `.zip` with the database, attachments, extracted text
and your own catalogue manifests. It does **not** include documents, collections or
maps; back those up as ordinary folders. Unless protected with a passphrase, anyone with
the file can read it.

Restoring happens at the next restart: the dialog lists what is replaced and what is
not, the backup is checked first, and **Cancel restore** drops it until then. Downloads
under way stop. What it replaces is kept as `before-restore-<time>` in the data
directory. Add the same storage locations again afterwards; their markers are
recognised. A restore does not bring back catalogue manifests (copy them from `catalog`
in the zip), network shares, or unfinished jobs. It is allowed only at the computer
Outpost runs on, or with `OUTPOST_ALLOW_REMOTE_ERASE=true`
([security.md](security.md#backup-and-restore)).

### Protecting backups with a passphrase

**Settings → Backup → Protect backups with a passphrase.** Every backup from then on
(scheduled, **Back up now**, downloaded) is encrypted as `….zip.enc`.

**Without the passphrase a protected backup cannot be opened, and Outpost cannot recover
it.** Outpost keeps only a key that can lock, so backups are made unattended and nothing
on the computer can read them back. Write the passphrase down and keep it apart from the
backups.

- Any passphrase is accepted; under twelve characters is called short. **Suggest one**
  gives five random words (80 bits).
- **Changing it** affects later backups only; keep the old one as long as its backups.
  The list marks which open with an earlier passphrase.
- **Switching it off** makes later backups plain again; it decrypts nothing.
- It can be set, changed or removed only where restoring can, and from another device
  **only over `https`**, as can the passphrase typed to restore.
- A wrong passphrase is said to be wrong; a damaged or cut-short file is refused whole.
  Nothing decrypted is written to disk. On a fresh install, the file and passphrase are
  all you need.
- Restoring an older backup does not bring back its older passphrase. A portable drive
  carries the setting.

The file's name and header still show when it was made, by which version, and its
size. It does not protect Outpost itself, the data directory, older backups, or storage
locations. Restoring one takes about a second longer and up to 512 MiB of memory, on
purpose, to make guessing slow. The file format is in
[development/storage-and-https.md](development/storage-and-https.md#the-protected-backup-file).

### Automatic backups

**Settings → Automatic backups** makes the same backup on a schedule onto a storage
location (a share included), in a folder `outpost-backups`, named
`outpost-backup-<UTC time>-scheduled.zip` or `-manual.zip`.

- **When**: daily or weekly at a time you choose, by the server's clock; the first at
  the next such time. **Back up now** makes one any time.
- **Checked**: each is read back whole, every file against its checksum and the
  database through SQLite's integrity check, before it is listed as verified. One that
  fails is kept as **Not verified**, never counted or used to replace a good one, and
  tried again after 1, 2, 4, 8 hours up to a day. Only the newest two failed ones are
  kept.
- **Location not connected**: the backup is skipped, written nowhere else, and made as
  soon as the location is back (once, however many were missed). The screen says so.
- **How many**: seven scheduled and seven by hand, counted apart. Outpost deletes only
  its own backup files in that folder, and never the newest verified one.
- **The list** shows each with date, size, version and whether it verified, to
  download, **Restore this one** or delete.
- **Test a restore** opens a stored backup in a scratch folder, checks everything,
  counts what it holds against what is here now, and removes the scratch copy; nothing
  is changed. The result shows on **Settings → Server status** ([device.md](device.md)).
- **Who may**: any device can set the schedule, back up, test and download; restoring,
  deleting and keeping fewer need the computer Outpost runs on, or
  `OUTPOST_ALLOW_REMOTE_ERASE=true`.

Turning it off, removing the location or erasing everything leaves existing backups in
place. The schedule is not copied to a portable drive.

## Taking everything out

**Settings → Take everything out** makes a `.zip` of your things in formats other
programs read:

| Folder | What | Format |
| --- | --- | --- |
| `notes/` | Every page, nested, attachments in `_attachments/` | Markdown |
| `contacts/` | Every contact | vCard 4.0 |
| `places/` | Markers, routes and tracks | GPX and GeoJSON |
| `supplies/`, `barometer/` | Supplies list, barometer log | CSV |
| `radio-log/` | The contact log | ADIF 3.1.8 and CSV |
| `plans/` | Emergency plans | JSON |
| `weather-places/` | The places Weather keeps forecasts for | GeoJSON |
| `radio-plans/`, `power-plans/` | Communication plans, power plans | JSON |
| `papers/` | Medical sheets and the keeping-in-touch plan (locked sheets stay locked) | JSON, OpenPGP |
| `board/` | The household board, with files sent | Plain text |
| `documents/` | Every document as added, a folder per category | The original files |

Its `README.md` says when it was made and what was left out (documents on disconnected
locations, the bin, removed board messages, collections, maps, settings). The section
shows the sizes first. **Download to this device** keeps only the newest on the server;
**a storage location** writes to `outpost-exports`, which Outpost never deletes from.
The zip is not encrypted.

Weather places, communication plans and power plans go back in from their own screens
(**Bring in places from a file**, **Bring in a plan**), added beside what is there. The rest
opens in other programs; to put a whole Outpost back, use a backup.
