# Supplies

**Preparedness → Supplies** keeps your stored food, water and kit: what there is, where it
is kept, and the date on it. It works out how many days the food and water last for the
people and pets they are for, what to use first, and what to buy to reach the days you
want. A barcode finds an item or starts a new one.

It is your own data, on the server: in backups, counted under Storage → Database, and
erased by Erase everything. Nothing is sent anywhere. These are planning figures for a
store cupboard, not dietary advice.

## What is kept

- **Items**, one row to a batch: name, category, how many and of what, where it is kept,
  the date and whether it is a **use-by** or **best before**, energy (kcal a pack, or per
  100 g with the pack's weight), litres for water, a minimum to keep, a barcode and notes.
- **The household**: each person's age band and sex (or "not said"), their own figures if
  you give them, pets, and the days wanted.
- **The shopping list**, and **barcodes remembered** after an item is used up.

## Use-by and best before

Following GOV.UK's "Best before and use-by dates" (use-by is about safety, best before
about quality):

- **Past its use-by** (from the day after): not counted in the days of food, listed first
  under "Use first" as "do not eat, throw away or replace", and put on the shopping list.
- **Past best before**: still counted; listed as "check it, and eat it first".
- A date with no kind given is taken as best before, and the import says so.

Enter a medicine's expiry date as a use-by.

## How the days are worked out

**Food** is counted by energy, eaten in date order: food with a use-by is eaten soonest
first, and what would pass its use-by before its turn is counted as lost, and the screen
says so. Items with no energy figure are left out and named. **Water** is litres held
against the household's litres a day. **Pet food** counts against the pets' figures.
**What runs out first** compares the two. Days are said with "about", rounded down ("about
2.3 days", "about 23 days").

**How long it lasts** gives the food as days of energy ("about 8.6 days of energy for 1
person"): energy only, nothing about protein, vitamins or a diet to live on for long.
**Give them their energy** opens each item without a figure in turn.

## Energy from USDA FoodData Central

Typing a food's name offers matching foods from USDA FoodData Central's SR Legacy table
(April 2018, 7,793 generic foods, public domain), with energy per 100 g. The table ships
with Outpost, so this works with no internet.

- **Offered, never filled unasked**, and never over a figure you typed: **the label
  wins**, as the table's are averages, often for American products.
- **The weight.** When the unit is a weight (g, kg, lb, oz) it is used: 5 kg of rice at
  365 kcal per 100 g is 18,250 kcal. For a tin or pack, the form asks for the weight on the
  label (drained, for drained foods) and does not count the item until it is given.
- **Raw, dry, cooked and canned are different entries** (raw rice 365 kcal per 100 g,
  cooked 130), so check which you choose. The source is noted in the item's notes.
- **British names** such as aubergine, courgette, mince, plain flour, crisps and tinned
  also find the American entry.

## The planning figures

Every figure can be changed for the household or one person. The sources are in
[sources.md](sources.md#planning-figures-for-supplies-read-on-2026-11-16).

**Energy**, from Public Health England's *Government Dietary Recommendations* (August
2016), Open Government Licence:

| Age | Males, kcal a day | Females, kcal a day |
| --- | --- | --- |
| 1 | 765 | 717 |
| 2 to 3 | 1,088 | 1,004 |
| 4 to 6 | 1,482 | 1,378 |
| 7 to 10 | 1,817 | 1,703 |
| 11 to 18 | 2,500 | 2,000 |
| 19 to 64 | 2,500 | 2,000 |
| 65 to 74 | 2,342 | 1,912 |
| 75 and over | 2,294 | 1,840 |

The figures are averages ("individual requirements may vary"), those from 11 to 64 capped
"to help address issues of overweight and obesity". For a baby under one, give a figure.
"Not said" takes the mean of the two.

**Water**, two figures:

- **To drink**: 3 litres a person a day (the default), from the UK government's Be Ready:
  "More would be needed for other tasks such as cooking and washing."
- **Drinking, cooking and basic hygiene**: 7.5 litres a person a day, the low end of the
  WHO's 7.5 to 15 (FEMA says at least one US gallon, 3.8 litres, for drinking and
  sanitation).

Children, nursing mothers and sick people may need more, and in very hot weather needs
can double (FEMA); the screen says so.

**Pets** count only with figures you give, from the packet or a vet: no official figure
was found.

## The shopping list

**Work out the list**:

1. Every product past its use-by is replaced, as many as there were.
2. Every product below its minimum is brought up to it (the larger of the two once, where
   both apply).
3. The shortfall to the days wanted is shared over the products already stocked, in
   proportion to how much of each is held, rounded up to whole packs: the same mix, more
   of it. With nothing to buy more of, the line gives the shortfall in kcal or litres.

Change or add lines; **Work it out again** keeps yours. **Bought** asks how many, the date
and where, and adds them to the stock. Save the list as a PDF or copy it as text.

## The barcode scanner

**Scan** offers three ways, always on screen:

- **Type the number.** A barcode scanner that types like a keyboard (USB or Bluetooth)
  works here too.
- **A photo**, taken or chosen. This works at a plain `http://` address.
- **The live camera**, which browsers allow only on a secure page. At a plain `http://`
  address the screen says "The camera is not available at this address" and points to
  **Settings → HTTPS on your network**.

The camera is let go when the scan ends or the page is hidden. A found barcode shows its
rows with plus and minus and "Add another batch"; an unknown one starts **New item** with
the barcode filled in.

### What reads the barcode

The browser's own reader where it has one (Chrome on Android), elsewhere (iPhones
included) Outpost's own. It reads **EAN-13, UPC-A, EAN-8 and Code 128** and accepts a
read only with a correct check digit. It does **not** read UPC-E (small American packets),
ITF-14, QR codes, or a code curved too far round a tin: type the number.

## Open Food Facts, and why nothing is looked up

Outpost has no product database and never looks a barcode up on the internet. Open Food
Facts' terms would allow one lookup per real scan, or a downloaded table under the ODbL;
neither is built.

## CSV

**Save as CSV** writes every row in Outpost's columns (`name, category, quantity, unit,
location, date_kind, date, kcal_per_unit, kcal_per_100g, grams_per_unit, litres_per_unit,
minimum, barcode, notes, id`).

**Bring in a CSV file** (at most 2 MB and 5,000 rows) shows every row before anything
changes. The first row names the columns, matched loosely ("Item", "Qty", "Where", "Best
before", "Use by", "Calories per pack", "EAN"). Dates may be 2027-03-31, 31/03/2027 or
03/2027. Comma, semicolon and tab separators are read; a number the file does not settle
(such as `1,250` in a tab file) is refused with both readings, and over 1,000 kcal per
100 g (usually kJ) is refused. A row already in the supplies is skipped unless you choose
to update it or add it again.

Each item has its own address: **Copy the link** to paste it into a page of Notes.
