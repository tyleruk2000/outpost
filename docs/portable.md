# Portable drives

A portable drive is a complete, runnable copy of Outpost on a USB stick or external
disk. Plug it into another computer, double-click, and it opens in the browser.
Nothing is installed on that computer, and no internet connection is needed.

This page covers what a drive contains, how to make and update one, which computers it
runs on, and what to know about drive formats and security.

## What a drive contains

```
<folder on the drive>/
  Start Outpost.command      launcher for macOS
  Start Outpost.bat          launcher for Windows
  start-outpost.sh           launcher for Linux
  README.txt                 how to start it, for whoever holds the drive
  outpost-portable.json      marks the folder as a finished Outpost drive
  app/                       Outpost itself (the packaged app)
  runtime/<platform>/        the program that runs it: node (node.exe on Windows),
                             and kiwix-serve where a reader is included
  data/                      the drive's own database, attachments and extracted text
  library/                   documents, collections and maps
```

What travels:

- **Always:** all your notes with their attachments, tags, map markers and tracks,
  settings, and the search index, with its vectors for search by meaning if you built
  them.
- **Your choice:** all documents or none; and any installed collections and maps you
  tick.
- The database on the drive is a copy narrowed to match: it lists only the documents
  and collections that were copied, and one storage location, "This drive", which is
  the drive's `library` folder. Download history, background jobs and the records of
  past imports are not copied.

The drive's library folder is found by its marker file, so the drive works whatever
letter or mount point the next computer gives it.

## Making a drive

