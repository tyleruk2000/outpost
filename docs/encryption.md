# Encryption

The **Encryption** screen has two halves: real encryption with OpenPGP keys (the kind
GnuPG uses) for text, files and pages of notes, and classical ciphers worked with pencil
and paper, which protect nothing from anyone with a computer. The security model is in
[security.md](security.md#encryption).

## What it is, and is not

It protects what you encrypt, stored or sent, between people who have exchanged keys. It
does not hide that something is encrypted, to whom, or roughly how large it is. It does
not protect against someone at the device while a key is unlocked, or software that
records typing. Outpost's own code around the OpenPGP library has not been audited; for
anything that matters, check the result with GnuPG.

## It needs HTTPS

Keys are made, unlocked and used **in the browser**; passphrases, unlocked keys and the
text are never sent to the server or stored. Browsers allow the cryptography only over
**HTTPS** or at `http://localhost` on the computer itself. At a plain `http://` address
the screen opens on **By hand**, says what does not work, and links to **Settings, HTTPS
on your network**. An encrypted page of notes shows only its title and tags there.

## Keys

The **public key** is for giving out: others encrypt to you with it and check your
signatures. The **private key** stays with you, locked by a passphrase.

### Making one

**Make a key** asks for a name, an optional email address, a kind (**Curve25519**, the
default, or **RSA 4096** for old software), an expiry (1, 2 or 5 years, or never) and a
passphrase. It then shows the fingerprint, the public key, and a **revocation
certificate** to save (see [Revoking](#revoking)).

### Where the private key is kept

Always locked by its passphrase, in one of two places:

- **On this device only** (the default), in this browser. Clearing the browser's site
  data erases it; without a saved copy (**Save a copy of the private key**), everything
  encrypted to it is lost.
- **On this device and on Outpost**, so your other devices can fetch it. *Anyone on your
  network can copy it and try passphrases for as long as they like*, so it is only as
  safe as its passphrase, and a stricter one is required.

Public keys always go on Outpost. A key's menu moves the private key later. Stopping
keeping it on Outpost does not reach backups and drives made meanwhile.

### Passphrases

A passphrase is all that protects a key someone has copied. **Suggest one** makes five
pronounceable words from the browser's random source (80 bits, such as
`kusom-duhaj-najis-gisar-zirir`); write it down. A typed passphrase is refused if it is
a repeated character, a straight run, or contains a word from the key's name or address,
and must be at least:

- **12 characters** for a key kept on this device only;
- **20 characters with 10 different ones** (or a suggested one of 64 bits or more) for
  anything kept on Outpost;
- anything, for a passphrase-only message or file agreed with someone else.

Passing is no promise: a quotation is weak however long. A passphrase cannot be
recovered or reset.

### Unlocking

An unlocked key is held in the tab for **5 minutes after its last use**, and forgotten
on **Lock now**, on leaving the screen, or on closing the tab. Typing on a page opened
with the key counts as use.

### Other people's keys

**Add a key** takes a pasted or saved public key; nothing is looked up online. Anyone
can make a key in any name: compare the **fingerprint** with its owner in person or on a
call, then tick **I have compared this fingerprint**. The mark is kept in this browser
only. The same box takes your own private key exported from elsewhere
(`gpg --armor --export-secret-keys`, which must have a passphrase) and revocation
certificates.

Each key says what it can do here: **Decrypts and signs here**, **Encrypts only: private
key not here**, or **Encrypts and checks signatures only**. Expired, revoked and invalid
keys are marked and cannot be encrypted to.

### Revoking

A revocation certificate tells others' software to stop using a lost or stolen key. It
needs no passphrase, so keep it private. **Make a revocation certificate** makes another;
**Revoke this key now** applies it here and cannot be undone. A revoked key still
decrypts old messages.

### Deleting

**Delete key** removes the public key from Outpost and the private key from this device
and Outpost. Anything encrypted to it is lost unless a copy of the private key exists.
Copies on other devices, in backups and on drives are not touched.

## Text

- **Encrypt** to one or more keys, optionally also with a passphrase (with no key, this
  is `gpg -c`), optionally signed. The result is text to copy or save as `.asc`.
- **Decrypt** says first whom the message is encrypted to. A changed message shows
  nothing.
- **Sign** makes a clear-signed message; **Check a signature** checks one against every
  key you hold.

A signature check says exactly what it checked: **Good signature** from your key, from a
key whose fingerprint you compared, or from a key nobody here has checked (proving only
that the holder of that key signed); **Bad signature**; **Signature not checked** (key
unknown); a key no longer good (treat as unsigned); or **Not signed**.

## Files

**Encrypt** a file to keys or a passphrase, as `.gpg` or as text (`.asc`, a third
larger). **Decrypt** a `.gpg`, `.pgp` or `.asc` file. Nothing is uploaded, and a
decrypted file is offered only after all of it passes its integrity check. Limits:
**537 MB** to encrypt and 752 MB to decrypt; use GnuPG for larger. Encrypted files are not
added to the library.

## Pages of notes

Choose **Encrypt this page…** from a page's menu. Its text is replaced by an encrypted
copy that only its passphrase or key opens.

- **Encrypted:** everything written on the page.
- **Not encrypted:** title, icon, tags, cover, place in the tree, sub-pages, dates, and
  the fact that it is encrypted.
- **Not allowed:** pictures and attached files. Remove them first.

Before anything is saved, the page is encrypted, decrypted again and compared; if it
differs, nothing is sent. Encrypting with a key needs it unlocked.

### What happens to the old text

Encrypting removes the page's text from search and from "linked from" lists, and erases
it from the database file. It does **not** reach, and the dialog says so:

- backups and portable drives made before now, and a drive's record of changes;
- exported files, and a copy kept on a phone;
- an unsaved draft in another tab;
- freed space in the database until **Storage, Manage and clean up, Compact the
  database**, and single words left in the search index;
- the disk underneath.

Treat every copy made before now as still holding the text.

### Opening and editing

Enter the passphrase or the key's passphrase. **Edit** makes the text editable; changes
are encrypted and saved two seconds after typing stops ("Encrypting and saving…").
**Done** saves; **Lock** saves and forgets. Five minutes idle, leaving the page or closing
the tab lock it too, but a page with unsaved changes is never locked: it keeps trying to
save. No draft is kept, so a failed last save is lost and says so. **Remove encryption…**
stores the text plainly again. To change a passphrase, remove the encryption and encrypt
again.

### Limits

- No pictures or attached files.
- The sidebar does not mark encrypted pages.
- Templates cannot be encrypted.
- A page with several locks, made elsewhere, can be read but not edited.
- A drive brought back treats an encrypted page as a whole page; an edit on both sides
  is a conflict to settle by hand. Keys are not brought back from a drive. Backups hold
  them; **Erase everything** erases them.

## Working with GnuPG

| To | In GnuPG |
| --- | --- |
| Use a key saved from Outpost | `gpg --import name-public-….asc` (or `name-PRIVATE-….asc`) |
| Give Outpost a key | `gpg --armor --export you@example.org` (or `--export-secret-keys`), then **Add a key** |
| Decrypt a message, file or encrypted page's block | `gpg --decrypt file.asc` |
| Encrypt with a passphrase for Outpost | `gpg --symmetric --armor` (without `--armor` for Files) |
| Check a signature made in Outpost | `gpg --verify signed.asc` |
| Revoke | `gpg --import name-revocation-….asc` |

## By hand

Six ciphers, each with a tool, its steps worked with your own message, and paper aids.
Nothing typed is sent or stored. **None protects a message from anyone with a computer,
except a one-time pad used exactly by its rules.**

| Cipher | How | Strength |
| --- | --- | --- |
| **Caesar and ROT13** | Each letter moved along the alphabet; ROT13 moves 13 | None |
| **Vigenère** | Each letter shifted by the repeating key letter above it | Broken |
| **Playfair** | Pairs of letters from a 5 × 5 square made from the key | Broken |
| **Rail fence** | Written in a zigzag, read off rail by rail | None |
| **Columnar transposition** | Written in rows under the key, read off by columns | Broken |
| **One-time pad** | Message letter plus pad letter, modulo 26 | Unbreakable only if the pad is truly random, as long as the message, never reused, and kept secret |

Playfair and the pad use A to Z only: spell numbers in words.

### Paper aids

**Print a Vigenère square**, or **Print pads**: 1, 2, 4 or 8 pads of 100, 250 or 500
letters, each printed twice (one for each of you), with the rules on each. A pad is only
as secret as the computer, printer and route that made it; the strict way is dice and
pencil. **Save as PDF** makes the same sheets (A4 or US Letter). A saved PDF is **a third
copy of the pads**: print it, then delete it everywhere. **Add to library** asks first for
pads, since everyone on the network can read the library.

### Printing from a phone

A phone's browser does not always print from a page's button, and never says when it
did not. On an iPhone, other apps' in-app browsers and a site opened from the Home
Screen may do nothing. Where the browser has no print, there is no Print button; when
Outpost was opened from the Home Screen, **Save as PDF** comes first; and if no sign of
printing follows a press, the screen says what to do instead. For pads, the square and
the map, use the PDF; for the Contacts emergency sheet, use the browser's Share menu,
then Print, or a screenshot.

### Amateur radio

Encrypting to hide a message's meaning is not allowed on the amateur bands: Ofcom's
licence (OFW611, 2024, condition 6, clause 19(b)) and the ITU Radio Regulations (2024,
provision 25.2A), read 16 November 2026. The UK licence lifts this in a disaster,
emergency or exercise (clause 5); read the current booklet before relying on it.

## The library

OpenPGP is done by **OpenPGP.js 6.3.2**, under the LGPL (version 3 or later). It is
shipped unchanged beside its licence and loaded only when needed; you may replace it with
another build. See [architecture.md](architecture.md#dependency-licences). How it fits
together: [development/encryption-and-contacts.md](development/encryption-and-contacts.md).
