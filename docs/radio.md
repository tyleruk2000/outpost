# Radio: reference sheets, a handbook, radio guides, repeaters and tools on the map

Everything here works with no connection. Screens with pages of their own: [Frequencies to listen to](radio-frequencies.md),
[HF propagation](hf-propagation.md), the [Morse trainer](morse-trainer.md),
[Satellites](satellites.md), [Heard on the radio](heard-on-the-radio.md) and
[Mesh radio](mesh-radio.md).

Every radio screen says in one line whether what it does needs a licence; the detail is on
[What needs a radio licence](radio-licences.md). A household with a licensed operator can
say so under **Settings → Radio licence**, and the reminders are left out.

## Licences and band plans

**Radio → Licences and band plans** shows, for Home's country, each amateur licence class
with its bands, power and conditions, and the licence-free radio anyone may use there
(PMR446, CB, FRS and GMRS, UHF CB, the 868 and 915 MHz bands Meshtastic uses). Choose
another country from the list. Every figure names its document and the day it was read.
Covered: the UK, Ireland, the US, Canada, Australia, New Zealand, Germany, the Netherlands,
France (without its licence-free services), Belgium, Switzerland, Spain and Italy. Rules change; this is not legal advice.

## Radio tools on the map

On **Maps**: [Maidenhead locators](maps.md#maidenhead-locators),
[line of sight](maps.md#line-of-sight) between two points or from a repeater, and
[the grey line](maps.md#the-grey-line-day-and-night), which an HF coverage map can also
draw under **Grey line (day and night)** for about the 15th of the month shown.

Line of sight is geometry over installed terrain, not propagation: it knows nothing of
buildings or trees, and gives no verdict where terrain is missing. A blocked path may
still be worked, and a clear one may be poor.

## Repeaters

**Radio → Repeaters** (also behind the **Repeaters** button on the map) is a database of
amateur repeaters kept on your machine. Outpost ships with none and fetches none by itself.

- **A list is right for its date.** Every screen shows where an entry came from and the
  date of its data; a list over six months old is marked with its age, over a year with a
  warning.
- **Listed positions are often rough on purpose.** One that may be a kilometre or more out
  is marked approximate wherever an exact place matters.
- **Transmitting through a repeater needs an amateur licence for the band**, and its keeper
  may restrict who uses it (UK licence conditions and Ofcom's guidance, section 4.5.3, both
  in Explore under Radio communications).

### Where to get a list

**Get a list** sets out the sources by country, starting with the one your map last
showed. Each source is one of three kinds:

- **Outpost can get this list**: **Get the list** fetches the file once, and you see how it
  was read before anything is kept. **Get it again** or **Bring up to date** fetches a newer
  copy into the same list.
- **To be downloaded by hand**: the publisher's page opens with the steps; then **Import
  the file**.
- **Nothing usable here.**

**Why, and its terms as read** gives the reason. Outpost fetches only where a publisher
allows a program to, only when you press the button
([sources.md](sources.md#repeater-lists)).

| List | Kind |
| --- | --- |
| UK: RSGB ETCC, ukrepeater.net | By hand (its server turns a program away) |
| Ireland: IRTS voice repeaters, no positions | Outpost can get it |
| Worldwide: Hearham, about 23,000, approximate positions | Outpost can get it |
| Worldwide: RepeaterBook | By hand (its terms forbid a program) |
| Worldwide: Open Repeater; Finland: SRAL | By hand |
| Australia: WIA directory, no positions | By hand (all rights reserved) |
| Australia: ACMA register; Europe: przemienniki.net, repeate.rs | Nothing usable |

A fetched file has no checksum, so the preview is the check. If a server refuses or sends
a web page, Outpost stops and says so: download the file by hand.

### Getting a list in

**Import a list** takes a CSV or JSON list of records (16 MB, 100,000 rows). The ETCC,
CHIRP, WIA and Hearham layouts and Outpost's own are recognised; other files are read by
their headings. Before anything is kept you see the first rows as they would be kept (the
**output** is what the repeater transmits on, the one you listen on), how each column is
read (changeable), the rows that cannot be kept with the reason, how many lack a position,
and which you already hold. A frequency with no unit that could be read two ways ("7100")
is refused: name the unit in the heading or after the number.

Give the list a name, its publisher and **the date of its data** (when the file was made or
fetched). An entry with only a locator is placed at the square's middle; CHIRP files have
no positions, so those entries stay off the map until you give one. **Add by hand** makes
an entry of your own.

### Bringing a list up to date

**Bring up to date** takes a newer copy and first shows what is new, changed, the same and
gone. An entry you changed is kept as you have it unless you tick the box (its screen shows
both, with **Put back to what the list says**). One you removed stays removed. One that left
the list is removed unless you keep those, and never if you changed it. Removing a list
removes its entries and your changes to them, nothing else.

### The same repeater twice

Entries are **the same repeater** when their callsigns match (ignoring case, spaces and
hyphens) and their outputs are within 3 kHz. Different callsigns on one frequency within
2 km **may be** the same; Outpost shows these and never merges them by itself.

On import, choose **Show each repeater once, with the newer data** (the default; what you
typed is carried over), **Leave what I hold as it is**, or **Keep both**. **Find
duplicates** does the same for what you hold: merge a group, or **Merge all** the certain
ones. A merge sets the others aside, never deletes, and **Separate them** undoes it.

### Using it

Filter by band, mode and distance from a place, nearest first. Find by callsign, town,
locator or frequency (`145.7` finds 145.700 to 145.799 MHz). One repeater's screen gives what to listen and transmit on, access, status
with its date, and **Show on the map** ([maps.md](maps.md#repeaters-on-the-map)), **Check
line of sight** and **Estimated range**.

### The estimated range

**Estimated range** (a switch on a repeater's map card, a button on its screen) shades in
green the ground from which a station at a chosen height would have line of sight to the
repeater's aerial, over installed terrain, out to 100 km. The card gives the share in
sight within 10 and 25 km, the typical range and the furthest ground in sight ("Typical
range about 12 km; furthest 31 km to the north-east"); **Why this shape: look along one
direction** shows the cross-section along any bearing. Up to eight ranges can be on;
**Hide all ranges** clears them.

On the map:

- **Distance rings**, thin and grey, at 10, 25, 50 and 100 km, drawn only out to the first
  ring beyond the furthest ground in sight. With the furthest ground 31 km away you get
  10, 25 and 50 km.
- **Typical range**, a dashed magenta circle labelled once ("Typical 12 km"). Ground is
  looked at along 720 directions; on each, the furthest ground in sight is taken, and the
  typical range is the middle of those 720 distances (the median): half the directions
  reach further, half not as far. One long glen or a far summit does not pull it out. A
  direction with no ground in sight counts as nothing, so a mast in a hollow gets a small
  typical range even if one gap sees far. Where terrain runs out, the direction counts as
  far as terrain is held, so with partial terrain the typical range may be larger. The
  phone works it out the same way from terrain it kept.

The same rings and circle appear in the disc of **Why this shape** (which reaches only as
far as the last ring) and, with **Estimated radio range** ticked, on a printed map.

The aerial height is as listed, or an assumed **10 m** (changeable; low so the estimate
errs small). The other station is **Handheld 1.5 m**, **Car 2 m** or **Roof aerial 8 m**.
With no terrain you get the smooth-Earth radio horizon, about 4.12 × (√h1 + √h2) km, and
**Get terrain in Offline maps**. It leaves out power, aerial gain, frequency, buildings and
trees, and can miss a narrow ridge.

The ground in sight is a green wash with a solid green edge round each patch, and the map
first fits nine tenths of it, so one far glen does not shrink the rest. A small key under
the answer names the wash, the typical range and the rings.

**How accurate it is.** Treat the shading as the most a radio could see over bare ground.
Over the terrain held, the share in sight is within about 1.5 percentage points of a
careful reading of the same terrain, erring generous, and its edge is good to a sample or
two. Two things matter more: trees and buildings (the terrain in England and Wales is bare
earth, so in a town or wood the real view is far smaller; elsewhere it is a 30 m surface
model, with canopy and buildings averaged in), and the terrain's own error (±15 cm from
lidar in Great Britain, under 4 m elsewhere). How this was checked is in
[development/radio.md](development/radio.md#estimated-range-accuracy).

### Taking a set out

**Export these** writes the repeaters shown, nearest first: **CHIRP (CSV)** for programming
a radio (at most 2,000; tone burst, colour code and talkgroup go in the comment; an entry
with no input is written so the radio will not transmit), or **Outpost (CSV)** with every
field. **Check the file before you transmit.**

### Changing the sources

Sources are declared in `catalog/repeater-sources.json`, and Outpost fetches only from the
addresses it names. To change one or add your own, put a file of the same format at
`<data directory>/catalog/repeaters/repeater-sources.json` and restart. The format is in
[development/radio.md](development/radio.md#repeater-sources).

### Limits

Nothing is fetched on a timer. Hearham's list holds many repeaters twice: import it with
**Leave what I hold as it is**, or use **Find duplicates**. A possible duplicate cannot be
dismissed. KML, GPX, ADIF and radio memory images are not read. A phone out of reach of the
server has no repeaters ([offline.md](offline.md#a-phone-out-of-reach-of-the-server)), a
printed map does not show them, and portable-drive changes to them do not come home.

## The reference sheets

Nine sheets written from regulators' documents (read 15 and 16 November 2026). In
**Explore → Radio communications**, **Add to library** copies one in with no download, and
its text is then searched (try `446.00625`). Explore offers **Update** when a corrected
sheet ships, and lists the source documents ([sources.md](sources.md#radio)).

They cover UK, US and worldwide amateur bands; licence-free radio; emergency, distress
and calling frequencies; weather, shipping and time broadcasts; repeater, data-mode and
space frequencies; preparedness channel conventions (labelled unofficial); and an operating
reference. Each ends with **Checked**, **Sources** and **Not covered**: a sheet is right
for its **Checked** date, covers only the UK and US in detail, and is not legal advice. It
never says an unlicensed transmission is lawful in an emergency. BBC Radio 4 long wave
(198 kHz) was reported closed on 27 June 2026: do not plan on it.

## The handbook and the radio guides

Sixteen books from LogBook73, an amateur radio logbook by the same author, under its MIT
licence: the **Radio Engineering Handbook** (90 chapters, from first principles to a first
station) and guides to fifteen radios and interfaces, from the Baofeng UV-5R to the Xiegu
X6200 and DigiPi. **They are not the manufacturers' manuals**, and Outpost has not checked
them again: where a guide and your radio disagree, believe the radio.

In **Explore → Radio communications**, **Add to library** copies a book in; the packs
**Learning amateur radio** and **Radio companion guides** gather them. A book is listed
under **Books** in the Library's Collections tab, and each chapter is its own document, so
search lands on the chapter. A guide's links to the handbook work once the handbook is in
your library. LogBook73's quizzes, its own screens and thirteen illustrations are not
carried over.

Correcting a sheet, and importing the books: [development/radio.md](development/radio.md).
