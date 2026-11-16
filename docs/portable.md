# Portable drives

A portable drive is a complete, runnable copy of Outpost on a USB stick or external
disk. Plug it into another computer, double-click, and it opens in the browser.
Nothing is installed on that computer, and no internet connection is needed.

This page covers what a drive contains, how to make and update one, which computers it
runs on, how to bring back what you wrote on it while away, and what to know about
drive formats and security.

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
  the drive's `library` folder. Download history, background jobs, the records of
  past imports and of past merges, and the addresses of network shares are not copied.
- The database also carries a record of what every page, document, saved place and
  track was when the drive was written, and which library wrote it. That record is
  what lets changes be [brought back](#bringing-changes-back-from-a-drive) exactly.

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

If you wrote or added anything while running from the drive, bring it back first: see
[Bringing changes back from a drive](#bringing-changes-back-from-a-drive). Updating
does not do that for you. (If you forget, nothing is lost: see "Kept" below.)

Make a drive again and choose the same folder. Outpost recognises it and asks you to
confirm **Replace the notes and library index on this drive**.

- **Replaced:** the app, and the `data` folder (notes, settings, the library index),
  with this Outpost's current ones.
- **Kept:** the `data` folder the drive had is renamed to
  `data-before-update-<date and time>` and left on the drive. Nothing in it is
  deleted, and its changes can still be brought back from there. Remove old ones
  yourself when you no longer need them.
- **Skipped:** files already on the drive with the same size and a date no older than
  the source are not copied again, so updating is much faster than the first write.
- **Left alone:** files in `library` for collections you no longer include are not
  deleted. The drive's index no longer lists them; delete them by hand if you need the
  space.

## Bringing changes back from a drive

Notes written and documents added while running from a drive are saved on the drive.
When you are home, plug the drive into the computer that runs your main Outpost and
bring them back: **Storage → Take it with you → Bring back changes from a drive**.

Three things hold throughout:

- **Nothing on the drive is ever changed.** Outpost only reads it. It does not even
  open the drive's database where it lies: it copies the database to its own data
  directory and reads the copy.
- **Nothing at home is overwritten without a way back,** and nothing is removed at
  home unless you tick it.
- **You see everything first.** Nothing happens until you have read the preview and
  pressed the button, and the button says how many changes it will make.

### The steps

1. **Choose the drive.** Open the drive's Outpost folder (the one that holds "Start
   Outpost") in the folder browser. The folder has to be inside a storage root, as for
   making a drive. If Outpost is running from the drive, stop it first. Outpost says
   whether the folder is an Outpost drive, when it was last written and by which
   version.
2. **Check what changed.** Outpost copies the drive's database, compares it with your
   library and shows a preview, grouped and counted. Nothing has been changed yet.
3. **Bring it back.** The merge runs as a background job with progress, and can be
   stopped. At the end you get the record of everything it did.

A backup first is offered on the preview (it is the same backup as **Settings →
Backup**). Take it if the library matters to you: it is the one thing that puts back
whatever a merge does, including what "undo" cannot.

### What the preview shows, and what happens by default

| Group | What is in it | Unless you choose otherwise |
| --- | --- | --- |
| **Changed on both sides** | A page, saved place or track that was changed on the drive *and* at home since the drive was written; a document whose details were changed on both sides; and anything Outpost cannot be sure about. | **Both are kept.** Home's version stays exactly as it is, and the drive's arrives beside it, named for where it came from: "Anchorages (from drive TRAVEL/Outpost, 15 Nov 2026)". |
| **New on the drive** | Pages (with their sub-pages, tags, pictures and files), documents, saved places, routes and tracks made on the drive. | Added. |
| **Changed on the drive** | Things changed on the drive and untouched at home; pages moved under another page; documents whose title, tags or other details were changed. | Home's copy is updated. What it was before is kept in the record of the merge. |
| **Removed on the drive** | Things deleted on the drive that are still at home. | **Kept.** Nothing is removed at home unless you tick it, item by item. |
| **Downloaded on the drive** | Reference collections and maps that are on the drive and not at home. | Not copied (they are large). Tick one to copy it in. |
| **Cannot be brought back** | Anything that cannot come across, each with the reason. | Stays on the drive. |

Under the lists, the preview also says how many things are the same on both sides, how
many were changed only at home (there is nothing to bring back for those; updating the
drive carries them over), and how many were dealt with by an earlier merge.

Every item can be opened to read it, and for a change or a conflict the two versions
are shown side by side as text, with the lines that differ marked.

### Your choices

- **Where both sides changed**, per item or for all at once:
  **Keep both** (the default), **Keep home's** (the drive's version stays on the drive
  and is not offered again unless it changes), or **Use the drive's** (home's version
  is replaced, and kept in the record).
