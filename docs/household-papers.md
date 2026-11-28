# Medical sheets, keeping in touch and grab cards

Three screens under **Preparedness** keep the household's papers, made from what Outpost
already holds, so a change there shows the next time a paper is made.

## Medical sheets

**Medical sheets** lists each person of the household ([Households](households.md)), with **Make a
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

Copies made before stay in the clear: backups, portable drives, printouts, PDFs, a household
book made earlier, and old versions in the database's unused space until it is compacted
(**Storage → Manage and clean up**).

An encrypted sheet stays open in the tab until you press **Lock**, leave it five minutes,
or close the tab; while locked it cannot go on a grab card or in the household book.

**Print**, at the foot of a sheet, gives one page with **Save as PDF**, **Add to
library** and **Share**. Adding it to the library asks first: there anyone on your network
can read and search it, and an encrypted sheet is in the clear in that copy.

### On a phone

**Keep on this phone**, under the list, keeps every sheet on the phone as a set, for when
the server is out of reach. An encrypted sheet travels encrypted, as the message Outpost
holds, and opens on the phone with its passphrase, in memory only, until you leave the
screen. A sheet encrypted to a key opens only with the server in reach, on a device that
holds the key. A sheet that is not encrypted is kept readable, so Outpost asks first:
anyone who can open that browser can read it. Encrypt a sheet before keeping it to keep it
locked on the phone.

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

**Grab cards** makes a card for each person to carry. **On this phone**, at the top,
shows each person's card in large type, with numbers that call: read it there, or keep
the page on the phone. **To print** comes after it.

- **Front**: name, the emergency number (from the plans; "not given" when no plan has
  one), the person's own line from the plans ("Remember: fetch Sam"), blood group,
  allergies, conditions and medicines.
- **Back**: who to contact (the plans' contacts in the plans' order, then next of kin,
  the doctor and the emergency contacts), where to meet, the first steps of Keeping in
  touch, and where home is: its **address** first, as you give it on the household's
  page (**Name and place → Address**), then its position in the formats you choose
  (decimal degrees by default; degrees, minutes and seconds; British National Grid; the
  Maidenhead locator).

**Wallet** folds to bank-card size, four to a sheet; **A6** is 105 by 148 mm, two to a
sheet. Print at actual size (100%) and cut along the corner marks. A card that does not
fit is named on screen: try A6 or fewer formats. An encrypted sheet not open in this tab
gives a card with no medical lines, which says so. Make cards again after a change.

## Several households

With more than one household (**Preparedness → Households**), each paper is for the
current one, and its screen says which under the title, with **Change**.

- **Medical sheets** stay with the person. A household lists the sheets of its people and
  the sheets for someone else made in it. Someone in two households has one sheet, shown
  in both; a change shows in both.
- **Keeping in touch**, the **household book** and the record of the last book made are
  each household's own. A new household starts with none.
- **Grab cards** are for the people in the current household. A household that moves (a
  caravan, a car, a hiking group) has no address on its cards: they say who it is
  travelling with and what kit Supplies holds for it.
- **Keep on this phone** keeps the current household's sheets, and the phone says whose
  they are. Each household's sheets are a copy of their own: keeping the caravan's does not
  replace home's. Out of reach, the phone shows every household's copy it holds, each under
  its name, and each is brought up to date from its own household when the server is back.

## On paper together

To print everything together, use **Preparedness → [Household book](household-book.md)**:
it prints the fridge sheets, the emergency contacts, Keeping in touch with a page for each
person, the grab cards, the medical sheets, the frequencies, home and the meeting points
and the supplies, with everything else the book holds, or only the parts you choose. The
binder's old address opens the book.

Sheets, the communication plan and the record of the last book are kept in the database: in
backups, copied to a portable drive, and removed by Erase everything. Cards and the book
are not stored unless saved or added to the library.
