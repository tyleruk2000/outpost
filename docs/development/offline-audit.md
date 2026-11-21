# Offline audit of every screen

What each screen needs that may not be on the device, what it says when that is missing,
and what happens with the internet off. Screens are those in `apps/web/src/components/nav.ts`
and the Tools, Prepare and Games registries. Audited 21 November 2026; keep it current when
a screen gains something it needs from outside.

The rules every screen is held to: say plainly what is missing and why, with a button or
link to get it and its size; never hang, spin for ever or show a raw error with the network
off; and fetch nothing from the internet without a press.

## What holds for every screen

- **The browser loads nothing from the internet.** The content security policy is
  `default-src 'self'`; fonts, map glyphs and sprites are local. Links out are plain links.
- **Every outbound request has a time limit.** Through `core/http.ts` (connect 15 s,
  headers 30 s, body 60 s) or a call site's own; the embedding server call now has 120 s
  even when a search passes its own signal.
- **A failed fetch is said in words.** A background job that fails for want of a network
  stores "The site this needs could not be reached: this computer has no internet
  connection, or the site is down…" (`networkSentence`, `core/errors.ts`), not undici's
  "fetch failed". The browser's own failure reads "The Outpost server is not responding".
- **Nothing is fetched at start or on a timer for a new purpose.** Two things carry on
  an earlier press with nobody pressing: a job left unfinished at shutdown (a download, a
  layer import, the P.533 build) resumes on start, and a failed job is retried on a
  back-off. Weather can refresh on opening only if its "also update when I open this
  screen" box is ticked (off by default).

## Screens

| Screen | Needs from outside | When missing | Network off | Fetch without a press |
| --- | --- | --- | --- | --- |
| Home | nothing | links to Explore | local | no |
| Search | search by meaning (optional), installed collections | "Search by meaning is not set up…" with **Set up search by meaning** (fixed: had no link) | a part that fails is named in words, the rest shown (fixed: showed the raw error) | no |
| Library, learning panel | collections, OCR languages beyond English | "No collections installed yet" with Explore and Download maps | local | no |
| Maps | map regions, terrain, place names, layers, imagery | "No detailed maps on this device yet" with **Choose your area** / **World overview (about 45 MB)**; "Place names are not installed" with **Add place names**; terrain lines link to **Get terrain in Offline maps** (fixed: route profile and relay had no link) | estimate or start for a region or terrain says "Outpost could not reach the map source…" (fixed: was a generic server error) | no |
| Explore | catalogue refresh | "The catalogue was not refreshed: there is no connection…" and the last list still works | good | no |
| Chat | a language model on this machine or network | "Chat needs a language model…" with the size and Set-up guide | "The model server is not answering" with Look again | lists models on opening, from the model server on this machine or network only |
| Contacts, Messages, Encryption | nothing | — | local | no |
| Radio, Morse, Frequencies, Licences | shipped with Outpost | — | local | no |
| HF propagation, coverage, log, plans | VOACAP data, solar table, optional P.533 engine and maps | each missing piece named with **Download (size)**, "fetched once, when you press this" | a failed P.533 build says the site could not be reached (fixed: "fetch failed") | no |
| Repeaters | lists, by file or a fetch the publisher allows | "No repeaters yet" and where lists come from | worded, with a time limit | no |
| Satellites | CelesTrak elements, SatNOGS transmitters | "No orbital elements yet" with **Get orbital elements** (about 4 MB) | "There is no connection to it" / "It did not answer in time" (fixed: a timeout showed the raw text) | no |
| Heard on the radio | a receiver on the network | "No receiver yet" | local | no |
| Tools: Tide times | tidal constants, shipped | no station within 100 km: "No tide data for the coast near …", the nearest station and its distance, what to do, and that nothing needs downloading (fixed: offered Maine to a home in London) | local | no |
| Tools: Devices on this network | the IEEE registry of makers | **Fetch the registry from the IEEE** with its size and that it needs the internet | a failed fetch is shown under the button (fixed: it vanished without a word) | no |
| Tools: Power | optional weather figures | press to fetch | worded as Weather | no |
| Other tools (Water, Outdoors, Radio calculations, Building, Cooking, Rations, QR, Solar clock, Compass, Night sky, Celestial navigation, Garden) | nothing | — | local | no |
| Prepare: Weather and hazards | forecasts and warnings | "Choose a place for forecasts" | "{publisher} could not be reached. Check the connection and try again." | only if the person ticked "update when I open" |
| Prepare: Nuclear | population grid, map region | grid: **Get reference data**; map: **Add your area in Offline maps** with the overview's size (fixed: had no link or size) | local | no |
| Other Prepare screens, Games | nothing | — | local | no |
| Downloads | — | — | "Waiting for a connection"; resumes when the network is back | resumes after a restart |
| Storage (portable drive) | the Node runtime and kiwix-tools for other systems | — | a failed fetch is worded (fixed: "fetch failed") | no |
| Settings, Updates | release manifest; model and embedding servers | "Needs the internet. Outpost asks only when you press" | "The release page could not be reached…" (fixed: "fetch failed", and a generic error from Download) | no |
| Server status, Help, Set-up guide, On this device | nothing | — | local | no |

## Not checked

The wording of OCR's reasons, the empty states of On this device and Storage, the model
size line in the model set-up, and the error sentences of imagery, OS Names and route
finding (each does classify network errors).
