# Encryption

The **Encryption** screen has two halves. One is real encryption with OpenPGP keys, the
kind GnuPG uses: keys, text, files, and pages of your notes. The other is a set of
classical ciphers that can be worked with pencil and paper, which are for interest and
practice and protect nothing from anyone with a computer.

This page says what each part does, what it does not, and what was tested. The security
model, and the reasons for it, are in [security.md](security.md#encryption).

## What it is, and is not

It protects what you encrypt while it is stored and while it travels, between people
who have exchanged keys.

- It does not hide that something is encrypted, who it is encrypted to, or roughly how
  large it is. All three can be read from the outside of an OpenPGP message.
- It does not protect anything from someone at a device while a key is unlocked or a
  decrypted text is on its screen.
- It does not protect against software on the device that records what is typed.
- A page opened over plain HTTP cannot do any of it; see below.
- Outpost's use of OpenPGP has not been audited by anyone. The library underneath has
  been; Outpost's own code around it has only its tests. For something that matters,
  check the result with GnuPG.

## Where it runs, and why HTTPS matters

Every key is made, unlocked and used **in the browser**. A passphrase, an unlocked key
and the text or file being encrypted are never sent to the server, written to the
browser's storage, logged, or put in an address.

Browsers only allow the cryptography this needs (`crypto.subtle`) on a page opened over
**HTTPS**, or on the computer Outpost itself runs on (`http://localhost`). Outpost is
usually reached on a home network as `http://<address>:8080`, and there:

- The screen opens on **By hand** with a notice above the tabs that says what does not
  work there (keys, text, files and encrypted pages of notes), why, and links to
  **Settings, HTTPS on your network** (`/settings#https`). **Keys, Text and Files** each
  point back to it. The encryption library is not even fetched.
- An encrypted page of notes shows its title and tags and the same notice in place of
  its text.
- **By hand** works, including making pads, because it needs only random numbers.

This is the browser's rule, not a choice Outpost could override, and it is the right
rule: over plain HTTP anyone on the network who can alter traffic could change the page
on its way to you and take your passphrase. Outpost does not offer to do the
cryptography on the server instead, because that would mean sending the passphrase and
the text across that same network.

Checked in Chromium with the packaged app opened as `http://outpost.test:8635` (a name
that is not `localhost`): the screen opened on "By hand", the library was not requested,
ciphers and pads worked, and an encrypted page asked for HTTPS.

## Keys

A key is a pair. The **public key** is for giving out: with it anyone can encrypt
something only you can read, and check that a signature is yours. The **private key**
stays with you, locked by a passphrase; it decrypts and signs.

### Making one

**Make a key** asks for a name, an optional email address, a kind, an expiry and a
passphrase.

- **Curve25519** (the default) or **RSA 4096** for correspondents whose software is too
  old for it. Curve25519 keys are written in the encoding GnuPG uses (EdDSA and ECDH,
  algorithms 22 and 18, in a version 4 key). The newer encoding of RFC 9580 is *read*
  (a key of that kind can be added and used) but never made here, because GnuPG 2.5.18
  refuses it: "unsupported public-key algorithm (27)".
- **Expiry**: 1, 2 (the default) or 5 years, or never.
- The key is made in the browser. Curve25519 takes a fraction of a second; RSA 4096 took
  0.7 to 2.5 seconds on an Apple M2 Max.

When it is made, the screen shows its fingerprint, its public key, and a **revocation
certificate** to save. See [Revoking](#revoking).

### Where the private key is kept

Always in the form its passphrase protects, and one of:

- **On this device only** (the default): in this browser's storage (`localStorage`).
  To use the key on another device you carry a copy there yourself (**Save a copy of
  the private key**, then **Add a key** on the other device). Clearing the browser's
  site data erases it; if no copy was saved, the key is gone and so is everything
  encrypted to it.
- **On this device and on Outpost**: your other devices can then fetch it. *Anyone on
  your network can copy a key kept on Outpost and try passphrases against it for as long
  as they like, so it is only as safe as its passphrase.* The screen says this at the
  moment of choosing, and requires a passphrase that passes the stricter rule below.

The public key always goes on Outpost, where every device sees it. A key's place can be
changed later from its menu: **Keep the private key on Outpost too**, **Stop keeping it
on Outpost**, **Remove the private key from this device**. Stopping does not reach
backups and portable drives made while it was there.

The server checks every private key it is asked to keep, by reading the key's packets,
and refuses one whose secret part is not encrypted under a stretched passphrase. It
also refuses private material offered as a public key.

### Passphrases, and how they are measured

OpenPGP stretches a passphrase with repeated SHA-256. Outpost sets this as high as the
format allows (65,011,712 bytes hashed per guess), which is about a million SHA-256
block operations. A graphics card does billions of those a second, so thousands of
guesses a second per card is the right order of magnitude. That is an estimate from the
arithmetic, not a measurement. It means the passphrase's own unpredictability is the
whole defence for anything an attacker can copy.

Outpost cannot measure how guessable a phrase someone made up is. So:

- **Suggest one** makes a passphrase from five *proquints* (pronounceable five-letter
  words, 16 random bits each; Wilkerson, 2009, <https://arxiv.org/abs/0901.4016>), drawn
  from the browser's cryptographic random source: 80 bits exactly, for example
  `kusom-duhaj-najis-gisar-zirir`. It is shown so that it can be written down.
- A **typed** passphrase is measured by what can be measured. It is refused if it is one
  character repeated or a straight run, or contains a word of four letters or more from
  the key's own name or address.
  - For a key kept on this device only: at least **12 characters**.
  - For anything kept on Outpost (a private key, an encrypted page): at least
    **20 characters with 10 different ones**, or a suggested passphrase of at least
    64 bits.
  - For a passphrase-only message or file, which may be a phrase agreed with someone
    else, nothing is refused; the screen says what it sees.

Passing is not a promise of strength: a quotation or a lyric is weak however long it is,
and the screen says so.

A passphrase cannot be recovered or reset. Outpost never has it.

### Unlocking

A key that has been unlocked is held in the tab's memory for **5 minutes after its last
use**, and forgotten when you press **Lock now**, leave the Encryption screen, or close
the tab. "Forgotten" means the library is told to wipe the key's secret numbers and
Outpost drops every reference to it. A browser gives a page no way to be certain that
memory is erased, and a passphrase typed into a field is a string that cannot be
overwritten; both are simply released.

Reading or typing on a page of notes that was opened with a key counts as use of that
key: every save of the page needs it, to check what was encrypted. So the key's 5
minutes and the page's are the same 5 minutes, and both start again at each key press
and each press of a pointer on the page.

### Other people's keys

**Add a key** takes a public key as pasted text or a file. Nothing is looked up on the
internet: there are no key servers here.

A key says whose it is, and anyone can make a key that says anything. What tells one
key from another is its **fingerprint**, shown in full in groups of four for reading
aloud. Compare it with the key's owner in person or on a call, then tick **I have
compared this fingerprint**. That mark is kept in the browser, by fingerprint, and never
on the server: Outpost has no accounts, so a mark kept there could be set by anyone on
the network. A key that someone swapped on the server for another shows up as not
checked. Where you pick whom to encrypt to, a key not yet marked says **Fingerprint not
compared**.

The same box takes a **private key of your own** exported from elsewhere
(`gpg --armor --export-secret-keys`), which must have a passphrase, and a **revocation
certificate** for a key in your lists.

### What a key can do here

Each key says, in words: **Decrypts and signs here**; **Encrypts only: private key not
here** (yours, but its private half is on another device); or **Encrypts and checks
signatures only** (someone else's). Expired, revoked and invalid keys are marked, are
left out when choosing who to encrypt to, and are refused by the engine if used anyway.

### Revoking

A revocation certificate is a short signed statement that a key should no longer be
used. It needs no passphrase to use, so it is kept private, apart from the private key.
If the key is lost or stolen, giving the certificate to everyone who has your public
key (`gpg --import`) tells their software to stop using it. One is offered when a key is
made; **Make a revocation certificate** makes another at any time. **Revoke this key
now** applies it here, which cannot be undone. A revoked key still decrypts what was
encrypted to it before.

### Deleting

**Delete key** removes the public key from Outpost and the private key from this device
and from Outpost, after saying what follows: anything encrypted to the key can no longer
be decrypted unless a copy of the private key exists somewhere. Copies on other devices,
in backups and on portable drives are not touched.

## Text

- **Encrypt** to one or more keys, optionally with a passphrase that can also open it
  (with no key chosen this is `gpg -c`), optionally signed. The result is ASCII-armoured
  text to copy or save as `.asc`. If none of the keys is yours, the screen says you will
  not be able to read it yourself.
- **Decrypt** reads the outside of a pasted message first and says who it is encrypted
  to, in your terms: your key (locked or unlocked), someone else's key, or a key ID that
  is not in your lists. A message that has been changed shows nothing.
- **Sign** makes a clear-signed message: the text readable as it is, with a signature
  under it.
- **Check a signature** checks a clear-signed message against every key in your lists.

### What a signature check says

Exactly what was checked, and never more:

| Result | Meaning |
| --- | --- |
| Good signature, your own key | The text is what your key signed. |
| Good signature, a key you marked as checked | The text is what that key signed, and you have compared its fingerprint with its owner. |
| Good signature, a key nobody here has checked | The text is what that key signed. The key *says* whose it is. Until the fingerprint is compared, this proves only that the holder of that key signed it. |
| Bad signature | The text or the signature was changed, or it was never signed by that key. |
| Signature not checked | It names a key that is not in your lists. This says nothing either way. |
| Signature by a key that is no longer good | The key was expired or revoked. Treat the text as unsigned. |
| Not signed | Nothing says who wrote it. |

## Files

**Encrypt** a file chosen from the device to keys or a passphrase, optionally signed, as
a compact `.gpg` file or as text (`.asc`, a third larger). **Decrypt** a `.gpg`, `.pgp`
or `.asc` file. The result is offered as a download; the original is not touched.

- The file is read a piece at a time and is not uploaded.
- A decrypted file is offered only after **all of it** has passed its integrity check.
  A file that was changed, is cut short, or is opened with the wrong passphrase yields
  nothing.
- The name stored inside an encrypted file is treated as a suggestion: it is stripped of
  path separators and control characters before it is offered as a download name.
- The result is held by the browser until it is saved, so there is a limit:
  **537 MB** (512 MiB) to encrypt, and 752 MB to decrypt, since an encrypted file is
  larger than what is in it. For anything bigger use GnuPG on the computer itself.

Measured in Chromium on an Apple M2 Max, through the screen, with files of random bytes
read from disk and both results saved and compared by SHA-256:

| File | Encrypt | Decrypt | Round trip |
| --- | --- | --- | --- |
| 537 MB (512 MiB) | 9 s | 14 s | identical |
| 1.07 GB (1 GiB) | 17 s | 27 s | **not completed**: the browser cancelled saving the decrypted file. The disk had 15 GB free. |

Because the larger round trip did not finish, the limit is the size that did. Firefox and
Safari were not measured.

**Encrypted files are not added to the library.** The library keeps files it can read
and search (PDF, EPUB, Markdown, text, images), and an encrypted file is none of those.

## Pages of notes

Open a page and choose **Encrypt this page…** from its menu. The page's text is replaced
by an encrypted copy that only its passphrase or key can open, in the browser.

### What is and is not encrypted

| | |
| --- | --- |
| **Encrypted** | Everything written on the page: text, formatting, tables, links to other pages and documents. |
| **Not encrypted** | The title, icon, tags and cover; where the page sits in the tree; its sub-pages (each is a page of its own); when it was created and changed; and the fact that it is encrypted. |
| **Not allowed** | Pictures and attached files. They are stored on Outpost as separate files that anyone on the network can open, and encrypting the text around them would look safer than it is. A page with any is refused until they are removed; an encrypted page will not take one. |

### What happens to the old text

The save that encrypts a page:

- replaces the page's content with the encrypted message;
- removes its text from the search index and from search by meaning (its passages and
  their vectors are deleted; the page stays findable by title and tags);
- removes the page from the "linked from" lists of pages it mentions, since its links
  can no longer be seen;
- **erases the replaced text from the database file**, the write-ahead log and the
  search index's own tables, rather than leaving it in freed space. A test reads the
  files afterwards and finds neither the words nor the stems the index made of them.

It does **not** reach, and the dialog says so before you confirm:

- **Backups** made before now, on this computer or on a storage location such as a NAS.
- **Portable drives** written before now.
- **The record of a drive that was brought back**, which keeps the earlier version of
  each page it changed so that the change can be undone.
- **Exported files** (Markdown, the workspace zip).
- **A copy kept on a phone** for use offline.
- **An unsaved draft** of the page open in another browser tab. (If that tab is this
  one, the encrypted page says so and offers to discard the draft.)
- **Earlier wordings of the page**, from before your last edits. Outpost has no page
  history, but text freed by earlier saves can lie in unused space in the database file
  until it is compacted (**Storage, Manage and clean up, Compact the database**), and
  single words of it can remain as terms in the search index after that.
- The disk underneath. Nothing here overwrites disk blocks.

If the text mattered before it was encrypted, treat every copy made before now as still
holding it.

### How it is saved, and what cannot go wrong

1. Anything unsaved on the page is saved first. If it cannot be (offline, or the page
   was changed elsewhere), nothing is encrypted.
2. The page is encrypted in the browser.
3. The result is **decrypted again in the browser** with the same passphrase or key and
   compared with what was written. If it differs by a character, or cannot be decrypted,
   nothing is sent.
4. Only then is it saved, on top of the exact version it was made from. If the page
   changed in the meantime the save is refused and the page is as it was.

Encrypting with a key requires that key to be unlocked, for step 3. That also proves
you can open the page afterwards.

The server adds two guards of its own. A save from a browser may only put ciphertext in
place of text, or the reverse, on top of the version it names; and it may only put text
in place of ciphertext if it says that is the point. So a tab left open from before the
page was encrypted cannot put the old text back.

### Opening, editing, locking

An encrypted page shows its title and tags, and asks for its passphrase or its key's
passphrase. Then:

- The text is shown, read-only. **Edit** makes it editable.
- While editing, changes are saved two seconds after typing stops. Each save is a fresh
  encryption of the whole page, checked as above before it is sent. The page says
  "Encrypting and saving…" and "Not saved yet" in place of "Saved". If a save fails, the
  changes stay on screen and nothing is stored in their place.
- **Done** saves and returns to reading. **Lock** saves, then forgets the text and the
  passphrase. So do **5 minutes** without a key or a pointer, leaving the page, and
  closing the tab.
- Leaving the page for another screen with something unsaved saves it on the way out,
  including anything typed while an earlier save was still under way, and a save that
  is under way is allowed to finish before the key is forgotten. If that last save
  fails, a message says the last changes were not saved; they are gone, because an
  encrypted page keeps no draft. Closing or reloading the tab while something is
  unsaved or being saved makes the browser ask first.
- If something is still unsaved when the 5 minutes run out (a save failed and nobody
  pressed **Try again**), the page tries once more to save it, and locks only if that
  works. Otherwise it stays open with the changes on screen and tries again every 5
  minutes. A page that cannot be saved is never locked, because locking would drop
  what was typed.
- A page opened with a key is saved with that key. If a save finds the key locked, the
  page says so, keeps the changes on screen, and asks for the key's passphrase; **Unlock
  and save** then saves them. (A key is not forgotten while its page is in use, so this
  should not happen in ordinary use.)
- The decrypted text is never written to the browser's storage. An encrypted page keeps
  no draft.
- **Remove encryption…** stores the text in the clear again, after asking.

To change a page's passphrase, remove the encryption and encrypt it again.

### What an encrypted page is, underneath

An ordinary page whose whole content is one code block of the language `pgp-message`
holding one armoured OpenPGP message. Nothing else marks it. That is why it survives
everything a page goes through as ciphertext: export to Markdown (a fenced block that
`gpg --decrypt` reads), a duplicate, the trash, a backup, a portable drive and its
return. A copy of Outpost that knows nothing of encryption shows it as a block of text.

Inside the message is the page's content as JSON:

```json
{ "outpost": "encrypted-page", "version": 1, "content": { "type": "doc", "content": [ … ] } }
```

A page holding a message Outpost did not write (pasted from `gpg -c`, say) opens as
plain paragraphs.

### Limits

- **No pictures or attached files**, as above. Lifting this needs attachments to be
  encrypted in the browser before upload, and the server to know which page an
  encrypted attachment belongs to without reading the page.
- **The sidebar does not mark encrypted pages.** The tree is read without each page's
  content, which is where the mark would come from.
- **A template cannot be encrypted**, and an encrypted page cannot become one.
- **A page with more than one lock** (a passphrase and a key, or several keys; possible
  only for a message made elsewhere) can be read but not edited, because saving from
  here would keep only the lock that was used.
- **Bringing a drive back** treats an encrypted page like any other: whole pages, never
  merged. A page encrypted at home and edited on the drive is a conflict to settle by
  hand.
- **Keys are not brought back from a drive**, and are not in a drive's record of
  changes. A backup holds them (public keys, and any protected private key kept on
  Outpost). "Erase everything" erases them.

## Working with GnuPG

| To | In GnuPG |
| --- | --- |
| Use a public key saved from Outpost | `gpg --import name-public-….asc` |
| Use a private key saved from Outpost | `gpg --import name-PRIVATE-….asc` (asks for its passphrase) |
| Give Outpost a public key | `gpg --armor --export someone@example.org`, then **Add a key** |
| Give Outpost a private key | `gpg --armor --export-secret-keys you@example.org`, then **Add a key** |
| Decrypt a message, a file, or an encrypted page's block | `gpg --decrypt file.asc` |
| Encrypt with a passphrase for Outpost to open | `gpg --symmetric --armor` (or without `--armor`, for Files) |
| Check a signature made in Outpost | `gpg --verify signed.asc` |
| Revoke | `gpg --import name-revocation-….asc` |

### What was tested against GnuPG

GnuPG 2.5.18 was installed on the machine this was built on. In a keyring of its own,
thrown away afterwards (never the user's), `engine.test.ts` does all of this each time
the web tests run, and skips it, saying so, where `gpg` is not installed:

- A key made in Outpost imports into gpg, public and private, under the same fingerprint.
- gpg decrypts what Outpost encrypted to an Outpost-made key and to a gpg-made key.
- Outpost decrypts what gpg encrypted to an Outpost-made key and to its own key
  (including GnuPG's own OCB packet, which Outpost reads but never writes).
- Signatures verify in both directions, clear-signed and inside an encrypted message;
  a changed text fails in both.
- Passphrase-only messages and files cross in both directions (`gpg -c`).
- gpg imports a revocation certificate made in Outpost and marks the key revoked;
  Outpost applies one made by gpg.

A second set of tests reads files that GnuPG 2.5.18 wrote once (`fixtures/`), so that
"reads what gpg writes" is tested where gpg is absent. No other OpenPGP program
(Sequoia, RNP, Thunderbird, older GnuPG) was tried.

## By hand

Six ciphers, each with a tool to encipher and decipher, the steps written out with your
own message, and paper aids where they help. Nothing typed here is sent or stored.

**None of these protects a message from anyone with a computer, except the one-time pad
used exactly as its rules demand.**

| Cipher | Rules as implemented | Strength |
| --- | --- | --- |
| **Caesar and ROT13** | Each letter moves `shift` places along the alphabet, wrapping. Case is kept; everything that is not A to Z is left as it is. ROT13 is a shift of 13. | None: 25 shifts to try. |
| **Vigenère** | Each letter is shifted by the key letter under it (A = 0), the key repeating. The key moves on only at letters. | Broken: repeats give the key's length (Kasiski, 1863), then each position is a Caesar cipher. |
| **Playfair** | A 5 × 5 square from the key, I and J sharing a place. Pairs of letters: same row, take the letter to the right; same column, the letter below; otherwise the other corner in the same row. A doubled pair is parted by X (by Q between two Xs); a lone last letter gets one. | Broken: pairs have their own frequencies. |
| **Rail fence** | The message written in a zigzag over the rails and read off rail by rail. | None: the number of rails is the only secret. |
| **Columnar transposition** | The message written in rows under the key and read off by columns in the alphabetical order of the key's letters; equal letters are numbered left to right. The last row is left short. | Broken: the letters are all there, and the columns can be put back by trial. |
| **One-time pad** | Message letter plus pad letter, modulo 26 (A = 0); deciphering subtracts. A pad shorter than the message is refused. | Unbreakable, *if and only if* the pad is truly random, at least as long as the message, never reused in whole or in part, and kept secret by both parties. |

Playfair and the one-time pad work on the letters A to Z only: accents are removed,
spaces and punctuation are dropped, and figures are left out with a note to spell
numbers in words. The two transpositions keep figures, since they only move characters.

### Worked examples the tests check

Every cipher is tested against a published worked example, read on 16 November 2026.

| Cipher | Example | Source |
| --- | --- | --- |
| Caesar | `THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG`, left shift 3 → `QEB NRFZH YOLTK CLU GRJMP LSBO QEB IXWV ALD` | <https://en.wikipedia.org/wiki/Caesar_cipher> (revision 1384766789) |
| ROT13 | `Why did the chicken cross the road?` → `Jul qvq gur puvpxra pebff gur ebnq?` | <https://en.wikipedia.org/wiki/ROT13> (revision 1382439832) |
| Vigenère | `attackatdawn`, key `LEMON` → `LXFOPVEFRNHR` | <https://en.wikipedia.org/w/index.php?title=Vigen%C3%A8re_cipher&oldid=1328532396> (removed from the current page in March 2026) |
| Vigenère | `attacking tonight`, key `oculorhinolaryngology` → `ovnlqbpvt hznzeuz`; `cryptoisshortforcryptography`, key `ABCD` → `CSASTPKVSIQUTGQUCSASTPIUAQJB` | <https://en.wikipedia.org/wiki/Vigen%C3%A8re_cipher> (revision 1385837243) |
| Playfair | `hide the gold in the tree stump`, key `playfair example` → `BMODZ BXDNA BEKUD MUIXM MOUVI F`, with the square and each pair | <https://en.wikipedia.org/wiki/Playfair_cipher> (revision 1371494878) |
| Rail fence | `WE ARE DISCOVERED. RUN AT ONCE.` on 3 rails → `WECRUO ERDSOEERNTNE AIVDAC`; on 6 → `WVO EOETN ACRAC RSENE EIDU DR` | <https://en.wikipedia.org/wiki/Rail_fence_cipher> (revision 1384142693) |
| Columnar | `WE ARE DISCOVERED. FLEE AT ONCE`, key `ZEBRAS` → `EVLNA CDTES EAROF ODEEC WIREE`; with nulls `QKJEU` → `EVLNE ACDTK ESEAQ ROFOJ DEECU WIREE`; again with `STRIPE` → `CAEEN SOIAE DRLEF WEDRE EVTOC` | <https://en.wikipedia.org/wiki/Transposition_cipher> (revision 1385307730) |
| One-time pad | `hello`, pad `XMCKL` → `EQNVZ`; the same ciphertext with pad `TQURI` → `later` | <https://en.wikipedia.org/wiki/One-time_pad> (revision 1385690660) |

### Paper aids

- **A Vigenère square** to print.
- **One-time pad sheets**: 1, 2, 4 or 8 pads of 100, 250 or 500 letters, each printed
  twice (one copy for each of you), in groups of five on numbered lines, with the rule
  printed on each: use each letter once, cross it out, never use any part for a second
  message, burn or shred it when finished.

Pad letters come from the browser's cryptographic random source
(`crypto.getRandomValues`). A byte of 234 or more is thrown away and drawn again, so
that what is left divides evenly among 26 letters and none is favoured; a test checks
this. The letters are held only in the page, are never stored or sent, and are gone when
you leave the screen.

A pad made on a computer is only as secret as that computer, its printer and the route
the paper takes to the other person. Typing a pad into the tool to encipher leaves it in
the browser too. The strict way is dice, a pencil, and the sums done on paper; the tool
shows the sums.

### Getting them onto paper

**Print pads** and **Print a Vigenère square** open the sheet over the whole screen, as
it will print: white paper, black letters in the mono face, each pad twice. Nothing is
printed by opening it. Above the sheet are two ways to paper, and the sheet being on the
screen is a third:

- **Print** asks the browser to print. Only the sheet is printed: the bar, the notes and
  the app behind it are left off the paper, and the sheet runs on from page to page with
  no pad copy split between two.
- **Save as PDF** makes the same sheets as a PDF file and hands it to the browser to
  save: `one-time-pads.pdf` or `vigenere-square.pdf`, A4 or US Letter (US Letter to
  start with where the device is set to a country that uses it; the choice is
  remembered). Any phone can open, share and print a PDF. Where the browser can share a
  file (which needs HTTPS), **Share the PDF** is offered as well.
- **The browser's own Share menu, then Print**, prints the sheet too, since the same
  rules apply however printing is started. A screenshot keeps it.

The PDF is written by Outpost's own small writer, the one the map uses
(`apps/web/src/features/maps/print/pdf.ts`), with no library. The words are in
Helvetica and the letters in Courier, two of the typefaces every PDF reader supplies
itself, so the file carries no font, its letters are real text, and two pads make a file
of about 7 kB. Pad copies are laid out in the order they were made, the sender's copy
then the receiver's, as many to a page as fit, and none is split between pages: three
copies of 500 letters fit on a page of A4.

**The file is made in the page and sent nowhere.** Outpost keeps nothing of it once the
view is closed or the screen is left: the only thing remembered is which paper was
chosen. But a PDF you save is **a third copy of the pads**, on this device and anywhere
it is then shared, synced or backed up. The screen says so beside the button. Print it,
then delete it everywhere, as you would burn the paper. A screenshot is a copy too.

### Printing from a phone

A Print button on a web page calls `window.print()`, and that does not do the same
thing in every browser. None of them reports failure, so the screen cannot know that a
press did nothing; it can only look for signs. What was found, on 16 November 2026:

| Where | What `window.print()` does | Source |
| --- | --- | --- |
| Desktop browsers | Opens the print dialogue; the page waits until it closes. | MDN, [Window: print()](https://developer.mozilla.org/en-US/docs/Web/API/Window/print): "This method will block while the print dialog is open." |
| Safari on iPhone and iPad | Supported. The page is not held while the print sheet is open: `afterprint` fires before the sheet is closed. | WebKit [bug 245171](https://bugs.webkit.org/show_bug.cgi?id=245171) (open since 2022, reported on iOS 15.6 and 16) |
| Any other app on iOS that shows a page in a web view (other browsers, in-app browsers) | Nothing, unless the app has arranged for printing itself. WebKit passes the call to the app through a private hook; if the app has none, the call returns with no dialogue and no error. | WebKit source, [`UIDelegate.mm`, `UIClient::printFrame`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Cocoa/UIDelegate.mm) |
| Chrome on iOS | Has arranged it: it replaces `window.print` with its own function, which asks the app to print. | Chromium source, [`ios/chrome/browser/web/model/print/resources/print.ts`](https://github.com/chromium/chromium/blob/main/ios/chrome/browser/web/model/print/resources/print.ts) |
| Firefox on iOS | Arranged the same way in 2016 (the bug is marked for version 4.0). The current source was not found to confirm it is still there. | Mozilla [bug 1247848](https://bugzilla.mozilla.org/show_bug.cgi?id=1247848), "Support window.print()", fixed |
| A site opened from the Home Screen on iOS (an app of its own, with no browser toolbar) | **Not established.** Apple does not say. The app that shows such a site is not part of open-source WebKit, so whether it answers the call cannot be read. The reports found say it does not work: on iOS 9 the dialogue opened with no preview and no printer to choose; in November 2026 the owner of another project reported that Print did nothing on an iPhone from the Home Screen. | Apple Developer Forums, [thread 22911](https://developer.apple.com/forums/thread/22911) (2015); [kylehoehns/benchcard issue 500](https://github.com/kylehoehns/benchcard/issues/500) (2026, no iOS version given) |
| Firefox on Android | Supported since version 114. | MDN [browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/Window.json), `api.Window.print` |
| Chrome on Android | Listed as supported, like desktop Chrome. Not checked further. | The same data |

Two more things bear on it. Since iOS 26, a site added to the Home Screen opens as an
app of its own by default ([firt.dev, "iOS PWA Compatibility"](https://firt.dev/notes/pwa-ios/),
updated 13 October 2026), and Outpost's manifest asks for that in any case; so anyone
who put Outpost on their Home Screen is in the row of the table that is not established.
And saving a file from a Home Screen app has its own history: a link with the
`download` attribute did nothing there on iOS 13 and was working by iOS 14.3
(WebKit [bug 209407](https://bugs.webkit.org/show_bug.cgi?id=209407)); on iOS 17 it
opens a preview of the file, with the share button, where Safari would ask whether to
download it (WebKit [bug 275288](https://bugs.webkit.org/show_bug.cgi?id=275288)).

The PDFs Outpost makes elsewhere (a map page, an HF prediction, a communication plan)
have a way that depends on none of this: **Add to library** sends the file to the
server instead of to the device ([library.md](library.md)). The paper aids offer it
too. A one-time pad should exist as two sheets of paper and nowhere else, and the
library can be read by everyone who can reach Outpost, is in every backup and is in the
search index, so for a pad the button asks first and says exactly that; the cipher
square is no secret and is added without a question.

So the screen does three things, and so do the emergency sheet in Contacts and the map's
"Print or save as PDF" (`apps/web/src/lib/printing.ts`):

- **Where the browser has no `window.print`**, there is no Print button. The screen says
  the browser cannot print from a page and what to do instead.
- **Where Outpost was opened from the Home Screen** (`navigator.standalone`, or the
  `display-mode: standalone` media query), the other way is put first: Save as PDF leads,
  Print stands second, and a line says that a phone does not always print from there.
- **After Print is pressed**, the screen waits a second and a half for a sign that
  printing began: the `beforeprint` event, or the page being laid out for paper. If
  neither comes, it says "If no print dialogue opened, this browser does not print from
  a button", and what to do instead. The words are conditional because the sign is not
  proof either way on a browser that was not tested.

What to do instead is the PDF, for pads, the square and the map. The emergency sheet has
no PDF yet: its sheet is already on the screen as it prints, so the screen points to
the browser's own Share menu, then Print, and to a screenshot.

### Amateur radio

Enciphering a message to hide what it says is not allowed on the amateur bands. The
screen says so in one line; the sources are:

- **Ofcom (UK)**, *Amateur Radio Wireless Telegraphy Licence Conditions Booklet* OFW611
  (published 21 February 2024), condition 6, clause 19(b): "Transmissions between
  amateur stations are not encrypted for the purpose of obscuring their meaning, except
  for control signals exchanged between earth command stations and space stations in the
  amateur-satellite service." Clause 19 does not apply when the equipment is used under
  clause 5, to assist with communications in a disaster or emergency, in support of a
  user service, or in an exercise for either.
  <https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf?v=386197>
- **ITU Radio Regulations** (edition of 2024), Article 25, provision 25.2A:
  "Transmissions between amateur stations of different countries shall not be encoded
  for the purpose of obscuring their meaning, except for control signals exchanged
  between earth command stations and space stations in the amateur-satellite service."
  <https://search.itu.int/history/HistoryDigitalCollectionDocLibrary/1.49.48.en.101.pdf>

Both were read on 16 November 2026. A licence is the authority, not this page: read the
current booklet before relying on either exception.

## The library

OpenPGP is done by **OpenPGP.js 6.3.2**, which is under the LGPL (version 3 or later),
not one of the permissive licences everything else in Outpost uses.
[architecture.md](architecture.md#dependency-licences) says why and how it is kept
apart: it is shipped as the unchanged file its authors publish, at
`web/vendor/openpgp/openpgp.min.mjs`, beside its licence and a notice of where its
source is; it is fetched only when the Encryption screen or an encrypted page needs it;
and Outpost's own code reaches it through one interface (`engine.ts`), so that it can be
replaced. You may put another build of OpenPGP.js in its place.

## Not tested

- **Any browser but Chromium.** The unit tests run in Node; the end-to-end tests and
  every measurement here used Chromium. Firefox and Safari were not opened.
- **A real phone.** Phone width was tested in Chromium's emulation.
- **Printing or saving a PDF on an iPhone, in any browser or from the Home Screen.**
  The print view, the PDF and the fallbacks were tested in Chromium at a phone's size,
  with `window.print` removed, made to do nothing, and with the Home Screen sign set by
  hand. What Safari, Chrome and Firefox on iOS, and a Home Screen app, do with the Print
  button, with the "Save as PDF" link and with a PDF of Courier text is taken from the
  sources under "Printing from a phone", not from a device. Whether the `beforeprint`
  sign arrives on iOS when the print sheet opens is not known; if it does not, the
  "If no print dialogue opened" line appears beside a print sheet that did open.
- **The PDF in a reader other than pdf.js and macOS Preview's renderer.** The tests read
  it back with pdf.js; it was looked at once as rendered by `pdftoppm` and by macOS.
- **Real HTTPS on a home network.** The secure-origin behaviour was tested on
  `localhost`; the setting that turns HTTPS on is another piece of work.
- **Printing on paper.** The print layout was checked in Chromium's print rendering
  (sixteen pad copies run on over six pages of A4, with nothing else on them), not on a
  printer.
- **A page of notes larger than a few thousand words**, for how long each encrypted save
  takes on a slow device.
- **Any OpenPGP program other than GnuPG 2.5.18.**

## Code

| | |
| --- | --- |
| The engine interface and its one implementation | `apps/web/src/features/encryption/engine.ts`, `engine-openpgp.ts`, `load-openpgp.ts` |
| Keys in the browser, the unlock session, passphrase rules | `device-keys.ts`, `session.ts`, `passphrase.ts` |
| The screen | `encryption-page.tsx`, `keys-tab.tsx`, `text-tab.tsx`, `files-tab.tsx`, `hand-tab.tsx` |
| Ciphers | `ciphers.ts` |
| Paper aids: their words and PDF pages, and the view that prints them | `paper-aids.ts`, `print-view.tsx`, `encryption.css`; the PDF writer in `apps/web/src/features/maps/print/pdf.ts`, `courier.ts` |
| Asking the browser to print, and saying when it will not | `apps/web/src/lib/printing.ts`, `apps/web/src/components/print-notice.tsx` |
| Encrypted pages | `pages.ts`; `apps/web/src/features/notes/encrypt-page-dialog.tsx`, `encrypted-note.tsx`; `packages/shared/src/encryption.ts` |
| The key shelf on the server | `apps/server/src/modules/encryption/` |
| Encrypted pages on the server | `apps/server/src/modules/notes/service.ts` (`encryptedNoteArmor`), `apps/server/src/modules/search/service.ts` (`scrubbing`) |
