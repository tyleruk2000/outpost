# Nuclear preparedness

Preparedness → Nuclear preparedness (`/prepare/nuclear`) is a workspace over the
offline map for civil preparedness and education, built only from public, published
information. This page is the module's one page: what each part is, the rules it keeps,
every source and model, and what is not built and why. The reference layers it shows
are described in full in [reference-layers.md](reference-layers.md); the emergency
plans it builds on in [emergency-plans.md](emergency-plans.md).

## The module's rules

The module is about **effects, preparedness and published history**: what a detonation
of a stated size does at a distance, where published sources say things are, and what
official bodies advise people to do. These hold everywhere in it, in the data and on
the screen, and the tests named beside them fail if one is broken.

1. **Nothing about how weapons are designed, built, obtained or delivered.**
2. **Historical records, publicly mapped infrastructure and hypothetical scenarios are
   separate categories that cannot be confused.** In the data: a `provenance` column with
   a CHECK constraint, historical records in a table of their own with a required
   `record_type`, scenarios in tables of their own (`nuclear_scenarios`,
   `nuclear_scenario_sets`) never joined to either. On screen: five provenance classes,
   each with its own mark and words; historical records say which of the three kinds of
   record they are and that they say nothing about any place today.
3. **Publicly mapped infrastructure is never labelled, scored, ranked, sorted or filtered
   as a target.** It is shown as what a public dataset lists. Search is ordered by how
   well a name matches; historical records by period and then name.
