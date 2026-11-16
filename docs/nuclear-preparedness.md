# Nuclear preparedness

Preparedness → Nuclear preparedness (`/prepare/nuclear`) is a workspace over the
offline map for civil preparedness and education, built only from public, published
information. This page is the plan for the whole module, then the account of what is
built: the workspace and the educational effects simulator.

The module is about **effects, preparedness and published history**: what a detonation
of a stated size does at a distance, where published sources say things are, and what
official bodies advise people to do. It never covers how weapons are designed, built,
obtained or delivered. It keeps historical targets, known infrastructure and
hypothetical scenarios as separate categories, never presents a speculative target as
confirmed, predicts no attack plans, assigns no probabilities to places, produces no
ranked list of likely targets (nor any sort or filter that would make one), and never
classifies modern infrastructure as a future target. Scenario results are educational
estimates, not emergency forecasts or instructions.

## What exists, and what the module reuses

| Need | What Outpost already has | Used how |
| --- | --- | --- |
| Map engine, style, installed regions | `features/maps/map/engine.ts` (MapLibre), `lib/style.ts`, PMTiles regions served by `modules/maps/pmtiles` and `tile-server.ts` | The workspace embeds `features/propagation/map/plan-map.tsx`, the map the HF planner sets into a screen: same style, regions and furniture, one overlay source of its own (`o-nuclear`, registered in `map/overlays.ts`). Two optional props were added to it: `satellite` and `fitMaxZoom`. |
| Satellite imagery | `modules/maps/imagery`, `features/maps/imagery` | Drawn under the rings when the person switches it on and some is installed, with its credits. |
| Things over a map on a phone | `map-furniture.tsx`, the rule in `docs/development/web-screens.md` | The workspace puts nothing over the map but PlanMap's own column; on a phone the panel follows the map on the page. |
| Saved places | `markers` (the Maps screen's places, with icons) | Shown on the workspace map and measured against a scenario. |
| Own data rules | migrations, `modules/manage` (erase everything), `modules/database/inspect.ts` | Scenarios: migration `0016_nuclear_scenarios`, counted and erased like the radio data. |
| Downloads, catalogue, storage | `modules/downloads` (resumable, checksummed jobs), `modules/catalog` (manifests with licence and size), `modules/storage` (locations on local disks, drives and NAS, `resolveInside`) | The later dataset manager is built on these rather than beside them (see the plan). |
| Search | `modules/search` (`addSource` for many small records) | Historical records and infrastructure become a search source of their own, as repeaters are. |
| PDFs made in Outpost | `features/library/made/`, `features/maps/print/pdf.ts`, `features/propagation/plans/document.ts` | A scenario is written out as PDF and Markdown with the same buttons as everywhere else. |

## The plan, in milestones

Each milestone works on its own. The numbers in brackets are the specification's
sections.

1. **Workspace and effects simulator** (§§ 4, 9, part of 10; this version). Done: see
   below.
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

What each later sitting should take: the second, milestones 2 to 5; the third,
milestone 6; each also its share of 7.

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

Affected population is **not estimated**: it needs population data (milestone 5). The
screen says so; nothing is estimated from anything invented.

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
plume geometry for the map, about 2 ms per scenario. It runs on every keystroke. It has
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

- **Layout.** On a wide screen the map with the panel beside it (Scenario, Saved,
  Layers), which can be put away; on a phone the map first and the panel after it on
  the page. A line under the title says, always, that the screen works from this device,
  and whether an offline map region is installed.
- **On the map.** Each ring is a circle on the ground with its scenario letter, level
  and rounded distance written along it; blast solid, burns long dashes, radiation
  dots, fireball and crater thin. The fallout plume is its own layer. Two scenarios
  (A, the one being edited, and B, a saved one chosen to compare) are told apart by the
  letter on every ring and at each ground zero, and by colour as a second cue.
- **Provenance.** Five classes, each with an icon, a word and its own edge, so that they
  are told apart without colour: verified public infrastructure (solid), historical
  documentation (double), modelled effects (dashed), made by you (shaded), unverified or
  speculative (dotted). Only modelled effects and made by you have anything in them in
  this version; the key in the Layers tab says the others are empty.
- **Saved places** (the Maps screen's places) are shown on the map and listed with their
  distance from ground zero and, in plain words, the rings and fallout contours they are
  inside. Nothing more.
- **Saved scenarios** keep only what was typed (`nuclear_scenarios`, migration 0016);
  the effects are worked out again when one is opened. They are counted under Storage →
  Database ("saved nuclear effects scenarios"), are in backups, and go with "erase
  everything".
- **On paper.** A PDF (Save as PDF, Add to library, Share) and Markdown with every
  figure, what each level means, the notes, the assumptions, limitations and source;
  both scenarios when comparing.

Routes are in [api.md](api.md#nuclear-preparedness).