- **New and changed things** can be unticked. They stay on the drive and are offered
  again next time.
- **Removals** have to be ticked to happen, and Outpost then asks once more, naming
  them. A page goes to the trash in Notes with its sub-pages (including sub-pages you
  added at home, which the preview counts for you), and can be restored from there. A
  saved place or track is removed, and comes back if you undo the merge. **A document's
  file is deleted for good**; that is the one thing a merge can do that cannot be
  undone, so it is said on the item and again before it happens.

### What exactly is brought across

- **Pages** keep their title, icon, content, tags, cover, place in the tree and the
  dates they were written. A new page keeps the sub-pages it had on the drive. A page
  whose parent is not at home is put at the top level. Links between pages, links to
  documents and pictures are pointed at home's copies. Content goes through the same
  sanitiser as an import: only the blocks and marks a page can hold are kept.
- **Pictures and files in pages** are copied from the drive, each checked against the
  checksum the drive recorded for it, and only if home does not already hold the same
  bytes.
- **Documents** are copied into the library through the same path as an upload: the
  file is checked against its checksum on the drive, copied, checked again at home,
  and its text is read for search. A file whose bytes are already in your library is
  not copied twice.
- **Saved places** keep their name, note, position, colour and the page they point at.
- **Routes and tracks** come across the way an exported GPX file would: lines,
  waypoints and names exactly. The height profile of a route drawn on the map is not
  carried, so its climb is worked out again from its points and may differ or be
  missing.
- **Collections and maps** you tick are copied into the default storage location and
  checked against their checksum.
- **Not brought across:** settings (home keeps its own), the favourite star on pages
  that already exist at home, the order of pages among their siblings, the search
  index (home builds its own), and anything in the drive's trash.

### How Outpost tells what changed where

When a drive is written or updated, Outpost records on it what every page, document,
saved place and track was at that moment, and which library wrote it. When the drive
comes home, anything on it that differs from that record was changed on the drive, and
anything at home that differs from it was changed at home. That is exact: it does not
depend on either computer's clock.

Two cases have no such record:

- **A drive written by a version of Outpost from before drives carried this record.**
  Outpost compares content, and uses dates to tell which side changed: changed on the drive
  after it was written and not at home means "changed on the drive". Where the dates
  do not settle it, the item is listed under "Changed on both sides" for you to
  decide. Moved pages are not followed, and removals of documents are not offered,
  because without the record there is no telling whether a document was removed on
  the drive or never taken. The preview says when a drive is being read this way.
  One thing to know: if the computer the drive was used on had its clock set earlier
  than the day the drive was made, an edit made there can look older than it is. It is
  then either listed as a conflict or, if the same page was also edited at home,
  counted as changed at home only. Nothing is lost (the drive is not touched), but
  check the drive's own copy if something you expected is not in the preview. Writing
  the drive again from this version gives it a record, and the question goes away.
- **A drive made by a different Outpost.** Nothing on it is taken for an older copy of
  something here. What it holds that you do not have is offered as new, and nothing at
  home is offered for removal.

Two things with the same id are only treated as the same thing when the record says
so (or, without a record, when they were also created at the same moment). A page made
on the drive that happens to share an id with a page made at home is a different page
and gets a new id.

### The same drive, more than once

- **Merging again finds nothing new.** Each merge records what it did with each of the
  drive's things. What you brought back, kept home's version of, or chose not to
  remove is not asked about again. Unticked items are.
- **Using the drive again after a merge, without updating it,** is fine: the next merge
  brings only what changed since. The drive's side of a conflict you kept both
  versions of carries on in the page that was made for it.
- **Stopping part-way** leaves a library that is whole: each item is brought back
  completely, in one step with its line in the record, or not at all. To carry on,
  look at the drive again; what is already home is not brought back twice.
