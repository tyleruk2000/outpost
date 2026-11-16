# Contacts

The people and places to reach when the phone network and the internet are down:
family, neighbours, a doctor, a meeting point, a radio callsign and the frequency to
try. Contacts live in Outpost's own database, open from any screen that can reach it,
print on one sheet, and can be brought in from a phone and handed back to one.

This page covers what a contact holds, who can see it, how contacts come in from a
phone and go out again, what "sync" does and does not mean here, and what has and has
not been tested.

## Who can see them

**Everyone who can open this Outpost can read, change, export and delete every
contact.** Outpost has no accounts, so there is nothing to keep one person's contacts
from another's, and no "private" contact. The Contacts screen says so once, above the
list.

Contacts are information about other people. Before putting someone's number in,
consider who is on the network Outpost is shared with. What follows from this, and
where contacts travel, is in [security.md](security.md#contacts).

## What a contact holds

A contact is a person, or an organisation or place. Everything in it is plain text, and
nothing is checked for being a real number, address or frequency: write them the way
you need to read them.

| Field | Notes |
| --- | --- |
| Name | First and family name, with room for a title, middle names, a suffix and "known as". An organisation or place has a name and a department or desk. |
| Phone numbers, email addresses, links | Up to 30 of each, each with a label. The label is chosen from a short list or typed: "mobile", "satellite", "boat shed". |
| Addresses | Up to 30, each with a label, such as "meeting point". |
| In an emergency | A mark, and one line saying who this is when it matters ("Has a spare key and a generator"). Marked contacts are listed first and printed on the emergency sheet. |
| Radio | A callsign, and frequencies to try in the order to try them, each with a mode or a time ("145.500 MHz", "FM, on the hour"). Plain text: nothing is looked up or validated. |
| Saved place | A link to one saved place on the map. |
| Pages of notes | Links to up to 20 pages. |
| Related people, birthday, note, tags | A birthday may leave out the year. |
| Other fields | Anything else that came with the contact from a phone (an anniversary, a messaging name, a phonetic spelling) is kept as it came and goes out again on export. It is listed under the contact and cannot be changed in Outpost. |

Outpost holds at most 20,000 contacts. **Photos are not kept**: a picture embedded in a
contact is left out when the contact comes in, and the import says how many were.

## Using them

- **Find as you type.** By name (accents do not matter: "zoe lukas" finds Zoë
  Łukasiewicz), part of a number however it was spaced ("07700 900" finds
  "+44 7700 900123"), an email address, a place, a tag or a callsign. Contacts are also
  in the search across everything.
- **Reach someone in one touch.** Each number has Call (`tel:`), Text (`sms:`) and Copy;
  each email address has Email (`mailto:`) and Copy. What happens next is up to the
  device: a phone dials, a computer asks which app to use.
- **Large type.** One contact with its name and numbers set large enough to read at
  arm's length or without glasses. Each number is still a link that calls.
- **Find an address on the map.** Under an address, "Find on the map" looks the town up
  in the place names installed for the map and opens the map there. It finds the town,
  not the street: the place names are towns and features, not street addresses. Without
  place names installed it says so. A saved place linked to the contact is exact.
- **The emergency sheet.** **Print the sheet**, beside "In an emergency" in the list (or
  **⋯ → Print the emergency sheet**), shows the marked contacts as a
  page: names, the emergency line, numbers, callsign and frequencies, addresses, and the
  position of a linked saved place. **Print** uses the browser's own print, and only the
  sheet is on the paper. A printed sheet can be read by whoever finds it and does not
  change when a contact does. A phone's browser does not always print from a button:
  where the browser has no print the button is left out, and where a press is followed by
  no sign of printing, or Outpost was opened from the Home Screen, the screen says to use
  the browser's own Share menu, then Print, or to take a screenshot of the sheet (see
  [encryption.md](encryption.md#printing-from-a-phone) for what is known about each
  browser). The sheet cannot yet be saved as a PDF, as the map's page and the one-time
  pads can.
- **Changes are explicit.** Nothing is saved until **Save contact**. If the contact was
  changed somewhere else after you opened it, your change is refused and nothing is
  overwritten.

## Bringing contacts in from a phone

**Contacts → ⋯ → Bring in from a phone or a file.** There are three steps, and nothing
changes before the last one.

1. **Choose** a vCard file, or pick people on the phone where the browser allows it.
2. **Read what would happen.** Outpost reads the file and shows: how many contacts are
   new; how many are already here with everything the file has for them (nothing to
   do); how many look like a contact already here; how many could not be read, with the
   reason for each; and how many pictures were left out.
3. **Do it.** The button says exactly what it will do: "Add 12 contacts and change 2".

### Contacts that look like one already here

A contact from a file is compared with the ones Outpost holds:

| Match | Meaning |
| --- | --- |
| The same card | Both carry the same identity (the vCard `UID`). A phone gives a contact the same one every time it exports it. |
| Same name and a number or email address in common | Very likely the same person, from another phone. |
| Same name and nothing else in common | May be someone else. |

A shared number without a shared name is not a match: a household shares a landline.

If everything the file says about a contact is already in Outpost's, there is nothing
to ask and it is counted as "already here". Otherwise the two are shown **side by
side**, field by field, with the fields where the file says something new marked, and
you choose, one contact at a time:

| Choice | What happens |
| --- | --- |
| **Leave Outpost's as it is** (the default) | Nothing is brought in for this one. |
| **Add what is new** | Numbers, addresses and other entries Outpost lacks are added; an empty field is filled; a different note is added under the one that is there. Nothing Outpost has is removed or replaced. |
| **Use the file's** | Names, numbers, addresses and the note become the file's. The emergency mark and its line, radio details, tags and the links to the map and to notes stay. |
| **Keep both** | The file's comes in as a contact of its own. |

So bringing the same phone's export in again, weeks later, is safe: what has not
changed is skipped, what is new is added, and what changed on the phone is shown to you
before anything is touched. That is the route from a phone *to* Outpost.

### Making the file on a phone

These are the steps in Apple's and Google's own help pages, read on 16 November 2026.
They have not been tried on a phone by this project, and menus move between versions.

**iPhone or iPad** (Apple, *iPhone User Guide*, "Export contacts"):

1. Open **Contacts** and tap **Lists** at the top left.
2. Touch and hold the list you want, then tap **Export**.
3. Choose the fields to include and tap **Done**.
4. Save the file to Files (or send it to yourself), then choose it in Outpost.

Apple's page describes this for "an existing list"; it does not say in so many words
that the list of all contacts is one. From a computer, iCloud.com does the same: in
Contacts, choose Select All Contacts, then **Export vCard**.

**Android** (Google, *Contacts Help*, "Export, back up, or restore contacts"):

1. Open **Contacts**.
2. At the bottom, tap **Fix & manage** (Google's own pages also call this tab
   **Organize**), then **Export to file**.
3. Choose the account and tap **Export to .VCF file**.
4. Choose that file in Outpost.

Other makers' contacts apps export a `.vcf` too. Samsung documents sharing contacts as
a vCard file; its menu path was not confirmed.

### What is read from a vCard file

vCard 2.1, 3.0 and 4.0 are read, by a reader of Outpost's own
(`apps/server/src/modules/contacts/vcard.ts`):

- folded lines in all three versions, including 2.1's rule that the space a line was
  folded at is part of the text;
- in 2.1, quoted-printable values with their soft line breaks, a character set named
  per line (`CHARSET=`), bare parameters (`TEL;CELL;VOICE:`), and files in the Western
  European set (windows-1252) that say nothing about their encoding;
- files saved as UTF-16, with or without Windows or old Mac line endings;
- grouped properties (`item1.TEL` with `item1.X-ABLabel`), which is how an iPhone
  writes a label of your own, and Apple's built-in labels (`_$!<Mobile>!$_`);
- Apple's `X-ABRELATEDNAMES` (related people), `X-ABShowAs:COMPANY` (an organisation),
  and a birthday without a year (`X-APPLE-OMIT-YEAR`).

What is done with the rest:

- **Embedded pictures, sounds and keys are left out**, and counted. A link to a picture
  is kept as a line of text.
- **Every other property is kept as it came** and written out again on export.
- A card inside a card (2.1 allowed one) is not read as a contact.
- A card with a field longer than Outpost keeps (a note over 20,000 characters, say) is
  **left out whole and listed**, so that nothing is cut short without your knowing.
- Google's `myContacts` category, which Google puts on every contact, is not made a tag.
- A contact with only a formatted name (no separate first and family name) is kept
  under that name as its first name, and sorts by it.

Limits: one file of at most 50 MB and 20,000 contacts. A 50 MB file of 600 contacts
with photos was read in about 0.1 seconds, and 5,000 contacts were brought in in under
2 seconds, on an Apple M2 Max.

### Picking on the phone

Where the browser has the Contact Picker API, **Pick from this phone** opens the
phone's own list, and Outpost is handed only the people you tick: name, numbers, email
addresses and addresses. They go through the same three steps as a file.

Where it exists, as of 16 November 2026:

- **Chrome on Android** (since Chrome 80), and only on a page opened over **https**, in
  the top-level page, after a tap. Outpost's own HTTPS ([Settings → HTTPS on your
  network](deployment.md#https-on-the-home-network)) provides an https address;
  Chromium's source says Chrome on Android uses certificate authorities the user added,
  but nobody has tried the picker over Outpost's certificate on a real phone.
- **Not** in Safari on an iPhone (it is behind an experimental flag that is off by
  default), Firefox, desktop Chrome, or Samsung Internet (removed in version 22).

Where it is missing, the screen says why and offers the file. A file also carries more:
the picker gives no labels, notes or birthdays.

## Sending contacts out

- **Contacts → ⋯ → Export all as a vCard file**, or **Save as a vCard file** on one
  contact, or **Save these as a vCard file** on the emergency sheet.
- The file is vCard 3.0, which an iPhone, Google Contacts and desktop address books all
  read. (`GET /api/contacts/export.vcf?version=4.0` writes 4.0.)
- On an iPhone, tapping a downloaded `.vcf` offers to add the contacts. In Google
  Contacts it is **Organize → Import from file**.
- What vCard has no property for is written as `X-OUTPOST-…` lines (the emergency mark
  and line, callsign, frequencies). Another Outpost reads them back; a phone ignores
  them, so **a phone does not show the radio details or the emergency mark**. Links to
  the map and to notes are not exported: they point at things in this Outpost.
- A label a phone would not know ("meeting point") is written the way Apple's address
  book writes its own, so an iPhone shows it.

## Keeping a copy on a phone (CardDAV)

**Contacts → ⋯ → Keep a copy on a phone.** A phone or computer subscribes to Outpost's
address book and keeps its own copy up to date. The copy is still on the phone when
Outpost cannot be reached, which is when an emergency list is wanted. It is off until
you turn it on.

### Which way it goes

**From Outpost to the phone, and never back.** Outpost's contacts are the original and
the phone holds a copy.

- The address book is **read-only**. Every request that would add, change or delete is
  refused (`403`), so nothing done on a phone, and no fault in a phone's software, can
  alter or remove a contact in Outpost.
- The phone keeps Outpost's contacts as an **account of its own**, beside the contacts
  it already has. Nothing here reads, changes or removes those. Removing the account
  from the phone removes the copy and nothing else.
- To bring contacts from a phone into Outpost, use a file, as above.

This is the arrangement that cannot lose data on either side without a person choosing
to. A phone that could write could also delete, and a sync fault could empty an address
book; that is not offered. Two-way sync is described under
[What is not built](#what-is-not-built).

### No password

A CardDAV client asks for a user name and a password. Outpost has no accounts, and
everything the address book serves can already be read in a browser, with no password,
by the same devices. A password here would protect nothing, and would be one more thing
crossing the network. So:

- **No user name or password is checked, and none is stored.** The user name to type is
  `outpost`; it is a label.
- Where a phone will not continue without a password, type `outpost`. **Never type a
  password you use anywhere else**: Outpost ignores it, and over an `http` address a
  phone may send it across your network unprotected.
- Outpost never asks for a password (it never answers `401`), so a client that behaves
  does not send one.

Turning it on is therefore the same decision as sharing Outpost on the network at all:
whoever can open Outpost can read the contacts, in a browser or in a contacts app.

### What to give the phone

The page shows the address: this Outpost's address followed by `/dav/principal/`, for
example `https://192.168.1.20:8443/dav/principal/`. Addresses that start with `https`
are listed first.

- **iPhone, iPad and Mac need https.** Secondary sources (the Nextcloud manual, sabre/dav's
  notes on Apple's clients) say Apple's contacts accounts require TLS; Apple documents
  that a certificate authority installed by hand must be given full trust under
  Settings → General → About → Certificate Trust Settings. Turn on Outpost's HTTPS and
  follow its steps for the device first.
- **Android** has no CardDAV of its own; DAVx⁵ adds it. Its manual says it accepts an
  `http` address ("not recommended") and asks you to accept a certificate from an
  authority the phone does not know. It also allows logging in with no credentials.

Steps, from Apple's help pages and the DAVx⁵ manual as read on 16 November 2026:

- **iPhone or iPad:** Settings → Apps → Contacts → Contacts Accounts → Add Account →
  Add Other Account → Add CardDAV Account. Server: the https address. User name:
  `outpost`. Password: `outpost`.
- **Android:** install DAVx⁵, add an account, choose "Advanced login", give the address
  as the base URL and leave user name and password empty. Choose the "Outpost" address
  book.
- **Mac:** Contacts → Add Account → Other Contacts Account → CardDAV, account type
  Manual, the same three values.

### What the server does

One address book, at `/dav/addressbooks/contacts/`, with a principal at
`/dav/principal/` and discovery at `/.well-known/carddav` (RFC 6764). It answers
`OPTIONS`, `PROPFIND`, `GET` and `HEAD`, and the `addressbook-multiget` and
`addressbook-query` reports of RFC 6352; a filter in a query is read as words to look
for in a card. Cards are vCard 3.0.

A client finds what changed from the collection's CTag and each card's ETag. Both are
worked out from the cards themselves, so they are right after a restart or a restore
from a backup. The `sync-collection` report (RFC 6578) is not offered: it needs a
record of what was deleted and when, and for an address book of this size the listing
does the same job.

It is never offered from a portable drive, which only its own computer can open.

### What has been tested, and what has not

Tested, on a computer:

- each answer against the RFCs, by speaking the protocol by hand
  (`apps/server/test/contacts-dav.test.ts`);
- **tsdav 2.5.0**, a CardDAV client library, in the same test file: it finds the
  address book from the server's address alone, reads every card, sees a change by
  CTag and ETag, and has its attempts to add, change and delete refused;
- **vdirsyncer 0.21.0**, a sync program, by hand on 16 November 2026: discovery, a
  first sync of three contacts, a changed contact updated and a deleted contact removed
  on the next sync, and its attempts to upload a local change, a local deletion and a
  new card each refused with `403`, leaving Outpost's contacts as they were.

**Not tested: any phone.** No iPhone, iPad, Android phone with DAVx⁵, or Mac has been
connected to it. In particular it is not known:

- whether an iPhone accepts an address book that offers no `sync-collection` report
  (sabre/dav's notes say Apple's clients ask for the CTag and use `addressbook-multiget`,
  which are both here);
- what an iPhone does when a contact in this account is edited on the phone and the
  change is refused (expected: the contact is put back as Outpost has it at the next
  sync);
- whether an iPhone goes on with no password, or with one that is not asked for.

If a phone will not connect, a vCard file from the Contacts menu always works.

## What is not built

- **Two-way sync.** Contacts changed on a phone do not flow back by themselves. To be
  trusted with someone's address book it would need: what a phone sends kept exactly as
  sent, photos included, so that the phone's own copy is never cut down; a holding
  place for what a phone deletes, so that a deletion is a person's decision in Outpost
  and not a sync's; the `sync-collection` report with a record of deletions; a decision
  about a password, since a phone that can write is a different matter from one that
  can read; and a pass on real phones. None of that is in this version.
- **Photos.**
- **Contacts on a phone that is out of reach of the server.** The pages, routes and map
  areas a phone can keep ([offline.md](offline.md#a-phone-out-of-reach-of-the-server))
  do not include contacts. A CardDAV copy, or a vCard file imported into the phone, is
  how contacts are on the phone when Outpost is not.
- **Street addresses on the map.** See "Find an address on the map" above.
- **Groups as lists a phone understands.** Tags travel as vCard categories, which
  Google Contacts reads and an iPhone ignores.

## Backups, portable drives and erasing

- **Backups** hold every contact: they are in the database, which a backup copies
  whole. A backup is not encrypted unless you set a passphrase for backups
  ([storage.md](storage.md#protecting-backups-with-a-passphrase)).
- **Portable drives** carry the contacts unless you turn **Contacts** off when making
  the drive. A drive is not encrypted, and contacts are other people's details: leave
  them off a drive you will hand to someone else. Contacts added or changed while
  running from a drive are **not** brought back by "Bring back changes from a drive";
  export them on the drive as a vCard file and bring that file in at home, where
  look-alikes are shown side by side. See [portable.md](portable.md).
- **Erase everything** removes every contact, with its tags, links and place in search,
  and counts them in the summary shown before it starts.

## Sources

Read on 16 November 2026.

- Apple, iPhone User Guide, "Export contacts": <https://support.apple.com/guide/iphone/export-contacts-iph075ddebf2/ios>
- Apple, iCloud User Guide, "Import, export, and print contacts": <https://support.apple.com/guide/icloud/import-export-and-print-contacts-mmfba748b2/icloud>
- Apple, iPhone User Guide, "Import contacts": <https://support.apple.com/guide/iphone/import-contacts-iph356499f31/ios>
- Apple, iPhone User Guide, "Add or remove accounts": <https://support.apple.com/guide/iphone/add-or-remove-accounts-iph7edacccf9/ios>
- Apple, "Trust manually installed certificate profiles": <https://support.apple.com/en-us/102390>
- Apple, Contacts User Guide for Mac, "Add contacts from iCloud, Google, and more": <https://support.apple.com/guide/contacts/add-contacts-from-icloud-google-and-more-adrb7e5aaa2a/mac>
- Google, Contacts Help, "Export, back up, or restore contacts": <https://support.google.com/contacts/answer/7199294>
- Chrome for Developers, "A contact picker for the web": <https://developer.chrome.com/docs/capabilities/web-apis/contact-picker>
- W3C, Contact Picker API (Working Draft): <https://www.w3.org/TR/contact-picker/>
- MDN browser compatibility data, `ContactsManager`: <https://github.com/mdn/browser-compat-data/blob/main/api/ContactsManager.json>
- RFC 6352 (CardDAV), RFC 6764 (finding the service), RFC 6578 (collection sync),
  RFC 2426 and RFC 6350 (vCard 3.0 and 4.0), and the vCard 2.1 specification.
- Apple Calendar Server, the CTag extension: <https://github.com/apple/ccs-calendarserver/blob/master/doc/Extensions/caldav-ctag.txt>
- DAVx⁵ manual: <https://manual.davx5.com/>
- Secondary, on how Apple's clients behave: sabre/dav, "iOS" and "OS X Addressbook"
  client notes (<https://sabre.io/dav/clients/>); the Nextcloud user manual,
  "Synchronizing with iOS" and "with macOS".
