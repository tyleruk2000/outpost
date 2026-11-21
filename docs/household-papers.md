# Medical sheets, keeping in touch, grab cards and the binder

Four screens under **Preparedness** keep the household's papers: a medical sheet for
each person, the communication plan, a grab card each person carries, and the household
binder that puts the printables into one PDF. Each is made from what Outpost already
holds (the household under Supplies, Contacts, the emergency plans, saved places, the
list of frequencies, repeaters and the mesh radio), so a change there shows the next time
a paper is made.

## Medical sheets

**Preparedness → Medical sheets** lists each person in the household (the people under
**Supplies → Household**), with **Make a sheet** beside anyone who has none. A sheet can
also be made for someone not counted in the household: type their name under **Someone
else**.

A sheet holds what a relative or a paramedic needs to be told:

- name, date of birth and blood group (leave it empty when it is not known);
- allergies, and what happens;
- medicines: the name, the dose as the label says, when it is taken and where it is kept;
- conditions, and what to know about each;
- the GP surgery and the pharmacy, and next of kin, chosen from Contacts (so a changed
  number is changed here too) or typed;
- notes.

Press **Save** to keep a change. The screen says when there are changes not saved yet.

**Outpost records what you type and gives no medical advice.** It checks no dose,
interaction or allergy, and every printed sheet says so.

### Counting medicines down

Give a medicine what is **Held** (28), its **Unit** (tablets), how many are **Used a
day** (1) and the day it was **Counted on** (**Counted today** fills in today). The
sheet then says how long it lasts by that count: "about 8 days left, runs out about 29
Nov 2026". The list of sheets names the one that runs out soonest when it is under two
weeks away. A medicine taken only when needed has no daily use and is not counted down.
Count again after collecting a prescription.

### Who can read a sheet

Outpost has no accounts. Anyone who can reach it on your network can open a sheet that is
not encrypted. Two switches decide who else sees the sheets that are not encrypted; both
are off until you turn them on:

- **Find them in search** (on the Medical sheets screen): medicines, allergies and
  conditions become findable in Search and the quick search, and in search by meaning
  where that is set up, which sends their words to its model server.
- **Medical sheets** under **Settings → Looking things up**: a language model in Chat,
  and other programs over MCP where that is turned on, may read them. The GP, pharmacy and
  next of kin are never given to a model.

An encrypted sheet is never in search and never read by a model, whatever the switches
say.

### Encrypting a sheet

**Encrypt this sheet** works as encrypting a page of notes does, with a passphrase or one
of your own keys from **Encryption**. It needs HTTPS (or the computer Outpost runs on).
The sheet is encrypted in the browser and checked by decrypting it again before anything
is sent; Outpost then keeps only the name and the encrypted message.

- **Encrypted**: everything on the sheet except the name.
- **Not encrypted**: the name, when it was last changed, and that it is encrypted.
- **Not reached**: copies made before, which still hold the sheet in the clear: backups,
  portable drives, printed copies, PDFs saved or added to the library, a binder made
  earlier. Earlier versions can linger in unused space in the database until it is
  compacted (**Storage → Manage and clean up**).
- **No way back without the passphrase or key.** Outpost does not keep it.

An encrypted sheet is opened on the device: type the passphrase, or unlock the key. It
stays open in that browser tab until you press **Lock**, leave it for five minutes, or
close the tab; nothing decrypted is sent to Outpost or kept in the browser's storage.
Each save encrypts it again. While it is locked it cannot count medicines down, go on a
grab card or go in the binder; open it first, then make the card or binder in the same
tab. **Take the encryption off** saves it in the clear again, after asking.

### Printing a sheet

Each sheet prints on its own page, black on white, from **Print** at the foot of the
sheet, with **Save as PDF**, **Add to library** and **Share**. Adding it to the library
asks first: in the library anyone on your network can read it and find it by search, and
an encrypted sheet is in the clear in that copy.

## Keeping in touch

**Preparedness → Keeping in touch** is the household's communication plan. For each
situation ("Phones down", "Away from home when it happens") it holds the order to try
things in, agreed in advance:

| Order | Meaning |
| --- | --- |
| Primary | What you try first. |
| Alternate | If the first does not work. |
| Contingency | Slower or more effort, but likely to work. |
| Emergency | The last resort. |

Each step is one of: a phone call or text message to a contact; a mesh radio message on
one of the channels set up under **Settings → Mesh radio**; a radio channel from
Outpost's list of frequencies (PMR446 channel 3, a CB or amateur channel); a repeater
kept under **Radio → Repeaters**; the household board; meeting at a saved place on the
map or one described; or something else. Each takes **When** ("on the hour, for five
minutes") and words of your own.

A situation also has its own check-in times and **Who to contact, in order**, chosen from
Contacts. **Everyone checks in** holds the times for all situations. Under **Each
person**, write what is theirs alone ("Wait at the school office"); it goes at the top of
their page.

Transmitting on a radio channel needs the rules or the licence of where you are; the list
of frequencies says whose rules apply to each.

A contact, place or repeater deleted since it was chosen is shown as missing, on screen
and on paper, and is not dropped. Press **Save** to keep a change. **Print** makes a page
for each person in the household (one for everyone when the household is empty). When
this version of Outpost has the household check-in screen, the plan links to it.

## Grab cards

**Preparedness → Grab cards** makes a card for each person to carry, from what Outpost
holds now:

- **Front**: name, the emergency number (from the plans; 999 when there is none), blood
  group, allergies, conditions and medicines from their medical sheet.
- **Back**: who to contact (their next of kin and GP, the out-of-area contact from the
  plans, contacts marked for emergencies), where the household meets (the plans'
  meeting points), the first steps of **Keeping in touch**, and where home is.

Home is the saved place with the home icon. Choose the formats it is written in: decimal
degrees, degrees, minutes and seconds, the British National Grid (left off when home is
outside Great Britain) and the Maidenhead locator.

Sizes: **Wallet** folds to the size of a bank card, four to a sheet of A4 or US Letter;
**A6** is 105 by 148 mm, two to a sheet turned sideways. Print at actual size (100%) and
cut along the corner marks. A card that does not fit, even in the smallest type, is named
on screen; try A6 or fewer formats. A person whose sheet is encrypted and not open in this
tab gets a card that says so, with no medical lines.

A printed card does not change when Outpost does: make it again after a change.

## Household binder

**Preparedness → Household binder** puts a chosen set of the printables into one PDF,
with a contents page and the date of the newest thing in it:

- the emergency plans' fridge sheets;
- the emergency contacts sheet;
- **Keeping in touch**, a page for each person;
- the grab cards (wallet size);
- the medical sheets (encrypted ones only when open in this tab; in the binder they are
  in the clear);
- the frequencies the communication plan uses, from Outpost's list;
- home and each meeting point, in every grid format (a map page is printed on
  **Maps** with **Print or save as PDF**);
- supplies: what is kept, where, and how long it lasts.

Each part lists what it holds now; a part with nothing in it is left out. Press **Make
the binder**, then **Save as PDF**, **Add to library** or **Share**.

Outpost keeps a record of the binder last made. When something in it changes afterwards
(a plan, a contact, a sheet, the communication plan, a saved place, the supplies), Home
says so in one line, with a link to make it again. Something deleted is not noticed:
make the binder again after taking anything out.

## Where it is kept

Medical sheets, the communication plan and the record of the binder are kept in the
database: in every backup, counted under **Storage → Database**, copied to a portable
drive, and removed by **Erase everything**. Grab cards and the binder are made on the
device and are not stored, unless saved or added to the library.