- **If the drive was updated before its changes were brought back,** they are not
  lost: updating sets the drive's old `data` folder aside as
  `data-before-update-<date and time>`. Choose the drive as usual; Outpost lists those
  folders under "Which notes to read". Documents added on the drive are still in its
  `library` folder, which an update leaves alone.

### Afterwards: the record, undo, and updating the drive

The record lists every item with what was done to it, with anything that could not be
done first and the reason. It is kept: **Storage → Bring back changes from a drive →
Earlier merges**.

**Update this drive** on the record opens "Make a portable drive" at the drive's
folder, so the drive can be made to match home again. That is not done for you: the
drive stays as it was until you write it.

**Undo this merge** works from the record:

| The merge did this | Undo does this |
| --- | --- |
| Added a page, or the drive's side of a conflict | Moves it to the trash. A page that has since been given sub-pages is left in place. |
| Updated a page | Puts back the version from before. If you have changed the page since the merge, it is left alone and the earlier version is added beside it as a page of its own. |
| Moved a page | Moves it back, unless it has been moved again. |
| Moved a page to the trash | Restores it. |
| Updated a document's details, a saved place or a track | Puts them back, unless they have been changed since. |
| Added a saved place or track | Removes it, unless it has been changed since. |
| Removed a saved place or track | Adds it again. |
| Copied a document in | Leaves it in the library, unless you tick "Also remove the documents it copied". |
| Copied a collection in | Leaves it; remove it in the Library. |
| **Removed a document** | **Cannot be undone.** The file is gone from the library (it may still be in a backup of your storage, and it was not on the drive). |

After an undo, the drive's changes are offered again the next time you look at it.

### Limits

- One merge at a time, and at most 20,000 changes in one preview.
- Keep the drive plugged in until the merge has finished. If it is unplugged before
  the merge starts, nothing is done and the preview waits for it; if it goes part-way
  through, the merge stops there, and looking at the drive again carries on.
- From one drive Outpost reads at most 100,000 pages, 100,000 documents, 100,000 saved
  places and 20,000 tracks, and a database of at most 32 GB; a page of more than 5 MB
  or a track of more than 20 MB stays on the drive. A drive beyond those limits is
  refused whole rather than half read.
- A drive written by a newer Outpost than the one at home is refused with a message
  saying so: update Outpost at home first. A drive written by an older one is read as
  long as its notes are in a form this version knows.
- Books from the catalogue, place-name data and embedding models that were added on
  the drive are listed but not copied by a merge; add them at home from Explore.
- What has been tested is in the [limits table](architecture.md#limits-and-trade-offs):
  the whole path is covered by tests on one computer with a drive in a folder, and
  has not been tried with a physical USB drive carried to a second computer.

## Security

- **Local only.** From a drive, Outpost listens on `127.0.0.1`: only the computer the
  drive is plugged into can open it.
- **The drive is not encrypted.** Anyone who has the drive can read everything on it:
  your notes, your settings, and the documents and collections you copied. If that
  matters, use an encrypted drive (BitLocker, FileVault, LUKS or VeraCrypt) and unlock
  it before starting Outpost.
- **Nothing is written to the host computer.** Data and settings stay in the drive's
  `data` folder.
- **A drive that comes home is not trusted.** It has been in other computers. Bringing
  its changes back reads it defensively and never writes to it; see
  [security.md](security.md#bringing-a-drive-back).
- **Search by meaning.** The built-in model is part of the app on the drive, and the
  vectors travel in the database, so semantic search works from the drive on every
  platform the drive starts on, with no connection: the model runs as WebAssembly, with
  no program of its own per platform. This has been tried from a copy of the app on an
  Apple Silicon Mac, and in Linux containers on ARM64 and AMD64, where the vectors came
  out identical; not on Windows or an Intel Mac.
- **Embedding servers.** Settings travel with the drive. If semantic search was set to
  a local embedding server, the drive will look for one at the same address on the new
  computer. If none answers, searches return keyword results with a note saying so.

- **Model servers.** The same goes for answers: if "Answers from your library" was
  set up, the drive looks for a model server at the same address on the new computer.
  If none answers, **Answer from my library** says so; search is unaffected.

See also [offline.md](offline.md) and [security.md](security.md).
