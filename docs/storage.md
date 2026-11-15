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
| Embedding model files, if you use the in-process provider: `models/` | Downloaded place-name files: `collections/places/` |
| Cached programs for portable drives: `runtimes/` | Files still arriving: `*.part`, and `documents/.incoming/` |
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
never as an absolute path. This has three consequences:

- **A drive that comes back somewhere else is found.** If the marker is not where it
  was, Outpost looks for it inside every storage root, up to three folders deep, and
  carries on from the new path.
- **A different drive at the old path is not used.** If the folder exists but its
  marker is missing or has another id, the location is shown as disconnected with the
  note "The folder is there but is not this Outpost location."
- **A location can be adopted.** If you add a folder that already has a marker from
  another Outpost, or from before a database restore, it keeps its id, so records that
  refer to it line up again.

Do not delete or edit the marker file.

Locations are checked every 30 seconds (the `storage.checkIntervalSeconds` setting,
5 to 3600) and whenever someone chooses **Check drives** on the Storage screen.

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

Enter the server (its name, such as `nas.local`, or its address), the share's name, and
the user name and password for it. File servers that announce themselves on the network
(Bonjour) are listed so you can pick yours instead of typing its name. Outpost asks
macOS to connect the share, the same way the Finder does. It appears under `/Volumes`,
which is a storage root, and Outpost then offers to add it as a storage location, in a
folder of its own on the share (`Outpost` unless you choose otherwise).

- **SMB only.** That is the file sharing every NAS offers. NFS and AFP shares are not
  connected from here; mount those yourself and add the folder with **Add location**.
- **Only servers on your own network.** The server must have a private or link-local
  address (see [security.md](security.md#network-shares)).
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
was not checked or saved.

Keychain access needs someone to be logged in at the Mac. If Outpost is started before
anyone logs in, remembered shares stay disconnected until **Reconnect** is used with
the password.

### In Docker and on Linux

The form asks for the server, the share and the user name (or, for NFS, the exported
folder), **not** the password, and writes out the text to use, each block with a copy
button. They are instructions: nothing changes until you make the changes yourself.
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

## One location per item

Each document and each collection lives on exactly one location. Outpost does not
combine drives into a pool, mirror content across drives, or split a collection
between them. Storage pools are a possible future extension; nothing in this version
implements them.

## Backing up

**Settings → Backup** saves one `.zip` with the database, note attachments, extracted
text and your own catalogue manifests. It does not include documents, collections or
maps: those stay on their storage locations, and the backup records where.

Restoring replaces the database, attachments and extracted text after a restart. The
data they replace is kept in the data directory in a folder named
`before-restore-<time>`. After a restore, add the same storage locations again (their
marker files are recognised) to bring the content back.

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

See also [security.md](security.md) and [troubleshooting.md](troubleshooting.md).