The drive's folder must be somewhere Outpost can reach: inside a storage root. With
Docker that means the drive is mounted under `/storage` (see
[storage.md](storage.md#external-usb-drives)).

Open **Storage → Take it with you → Make a portable drive**. There are three steps.

1. **Where.** Choose an empty folder on the drive, make a new one, or pick a folder
   that is already an Outpost drive to update it. Outpost writes only inside this
   folder. It refuses a folder that already has other files in it, a folder that holds
   Outpost's own data, and one that overlaps a storage location.
2. **What to take.** Tick the kinds of computer the drive should start on, whether to
   include your documents, and which collections and maps to copy.
3. **Check and write.** Outpost shows exactly what will be written, how much is still
   to copy, the free space on the drive, and any warnings. Confirm to start.

Writing runs as a background job. You can close the window; progress shows under
**Downloads**. When it finishes, eject the drive before unplugging it.

If writing is interrupted or cancelled, files already copied stay on the drive, and
writing again continues from there. Each file is written under a temporary name and
renamed when complete, so a half-copied file never carries its real name. The file
`outpost-portable.json` is written last: its presence means the drive is complete.

Running Outpost from source? There is no packaged app to copy until you build one:

```bash
node scripts/build-app.mjs
```

## Which computers it runs on

| Platform | Outpost | Reference collections (ZIM) |
| --- | --- | --- |
| Mac, Apple Silicon | yes | yes |
| Mac, Intel | yes | yes |
| Linux, 64-bit PC | yes | yes |
| Linux, ARM64 (Raspberry Pi 4 and 5 with a 64-bit system) | yes | yes |
| Windows, 64-bit PC | yes | no |
| Windows, ARM64 | yes | no |

A drive runs only on the platforms you ticked when making it. Each one adds a Node
runtime of about 110 MB.

What has been tested: the server test suite writes a drive and starts a server on the
drive's own data and library folders, and the reader has been run from a drive on an
Apple Silicon Mac. Starting a drive on any other kind of computer is untried; see the
[limits table](architecture.md#limits-and-trade-offs).

### Where the programs come from

**Node runtimes** are the official builds from `nodejs.org`, in the same Node version
the server itself is running. Each download is checked against the SHA-256 list
nodejs.org publishes, and discarded if it does not match. Verified runtimes are cached
in `<data directory>/runtimes/`, so later drives need no connection. The Linux
runtimes are the standard nodejs.org builds, which need a glibc-based distribution.

To use a mirror, start the server with `OUTPOST_NODE_DIST_URL` set to its base address
(the equivalent of `https://nodejs.org/dist`).

**The reader for reference collections** is kiwix-serve, from the Kiwix project's own
`kiwix-tools` 3.8.2 builds at `download.kiwix.org`. When the drive includes at least
one reference collection, Outpost downloads the reader for each chosen platform that
has a build, caches it beside the Node runtimes, and copies it to
`runtime/<platform>/kiwix-serve`. On the drive, Outpost starts and stops it itself.

- The Kiwix project publishes no Windows build at this version. On Windows a drive
  cannot open reference collections; documents, notes, maps and search still work.
- The Kiwix project publishes only MD5 checksums for these files. Outpost checks the
  download against that MD5, which catches a damaged download; authenticity rests on
  the HTTPS connection to `download.kiwix.org`.
- To use a mirror, set `OUTPOST_KIWIX_DIST_URL` (the equivalent of
  `https://download.kiwix.org/release/kiwix-tools`).

The first drive for a new kind of computer therefore needs a connection. The last
step of the wizard says so when it applies.

## Starting Outpost from the drive

Open the folder on the drive.

| System | What to do |
| --- | --- |
| macOS | Double-click **Start Outpost.command**. The first time, macOS may ask you to confirm: right-click the file, choose **Open**, then **Open** again. |
| Windows | Double-click **Start Outpost.bat**. If a blue SmartScreen box appears, choose **More info**, then **Run anyway**. |
| Linux | Open a terminal in the folder and run `sh start-outpost.sh`. |

A terminal window opens and stays open while Outpost runs, and your browser opens the
address shown in it, normally <http://localhost:8080>. Close the window (or press
Ctrl+C) to stop Outpost before unplugging the drive.

If the drive was not made for the computer it is plugged into, the launcher says so
and tells you to add that platform from the Outpost that made the drive.

### If port 8080 is taken

When something on the host computer already uses port 8080, a portable Outpost tries
the next ports in turn, up to twenty of them, and prints and opens the one it got.
To choose a port yourself, set `OUTPOST_PORT` before starting the launcher.

## Drive formats

| Format | Works on | Notes |
| --- | --- | --- |
| exFAT | macOS, Windows, Linux | Recommended for a drive that moves between systems. |
| FAT32 | all | No file may be 4 GB or larger. Many reference collections and map regions are. Outpost warns before writing and stops with a clear message if a file is too large. |
| NTFS | Windows; read-only on macOS without extra software | |
| APFS | macOS only | |
| ext4 | Linux only | |

Formats such as exFAT do not record which files are programs. The macOS and Linux
launchers set that flag on the runtime themselves, and the Linux launcher is started
with `sh` for the same reason.

## Updating a drive

Make a drive again and choose the same folder. Outpost recognises it and asks you to
confirm **Replace the notes and library index on this drive**.

- **Replaced:** the app, and the `data` folder (notes, settings, the library index),
  with this Outpost's current ones.
- **Kept:** the `data` folder the drive had is renamed to
  `data-before-update-<date and time>` and left on the drive. Nothing in it is
  deleted. Remove old ones yourself when you no longer need them.
- **Skipped:** files already on the drive with the same size and a date no older than
  the source are not copied again, so updating is much faster than the first write.
- **Left alone:** files in `library` for collections you no longer include are not
  deleted. The drive's index no longer lists them; delete them by hand if you need the
  space.

## Changes made on the drive are not merged back

A drive is a copy, not a sync partner. Notes written and documents added while running
from the drive are saved on the drive. They are not sent to the Outpost that made it,
and updating the drive replaces them (the old `data` folder is kept, as above, but
Outpost does not merge it for you).

If you write something on the drive that you want to keep, export it first: a page or
the whole workspace as Markdown from Notes, documents from the Library.

## Security

- **Local only.** From a drive, Outpost listens on `127.0.0.1`: only the computer the
  drive is plugged into can open it.
- **The drive is not encrypted.** Anyone who has the drive can read everything on it:
  your notes, your settings, and the documents and collections you copied. If that
  matters, use an encrypted drive (BitLocker, FileVault, LUKS or VeraCrypt) and unlock
  it before starting Outpost.
- **Nothing is written to the host computer.** Data and settings stay in the drive's
  `data` folder.
- **Search by meaning.** The built-in model is part of the app on the drive, and the
  vectors travel in the database, so semantic search works from the drive on every
  platform the drive starts on, with no connection: the model runs as WebAssembly, with
  no program of its own per platform. This has been tried from a copy of the app on an
  Apple Silicon Mac, and in Linux containers on ARM64 and AMD64, where the vectors came
  out identical; not on Windows or an Intel Mac.
- **Embedding servers.** Settings travel with the drive. If semantic search was set to
  a local embedding server, the drive will look for one at the same address on the new
  computer. If none answers, searches return keyword results with a note saying so.

See also [offline.md](offline.md) and [security.md](security.md).
