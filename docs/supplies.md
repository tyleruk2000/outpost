# Supplies

**Preparedness → Supplies** (`/prepare/supplies`) keeps a household's stored food,
water and the kit beside them: what there is, where it is kept, and the date on it. It
works out how many days the food and water last for the people (and pets) it is for,
what to use first, and what to buy to reach the days wanted. A barcode finds an item,
or starts a new one.

Everything is the person's own data, on the server: it is in the database a backup
holds, counted under Storage → Database ("Preparedness") and in the plan of **Erase
everything**, and erased with everything else. Nothing is sent anywhere: a barcode is
looked up in the supplies and nowhere else.

These are planning figures for a store cupboard, not dietary advice. The screen says
so where the figures are.

## What is kept

- **Items**, one row to a batch: name, category (food, water, pet food, fuel,
  medical, hygiene, batteries, equipment, other), how many and of what (a tin, a
  pack), where it is kept (any words: pantry, garage, go-bag), the date on the label
  and whether it is a **use-by** or a **best before**, energy for food (kcal per pack,
  or kcal per 100 g and the weight of a pack), litres for water, a minimum to keep,
  a barcode, and notes. The same tins bought on another day with another date are
  another row.
- **The household**: each person with an age band and, for the energy table, sex
  (or "not said"); anyone's own figures for energy and water in place of the table's;
  pets, with figures given by the person; and the days wanted.
- **The shopping list**: lines worked out from the stock, and lines the person adds.
- **Barcodes remembered**: a product's name, category, unit and energy or litres, kept
  after the last of it is used up or removed, so that scanning it again fills them in.

Pictures of items are not kept: notes' attachments are tied to pages, and keeping a
photo for an item would have meant a store of its own. Recorded as a choice that could
be revisited.

## Use-by and best before

GOV.UK, "Best before and use-by dates" (updated 25 June 2026), on which the treatment is
based:

> Use-by dates relate to the safety of food, whereas best before dates relate to
> quality. … Eating food after the use-by date could make you ill. … After the best
> before date, the food is usually safe to eat but may not be of the same quality.

So:

- **Past its use-by** (the day after the date): not counted in the days of food,
  listed first under "Use first" as "do not eat, throw away or replace", marked on its
  row, and put on the shopping list to be replaced. On the date itself it still counts.
- **Past best before**: still counted; listed as "check it, and eat it first".
- A date with no kind given (from a spreadsheet, say) is taken as a best before, and
  the import says so.

Medicines carry an expiry date; enter it as a use-by.

## How the days are worked out

**Food** is counted by energy. Each row's energy is its kcal per pack, or its kcal per
100 g times the weight of a pack, times how many there are. Rows with no energy given,
with none left, or past their use-by are left out, and the screen names them.

It is then eaten in date order: food with a use-by is eaten soonest-first, and what would
reach its use-by before its turn is lost and said to be. Today is day 0, and food can be
eaten on its use-by day. With no use-by dates this is simply the energy divided by the
daily need.

Worked example (one of the tests): one adult man (2,500 kcal a day), 5,000 kcal of food
to be eaten by the end of today and 5,000 kcal with no date. 2,500 of the first is eaten
today and 2,500 lost; the rest lasts two more days. 3 days, not 4.

**Water** is litres per bottle times bottles, against the household's litres a day, to
drink or for drinking, cooking and washing as chosen (the other figure is given too).

**Pet food** is counted the same way against the energy given for the pets, when any is.

**What runs out first** compares the days of food and of water.

Days are said with "about", rounded down, to a tenth of a day under ten days and to
whole days from there ("about 2.3 days", "about 23 days"). The figures behind them
(labels, planning figures) do not support more.

## Energy from USDA FoodData Central

A person adding "rice, 5 kg" should not have to know its calories. When a food is added or
changed, typing its name offers the foods in USDA FoodData Central's table that match, each
with its energy per 100 g; choosing one fills it in. The table ships with Outpost, so this
works on first run with no internet: the search is asked of this Outpost, which holds the
table, and goes nowhere else.

- **Offered, never filled unasked.** The offers appear under the name once the typing
  pauses (a quarter of a second), only for food and pet food, and only while the item has
  no energy figure. Nothing is filled until a food is chosen.
- **The label wins.** A figure typed from the packet is never replaced: with one there,
  nothing is offered. Typing over a figure that came from the table makes it the person's
  own, and the note of the table goes.
