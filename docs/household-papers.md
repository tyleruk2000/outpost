# Medical sheets, keeping in touch, grab cards and the binder

Four screens under **Preparedness** keep the household's papers, made from what Outpost
already holds, so a change there shows the next time a paper is made.

## Medical sheets

**Medical sheets** lists each person under **Supplies → Household**, with **Make a
sheet** beside anyone who has none; **Someone else** makes one for anyone else. A sheet
holds what a relative or a paramedic needs to be told:

- name, date of birth and blood group (leave it empty when not known);
- allergies, and what happens;
- medicines: name, dose as the label says, when taken, where kept;
- conditions, and what to know about each;
- the GP surgery, the pharmacy and next of kin, from Contacts or typed;
- notes.

Press **Save** to keep a change. **Outpost records what you type and gives no medical
advice.** It checks no dose, interaction or allergy, and every printed sheet says so.

**Counting medicines down.** Give a medicine what is **Held** (28), its **Unit**
(tablets), how many are **Used a day** (1) and the day it was **Counted on**. The sheet
says "about 8 days left, runs out about 29 Nov 2026", and the list names the one running
out soonest when it is under two weeks away. Count again after collecting a prescription.

### Who can read a sheet

Outpost has no accounts: anyone who can reach it on your network can open a sheet that is
not encrypted. Two switches, both off to start, let others see them:

- **Find them in search** (on this screen): medicines, allergies and conditions become
  findable in Search, and in search by meaning where set up, which sends their words to
  its model server.
- **Medical sheets** under **Settings → Looking things up**: a language model in Chat, and
  programs over MCP where that is on, may read them. The GP, pharmacy and next of kin are
  never given to a model.

An encrypted sheet is never searched or read by a model.

### Encrypting a sheet

**Encrypt this sheet** works as encrypting a page of notes does, with a passphrase or one
of your keys from **Encryption**, and needs HTTPS. Everything but the name is encrypted in
the browser; Outpost keeps only the name and the encrypted message. **Without the
passphrase or key there is no way back.**

Copies made before stay in the clear: backups, portable drives, printouts, PDFs, a binder
made earlier, and old versions in the database's unused space until it is compacted
(**Storage → Manage and clean up**).

An encrypted sheet stays open in the tab until you press **Lock**, leave it five minutes,
or close the tab; while locked it cannot go on a grab card or in the binder.

**Print**, at the foot of a sheet, gives one page with **Save as PDF**, **Add to
library** and **Share**. Adding it to the library asks first: there anyone on your network
can read and search it, and an encrypted sheet is in the clear in that copy.

## Keeping in touch

**Keeping in touch** is the household's communication plan. For each situation ("Phones
down", "Away from home when it happens") it holds the order to try things in:

| Order | Meaning |
| --- | --- |
| Primary | What you try first. |
| Alternate | If the first does not work. |
| Contingency | Slower or more effort, but likely to work. |
| Emergency | The last resort. |

Each step is a call or text to a contact; a mesh radio channel; a radio channel from
Outpost's frequencies; a repeater; the household board; meeting at a place; or something
else, each with **When** ("on the hour, for five minutes") and your own words. A
situation also has check-in times and **Who to contact, in order**. **Each person** holds
what is theirs alone ("Wait at the school office"), printed at the top of their page.

Transmitting needs the rules or licence of where you are; the frequencies list says whose
apply. **Print** makes a page for each person.

## Grab cards

**Grab cards** makes a card for each person to carry:

- **Front**: name, the emergency number (from the plans; 999 when there is none), blood
  group, allergies, conditions and medicines.
- **Back**: who to contact (next of kin, GP, the out-of-area contact, emergency contacts),
  where to meet, the first steps of Keeping in touch, and where home is, in the formats
  you choose (decimal degrees; degrees, minutes and seconds; British National Grid; the
  Maidenhead locator).

**Wallet** folds to bank-card size, four to a sheet; **A6** is 105 by 148 mm, two to a
sheet. Print at actual size (100%) and cut along the corner marks. A card that does not
fit is named on screen: try A6 or fewer formats. An encrypted sheet not open in this tab
gives a card with no medical lines, which says so. Make cards again after a change.

## Household binder

**Household binder** puts a chosen set of printables into one PDF with a contents page:
the plans' fridge sheets, the emergency contacts sheet, Keeping in touch, the grab cards,
the medical sheets (encrypted ones only when open, and then in the clear), the
frequencies the plan uses, home and the meeting points in every grid format, and the
supplies. A part with nothing in it is left out. Press **Make the binder**, then **Save as
PDF**, **Add to library** or **Share**.

When something in the last binder changes or is deleted, Home says which part, with a link
to make it again. A binder made before this was kept notices changes but not deletions until
it is made again.

Sheets, the communication plan and the record of the binder are kept in the database: in
backups, copied to a portable drive, and removed by Erase everything. Cards and the binder
are not stored unless saved or added to the library.
