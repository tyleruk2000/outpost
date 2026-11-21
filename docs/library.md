# The library, and PDFs made in Outpost

The library holds the files you add: PDFs, EPUB books, Markdown, text, HTML, pictures and
audio. Each is checked to be what its name says, refused if the library already holds
the same bytes, read for search, and included in backups and on portable drives. Where
files are kept is in [storage.md](storage.md); how search reads them in
[search.md](search.md).

## Suggested for where you live

At the top of **Explore**, Outpost suggests downloads for the country Home is in (Home is
the saved place with the home icon). Near a border it may pick the neighbour, and says
which it took. Every country gets: the map and terrain of the smallest region round
Home, place names, reference layers, Wikipedia in the country's languages, radio and
weather; the United Kingdom also gets Ordnance Survey names, food shops, flood data and
Met Office warnings. Each row opens the screen that fetches it, size shown first.
Nothing is fetched to make the suggestions.

## Highlights and margin notes

In a PDF, a Markdown document or an EPUB chapter, select words, press **Highlight**, add a
note if you like, and **Save highlight**. The document's file is never changed.

- **Details** (top right) lists a document's highlights; press one to go to it. Search
  finds highlights by their words or notes.
- **Edit note** and **Delete highlight** change or remove one.
- **Copy all to a page in Notes** makes a page of quotes with notes and links back.

A highlight whose words are no longer in the file stays listed but is not marked. Not
available on reference archives, plain text, HTML or pictures. Browsers without the CSS
Custom Highlight API list highlights but cannot mark them.

## Audiobooks

Public-domain audiobooks, kept on the server and played in the browser.

### Getting one

