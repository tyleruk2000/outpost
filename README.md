# Outpost

**Knowledge beyond the network.**

Outpost is a self-hosted, offline-first knowledge and preparedness app. One program, on a
laptop, a home server, a NAS or a Raspberry Pi, holds an offline encyclopedia, your own
documents and notes, offline maps and road routes, contacts, a household message board,
radio planning tools, calculators, and each household's emergency plans, supplies and
printed book, behind one search box.
You choose what to download while you have a connection; after that, everything you kept
works with the network cable pulled out. Phones and other computers on your home network
use it in their browser.

**What it is not:**

- **Not a cloud service.** It runs on a computer you own. No telemetry, no analytics.
- **Not an account system.** There is no sign-in: everyone who can reach it can read and
  change everything, so it is for one person or a household on a network they trust.
- **Not an emergency service.** Its plans, calculators, forecasts and simulator are
  general information; its board and mesh radio are not a way to call for help. In an
  emergency, follow the emergency services and official warnings.
- **Not chatty.** Nothing leaves the machine except as the direct result of a press (see
  [offline.md](docs/offline.md)).

Outpost is open source under the [MIT Licence](LICENSE). It is version 0.1.0, not yet
released, and has been tried by hand on one kind of computer (a Mac with Apple Silicon).
[What has not been tried](docs/testing-status.md) lists the rest, by feature.

![Home](docs/screenshots/home.webp)

*Home, with made-up demonstration data, as are all the pictures here.*

## Features

Each guide, also inside Outpost under **Help**, says what a feature does and does not do.

### Home and search

| Feature | What it does |
| --- | --- |
| Home | What is in the library, free space, the emergency plan, how long food and water last, and anything new on the board. |
| [One search](docs/search.md) | One ranked list from documents, notes, reference archives, places, contacts, plans and supplies, each with the reason it was found; other spellings are searched too, and a typo gets "did you mean". |
| [Quick search](docs/search.md) | Ctrl or Cmd + K finds screens, settings and guide sections by name or everyday words. |
| [Search by meaning and OCR](docs/search.md) | One switch, and the model that comes with Outpost finds passages saying the same thing in other words. Scanned pages are read in English. Two pages explain each step with diagrams. |

![Search results, each with the reason it was found](docs/screenshots/search-reasons.webp)

![How search by meaning works](docs/screenshots/how-meaning-works.webp)

### Library, collections and the reader

| Feature | What it does |
| --- | --- |
| [Your documents](docs/library.md) | PDFs, EPUBs, Markdown, HTML, text and images, indexed by page, originals untouched. |
| [Audiobooks](docs/library.md) | A zip of chapters becomes one book with speed control; each device keeps its place. |
| [Save a web page](docs/notes-and-imports.md) | Keep a readable copy of an article from its address. |
| [Explore and packs](docs/sources.md) | A catalogue of 432 entries (Kiwix archives and official handbooks) in 24 packs, among them a survival guide and climbing and mountains, browsable offline; each states its size and licence first ([format](catalog/README.md)). |
| [Reference collections](docs/architecture.md) | ZIM archives (Wikipedia and the like) read in the app through kiwix-serve behind a sandboxing proxy. |
| [Learning progress](docs/learning.md) | Where each learner got to in a course archive such as Khan Academy. |
| [Included with Outpost](docs/radio.md) | Nine radio reference sheets compiled from regulators' documents, and sixteen LogBook73 radio books. No download needed. |

![A shipped radio reference sheet in the reader](docs/screenshots/reader.webp)

### Maps

