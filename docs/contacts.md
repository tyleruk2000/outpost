# Contacts

The people and places to reach when the phone network and the internet are down. They
can be printed on one sheet, brought in from a phone and handed back to one.

**Everyone who can open this Outpost can read, change, export and delete every
contact.** There are no accounts and no private contacts. Think about who is on the
network before putting someone's number in ([security.md](security.md#contacts)).

## What a contact holds

A person, or an organisation or place. Everything is plain text, written the way you
need to read it; nothing is checked.

- **Name**, with title, middle names, suffix and "known as"; or an organisation's name
  and department.
- **Phone numbers, email addresses, links and addresses**, up to 30 of each, each with a
  label ("mobile", "satellite", "meeting point").
- **In an emergency**: a mark and one line ("Has a spare key and a generator"). Marked
  contacts come first and go on the emergency sheet.
- **Radio**: a callsign and frequencies in the order to try them ("145.500 MHz, FM, on
  the hour").
- A linked **saved place**, up to 20 linked **pages of notes**, related people, birthday
  (the year may be left out), note and tags.
- Other fields that came from a phone are kept, shown, and exported again, but cannot be
  changed here.

At most 20,000 contacts. **Photos are not kept.**

## Using them

- **Find as you type** by name (accents do not matter), part of a number however spaced,
  email, place, tag or callsign. Contacts also appear in the search across everything.
- Each number has **Call**, **Text** and **Copy**; each email **Email** and **Copy**.
- **Large type** shows one contact readable at arm's length.
- **Find on the map**, under an address, opens the map at the town from the installed
  place names. It finds towns, not streets. A linked saved place is exact.
- **Print the sheet**, beside "In an emergency", shows the marked contacts as a page to
  print. A printed sheet does not change when a contact does, and can be read by whoever
  finds it. On a phone, if Print does nothing, use the browser's Share menu, then Print,
  or a screenshot ([encryption.md](encryption.md#printing-from-a-phone)).
- **The sheet as a PDF** offers **Save as PDF**, **Add to library** and **Share**, A4 or
  US Letter. Names in any script (Greek, Cyrillic, Chinese and so on) print as text in
  their own letters. **Add to library** asks first: the library
  is readable by everyone on the network, goes into every backup, and keeps the copy
  until you delete it.
- Nothing is saved until **Save contact**. If the contact changed elsewhere since you
  opened it, your change is refused.

## Bringing contacts in from a phone

**Contacts → ⋯ → Bring in from a phone or a file.**

1. **Choose** a vCard file (`.vcf`, versions 2.1, 3.0 and 4.0; at most 50 MB), or **Pick
   from this phone** where the browser allows it.
2. **Read what would happen**: how many are new, already here, look like one already
   here, could not be read (with reasons), and how many pictures were left out.
3. **Do it.** The button says exactly what it will do: "Add 12 contacts and change 2".

### Contacts that look like one already here

A contact is matched by the same card identity from the same phone, or by the same name
with a number or email in common (very likely the same person), or by the same name only
(may be someone else). A shared number alone is not a match. The two are shown side by
side and you choose:

- **Leave Outpost's as it is** (the default);
- **Add what is new**, which adds and never removes or replaces;
- **Use the file's**, which replaces names, numbers, addresses and note, keeping the
  emergency mark, radio details, tags and links;
- **Keep both**.

So bringing the same phone's export in again later is safe.

### Making the file on a phone

From Apple's and Google's help pages, read 16 November 2026; menus move between versions.

- **iPhone or iPad:** **Contacts**, tap **Lists**, touch and hold a list, **Export**,
  choose the fields, **Done**, save the file, then choose it in Outpost. From a computer,
  iCloud.com: Contacts, Select All Contacts, **Export vCard**.
- **Android:** **Contacts**, **Fix & manage** (or **Organize**), **Export to file**,
  choose the account, **Export to .VCF file**.

**Pick from this phone** works only in Chrome on Android over HTTPS. It is not in Safari,
Firefox, desktop Chrome or Samsung Internet. The picker gives no labels, notes or
birthdays; a file carries more.

## Sending contacts out

**Contacts → ⋯ → Export all as a vCard file**, **Save as a vCard file** on one contact, or
**Save these as a vCard file** on the emergency sheet. The file is vCard 3.0, which
iPhones, Google Contacts and address books read. **A phone does not show the radio
details or the emergency mark**; another Outpost does. Links to the map and notes are not
exported.

## Keeping a copy on a phone (CardDAV)

**Contacts → ⋯ → Keep a copy on a phone.** Off until you turn it on. A phone subscribes
to Outpost's address book and keeps its own copy, still there when Outpost cannot be
reached.

- **From Outpost to the phone, never back.** The address book is read-only: nothing done
  on a phone can change a contact in Outpost. The copy is an account of its own beside the
  phone's contacts; removing the account removes only the copy.
- **No password is checked or stored.** Type `outpost` as the user name, and as the
  password if one is demanded. **Never type a password you use elsewhere.** Turning this
  on is the same decision as sharing Outpost on the network.
- Not offered from a portable drive.

Give the phone the address the page shows, such as
`https://192.168.1.20:8443/dav/principal/`:

- **iPhone or iPad** (needs HTTPS, with Outpost's certificate given full trust): Settings
  → Apps → Contacts → Contacts Accounts → Add Account → Add Other Account → Add CardDAV
  Account; server, user name `outpost`, password `outpost`.
- **Mac:** Contacts → Add Account → Other Contacts Account → CardDAV, Manual, the same.
- **Android:** install DAVx⁵, add an account with "Advanced login", give the address as
  the base URL, leave user name and password empty, choose the "Outpost" address book.

If a phone will not connect, a vCard file always works.

## What is not built

- **Two-way sync.** Changes on a phone do not flow back; bring them in as a file.
- **Photos.**
- **Contacts kept on a phone out of reach** with the other kept copies
  ([offline.md](offline.md#a-phone-out-of-reach-of-the-server)): use the CardDAV copy or a
  vCard file in the phone.
- **Street addresses on the map.**
- **Groups a phone understands:** tags travel as vCard categories, which Google reads and
  an iPhone ignores.

## Backups, portable drives and erasing

- **Backups** hold every contact, unencrypted unless backups have a passphrase
  ([storage.md](storage.md#protecting-backups-with-a-passphrase)).
- **Portable drives** carry them unless **Contacts** is turned off; leave them off a drive
  you hand to someone else. Contacts changed on a drive are not brought back: export a
  vCard file there and bring it in at home ([portable.md](portable.md)).
- **Erase everything** removes every contact.