- **Explore → Audiobooks** has a starter shelf of fifteen LibriVox books, with readers,
  running time and an approximate size. **Download the zip** is a link your browser
  follows; then **Add the downloaded zip**. Outpost never fetches a recording itself
  (the reasons are in
  [sources.md](sources.md#audiobooks-and-the-niosh-pocket-guide-added-on-2026-11-17)).
  On an iPhone, Safari saves the zip to Files → Downloads.
- **Library → Documents, Type: Audiobooks → Add audiobook** takes a zip of chapters, or
  several audio files (MP3, M4A, M4B, AAC, Ogg, Opus, FLAC, WAV), with an optional title.
- **Add documents** takes one audio file as a book of one chapter.

Only audio files are kept from a zip. Chapters go by track number, or else file name.
Title, author and readers come from LibriVox for a shelf book (with its licence
statement), otherwise from tags the files agree on; nothing is guessed. Chapters inside
one M4B file are not read, so it plays as one chapter.

### Playing

Find books under **Library → Documents, Type: Audiobooks**; search finds them by title,
author, reader and chapter title (not by the words spoken). A book's page has the player:
**Back 30**, **Forward 30**, **Play**, **Pause**, **Previous**, **Next**, **Speed** (0.75×
to 2×) and the chapter list. The next chapter follows on.

- Whether a file plays is the browser's to say; one it cannot play (Safari and Ogg, for
  instance) is offered as a download.
- **Your place** in each book is kept on this device only (up to 200 books); the button
  then says **Resume**. Finishing the last chapter forgets it.
- Where the browser supports it, the lock screen shows the chapter with play, pause,
  skip and seek controls, and play can continue with the screen off.
- **Leaving the page stops the book**, keeping your place.

## Books from Calibre

**Library → Import from Calibre** brings in your Calibre e-books with authors, series,
tags, description and cover. The Calibre folder is only read, never changed.

1. Make the drive or folder holding the Calibre library a storage location (**Storage →
   Add location**).
2. Open the folder with `metadata.db` in it (one author's folder works too) and press
   **Read this library**. Outpost says how many books, how much space, how many covers,
   and what will be left out and why. **Discard** changes nothing.
3. Choose **Copy them into Outpost** (to a storage location you pick) or **Use them where
   they are** (no extra space, but unreadable while that drive is disconnected), then
   **Add**.

Each book brings one file: EPUB, else PDF, else text, Markdown or HTML. A book with only
MOBI, AZW3 or DOCX is left out; convert it to EPUB in Calibre. Books already in the
library are skipped, so reading the library again adds only what is new. Up to 20,000
books per import. A book used where it is offers **Remove from Outpost only**, leaving
its file.

## Where Outpost makes a PDF

| Screen | The PDF |
| --- | --- |
| Maps → **Print or save as PDF** | One page of map at a stated scale ([maps.md](maps.md#printing-a-map)) |
| Maps → Sun tab, or a place's Sun section | Sun times for two weeks, a month or a year ([maps.md](maps.md#sun-times-on-paper)) |
| Radio → HF propagation | A prediction, or a comparison ([hf-propagation.md](hf-propagation.md#a-prediction-on-paper)) |
| Radio → HF coverage | The coverage map, with its grid in figures ([hf-propagation.md](hf-propagation.md#a-coverage-map-on-paper)) |
| Radio → Communication plans | A plan written out ([hf-propagation.md](hf-propagation.md#exports)) |
| Radio → Frequencies | The chosen frequencies as a sheet |
| Encryption → By hand | One-time pads (**asks first**) and the cipher square |
| Contacts → Emergency sheet | The marked contacts, dated to the minute (**asks first**; [contacts.md](contacts.md#using-them)) |
| Preparedness → Nuclear preparedness | The scenarios with their maps (**asks first** with saved places ticked; [nuclear-preparedness.md](nuclear-preparedness.md#on-paper)) |
| Preparedness → Emergency plans | Wallet cards, a fridge sheet or a grab list (**asks first**) |
| Preparedness → Supplies | The shopping list |
| Tools → Power and batteries | A saved power plan |
| Tools → Water; Tools → Cooking | The official guidance as quoted, with the date read |
| Tools → QR codes | The code and what it holds (**asks first** for a Wi-Fi password or contact) |
| Tools → Solar clock | Sundial and nocturnal templates to cut out |
| Library → Learning, **On paper** | Each learner's progress (**asks first**; [learning.md](learning.md)) |

Each offers the same three buttons:

- **Save as PDF** saves the file on this device; Outpost keeps no copy.
- **Add to library** files it in the library under the category **Made in Outpost**
  (**Change where** picks another, remembered in this browser), with a title saying what
  it is, of what and for when, a tag for its kind, and a link back to the screen that
  made it. It works where saving does not, such as Outpost opened from a phone's Home
  Screen ([encryption.md](encryption.md#printing-from-a-phone)), and is then the main
  button.
- **Share**, where the device has a share sheet.

If the library already holds the same bytes, nothing is added and it says where the
copy is; an emergency sheet or map page is made afresh each time, so each is a new
document. If there is no room, the PDF is still there to save. Text in these PDFs is
searchable, and a map page carries the names drawn on it, so a search for a hill finds
the map.

## Paper aids: a pad asks first

A one-time pad should exist as two sheets of paper and nowhere else. The library is the
opposite: everyone on the network can read it, and it is in every backup, every portable
drive and the search index. So **Add to library** for a pad asks first, in those words;
use it only for practice pads. The cipher square is not secret and is added without
asking.

## The emergency sheet asks first

The emergency sheet holds other people's names, numbers and addresses. A copy in the
library is searchable, goes into backups and drives, and does not change when a contact
is corrected or removed, so **Add to library** asks first. The sheet carries the time it
was made. Saving it to the device asks nothing.

## Learning progress, on paper

A PDF of a learner's progress is a record of what a child has covered. Progress itself is
kept out of search; a copy in the library is searched, backed up and does not change, so
**Add to library** asks first. The sheet is dated by the day it was made.

## Letters the typefaces cannot write

The PDFs write only Western European letters. On the emergency sheet and sun times, other
scripts are drawn as a picture, still searchable; if the device cannot draw them they
print "[?]". Other PDFs print "?" and say which entries.

Not made as PDFs: routes, place lists and repeaters (they export GPX or radio formats),
notes (Markdown), contacts (vCard), keys and encrypted files (deliberately kept out of
the library).

How these work, for developers:
[development/library-and-games.md](development/library-and-games.md).