| Feature | What it does |
| --- | --- |
| [Offline maps](docs/maps.md) | Download a country, one of 188 ready-made regions or a box you draw, with the exact size shown first, and view it with no connection. |
| [Terrain and contours](docs/maps.md) | An optional terrain download adds hill shading, contour lines and the height of the ground, in metres or feet. |
| [Places and routes](docs/maps.md) | Saved places; routes drawn with distance, ascent and profile; GPX, KML, KMZ and GeoJSON in, GPX out. |
| [Road routes](docs/road-routes.md) | A drive planned on this device from road networks you install by country, written as you would write it down: the road, the place on the signs, the junctions, with the ferry or tunnel. A printable route card and a short plain-text copy. |
| [Find and record routes](docs/map-routes.md) | Look a named route up in OpenStreetMap (only when you search), or record where you walk while the screen is on, over `https`. |
| [Coordinates and place search](docs/maps.md) | Grid references, UTM, MGRS and Maidenhead; offline place names, and every British postcode. |
| [Sun, grey line, line of sight](docs/maps.md) | Sunrise and twilight for any place, day and night over the map, and whether two points can see each other over the terrain. |
| [Satellite imagery](docs/maps.md) | The world from NASA's Blue Marble, 10 m Sentinel-2 for an area, and aerial photographs for New Zealand and the US. |
| [Reference layers](docs/reference-layers.md) | Published data for the map (boundaries, airports, shelters, population, flood zones), each with its source and licence. |
| [Food and supplies](docs/reference-layers.md) | Shops, food banks, water, fuel and pharmacies from OpenStreetMap (and in the UK the Food Standards Agency), with the nearest of each to home worked out offline. |
| [Printing](docs/maps.md) | A one-page PDF map at a stated scale, made on your device. |

![The map with places and a route](docs/screenshots/maps.webp)

![A road route from Leatherhead to Chamonix, with its directions](docs/screenshots/road-route.webp)

<img src="docs/screenshots/route-card.webp" width="420" alt="The printable route card">

*The road networks here are made-up extracts shaped like the main roads, not OpenStreetMap's.*

### Notes

| Feature | What it does |
| --- | --- |
| [Notes](docs/notes-and-imports.md) | A page tree and block editor with links between pages, templates and Markdown export. |
| [Import files](docs/notes-and-imports.md) | Brings in Markdown, HTML and Notion exports, saying first what will be made and what left alone. |
| [Encrypted pages](docs/encryption.md) | A page can be encrypted with an OpenPGP key, so it is ciphertext wherever it is copied. |

![The notes editor, in the dark theme](docs/screenshots/notes-dark.webp)

### Chat and answers from the library

| Feature | What it does |
| --- | --- |
| [Answer from my library](docs/ai.md) | With a language model you run yourself (Ollama, llama.cpp or LM Studio), search writes a short answer from your documents with a citation after each statement. Outpost includes and downloads no model; the [set-up guide](docs/setup-guide.md) gets one running. |
| [Chat](docs/ai.md) | Conversations with the same model, kept on your Outpost and readable by everyone who can open it. |
| [Looking things up](docs/ai.md) | Off by default: a model in Chat can read places, supplies, plans, weather and the library, and shows what it looked at. |
| [Which model](docs/which-model.md) | Seven small models measured on one Mac, with a recommendation shown where a model is chosen. |
| [Tools for other programs (MCP)](docs/mcp.md) | The same read-only tools at `/mcp` for programs on the home network; off by default and switched on only at the computer Outpost runs on. |

![A Chat reply showing what it looked at](docs/screenshots/chat-looked-at.webp)

*The reply is from the test suite's stand-in model server, not a language model.*

### Contacts, messages and encryption

| Feature | What it does |
| --- | --- |
| [Contacts](docs/contacts.md) | People to reach when the phone network is down, with a one-page emergency list; vCard in, and a read-only CardDAV copy for a phone. |
| [The household board](docs/messages.md) | Messages, check-ins and files between devices on the home network, with no internet; anyone on it can post under any name. |
| [Mesh radio](docs/mesh-radio.md) | The board reaches beyond the Wi-Fi through a LoRa radio running Meshtastic or MeshCore. |
| [OpenPGP](docs/encryption.md) | Make keys, encrypt and sign text and files, and encrypt pages, in the browser; checked against GnuPG but not audited. |
| [Ciphers by hand](docs/encryption.md) | Classical pencil-and-paper ciphers with printable pads, for interest; they protect nothing from a computer. |

<img src="docs/screenshots/phone-messages.webp" width="320" alt="The household board on a phone">

### Radio