4. **No attack probabilities, and no ranked or scored list of modern places by any
   route**, including by combining a scenario with a layer. A scenario may say how many
   people a published population grid counts inside each of its rings, and how far the
   person's own saved places are from a ground zero they chose; it never lists, counts
   or highlights mapped features inside a ring, never suggests a ground zero, never
   snaps one to a feature, and offers no way to step through "what would be affected"
   by facility. The reference layers are not joined to scenarios: a press on the map
   moves ground zero only in the Scenario tab and opens a record only in the others.
   (Tests: `nuclear-page.test.tsx` "counts people per ring of the selected scenario
   only…"; `nuclear-final.test.ts` "hold no total…".)
5. **Scenario results are educational estimates, not emergency forecasts or
   instructions**, with no false precision and no casualty figures. People inside a
   ring is a count from a named grid of a stated year, rounded, said as who lives there
   and "not a prediction of harm" (`population-words.test.ts`). It is per ring, per
   scenario: nothing is added up across rings or scenarios, no union of rings is worked
   out, and no figure is offered for several scenarios together, because a combined
   tally of several detonations is the step from an illustration to an estimate of an
   attack.
6. **Ground zeros are only ever where the person put them**: pressed, typed, or one of
   their own saved places. Nothing is imported as a list of points.
7. **Official guidance, quoted and dated, from publishers whose terms allow it**; where
   it says nothing, a question for the household, never advice of Outpost's own
   (`emergency-plans-templates.test.ts`). General preparedness information is told
   apart from instructions in a real emergency on every screen and every paper.
8. **Offline, local and private**: nothing leaves the device but a download the person
   pressed for; saved places, scenarios and plans stay on this Outpost, are counted
   under Manage and clean up and Storage → Database, are in backups and go with "erase
   everything".

## What exists, and what the module reuses

| Need | What Outpost already has | Used how |
| --- | --- | --- |
| Map engine, style, installed regions | `features/maps/map/engine.ts` (MapLibre), `lib/style.ts`, PMTiles regions served by `modules/maps/pmtiles` and `tile-server.ts` | The workspace embeds `features/propagation/map/plan-map.tsx`, the map the HF planner sets into a screen: same style, regions and furniture, one overlay source of its own (`o-nuclear`, registered in `map/overlays.ts`). Two optional props were added to it: `satellite` and `fitMaxZoom`. |
| Satellite imagery | `modules/maps/imagery`, `features/maps/imagery` | Drawn under the rings when the person switches it on and some is installed, with its credits. |
| Things over a map on a phone | `map-furniture.tsx`, the rule in `docs/development/web-screens.md` | The workspace puts nothing over the map but PlanMap's own column; on a phone the panel follows the map on the page. |
| Saved places | `markers` (the Maps screen's places, with icons) | Shown on the workspace map and measured against a scenario. |
| Own data rules | migrations, `modules/manage` (erase everything), `modules/database/inspect.ts` | Scenarios: migration `0018_nuclear_scenarios`, counted and erased like the radio data. |
| Downloads, catalogue, storage | `modules/downloads` (resumable, checksummed jobs), `modules/catalog` (manifests with licence and size), `modules/storage` (locations on local disks, drives and NAS, `resolveInside`) | The later dataset manager is built on these rather than beside them (see the plan). |
| Search | `modules/search` (`addSource` for many small records) | Historical records and infrastructure become a search source of their own, as repeaters are. |
| PDFs made in Outpost | `features/library/made/`, `features/maps/print/pdf.ts`, `features/propagation/plans/document.ts` | A scenario is written out as PDF and Markdown with the same buttons as everywhere else. |

## The plan, in milestones

Each milestone works on its own. The numbers in brackets are the specification's
sections.

1. **Workspace and effects simulator** (§§ 4, 9, part of 10). Done: see below.
2. **Data-source framework and geographic store** (§§ 2, 8, 10). A provider adapter
   interface under `apps/server/src/modules/nuclear/sources/`: describe (name, licence,
   terms URL, what it holds), discover versions, fetch (only where the terms allow and
   only on a press, through `ctx.services.downloads`), validate, parse, normalise to
   one record shape, deduplicate (by provider id, then by distance and name), and
   record the version and retrieval date. Records go in SQLite with an R*Tree index
   (`better-sqlite3` has it; no new dependency), each with its provenance class,
   source, publication and retrieval dates, licence and positional accuracy. Manual
   import for providers that cannot be fetched. *Depends on nothing new.*
3. **Layers and source information** (§ 3, 10). Layers on `o-nuclear`, each with a
   switch, a legend, filters (never one that ranks targets), search, and a source panel
   per record; clustering through MapLibre's own source clustering. The provenance key
   built in milestone 1 is the visual language. *Depends on 2.*
4. **Historical records** (§ 6). Its own table and category; record types "actual
   historical target list", "historical assessment of likely targets", "author's
   speculation", each shown as such; open the source document from the map feature.
   Never joined to modern infrastructure. *Depends on 2 and 3.*
5. **Dataset manager and country packs** (§ 5). Catalogue-style manifests per country,
   region, box, category and provider, with size, version, licence, update date and
   space needed, through the existing downloads queue (resume, checksums, cancel,
   recovery) onto any storage location. Nothing large downloads by itself. *Depends on
   2.* Population data (WorldPop) arrives here, and with it the simulator's affected
   population (§ 4.5), which this version leaves out.
6. **Personal planning** (§ 7). Uses the emergency scenario planner and supplies
   inventory other builders are making under Preparedness, the saved places, notes and
   official guidance, quoted and dated. *Depends on those screens.*
7. **Tests across the module and the README** (§§ 11, 12.10).

All seven are done. The second sitting built milestones 2 to 5 as the map's reference
layers ([reference-layers.md](reference-layers.md): the adapters, the geographic store,
the layers, historical records, the dataset manager), under `modules/layers` rather than
`modules/nuclear/sources`, so that the Maps screen has them too. The third built
milestone 6 and brought the layers into the workspace; see "The workspace" below.

## Data providers and what their terms allow

Checked on 2026-11-16. The quotations below were read through a fetching tool that
returns excerpts; check the wording on the live page before quoting it in the app.
"Fetched" means the page itself was read; "search only" means only a search engine's
summary was.

| Provider | Terms, as the publisher states them | What the module may do |
| --- | --- | --- |
| Natural Earth | Fetched, <https://www.naturalearthdata.com/about/terms-of-use/>: "All versions of Natural Earth raster + vector map data found on this website are in the public domain." "No permission is needed to use Natural Earth." "Crediting the authors is unnecessary." Nothing on automated access. | Bundle, and fetch on a press. Credit it anyway (Outpost already does). |
| OurAirports | Search only: <https://ourairports.com/data/> "All data is released to the Public Domain, and comes with no guarantee of accuracy or fitness for use"; the about page "all in the Public Domain (no permission required)". The site's own pages would not load (an expired certificate). Fetched, <https://github.com/davidmegginson/ourairports-data>: licence "Unlicense", "Open-data downloads for OurAirports, updated daily." | Bundle, and fetch on a press, from the GitHub mirror, no more than daily. Recheck the site's own page when it loads. |
| OpenStreetMap | Fetched, <https://www.openstreetmap.org/copyright>: "licensed under the Open Data Commons Open Database License (ODbL)"; "Provide credit to OpenStreetMap"; "If you alter or build upon our data, you may distribute the result only under the same license." Fetched, <https://operations.osmfoundation.org/policies/api/>: "The editing API is provided in order to edit the map data, not for read-only purposes"; "Large or frequent data users must use the download service 'planet.osm' or other alternatives." Fetched, <https://wiki.openstreetmap.org/wiki/Overpass_API>: public instances for "less than 10,000 queries per day … less than 1 GB data per day", and an app's usage "counts towards the sum of requests made by all your users". Geofabrik extracts (<https://download.geofabrik.de/>): "License: ODbL 1.0"; no stated rate limits. | Fetch regional extracts (Geofabrik) on a press. Small Overpass queries on a press only, with Outpost's own User-Agent; never as a back end; never the editing API. Data derived from OSM is ODbL, so a pack made from it is distributed under ODbL with credit, separately from the MIT code. |
| WorldPop | Fetched, an example dataset (<https://hub.worldpop.org/geodata/summary?id=80031>, DOI 10.5258/SOTON/WP00845): "WorldPop datasets are available under the Creative Commons Attribution 4.0 International License", "provided attribution is included"; datasets derived from OSM or Microsoft data "are available under the Open Database License (ODbL)". The site's front and catalogue pages state no licence. | Fetch on a press and keep, crediting each dataset with its DOI, after checking the licence stated on that dataset's page. |
| FAS Nuclear Notebook | Fetched, <https://fas.org/initiative/fas-nuclear-notebook/>: "the FAS Nuclear Notebooks are freely available on the Internet"; footer "Federation of American Scientists © 2026"; PDFs from Taylor & Francis. The Bulletin of the Atomic Scientists' page: "always free-to-access"; "Copyright © 2026 Bulletin of the Atomic Scientists. All rights reserved." No open licence found. | Free to read is not free to copy. Cite figures with attribution and a link; a person may type in what they read. No bundling, no automated fetching. The Bulletin's permissions page and Taylor & Francis's terms were not read. |
| SIPRI | Fetched, <https://www.sipri.org/about/terms-and-conditions>: "SIPRI data may be freely downloaded, cited and used for statistical or other analytical purposes"; "Any reproduction … of the data requires authorization"; without permission in papers and similar "so long as SIPRI is clearly identified as the source"; "permission is only needed if you want to directly reproduce more than 10% of the data set." | Cite with SIPRI's credit line. Link out and offer manual import; bundle nothing beyond a small excerpt, or ask SIPRI. |
| NTI Index | Not verified: <https://www.ntiindex.org/terms-of-use/> was not found (404), <https://www.nti.org/terms-of-use/> refused (403), and the home page states no terms. | Treat as all rights reserved: cite and link only, until NTI's terms are read. |

**Historical targeting documents.** The best public source found is the National
Security Archive's Electronic Briefing Book No. 538, *U.S. Cold War Nuclear Target
Lists Declassified for First Time* (William Burr, 22 December 2015, updated 4 April
2016; <https://nsarchive2.gwu.edu/nukevault/ebb538-Cold-War-Nuclear-Target-List-Declassified-First-Ever/>):
the Strategic Air Command's *Atomic Weapons Requirements Study for 1959* (1956). The
original is held by the US National Archives, College Park (Record Group 342,
Operational Planning, box 147, file B 89351). It is published as scanned PDFs, the
urban-industrial list alone 306 pages, with parts excised. The Archive's spreadsheets
and map are its own compilation, not official transcriptions. The study is a US
Government work and so has no copyright (17 U.S.C. § 105, "Copyright protection under
this title is not available for any work of the United States Government"); the
Archive's terms (fetched, 2017 PDF) allow copying its materials with notices kept,
citation, a link and no change of substance, and say "Copyright is not claimed as to
any work of the United States government." So a transcription made from the
government scans may be bundled with credit to the Archive as the source; the Archive's
own spreadsheets may be used with citation and a link, unaltered. Any such record is
"historical documentation" for 1956 to 1959, never a statement about today. UK records:
GOV.UK content is under the Open Government Licence ("Most content on GOV.UK is subject
to Crown copyright protection and is published under the Open Government Licence");
The National Archives' own reuse pages refused the fetch, and *Protect and Survive*
(1980) was not shown to be under the OGL, so it is cited and linked only.

**Shelters and civil-defence resources.** US official guidance is public domain (a US
Government work): ready.gov's nuclear explosion page, "get inside, stay inside and stay
tuned". UK guidance on GOV.UK is under the OGL v3 with attribution. OpenStreetMap tags
shelters (`amenity=shelter` with `shelter_type=bomb_shelter`, `emergency=assembly_point`,
`military=bunker`) under ODbL. The US HIFLD Open portal was reported discontinued on 26
August 2025 (search only), with its National Shelter System layer archived at
DataLumos; FEMA's own map service (<https://gis.fema.gov/arcgis/rest/services/NSS/>)
lists the shelter layers but states no licence. Not verified: FEMA's terms for that
service, and whether it answers without an account.

## The effects simulator

### What it is

A person gives a place (pressed on the map, chosen from saved places, or typed as
coordinates, a grid reference or a locator), a yield, a burst (on the surface, at a
height, or at the height that carries a chosen overpressure farthest), a wind for
fallout, a name and notes. The simulator answers at once, in the browser, from
`computeEffects` in `packages/shared/src/nuclear-effects.ts`; the server holds a saved
scenario to the same limits with `effectsProblems`. Nothing needs the internet.

Every result carries, on the screen and in what is written out: "An educational
estimate from a published model for an idealised case: flat ground at sea level, a
standard atmosphere, clear air, and no buildings or hills. It is not a forecast and not
instructions. Distances are rounded to two significant figures because the model is no
more precise than that."

### The source

Samuel Glasstone and Philip J. Dolan (eds), *The Effects of Nuclear Weapons*, third
edition, prepared and published by the United States Department of Defense and the
Energy Research and Development Administration, 1977. A US Government work. Read from
the scans hosted at <https://www.fourmilab.ch/etexts/www/effects/> (chapters 2, 3, 5,
6, 7, 8, 9 and 12). No code or assets were taken from any website; no other
calculator was consulted.

**How the curves were read.** Each figure page was rendered at 300 dpi; the gridlines
were found by counting dark pixels along rows and columns; each curve's crossing of a
row or column between gridlines was found the same way and converted with the figure's
own scale (logarithmic where the figure's is). Points were assigned to curves by hand
against the picture. Tables were copied as printed (Table 9.93's exponents from a
zoomed image, as its text layer is garbled). The numbers are in
`packages/shared/src/nuclear-effects-data.ts`, each table with its figure number.

### The models

| Effect | Model | Range |
| --- | --- | --- |
| Blast | Peak overpressure on the ground for 1 kiloton against height of burst and ground distance, Figs. 3.73b (10 and 20 psi) and 3.73c (1, 2, 4 and 6 psi), each curve stored from where it meets the ground, out through its farthest reach, back to the axis. Scaled by the cube root of the yield, d = d₁ W^⅓ and h = h₁ W^⅓ (eq. 3.62.1, § 3.73). For a height, the farthest crossing of the curve at that scaled height. 5 psi, which the book does not draw, is interpolated between 4 and 6 psi on log pressure; where 4 psi reaches the ground and 6 psi does not, no 5 psi distance is given. "Farthest reach" is the height at a curve's tip. | Scaled height up to 5,000 ft (the figure's top). Height up to 40,000 ft (§ 3.65: above that the energy partition changes). Target at sea level, so no altitude correction (§ 3.64 applies the correction at the target's altitude). |
| Levels shown | 20, 10, 5, 2 and 1 psi, each described in the book's words: Table 12.38 (lung damage 12 psi threshold, severe at 25; eardrum rupture from 5 psi, half of adults at 15 to 20), § 5.143 (1 psi light damage; 10 psi for blast-resistant buildings), §§ 5.56 and 5.67 (houses at 5 psi "almost completely destroyed", "damaged beyond repair"), § 5.59 and Table 5.145 (1.7 psi, house standing but badly damaged; wood siding fails at 1 to 2 psi; windows at 0.5 to 1 psi). | |
| Heat | Fig. 7.42, slant range for 3, 5, 8, 12, 25 and 50 cal/cm² against yield for air bursts below 15,000 ft and a 12-mile visibility; interpolated on log exposure and log range. The exposure for a burn is the solid "50 percent" line of Fig. 12.65 ("average unshielded population taking no evasive action"): second degree Q = 3.95 + 0.757 log₁₀W, third degree Q = 5.96 + 1.24 log₁₀W cal/cm² (lines fitted through the read-off points; they are straight on the figure). A burst lower than Table 7.101's air-burst rows uses its effective thermal partition f (0.18 for a contact surface burst, § 7.101), by asking Fig. 7.42 for Q × 0.35/f. Ground distance = √(D² − H²). | 1 kiloton to 10 megatons (Fig. 7.42 and Fig. 12.65); exposures 3 to 50 cal/cm²; burst below 15,000 ft. First-degree burns (under 3 cal/cm² below about 400 kilotons) are not given. |
| Initial radiation | Gamma, Figs. 8.33a (fission weapons, 1 to 100 kt) and 8.33b (thermonuclear, half the yield from fission, 100 kt to 20 Mt); neutrons, Figs. 8.64a and b, likewise; each giving slant ranges for 30, 100, 300, 1,000, 3,000 and 10,000 rads. Dose at a range by log-linear interpolation between curves ("Interpolation may be used for doses other than those shown", § 8.33); total = gamma + neutron. Contact surface bursts: gamma × Table 8.37's factor (2/3 to 3 by yield), neutrons × ½ (§ 8.66), interpolated to 1 at 300 ft (§ 8.37). The fission curves are used below 100 kt and the thermonuclear above; that choice is the model's, stated on the screen, not a claim about any weapon. Rings at 600 and 100 rads, described from Table 12.108. | Reliability "within a factor of 0.5 to 2" (fission) and "0.25 to 1.5" (thermonuclear) (§ 8.33), said on the screen. Air density 0.9 of sea level. |
| Fireball | Radius at breakaway, 110 W^0.4 ft for an air burst (eq. 2.127.1), 145 W^0.4 ft for a contact surface burst (eq. 2.127.2). | |
| Crater | Apparent crater of a contact surface burst, Figs. 6.72a and b at depth of burst 0, which label the values: radius 82, 61, 58 and 49 ft and depth 31, 28, 28 and 22 ft for 1 kt in wet soil, dry soil, wet hard rock and dry hard rock; scaled by W^0.3 (§ 6.72). Shown as the range across grounds; the ring at the largest. | Surface bursts only. |
| Fallout | Idealised unit-time reference dose-rate contours for a contact surface burst, Table 9.93: for 3,000 to 1 rads per hour at one hour, downwind distance a·W^0.45, maximum width b·W^β, ground-zero width c·W^γ statute miles; upwind distance half the ground-zero width (§ 9.93). Effective wind v mph scales the downwind distance by F = 1 + (v − 15)/60 above 15 mph and 1 + (v − 15)/30 below (§ 9.97); widths and upwind distances are left alone, as § 9.98 allows. Drawn along the wind as Fig. 9.93's cigar shape: a semicircle upwind, widening from the ground-zero width to the maximum width two thirds of the way along (where Fig. 9.93 draws it; the table does not say), closing in an elliptical end. The map draws the 1,000, 100, 10 and 1 rads/h contours; the panel lists all eight. | Surface bursts only (an air burst below 180 W^0.4 ft is noted as likely to give local fallout, eq. 2.128.1, but not drawn). Wind 8 to 45 mph (13 to 72 km/h). All yield from fission (§ 9.94 scales dose rates by the fission share). |

Fallout is **built**, not disabled: Table 9.93 is a published, simple, defensible
idealised model, and the book's own worked example checks it to within one per cent.
It is labelled everywhere as an idealised pattern for a steady wind that real fallout
never follows, with the book's own words on its limits (§ 9.83: it "will undoubtedly
underestimate the fallout in some locations and overestimate it in others").

Affected population (§ 4.5) is given **only as the people a population grid counts
inside each ring**, never as casualties: see "People inside a ring" below.

### Validation

`apps/server/test/nuclear-effects.test.ts`, against the book's own worked examples and
statements. Figures are what the model gives today.

| Check | Book | Model | Tolerance |
| --- | --- | --- | --- |
| Farthest reach of 4 psi, 125 kt (Fig. 3.73c example) | 13,000 ft at about 5,500 ft | 13,500 ft at 5,750 ft (+3.8%, +4.5%) | 5% |
| 1 psi from 1 Mt at 6,500 ft (§ 2.35) | "roughly 1 pound per square inch" at 10 miles | 10.75 miles (+7.5%) | 10% (the book says "roughly") |
| 10 psi at the ground, 1 kt: Fig. 3.73b against Fig. 3.73c | 1,029 ft (b) | 1,062 ft (c) | 4%: the book's two figures disagree; 3.73b (finer grid) is used |
| Newspaper ignites, 8 cal/cm², 1 Mt air burst (§ 7.43) | "about 7 miles" | 7.33 miles (+4.7%) | 6% |
| 4.5 to 6 cal/cm², 1 Mt (§ 12.66) | "9 to 10 miles" | 8.10 to 8.96 miles | The book's text reads its own Fig. 7.42 about 10% farther than the figure as drawn; the figure is used |
| Gamma dose at 2,000 yd from 50 kt (§ 8.34) | "about 250 rads" | 263 rads (+5%) | 15% |
| Fallout example, 10 Mt, 30 mph (§ 9.97 example) | 75, 142, 355 miles for 3,000, 1,000, 300 rads/h | 74.9, 142.0, 354.9 | 1% |
| Low burst gives local fallout (eq. 2.128.1) | about 2,900 ft for 1 Mt | noted below 2,850 ft (180 W^0.4) | exact formula |

Also tested: cube-root scaling across yields, rings ordered outward with falling
overpressure for surface and air bursts from 1 kt to 10 Mt, 5 psi between 4 and 6,
Table 7.101's partitions, every refusal and its reason, and rounding. Ring geometry
(`apps/web/src/features/nuclear/geometry.test.ts`): every point of a ring is its
stated ground distance from ground zero at latitudes 0°, 51.5°, 70° and −45°, a ring
spans 1/cos(latitude) more degrees of longitude than of latitude (so it is a circle on
the ground, not on the web-mercator map), rings stay whole across the antimeridian,
the plume lies downwind with the book's dimensions.

**Speed.** On an Apple M2 Max, `computeEffects` takes about 0.1 ms; with the ring and
plume geometry for the map, about 2 ms per scenario. The effects are worked out again on
every keystroke; the map's overlay is rebuilt and handed to the map only when what it
draws changes (a ground zero, a figure, which scenario is selected, a switch), not when a
name or notes are typed. Nothing on the screen runs on a timer or animates. It has
**not been measured on a Raspberry Pi**; on one several times slower it would still be
a few tens of milliseconds at most.

### Limitations

Listed on the screen under "How this is worked out" and in every PDF and Markdown
file: the idealised conditions; read-off error of a few per cent and the book's own
figures differing by a few per cent; no casualty figures; the radiation curves'
reliability factors and the greater effect of neutrons (§ 8.65); fallout's hot spots,
wind shear, rain and decay (§§ 9.16, 9.99 to 9.102); and that where the book draws no
curve, nothing is given.

## The workspace

### Layout

On a wide screen the map with the panel beside it, which can be put away; on a phone
the map first and the panel after it on the page, so that nothing lies over the map but
its own column. The panel has five tabs: **Scenario**, **Saved**, **Layers**,
**Records** and **Plans**. A line under the title says, always, that the screen works
from this device and nothing in it uses the internet unless Download is pressed, and
whether an offline map region is installed. The card for a record pressed on the map
(the specification's "location information drawer") is under the map.

### Several scenarios on the map

Up to **six** scenarios are on the map at once, lettered A to F; each has its own ground
zero, yield, burst and wind. Six because the letters and labels of more collide on a
town-sized map, the list of them stops fitting a phone, and comparing more than a few
at once stops being readable; at the limit the screen says so and "Add another
scenario" is turned off. A new one is put at the middle of the map; a press moves the
selected one. Each can be selected to edit, hidden, removed from the map, or saved; a
saved scenario is put back on the map from the Saved tab, beside the others. On a
phone the list is the switcher, with a row of letters under the map as well. "Save
changes" sends the time of the saved version the scenario was opened at; if another tab
or device has saved it since, nothing is overwritten, and the screen offers **Keep my
version** or **Load the other version**, as Notes does. Sets are saved without this
check: the last set saved wins.

- **Telling them apart.** The letter on each ground zero and at the start of every ring
  and contour label is the first cue. The selected scenario is drawn at full strength
  with its rings lightly filled; the others are thinner and fainter, with no fill.
  No scenario has a hue of its own: hue means the kind of effect.
- **Results** are the selected scenario's, under its letter. The PDF and Markdown cover
  every scenario shown, each under its own letter and heading with its own caveat line
  and colour key, with a line saying nothing is added up across them.
- **Sets.** The scenarios on the map can be saved together as a set
  (`nuclear_scenario_sets`, migration `0024`) and opened again as they were, hidden ones
  hidden. A set keeps its own copy of each member as typed; deleting a saved single
  scenario leaves it whole. Sets are counted with saved scenarios under Manage and
  clean up and Storage → Database ("saved nuclear effects scenarios and sets"), are in
  backups and go with "erase everything".

### Colour

Each kind of effect has one hue, the same on the map, in the legend under it, beside
each heading of the results, on the switches of the Layers tab, in the plan's picture
and in the PDF's colour key: fireball and crater, blast, heat, initial radiation,
fallout. Within a kind the stronger level is more opaque, not another hue; the
selected scenario's rings are filled at 4.5 per cent each, so that they stack into
zones and the base map stays legible. Every line keeps its dashes and width, its
letter, level and distance, so nothing depends on colour and a grey copy reads the same.
Each line sits on a casing of the page's colour, so that it reads over imagery.

The hues are tokens (`--map-effect-*` in `styles/tokens.css`, light and dark), read into
the map's theme (`MapTheme.effects`); the PDF uses the light ones, since paper is light.
None is a status colour (`--danger`, `--warning`): no ring is a line of danger or of
safety, and there is no red-to-green ramp.

| Kind | Light | Dark |
| --- | --- | --- |
| Fireball and crater | `#888d18` | `#9a9235` |
| Blast | `#5373ef` | `#3f9bcf` |
| Heat | `#873d08` | `#b1530f` |
| Initial radiation | `#7343a6` | `#7260c4` |
| Fallout | `#b3628c` | `#e25b95` |

**Checked with the data-viz validator** (`validate_palette.js`, the one the `--chart-*`
tokens were checked with), every pair, since all can touch on a map
(`--pairs all`), on 16 November 2026:

| Surface | Lightness band | Chroma | Colour-blind separation (worst pair, protan/deutan ΔE) | Tritan | Normal vision (worst pair) | Contrast, each at least |
| --- | --- | --- | --- | --- | --- | --- |
| Light map land `#ecefef`, and the page `#ffffff` | pass | pass | 12.6 (radiation and blast) | 10.9 | 15.4 | 3:1, pass |
| Dark map land `#1c2224`, and the page `#141a1c` | pass | pass | 9.2 (heat and fireball) | 11.4 | 15.6 | 3:1, pass |

Over satellite imagery no hue keeps 3:1 against every patch of ground (against three
sample imagery tones, `#3e4a35`, `#6b6f5a` and `#9a9682`, the light hues measured 1.2 to
2.6:1 and the dark 1.0 to 3.0:1), which is why every line is drawn on a casing of the
page's colour: against the casing each meets the 3:1 above. The palette was found by a
search within hue ranges chosen away from red and green, then validated; the search
script is not in the repository.

### Reference layers in the workspace

The Layers tab mounts the Maps screen's pieces unchanged (`useReferenceLayers`, the
Layers panel, the record card, `ReferenceDataSection`): the same switches, legend,
filters, search, record card with its source, and the same sentence, "Nothing here
marks a place as a likely target or ranks places". The dataset manager is the same
one, under "Reference data". The workspace's own key to the five provenance classes
counts what is held in each. Its first class is named "Published public record", as the
reference layers name it: the specification's "verified public infrastructure", but
Outpost has not checked anything on the ground. `PlanMap` was given two optional props
for this: `onEngine` (the map engine itself) and `credits`.

### Historical records browser

The Records tab lists every historical record installed (`GET /api/reference/historical`),
by period and then name, each with its mark, which of the three kinds of record it is
(an actual historical target list, a historical assessment of likely targets, an
author's speculation), its period and document; filtered by kind. Each opens the record's
card (and its place on the map, where it has one), and its document in the library or
at its archive. When none is installed it says that no dataset is cleared for Outpost to
ship, and offers the import.

### People inside a ring

Where an installed WorldPop grid reaches a scenario's rings, each ring of the selected
scenario says how many people the grid counts inside it (`GET
/api/reference/population/sum` for the ring's rounded radius), once the scenario has
stopped changing for half a second:

- "About 220,000 people live inside this ring, by WorldPop's 2020 estimate. This is who
  lives there, not a prediction of harm." The server rounds to two significant figures,
  the most a modelled 1 km grid supports.
- A ring smaller than four of the grid's cells (the cell's area at that latitude comes
  with the answer) gets no count: the grid cannot speak for it.
- A ring half or more inside the installed grid but not wholly: the count of the part
  covered, said as such ("in the 64% of this ring that the installed grid covers; the
  rest of the ring is not counted"). Less than half: no count.
- The fallout pattern gets no count: it is an idealised shape for a steady wind.
- No grid installed: one line says what to download, with a button to the dataset
  manager.
- The grid's product, year, licence (CC BY 4.0) and WorldPop's citation are behind a
  disclosure under the counts.

A WorldPop grid can also be **imported from a file** a person downloaded from WorldPop's
site (`worldpop-tif`), credited as the download would be. Only the product Outpost
credits is read (2020, 1 km, unconstrained, UN-adjusted), told by WorldPop's own file
name; another is refused rather than credited wrongly.

### The wind field

The wind for the fallout pattern is a field of its own, labelled: the direction the wind
blows **from**, as compass buttons (N to NW) or degrees (0 to 360; 360 is read as north,
0), and its speed. Under it, in one
line, the state: drawn ("Drawn: wind from the west, so the pattern runs east, at 24
km/h"), or the one reason not (no wind given, one of the two missing, not numbers, a
speed outside the model's 13 to 72 km/h, or a burst at a height, for which the model
draws no fallout). No wind is filled in by default. When a pattern is first drawn or
its wind changes, the map is fitted to the rings and the 100 rads per hour contour;
"Fit the map to it" takes in the whole drawn pattern. The plume's outermost contour is
filled at 12 per cent and edged on a casing; each contour is labelled along its edge.

**Wind from the weather kept on this device.** Where Weather and hazards has fetched a
forecast for a place within 50 km of ground zero (`GET /api/weather`, which fetches
nothing), the field offers that forecast's wind for the hour nearest now, with the hour,
the place, its distance and when it was fetched, and the sentence: this is one hour's
forecast wind 10 m above the ground at one place; fallout is carried by the winds at
every height up to the top of the cloud; Glasstone and Dolan: "For a detailed fallout
distribution prediction, the winds from the surface to all levels in the radioactive
cloud must be considered", and the idealised pattern's effective wind is "the mean of
these two average winds" from the ground to the base and to the top of the stabilised
cloud (§ 9.84, p. 423). The person can always type their own.

### Saved places

The household's saved places (the Maps screen's) are shown on the map and listed with
their distance from the selected scenario's ground zero and, in plain words, the rings
and contours they are inside. In the Plans tab they are measured against each other.

### On paper

A PDF (Save as PDF, Add to library, Share) and Markdown with every figure, what each
level means, a colour key, the notes, the assumptions, limitations and source, for every
scenario shown (hidden ones are left out), each under its letter with its caveat. The
people counts are not written out: they belong to the installed grid of the day.

**Maps in the PDF.** Unless "Maps in the PDF" is switched off, the PDF has pictures of
the offline map, drawn on this device by the same off-screen map as a printed map page
and the HF coverage PDF (`features/maps/print/export.ts`), at 150 dots to the inch and
JPEG quality 0.92:

- **Each scenario's rings**, framed as the screen frames them (`fitArea`, rings only), so
  that the rings fill the picture: the light basemap, since paper is light, with the
  rings, the fallout pattern where one is drawn, ground zero and its letter, in the light
  theme's effect hues with their casings, dashes and the labels along each line, so that
  a grey copy reads the same.
- **Its fallout pattern**, where one is drawn, on a second map framed to reach the 100
  rads per hour contour, as the screen first frames a pattern; the page says that the 10
  and 1 contours run on past its edge, and the table gives how far. Where the 100
  contour reaches less than 1.6 times as far across as the rings, the second map takes
  in the whole drawn pattern instead, and says so; where even that does not, one map
  shows both (`print-frames.ts`).
- **An overview** first when several scenarios are shown: every one at full strength
  with its letter, none filled (so that where two overlap nothing is shaded as one), at
  a scale that takes them all in, the narrower way round the world. Under it, that each
  is worked out on its own and nothing is added up across them. No figure of any kind
  goes with it.

Under every map: a scale bar in kilometres and miles, the scale, north, the caveat line
the screen carries, for a pattern that it is an idealised shape for a steady wind, the
part of the area with no offline map if any, and the credits the print code works out
(`creditsFor`, `printedCredits`: OpenStreetMap with its copyright address, Protomaps,
Natural Earth) with the date of the map data where the installed region gives one.

**Saved places** are drawn only if "Show my saved places on the maps" is ticked. It is
off every time, because the PDF may be shared and a place called Home is not something
to put on a shared page by default. Ticked, the page says so, and "Add to library" asks
first, as for other documents that hold personal details.

**The reference layers are never drawn on these maps.** They are not joined to
scenarios anywhere in the module, and a page of rings over named facilities is exactly
the picture the module's rules exist to prevent. The style of these maps is built from
the scenario's layers and the places' alone (`printMapStyle` in `print-maps.ts`), and
`print-maps.test.ts` fails if anything else is in it. Satellite imagery is not used
either.

**When there is no map.** With no offline region covering the area, or on a device that
cannot draw it (the print code says why), the PDF is still made: the rings to scale with
no map under them (the same drawing as an emergency plan's, as lines on the page) in the
map's place, and one line saying why there is no map and how to get one (Maps, Offline
maps). The overview has the line only.

**Making it.** Nothing is drawn until "Make the PDF" is pressed. The page stays usable
meanwhile, says in words which map it is drawing ("Drawing the map for A (2 of 4)"), and
can be stopped. Switched off (remembered on the device), the words-only PDF is made at
once, as before. Paper is A4 or US Letter. The Markdown is words only and says that the
PDF has the maps.

**Across the antimeridian and near the poles.** A scenario's frame keeps its longitudes
within half a world of ground zero, so a scenario at 179.95° E is framed as the small
box round it (`fitArea` now does the same for the screen's "Fit the map to it"), and an
overview joins scenarios the narrower way round. Web Mercator stops at 85.05°; a ring
reaching past it is cut at the map's edge.

**What was measured** (the end-to-end suite's small test map; desktop Chromium on an
Apple M2 Max, and Chromium as a Pixel 7): one scenario with a pattern, 4 pages, 2 maps,
189 KB, about 4 s; three scenarios, one with a pattern, 7 pages, 5 maps, 399 KB, about
8 s; with no region, 3 pages, 126 KB. Each map is one picture of at most about 1,065 ×
625 pixels, inside what a phone draws at once, so a phone draws it in one piece. A real
region is denser than the test map, so its pictures will be larger: not measured. The
same PDF made twice on the same day came out byte for byte the same.

## Personal planning

### Plans for a radiation emergency are emergency plans

A household's plan for a radiation emergency is an emergency plan: made, changed, used,
printed as cards and reviewed on the emergency plans screens, from a template added to
theirs, **"Radiation emergency"** (kind "Sheltering at home", narrowed "Radiation
emergency"; `packages/shared/src/emergency-templates-radiation.ts`). The Plans tab:

- **Plans for a radiation emergency**: those made from the template or named for one,
  each opened, used ("Use now") or printed ("Cards to print") on the plans screens; one
  press makes a new one from the template. A line says these are made in advance from
  published guidance, and that in a real emergency the emergency services and official
  warnings come first.
- **A scenario as an illustration**: a saved scenario can be attached to a plan. The plan
  holds it as a link (`{ kind: "scenario", id }`), shows its picture (the rings to scale,
  in their hues, with the fallout pattern) and its caveat, and says it is missing if it
  is deleted. None of the plan's steps changes with it.
- **Places that matter**: the household's saved places, with the distance from one to
  each other, worked out on this device. They stay on this Outpost; the screen says so.
- **Supplies for staying in**: Supplies' days of food and water against the 3 days Be
  Ready's household plan asks for, beside UKHSA's "one to two days", longer if a release
  goes on.
- **If the phones fail**: each plan's own part on this, and Radio's communication plans.
- **Notes, documents and attachments**: the library and Notes, linked from a plan's
  "Notes and links"; files are attached to a page of notes.

### The radiation emergency template

Its words are the UK Health Security Agency's public guidance on GOV.UK, under the
Open Government Licence v3.0, the GOV.UK terms already cleared for the templates; each
page also carries "This publication is licensed under the terms of the Open Government
Licence v3.0 except where otherwise stated". Every quote (40, counting supplies and
"where things are") was checked word for word against the pages as downloaded on 16
November 2026 by a script, and the existing test fails if a template line quotes a
source whose terms are not cleared.

| Source | Page's own date | Terms | Verdict | Used for |
| --- | --- | --- | --- | --- |
| UK Health Security Agency, [What to do in a radiation emergency](https://www.gov.uk/government/publications/radiation-emergencies-information-for-the-public/what-to-do-in-a-radiation-emergency) | Updated 10 September 2024 | GOV.UK, OGL v3.0 | Quoted | Go in, stay in, tune in; the building, the room, vents; children, pets, medication, stable iodine, food and water, evacuation, coming back |
| UK Health Security Agency, [How to remove radioactive material from your skin and clothes – self-decontamination guidance](https://www.gov.uk/government/publications/radiation-emergencies-information-for-the-public/how-to-remove-radioactive-material-from-your-skin-and-clothes-self-decontamination-guidance) | Updated 10 September 2024 | GOV.UK, OGL v3.0 | Quoted | Taking off and bagging outer clothes, washing, clean clothes; gloves, masks, bags |
| Be Ready (Cabinet Office), Household emergency plan and other pages already used | No date shown | Be Ready, OGL v3.0 | Quoted | Water for 3 days, food, radio, torch, medication; an alert |
| Ready.gov (FEMA), [Radiation Emergencies](https://www.ready.gov/radiation), US, for comparison | Last Updated: 01/07/2025 | Not cleared (below) | Pointed to, not quoted | One pointer step |
| ICRP | | Permission needed | Not used | |
| IAEA | | Cleared for website content, with acknowledgement | Not used: nothing for households found | |
| Local-authority REPPIR public information (Portsmouth's 2024 residents' booklet, Oxfordshire's Culham leaflet; Kent's Dungeness leaflet refused, Gloucestershire's page not found) | | No licence statement in the documents read | Not used | A question asks the household to ask its council |
| UKHSA, [Nuclear emergencies: information for the public](https://www.gov.uk/government/publications/nuclear-emergencies-information-for-the-public/nuclear-emergencies-information-for-the-public) | Updated 28 September 2026 | GOV.UK, OGL v3.0 | Read; not quoted (background for councils) | |

**Ready.gov and FEMA, read again.** Ready.gov's footer links "Website Information" to
FEMA's page. It refused a direct request (HTTP 403) on 15 and 16 November, when its text
was read from the Internet Archive's copy of 7 August 2026; on 17 November 2026 it
answered Outpost's own client and was read directly (`docs/sources.md`, source 8), with
the same words: "Most material on FEMA.gov is
free of copyright and may be copied and distributed without permission", and "In
addition to this fema.gov website, FEMA also owns and manages these these .gov domains"
(Ready.gov among them); last updated 1 May 2023. It names FEMA.gov, and says "most", so
the verdict already recorded (not cleared) stands.

**For the household to decide** (the template's questions): which room is nearest the
middle of the home; which building near school, work or a usual route someone would go
into; what the children's school or nursery will do; which radio station, and who keeps
the radio; whether the household lives or works near a nuclear site (ask the council);
and, since the UK guidance read is for radiation emergencies such as an incident at a
nuclear site and says nothing of a nuclear explosion's blast, heat or flash, what if
anything the household would do differently.

## Tests

- `apps/server/test/nuclear-effects.test.ts`: the model against the book (above).
- `apps/server/test/nuclear-scenarios.test.ts`: saved scenarios kept as typed, refused
  with the model's reason, a change from an older copy refused with nothing changed,
  counted and erased.
- `apps/server/test/nuclear-final.test.ts`: sets saved, reopened, refused past six or
  with a letter twice; no total in what is stored or answered; a scenario linked to a
  plan, named, missing once deleted, steps unchanged; the radiation template's sources
  and verdicts; historical records listed by period and kind; a WorldPop grid imported
  from a file, refused under the wrong country's name; the cell size; a circle over the
  grid's edge counted in part.
- `apps/server/test/emergency-plans-templates.test.ts` (existing): every quoted line's
  publisher is cleared, pointers quote nothing.
- `apps/web/src/features/nuclear/`: `population-words.test.ts` (the wording, rounding,
  partial and missing grids, small rings, the fallout pattern, no word of harm);
  `fallout.test.ts` (the state line in each case, compass points with from and towards,
  the map's fit); `wind.test.ts` (the forecast offered and not); `colour.test.ts` (one
  hue per kind, from tokens, never a status colour, on the map, in the legend and in
  the PDF; stronger levels more opaque; the selected scenario full, the others quiet);
  `nuclear-page.test.tsx` (up to six scenarios and the limit; select, hide, remove;
  people per ring of the selected scenario only, and no total; the layers, records and
  plans tabs; a scenario changed elsewhere, kept or loaded; a scenario attached to a
  plan changed in between); `geometry.test.ts`, `form.test.ts`; `print-frames.test.ts` (the PDF's
  map frames: rings only, rings and pattern, far-apart scenarios, 70° N, across the
  antimeridian); `print-maps.test.ts` (a picture for each scenario, an overview only for
  several, places only when chosen, no reference layer in the style, no region, a device
  that cannot draw); `pdf-export.test.tsx` (nothing drawn before the press, progress,
  Stop, "Add to library" asks with places).
- End to end, internet blocked: `nuclear-acceptance.spec.ts` and
  `nuclear-acceptance.mobile.spec.ts` (the acceptance sentence: a country pack from
  fixtures, a public record and its source, a historical record and its document, a
  scenario with people inside its rings, a plan from the template with the scenario
  attached, found again; three scenarios at phone width saved as a set and opened again;
  the key and wind field at 320 px with the text at 150 per cent); `nuclear.spec.ts`,
  `nuclear.mobile.spec.ts`; `nuclear-pdf.spec.ts` and `nuclear-pdf.mobile.spec.ts` (the
  PDF with maps over the test map: one scenario with a pattern and three, pages and
  pictures, the same bytes twice, places and the question, no region, the controls at
  320 px).

## What is not built, and why

- **Casualty figures of any kind**, and any figure across scenarios: ruled out (above).
- **Counting or listing reference-layer features inside a ring**: ruled out (above).
- **Wind aloft**: no offline source of upper winds; the surface forecast is offered with
  why it is not the same.
- **The PDF does not carry the people counts**, nor the reference layers on its maps;
  the plan's picture is drawn without a base map.
- **A plan holds single saved scenarios**, not sets, as illustrations.
- **Not run on a Raspberry Pi**, and not tried on a real phone (Chromium at 390 and
  320 px). The palette over imagery was measured against three sample tones, not
  imagery of every kind of ground.
- **Historical records**: none ship (see reference-layers.md); the browser lists what a
  person imports.

Routes are in [api.md](api.md#nuclear-preparedness) and [api.md](api.md#reference-layers).
