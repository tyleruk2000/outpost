# Portable drives

A portable drive is a complete copy of Outpost on a USB stick or external disk. Plug it
into another computer, double-click, and it opens in the browser, with nothing
installed and no internet needed.

## What a drive contains

```
<folder on the drive>/
  Start Outpost.command      launcher for macOS
  Start Outpost.bat          launcher for Windows
  start-outpost.sh           launcher for Linux
  README.txt                 how to start it
  outpost-portable.json      marks a finished drive
  app/                       Outpost itself
  runtime/<platform>/        node, and kiwix-serve where a reader is included
  data/                      the drive's database, attachments and extracted text
  library/                   documents, collections and maps
```

- **Always copied:** notes with attachments and tags, map markers and tracks, settings,
  the search index (with vectors for search by meaning, if built), and your other
  records: repeaters and the radio planner's plans, log, profiles and predictions, Morse
  progress, power plans, every household with its people (the drive screen names them), supplies, weather places and barometer readings, emergency
  plans, nuclear scenarios, reference layers, network devices, games, and PGP keys (a
  private key only in its passphrase-protected form).
- **Your choice:** all documents or none, contacts (on by default), and the collections
  and maps you tick.
- **Never copied:** the mesh radio set-up and radios heard, the MCP switch, Heard on the
  radio's receivers and what they heard, download history, jobs, earlier versions of
  pages, import and merge records, network shares, [Chat](ai.md#chat) conversations, the
  household board, the setting that shares contacts with phones, and road networks
  (install them again on the computer the drive is used with; saved road routes are
  copied, with their directions).
- The drive's database lists only what was copied, with one location, "This drive". It
  also records what every page, document, place and track was when written, so changes
  can be [brought back](#bringing-changes-back-from-a-drive) exactly.

**A drive is not encrypted.** Turn **Contacts** off for a drive you will hand on: they are
other people's details. Saved web pages travel with documents; they belong to their
publishers, so think before passing them on. Outpost copies what you tick without
checking licences, and a few catalogue entries may be kept but not passed on: see
[how the catalogue treats licences](sources.md#how-the-catalogue-treats-licences).

## Making a drive

The drive's folder must be inside a storage root (in Docker, mounted under `/storage`:
see [storage.md](storage.md#external-usb-drives)). Running from source, build the app
first with `node scripts/build-app.mjs`.

**Storage → Take it with you → Make a portable drive**:

1. **Where.** An empty folder, a new one, or an existing Outpost drive to update.
   Outpost writes only there, and refuses a folder with other files, Outpost's own
   data, or one overlapping a storage location.
2. **What to take.** The kinds of computer to start on, documents or not, and which
   collections and maps.
3. **Check and write.** It shows what will be written, the free space and any warnings.

Writing runs as a job under **Downloads**; you can close the window. An interrupted
write continues where it stopped; `outpost-portable.json` is written last. Eject the
drive before unplugging it.

## Which computers it runs on

| Platform | Outpost | Reference collections |
| --- | --- | --- |
| Mac, Apple Silicon or Intel | yes | yes |
| Linux, 64-bit PC or ARM64 (Raspberry Pi 4 and 5, 64-bit) | yes | yes |
| Windows, 64-bit PC or ARM64 | yes | no |

A drive starts only on the platforms ticked. Each adds a Node runtime of about 110 MB,
the official nodejs.org build checked against its published SHA-256 (Linux builds need
glibc). Where collections are included, kiwix-serve 3.8.2 comes from
`download.kiwix.org`, checked only against the MD5 Kiwix publishes; Kiwix has no Windows
build, so a Windows drive cannot open reference collections. Both are cached in
`<data directory>/runtimes/`, so only the first drive for a new kind of computer needs a
connection. Mirrors: `OUTPOST_NODE_DIST_URL`, `OUTPOST_KIWIX_DIST_URL`.

## Starting Outpost from the drive

| System | What to do |
| --- | --- |
| macOS | Double-click **Start Outpost.command**. The first time, right-click it, **Open**, then **Open** again. |
| Windows | Double-click **Start Outpost.bat**. If SmartScreen appears, **More info**, then **Run anyway**. |
| Linux | In a terminal in the folder: `sh start-outpost.sh`. |

A terminal window stays open while Outpost runs and the browser opens
<http://localhost:8080>. If 8080 is taken, it tries the next twenty ports and opens the
one it got (or set `OUTPOST_PORT`). Close the window or press Ctrl+C before unplugging.
On a computer the drive was not made for, the launcher says so.

Search by meaning works from the drive on every platform with no connection. Settings
travel: a drive set to use an embedding or model server looks for one at the same
address, and says so if none answers.

## Drive formats

| Format | Works on | Notes |
| --- | --- | --- |
| exFAT | macOS, Windows, Linux | Best for a drive that moves between systems. |
| FAT32 | all | No file of 4 GB or more; many collections and maps are. Outpost warns first. |
| NTFS | Windows; read-only on macOS without extra software | |
| APFS | macOS only | |
| ext4 | Linux only | |

## Updating a drive

**Bring back what you wrote on it first**: updating does not. Then make a drive again in
the same folder and confirm **Replace the notes and library index on this drive**. The
app and `data` are replaced; the old `data` is kept as
`data-before-update-<date and time>` (its changes can still be brought back); files
already there are not copied again; collections no longer included are left in
`library` for you to delete.

## Bringing changes back from a drive

Plug the drive into the computer with your main Outpost: **Storage → Take it with you →
Bring back changes from a drive**. Nothing on the drive is ever changed (Outpost reads a
copy of its database), nothing at home is overwritten without a way back, and nothing
happens until you have read the preview.

1. **Choose the drive's Outpost folder** (inside a storage root). Stop Outpost on the
   drive first.
2. **Check what changed.** A grouped, counted preview. A backup is offered; take it if
   the library matters, as it puts back anything a merge does.
3. **Bring it back.** A job with progress, ending with a record of everything done.

| Group | Unless you choose otherwise |
| --- | --- |
| **Changed on both sides** (or not certain) | **Both kept**: the drive's arrives beside home's, named for where it came from. |
| **New on the drive** (pages with sub-pages and files, documents, places, routes, tracks) | Added. |
| **Changed on the drive** only | Home's copy updated; the old one kept in the record. |
| **Removed on the drive** | **Kept.** Tick each one to remove it. |
| **Downloaded on the drive** (collections, maps) | Not copied; tick to copy. |
| **Cannot be brought back** | Stays on the drive, with the reason. |

Each item can be opened, and conflicts shown side by side. Choose **Keep both**, **Keep
home's** or **Use the drive's** per item or for all; untick new or changed items to
leave them for next time. A removed page goes to the trash with its sub-pages. **A
removed document's file is deleted for good**: the one thing a merge cannot undo.

What comes across: pages with their tree, tags, dates and links pointed at home's
copies; pictures, files and documents, each checked against its checksum and not copied
twice; places; routes and tracks as GPX would carry them (a drawn route's height profile
is worked out again). **Not brought across:** contacts (export them as vCard on the
drive and bring them in at home: [contacts.md](contacts.md#contacts-that-look-like-one-already-here)),
settings, favourites and order of existing pages, the search index, the drive's trash,
and catalogue books, place names and models added on the drive (add those from
Explore).

Changes are told apart by the record written on the drive, not by clocks. A drive from
an older Outpost without that record is compared by content and dates; unclear items
go under "Changed on both sides", moves are not followed and document removals are not
offered (a wrong clock on the away computer can mislead it; write the drive again to
fix that). A drive made by a different Outpost offers only what is new.

Merging again offers only what is new or was left unticked. Stopping part-way leaves a
whole library; look at the drive again to carry on. If the drive was updated before its
changes came back, choose it as usual and pick the `data-before-update-…` folder under
"Which notes to read".

**Storage → Bring back changes from a drive → Earlier merges** keeps each record, with
**Update this drive** and **Undo this merge**. Undo removes what was added (to the
trash), puts back what was changed or moved unless changed since (then adds the earlier
version beside it), restores removed pages, places and tracks, and leaves copied
documents and collections unless you tick otherwise. A removed document cannot be
undone. Its changes are offered again next time.

**Limits:** one merge at a time; at most 20,000 changes in a preview; at most 100,000
pages, documents and places, 20,000 tracks and a 32 GB database from one drive (a page
over 5 MB or a track over 20 MB stays behind; a drive beyond these is refused whole); a
drive from a newer Outpost is refused. Keep it plugged in until the merge ends; if
unplugged, looking again carries on.

## Security

- From a drive, Outpost listens on `127.0.0.1` only, and writes nothing to the host
  computer.
- **Anyone with the drive can read everything on it.** If that matters, use an encrypted
  drive (BitLocker, FileVault, LUKS, VeraCrypt) and unlock it before starting.
- A drive that comes home is read defensively and never written to
  ([security.md](security.md#bringing-a-drive-back)).

See also [offline.md](offline.md).