| Feature | What it does |
| --- | --- |
| [HF propagation](docs/hf-propagation.md) | How often a shortwave path gets through, hour by hour and band by band, for your equipment, by VOACAP on your computer. A monthly median for planning, not today's conditions. |
| [A second model](docs/hf-propagation.md) | Optionally runs the ITU's P.533 beside VOACAP and states where they differ; you build its engine yourself. |
| [Coverage, plans and log](docs/hf-propagation.md) | Where one transmitter is heard as a map layer, which band serves each pair of stations at each hour, and a contact log set beside the prediction. |
| [Repeaters](docs/radio.md) | Repeaters from a file, by hand or from publishers whose terms allow it, on the map with an estimated line-of-sight range. |
| [Heard on the radio](docs/heard-on-the-radio.md) | APRS stations, aircraft and ships your own receivers decode, on the map and in a list; listening only. |
| [Satellites](docs/satellites.md) | When amateur, weather and crewed satellites pass over and what to tune to through a pass, worked out on the device, with what each satellite is. |
| [Morse trainer](docs/morse-trainer.md) | Learn by ear with the Koch method, send on screen, keyboard or a real key, and practise a contact. |
| [Frequencies to listen to](docs/radio-frequencies.md) | Time signals, broadcasters, weather, distress channels and emergency nets by country, each with its source and the day it was checked. |
| [What needs a licence](docs/radio-licences.md) | What you may listen to and send on in the UK and the US, from the regulators' own documents. |

![An HF prediction from London to Birmingham on 40 m](docs/screenshots/propagation.webp)

### Tools

Every calculator answers as you type and shows, under **How this is worked out**, its
formula, its source with the date read, and the range it holds for.

| Feature | What it does |
| --- | --- |
| [Water](docs/tools.md) | Water to store by the UK, CDC, Ready.gov or WHO figure, rain from a roof, filter life, and making water safe to drink. |
| [Outdoors](docs/tools.md) | Walking time by Naismith's rule, gradient, bearing, wind chill and heat index. |
| [Radio calculators](docs/tools.md) | Antenna lengths, path loss, radio horizon, cable loss, dBm and S-units. |
| [Building and cooking](docs/tools.md) | Concrete, roof pitch, heat loss; roasting times, safe temperatures and recipe scaling. |
| [Power and batteries](docs/tools-power.md) | How long a battery bank or a power station runs your devices, from makers' published figures; the bank drawn as it is wired in series and parallel; solar, cable and generator calculators and saved power plans. |
| [Compass](docs/tools-compass.md) | Magnetic and grid north from true north at a place (World Magnetic Model 2025), and a live compass on a phone over `https`. |
| [Solar clock](docs/tools-solar-clock.md) | The sun's position, setting a clock from a shadow after a power cut, and a sundial and nocturnal to print. |
| [Night sky](docs/night-sky.md) | The Moon's phase and times, a star chart for a place and time, and finding north by the stars. |
| [Celestial navigation](docs/celestial-navigation.md) | A position from sextant sights with the almanac worked out on the device; for learning and as a fallback, not for navigating a vessel. |
| [Tide times](docs/tides.md) | High and low water at stations within 100 km, worldwide, from NOAA's and TICON-4's constants; not for navigation. |
| [Garden](docs/garden.md) | What to sow, plant and harvest this month in the UK from the RHS calendar, and a record of sowings. |
| [QR codes and devices on this network](docs/tools-qr-and-network.md) | Make QR codes on the device, and list what answers on the local network. |