- **The weight.** The table's figures are per 100 g. When the item's unit is itself a
  weight (g, kg, lb, oz, or one with a number, "500 g"), the weight of one is filled in:
  5 of "kg" is five lots of 1,000 g, so 5 kg of rice at 365 kcal per 100 g is 18,250 kcal.
  A pound is 453.59237 g and an ounce a sixteenth of it. For anything else (a tin, a pack,
  a bag, a litre) the form asks for the weight of one from the label and does not count the
  item until it is given; it never assumes one. When the food chosen is drained ("canned
  in water, drained solids") it asks for the drained weight.
- **Raw, dry, cooked and canned are different entries**, and the offers show the table's
  own names ("Rice, white, long-grain, regular, raw, unenriched", 365 kcal, against
  "…, enriched, cooked", 130 kcal), so the choice is in plain sight.
- **Where the figure came from** is said under the energy ("From USDA FoodData Central (SR
  Legacy, April 2018), per 100 g of …. Check the label; products differ.") and kept as one
  line at the end of the item's notes, so that it travels with the item to its page, the
  CSV and backups. No new column was needed. The line is taken off when the figure is
  changed by hand.
- **British names.** The table is American. A short list (`BRITISH_NAMES` in
  `packages/shared/src/supplies-energy.ts`) also tries the American entry for a British
  word: aubergine (eggplant), courgette (zucchini), coriander leaves (cilantro), mince
  (ground beef), plain and self-raising flour (all-purpose, self-rising), porridge oats,
  crisps, biscuits (cookies), tinned (canned), swede, rocket, double cream, icing sugar,
  sweetcorn and some forty more. Nothing cleverer: no spelling correction.
- **The order offered.** Every word typed must be found (the last may be part typed:
  "lent" finds lentils; plurals are made singular). Foods whose first part is just the
  words typed ("Rice, …", "Honey") come first, then those with the words further in; a
  store-cupboard form (a part saying raw, dry, dried or uncooked, or starting "canned")
  and "plain" or "regular" are put a little higher; dishes from the food groups for fast
  food, restaurants, baby food and meals, and makers' names (in capitals in SR Legacy),
  lower. The ranking is tested on twenty everyday British shopping words.

### Days of energy

Under **How long it lasts**, the food is said as days of energy, in the same plain
sentences as before, and `GET /api/supplies/outlook` gives the same sentences (`energy`):

> Food, by energy: The food holds about 8.6 days of energy for 1 person. That is 21,610
> kcal in 2 items against 2,500 kcal a day: each person's figure for their age and sex from
> Public Health England, Government Dietary Recommendations (August 2016).
>
> 1 food item has no energy figure and is not counted: Oats. **Give them their energy**
>
> This is energy only: it says nothing about protein, vitamins or a diet to live on for
> long, and the figures are averages, not your packets.

The daily figure is the one already used: Public Health England's table (above), or the
figure given for a person under Household, and the sentence says which. **Give them their
energy** opens each item without a figure in turn, with the offers already made for its
name; saving one opens the next, and Cancel stops.

### The table, and how it was made

USDA FoodData Central publishes five kinds of data
([download page](https://fdc.nal.usda.gov/download-datasets/), read 17 November 2026):

| Data type | Release | CSV, zipped |
| --- | --- | --- |
| Foundation Foods | October 2026 | 4.1 MB |
| SR Legacy | April 2018, the last ("These data will not be updated") | 6.7 MB as listed (6.1 MB fetched) |
| FNDDS 2021–2023 (foods as eaten in a US survey) | October 2024 | 200 MB |
| Branded | October 2026 | 432 MB |

**SR Legacy** was chosen: 7,793 generic foods, each with energy per 100 g, with the raw,
dry and canned forms a store cupboard holds. Foundation Foods is newer and analysed more
closely but holds a few hundred foods; FNDDS describes foods as eaten (mostly dishes);
Branded is hundreds of thousands of American products.

Terms, from the FoodData Central home page (read 17 November 2026): "USDA FoodData Central
data are in the public domain and they are not copyrighted. They are published under CC0
1.0 Universal (CC0 1.0). No permission is needed for their use, but we request that users
list FoodData Central as the source of the data." The citation it asks for: "U.S.
Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition
Research Center. FoodData Central. [Internet]. [cited 17 November 2026]. Available from
https://fdc.nal.usda.gov/." The site's `robots.txt` disallows nothing.

`apps/server/src/modules/supplies/foods/fdc-sr-legacy.json` (724 kB, 164 kB compressed)
was made from `FoodData_Central_sr_legacy_food_csv_2018-04.zip` (sha256
`b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0`), fetched once on 17
November 2026, by:

    node scripts/build-food-energy.mjs <the unzipped folder> --zip <the .zip>

It keeps, for each food, its FoodData Central id, its description and food group, and four
figures per 100 g as published: nutrient 1008 (Energy, kcal), 1003 (Protein), 1004 (Total
lipid (fat)) and 1005 (Carbohydrate, by difference), in grams. Every one of the 7,793 has an
energy figure. The file records the dataset, its release and the download's checksum.
Thirteen foods were checked by hand against the CSV files (`apps/server/test/supplies-energy-table.test.ts`).
The server reads it the first time someone types a food's name, not at start.

These are averages for a kind of food, often American products: a British packet's own
figure is better, which is why the label always wins.

## The planning figures, and whose they are

Every figure can be changed by the person, for the household or for one member.

### Energy

Public Health England, *Government Dietary Recommendations: Government
recommendations for energy and nutrients for males and females aged 1 – 18 years and
19+ years* (August 2016), table 1 (page 6) and table 2 (page 7), which take them from
SACN, *Dietary Reference Values for Energy* (2011). Crown copyright, Open Government
Licence v3.0.
https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/618167/government_dietary_recommendations.pdf
(read 16 November 2026).

| Age | Males, kcal a day | Females, kcal a day |
| --- | --- | --- |
| 1 | 765 | 717 |
| 2 to 3 | 1,088 | 1,004 |
| 4 to 6 | 1,482 | 1,378 |
| 7 to 10 | 1,817 | 1,703 |
| 11 to 14 | 2,500 | 2,000 |
| 15 to 18 | 2,500 | 2,000 |
| 19 to 64 | 2,500 | 2,000 |
| 65 to 74 | 2,342 | 1,912 |
| 75 and over | 2,294 | 1,840 |

The table's notes: the figures are averaged across each age group; those for 11 to 18
and 19 to 64 "have been capped at 10.5 MJ (2500kcal)/day for males and 8.4MJ
(2000kcal)/day for females to help address issues of overweight and obesity"; "the
figures for energy in this table relate to the general population and individual
requirements may vary". There is no figure for a baby under one: the screen asks for
one. A person whose sex is "not said" is given the mean of the two, rounded.

### Water

Official bodies plan for two different things, so there are two figures:

| What | Default | Whose | Range quoted |
| --- | --- | --- | --- |
| To drink | 3 litres a person a day | UK government, *Be ready: get prepared for emergencies* (beready.campaign.gov.uk, read 16 November 2026): "3 litres per person per day for drinking. More would be needed for other tasks such as cooking and washing." | WHO: 2.5 to 3 litres for survival (drinking and food). FEMA: "about three quarters of a gallon of fluid daily" (2.8 litres). |
| Drinking, cooking and basic hygiene | 7.5 litres a person a day | WHO, *Technical notes on drinking-water, sanitation and hygiene in emergencies*, note 9, "How much water is needed in emergencies" (WEDC for WHO, updated July 2013), table 9.1, adapted from Sphere: survival 2.5 to 3, basic hygiene 2 to 6, basic cooking 3 to 6, total 7.5 to 15 litres a day. The default is the low end. | FEMA (ready.gov/water, updated 22 February 2021): "at least one gallon of water per person per day … for drinking and sanitation" (3.8 litres). WHO's top end: 15. |

FEMA also says: "Children, nursing mothers and sick people may need more water" and
"In very hot temperatures, water needs can double." The screen says this.

The default basis is **drinking**, the UK government's figure, because the owner is in
the UK; the household can switch to drinking, cooking and washing.

### Pets

No official figure for a pet's water or food was found that could be quoted (the figures
found were pet-food makers' and calculator sites'), so a pet counts only with the
figures the person gives, from the food packet or a vet. Pet food is its own category,
so that it is not counted as the people's food.

## The shopping list

**Work out the list** stores lines worked out from the stock and the household:

1. Every product (rows with the same barcode, or the same name and unit) past its
   use-by is replaced, as many as there were.
2. Every product below the minimum set on any of its rows is brought up to it. Where a
   product needs both, the larger is bought once.
3. The shortfall to the days wanted, in energy and in water, is shared over the
   products already stocked that have energy (or litres) given, in proportion to how
   much of each is held now: the same mix, more of it. Each share is rounded up to whole
   packs. What steps 1 and 2 already buy is taken off first. With no product to buy more
   of, the line says the shortfall in kcal or litres.

Worked example (a test): one man for 7 days needs 17,500 kcal; 10 tins of beans
(3,360 kcal) and 5 packs of pasta (8,975 kcal) hold 12,335, so 5,165 are short. The
beans' share (3,360/12,335 of it, 1,406.9 kcal) is 4.19 tins, so 5; the pasta's
(3,758.1 kcal) is 2.09 packs, so 3.

Every line can be made more or fewer, or taken off; lines can be added. **Work it out
again** replaces the worked-out lines and keeps the person's own. When the stock or the
household changes afterwards, the list says so (ticking a line off as bought changes the
stock, so it is one such change).

**Bought** (the tick on a line) asks how many, the date on them and its kind, and where
they are kept, and adds them to the stock: to a row of the same product with the same
place and date if there is one, otherwise as a new row like the old one. Fewer than the
line asked for leaves the rest on the list.

The list can be made a PDF (Save as PDF, Add to library, Share: see
[library.md](library.md)), printed from that, and copied as text.

## The barcode scanner

**Scan** opens three ways to give a barcode, all always on the screen:

- **The number**, typed. A barcode scanner that types like a keyboard (USB, or
  Bluetooth paired to the phone) types into the same field and presses Enter; nothing
  else is needed.
- **A photo**, taken or chosen through the phone's own picker. This needs no secure
  page, so it works at a plain `http://` address on the home network.
- **The live camera**, which browsers allow only on a secure page (HTTPS, or the
  computer Outpost runs on). At a plain `http://` address the screen says "The camera
  is not available at this address", why, and to turn on **Settings → HTTPS on your
  network** and open the https address; the other two ways stay.

The camera is let go (every track of it stopped, and the reading of frames with it) when
the scan ends: a code read, **Stop the camera**, **Done** or the dialog closed, and also
when the page is hidden (another tab, a locked phone). Coming back, the dialog says the
camera was stopped; **Use the camera** starts it again.

The result is matched against the supplies. A retail number with a right check digit
(EAN-8, UPC-A, EAN-13, GTIN-14) is matched as 14 digits, as GS1 stores GTINs, so that
a UPC-A read as 12 digits by one scanner and 13 by another is the same product.

- Found: each row of it, with plus and minus, "All used up", and "Add another batch".
- Not found, but remembered from an item that had it: "Add" and its name, filled in.
- Unknown: "New item: type its name". The barcode is filled in, and remembered from then
  on.

### What reads the barcode

Where the browser has its own `BarcodeDetector` with retail formats (Chrome on Android
and some desktops), that is used. Safari has none, so on an iPhone, and wherever else it
is missing, Outpost's own reader does the work
(`apps/web/src/features/supplies/barcode/decode.ts`, about 540 lines, no dependency). It
lays lines across the picture at twelve angles and nine offsets, finds the edges along
each in two ways (a threshold that follows the local light, and where the logarithm of
the brightness changes fastest, which a blur leaves in place and a shadow barely
moves), matches the runs against each format's patterns both ways round, and accepts a
read only with a right check digit (or Code 128 checksum) and at least two lines
agreeing. A live camera frame is read in about 18 ms at 640 × 480 on an M-series Mac in
the quick mode used for camera frames (60 ms for a full read of a photo); a phone is
slower, and frames are read about five times a second.

The libraries that could have done it: ZXing's JavaScript port (`@zxing/library`,
Apache-2.0) and Quagga2 (`@ericblade/quagga2`, MIT) are general barcode toolkits many
times the size of what is needed; the formats that matter on a tin are short to read.
Neither was installed.

**What it reads:** EAN-13, UPC-A (given as its 12 digits), EAN-8 and Code 128 (code
sets A, B and C; function characters such as GS1's FNC1 are dropped).

**What it does not read:** UPC-E (the short code on small American packets), ITF-14 on
outer cases, QR codes and other two-dimensional codes, and a code curved round a tin so
far that no straight line crosses all of it. Type the number for those.

**Its limits, measured** on pictures made in the tests (`decode.test.ts`; no camera):

| Spoiled how | Reads | Does not read |
| --- | --- | --- |
| Turned | Any angle tried (5° to 135°, −25°, upside down) | |
| Blurred (Gaussian sigma, in modules) | up to 0.43 (sigma 3.5 px at 8 px a module) | 0.47 and more |
| Small | 1.5 px a module | 1 px a module |
| Uneven light | light falling to a third across the code; half the code in shadow at 35% | |
| Speckle | ±40 levels of 255 | |
| Everything at once | turned 17°, blurred, half in shadow, speckled | |

It never gave a wrong number in those tests: across 36 blurred and turned pictures it
read the right one or none. Pure speckle with no code gives nothing. A real phone camera
adds focus hunting, motion and glare, which the tests do not imitate; **the reader has
not been tried with a real iPhone's camera or photos**.

## Open Food Facts, and why nothing is looked up

Outpost has no product database, and does not look a barcode up on the internet by
itself. An unknown barcode is a new item whose name the person types.

What Open Food Facts would allow, as its data page says (world.openfoodfacts.org/data,
read 16 November 2026): the database is under the Open Database License (ODbL), the
individual contents under the Database Contents License (DbCL), and product images
under CC BY-SA. Redistribution must keep the licence and notices; an app must attribute
Open Food Facts prominently with links to it and to the ODbL; a public adapted database
must be offered under the ODbL. Bulk data is offered nightly: a MongoDB dump, JSONL,
a simplified Parquet file on Hugging Face, daily delta files for the last 14 days, and
tab-separated CSV (the food file about 0.9 GB compressed, 9 GB uncompressed). The API is
for "1 API call = 1 real scan by a user"; scraping it is likely to be blocked.

So a later version could offer either a press that looks one barcode up (allowed, one
call for one scan, with attribution), or a download of a cut-down table of barcode,
name, quantity and energy built from the CSV, kept under the ODbL with its notice. Not
built.

## CSV

**Save as CSV** writes every row in Outpost's columns:

`name, category, quantity, unit, location, date_kind, date, kcal_per_unit,
kcal_per_100g, grams_per_unit, litres_per_unit, minimum, barcode, notes, id`

with a byte-order mark so that a spreadsheet reads it as UTF-8, and any text cell that
starts with `=`, `+`, `-` or `@` written with an apostrophe before it, so that a
spreadsheet does not take it as a formula (the apostrophe is taken off again on
import).

**Bring in a CSV file** reads a file of at most 2 MB and 5,000 rows and shows each row
before anything changes. It needs a first row naming the columns, one of them the name;
other headings are matched loosely ("Item", "Qty", "Where", "Best before", "Use by",
"Calories per pack", "EAN"), and a date column headed "Use by" or "Best before" says
which kind its dates are. Dates may be 2027-03-31, 31/03/2027 (day first) or 03/2027 (the
last day of that month). Semicolon- and tab-separated files are read too. A row that
cannot be read is listed with why; a category Outpost does not have is read as Other,
and said.

Numbers are read with the file's decimal mark, the same in every numeric column. A file
separated by semicolons uses the decimal comma (`1,5` is one and a half, `1.234,5` is
1234.5); a file separated by commas uses the decimal point (`"1,250"` is 1250). Some
cells mean one thing in any file: `1,5` and `0,250` are decimals, `1.234,5` and
`1,234.5` are both 1234.5. A tab-separated file is judged from its own numbers; where
they do not settle it, a cell such as `1,250` (1250 or 1.25) is refused with both
readings rather than guessed. Every number that was not plain is listed under its row
with how it was read. A number larger than an item takes in that column is refused on
its row, with the largest allowed: 1,000 kcal per 100 g (a figure above it is usually
kJ), 100,000 kcal a pack, 1,000,000 grams a pack, 10,000 litres a container, 1,000,000
for how many and the minimum. The add and change form refuses the same figures.

A row is **already in the supplies** when it carries the id of one (a file exported from
here), or is the same product kept in the same place with the same date. For those the
person chooses: skip (the default), update the item, or add again. Exporting and
importing the same file therefore changes nothing unless asked.

## Links

Each item has an address of its own, `/prepare/supplies/items/<id>`, with **Copy the
link** on its page; the whole inventory is `/prepare/supplies` (and `?view=days`,
`?view=shopping`, `?view=household`). In a note, select some words and paste the
address as the link.

For other screens (the emergency scenario planner), `GET /api/supplies/outlook`
answers how long the supplies last and what is missing; see [api.md](api.md#supplies).

## What was not tested

- Energy from FoodData Central on a real iPhone: the offers, the choosing and the weight
  were tested in a browser at phone width only.

- A real iPhone's camera, and photos from one. The plain-http state is tested in a
  browser at an address it does not treat as secure; the photo path and the decoder are
  tested with generated pictures. The live camera is tested only with a stand-in for
  `getUserMedia` (`barcode/camera.test.ts`: every track stopped when the scan is ended,
  when the page is hidden, and when it was ended while the camera was being asked for;
  and when the dialog is closed); no test has a real camera.
- The browser's own `BarcodeDetector` path: no test exercises it.