![A power plan's battery bank, drawn as it is wired](docs/screenshots/power-bank.webp)

### Preparedness

| Feature | What it does |
| --- | --- |
| [Households](docs/households.md) | One household or several, fixed or on the move (a caravan says where it is now): each with its own people, supplies, plans and papers, chosen from the sidebar. |
| [Emergency plans](docs/emergency-plans.md) | Plans for a power cut, flood, severe weather, sheltering or leaving, from templates that say whose guidance each step is; **Use now** shows them in large type, and cards print as PDF. |
| [Household papers](docs/household-papers.md) | A medical sheet for each person, the communication plan, grab cards and one PDF binder. Records only, no medical advice. |
| [Household book](docs/household-book.md) | A few questions, then a printable emergency book made from the answers and what Outpost holds: first minutes, people, help near home, first aid, water, journeys, the radio plan and the repeaters round each place with a map of the ground each reaches. |
| [Check-ins, log, checks, drill](docs/readiness.md) | "I'm safe" in one press with a roll call, a log of events, routine checks with what is overdue, and an offline drill. |
| [Supplies](docs/supplies.md) | Food, water and kit at home: how many days they last for your household, what to use first, and what to buy; food energy from USDA FoodData Central, shipped. |
| [Weather and hazards](docs/weather.md) | Forecasts; national warnings (UK, MeteoAlarm in Europe, US, Canada, New Zealand, Japan); climate averages; England's river levels; all fetched on a press. A barometer log. |
| [Nuclear preparedness](docs/nuclear-preparedness.md) | An educational workspace: an effects simulator from Glasstone and Dolan's published model, reference layers and a radiation emergency plan. Estimates for an idealised case, never targets or casualty figures. |

![Two households: a home, and a caravan that moves](docs/screenshots/households.webp)

![An emergency plan's steps, each with its source](docs/screenshots/emergency-plan.webp)

<img src="docs/screenshots/book-repeaters.webp" width="520" alt="The household book's page of repeaters round home">

### Games

| Feature | What it does |
| --- | --- |
| [Allotment and Steading](docs/games.md) | A household plot that grows in real British months, and a settlement of workshops, belts and power on a land you choose; nothing is lost while you are away. |
| [Cards and puzzles](docs/games.md) | Solitaire, peg solitaire, Sudoku, Pairs and Snake. |
| [Draughts and chess](docs/games.md) | Against the computer or two at one device; chess reads and writes PGN and FEN. |
| [Skerry](docs/games.md) | Twelve puzzles solved at a pretend terminal that teach files, searching and pipes. |

### Looking after it

| Feature | What it does |
| --- | --- |
| [Downloads and tasks](docs/downloads-and-tasks.md) | Every download and every task Outpost works on in one place, each with a page of its own: progress, rate, time left and what happened; downloads resumable, retried and checksummed. |
| [Storage](docs/storage.md) | Disks, USB drives and NAS shares as storage locations; collections move between them with verification. |
| [Manage and clean up](docs/storage.md) | Everything installed in one list; each removal says first whether it can be undone. |
| [Backups](docs/storage.md#backing-up) | The database, attachments and text to a file, by hand or on a schedule, optionally encrypted. |
| [Portable drives](docs/portable.md) | A USB drive that runs Outpost on another computer with nothing installed, and brings back what was written on it. |
| [On this phone](docs/offline.md) | Over HTTPS the app, chosen notes, routes, map areas and plans stay on a phone to read away from the server. |
| [HTTPS on your network](docs/deployment.md#https-on-your-network) | An `https` address with no domain and no internet, from a certificate Outpost makes or one of your own. |
| [Server status and updates](docs/device.md) | The server's health, clock and `outpost.local`; updates from the app or a USB stick. |

![The page of one task: what it was, how it ended and what happened](docs/screenshots/task-page.webp)

## Install and run

Every way to install, and every setting, is in [deployment.md](docs/deployment.md).

### With Docker Compose

You need Docker with the Compose plugin. The build needs the internet; no image is
published.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
cp .env.example .env
docker compose up -d --build
```

Open <http://localhost:8080>. While you still have the internet, fetch VOACAP's data so
the HF planner works offline (559 kB):

```bash
docker compose exec outpost node /app/scripts/fetch-voacap-data.mjs --data-dir /data
```

It answers only on its own computer. To let other devices on your network in, read
[deployment.md](docs/deployment.md), set these in `.env` and run `docker compose up -d`:

```ini
OUTPOST_LAN_ACCESS=true
OUTPOST_BIND=0.0.0.0
```

### From source

You need Node.js 26 or newer and pnpm 9.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
pnpm install
node scripts/fetch-map-assets.mjs        # map fonts and icons, once
node scripts/fetch-embedding-model.mjs   # search-by-meaning model (24 MB), once
pnpm build
node scripts/fetch-voacap-data.mjs --data-dir apps/server/data   # optional HF data
pnpm start
```

Open <http://localhost:8080>. `pnpm start` does not read `.env`: set `OUTPOST_DATA_DIR`,
`OUTPOST_STORAGE_ROOTS` and, for LAN access, `OUTPOST_HOST=0.0.0.0` with
`OUTPOST_LAN_ACCESS=true` in the shell. Reference collections need kiwix-serve beside it.

The packaged app (`node scripts/build-app.mjs`, a folder that runs with only Node 26) is
described in [deployment.md](docs/deployment.md).

### On a Raspberry Pi

A 64-bit operating system is required; 4 GB of memory is enough for keyword search,
reading, notes and maps. [deployment.md](docs/deployment.md) walks from a Pi in its box to
Outpost open on a phone. The scripts in `deploy/pi/` install it, connect a NAS folder, and
turn the Pi into a Wi-Fi hotspot for use with no router. Run each with `--dry-run` first
and expect to adjust them.

```bash
./deploy/pi/install.sh --dry-run
./deploy/pi/install.sh --install-docker --lan --https   # needs the internet this once
sudo ./deploy/pi/hotspot.sh on --ssid "Outpost"
```

Back up before updating (**Settings → Backup**).

## What needs a download or a build first

Outpost ships its code, catalogue, reference sheets and radio books, the frequencies to
listen to, USDA FoodData Central's energy table, the World Magnetic Model and NOAA's tide
constants. Everything else is fetched only on a press or a set-up line, and states its
size first:

| What | Size, and why it is not bundled |
| --- | --- |
| [Map regions and terrain](docs/maps.md) | Shown before the download (a box of up to 60 GB); OpenStreetMap data for the area you choose |
| [Road networks](docs/road-routes.md) | About 1–2% of a Geofabrik extract (Great Britain's 2.2 GB makes 30 MB); OpenStreetMap data for the countries you drive through |
| [Place names](docs/maps.md) | A GeoNames dataset; for Great Britain OS Open Names, 103 MB |
| [Reference collections](docs/sources.md) | A few megabytes to many gigabytes, each under its publisher's licence |
| [VOACAP's data](docs/hf-propagation.md) | 559 kB; the ITU has not given permission to pass it on |
| [The second HF model](docs/hf-propagation.md) | Built on your computer with Docker, plus 137 MB of maps; under no open licence |
| [Satellite imagery and aerial photographs](docs/maps.md) | The world at 2 km: 256 MB fetched, 15.5 MB kept; Sentinel-2 about 16 MB per 100 km² |
| [Reference data, food and supplies](docs/reference-layers.md) | Stated per item; a Geofabrik extract runs from 1.95 MB (Rutland) to 1.72 GB (England) |
| [Audiobooks](docs/library.md) | Downloaded by your browser from LibriVox's links |
| [A model server](docs/setup-guide.md) | Several gigabytes a model; your choice, Outpost includes none |
| [The device-maker registry](docs/tools-qr-and-network.md) | About 3.9 MB; the IEEE states no permission to pass it on |
| [Map fonts, icons, search model](docs/deployment.md) | The model is 24 MB; fetched once at build time |

## Privacy and security in brief

The full threat model is in [security.md](docs/security.md).

- **No accounts.** Whoever can reach Outpost can read and change everything; a household
  PIN limits changes to devices unlocked with it, but is no defence against someone
  determined. By default only the computer it runs on can reach it. Turn LAN access on
  only on a network where you trust everyone, and never expose it to the internet
  without a proxy that asks people to sign in.
- **Some things only the computer itself may do**: erasing everything, restoring a
  backup, changing the backup passphrase or certificates, and setting up the mesh radio
  or MCP (unless started with `OUTPOST_ALLOW_REMOTE_ERASE=true` or
  `OUTPOST_ALLOW_REMOTE_SETTINGS=true`).
- **Every outbound request follows a press**, except three a person set up earlier (an
  embedding server, a remembered network share, the mesh radio's link). No telemetry,
  CDN or remote fonts, and downloads cannot be pointed inside your network.
- **Your model, your address.** Answers and Chat send your question and passages of your
  library only to the model server you set; while MCP is on, any program on the network
  that speaks it can read what the tools read.
- **The board and the mesh radio** are readable by everyone on the network or the
  channel; the MQTT broker speaks plain TCP.
- **Nothing is encrypted at rest** except private keys, what you encrypt, and backups
  with a passphrase. Use encrypted drives for anything that leaves the house.

Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Data sources and licences

Every source and its terms, in its publisher's words, are in [sources.md](docs/sources.md).

| Source | Licence or terms |
| --- | --- |
| OpenStreetMap (maps, routes, road networks, layers, food and supplies) | ODbL |
| Ordnance Survey OS Open Names; Environment Agency; Food Standards Agency | OGL v3.0 |
| Mapterhorn (terrain) | Various open licences ([attribution](https://mapterhorn.com/attribution)) |
| GeoNames; Natural Earth | CC BY 4.0; public domain |
| Kiwix archives; kiwix-serve | Each archive its own; GPL-3.0, run as a separate program |
| Official publishers in the catalogue (CDC, FEMA, UK government, WHO and others) | Each its own, stated on each entry |
| NASA Blue Marble; Copernicus Sentinel-2; LINZ; USDA NAIP | Credit to NASA; free, full and open; CC BY 4.0; public domain |
| VOACAP via hfcast-engine; ITU-R ITURHFProp | Apache-2.0, coefficients not shipped; no open licence, nothing shipped |
| Open-Meteo; Met Office; NASA POWER; PVGIS | CC BY 4.0; Crown copyright; credit to NASA; credit to the JRC |
| OurAirports; Wikidata; WorldPop; BABS | Public domain; CC0; CC BY 4.0; open use with source |
| USDA FoodData Central; World Magnetic Model 2025; NOAA tide constants (shipped) | CC0; public domain; public domain |
| TICON-4 tide constants, DGFI-TUM (shipped) | CC BY 4.0 |
| Frequencies, the RHS's growing months | Facts, each page named and dated |
| Emergency plan templates (UK Government and others) | OGL v3 and others, quoted where allowed |
| Glasstone and Dolan, *The Effects of Nuclear Weapons* (1977) | A US Government work |

Outpost and its reference sheets are under the [MIT Licence](LICENSE); the LogBook73 radio
books under that project's MIT licence. Dependencies' licences are in
[architecture.md](docs/architecture.md) and `THIRD-PARTY-LICENSES.txt`; OpenPGP.js
(LGPL-3.0) ships as a separate file. Typefaces: Atkinson Hyperlegible and Literata (SIL
Open Font Licence).

SPOOLTENNA is a trade mark of Panther Creek Solutions LLC, named only to say which
antenna is meant. QR Code is a registered trademark of DENSO WAVE INCORPORATED.

Projects that showed the way (no code taken): Internet-in-a-Box, PrepperPi, Offgrid Pi,
Paperless-ngx, Organic Maps.

## Developing and contributing

Code, catalogue entries and documentation are welcome: start with
[CONTRIBUTING.md](CONTRIBUTING.md), which has the checks to run (there is no continuous
integration). The README pictures are made again with
`cd e2e && pnpm exec playwright test -c readme-screenshots.config.ts` after
`node scripts/build-app.mjs`.

## Documentation

Every page is also inside Outpost, under **Help**. Besides the guides linked above:
[Deployment](docs/deployment.md), [Troubleshooting](docs/troubleshooting.md),
[Security](docs/security.md), [Offline use](docs/offline.md),
[Map quick start](docs/map-quick-start.md), [Radio quick start](docs/radio-quick-start.md),
[What has not been tried](docs/testing-status.md), and for developers
[Architecture](docs/architecture.md), [API](docs/api.md),
[Server modules](docs/development/server-modules.md),
[Web screens](docs/development/web-screens.md), [Design quality](docs/development/design-quality.md)
and [Releases](docs/development/releases.md).
