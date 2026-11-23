# Working offline

"Offline" means the Outpost server has no route to the internet. Your browser still
reaches the server, on the same computer or over your own network. A phone carried away
from home that cannot reach the server at all is **out of reach**; see
[A phone out of reach of the server](#a-phone-out-of-reach-of-the-server).

## What works with no internet

Everything already installed or written, including:

- reading and searching documents, notes, saved web pages and installed reference
  collections, including the PDFs and e-books inside a collection;
- keyword search, and search by meaning once its index is built ([search.md](search.md));
- answers and chat, if the model server runs on your own machine or network ([ai.md](ai.md));
- writing notes, uploading documents, importing files;
- installed map regions, place search, markers, routes, GPX import and export;
- moving and checking collections, backup and restore;
- writing a portable drive, once its programs are cached (below);
- the frequency list, the Morse trainer, the Solar clock and the games;
- tide times: constants for about 4,100 stations worldwide come with Outpost; where none
  is within 100 km the screen says so;
- the household board in Messages (on the home network only; it does not wake a locked
  phone);
- Help. A link to another guide stays inside Outpost; a link marked with an arrow
  needs the internet.

The app's scripts, fonts, map lettering and icons are all served by Outpost itself.

## What needs a connection

Only actions that fetch something new, each started by a person pressing a button.

| Action | Contacts |
| --- | --- |
| **Refresh** on Explore | `opds.library.kiwix.org`. A manifest of your own without file sizes and checksums causes one small request to the host it names. |
| Starting a catalogue download | The hosts in the manifests' `downloadHosts`, and mirrors they redirect to |
| Offline maps: **Check size** and **Download** for a place's map | `build-metadata.protomaps.dev` and `build.protomaps.com`, or the `maps.tileSource` archive; for terrain, the `maps.terrainSource` archive |
| Downloading place names | `download.geonames.org` |
| Offline maps: **Check size** and **Download** for routes, nearby places or a source file | `download.geofabrik.de`, for its list of countries and their parts, and the country's source file ([road-routes.md](road-routes.md#adding-routes-for-a-place)) |
| Place names for Great Britain: **Check the size**, **Download** | `api.os.uk`, which redirects to `omseprd1stdstordownload.blob.core.windows.net` ([maps.md](maps.md#place-names-for-great-britain)) |
| **Find a route** on Maps | The route source shown beside the search (as shipped, `ovp.dresel.systems` or `overpass.private.coffee`), sent the name typed and, for **This map view**, its edges ([maps.md](map-routes.md#finding-a-known-route)) |
| Repeaters: **Get the list**, **Bring up to date** | The publisher named beside the source (as shipped, `www.irts.ie` and `hearham.com`) ([radio.md](radio.md#where-to-get-a-list)) |
| **Save to library** on a link in a reference page | The host in the link. The address must be `http` or `https`, end in a kind of file the library keeps, and not be on a private network. |
| **Look at the page**, **Save page** under "Save a web page" | The host in the address pasted, and the hosts of its pictures if you asked for them ([notes-and-imports.md](notes-and-imports.md#saving-a-web-page)) |
| Layer data for the map: **Show the size**, **Download** | The source chosen: `raw.githubusercontent.com`, `davidmegginson.github.io`, `ovp.dresel.systems` or your Overpass server, `download.geofabrik.de`, `query.wikidata.org`, `data.worldpop.org`, `data.geo.admin.ch`, `environment.data.gov.uk` or `api.ratings.food.gov.uk` ([reference-layers.md](reference-layers.md)) |
| Weather: **Update now**; Climate: **Fetch the averages for this place** | `api.open-meteo.com`, `www.metoffice.gov.uk`, `environment.data.gov.uk`; for averages `power.larc.nasa.gov` and `re.jrc.ec.europa.eu`. Positions are rounded to two decimal places. ([weather.md](weather.md)) |
| Weather: **Fetch alerts** | `www.gdacs.org`, `earthquake.usgs.gov`, and one national service: `feeds.meteoalarm.org` (sent the country), `api.weather.gov` or `api.weather.gc.ca` (sent Home's position), `alerts.metservice.com` or `www.data.jma.go.jp` (sent nothing) ([weather.md](weather.md#worldwide-alerts)) |
| Weather: **Fetch river and sea levels** | `environment.data.gov.uk` ([weather.md](weather.md#river-and-sea-levels)) |
| HF propagation: **Fetch today's conditions**, **Download a newer table** | `services.swpc.noaa.gov` ([hf-propagation.md](hf-propagation.md#todays-conditions)) |
| HF propagation: **Download the P.533 maps**, **Build the P.533 engine** | `raw.githubusercontent.com`; to build, also `github.com` and `release-assets.githubusercontent.com` (about 190 MB) ([hf-propagation.md](hf-propagation.md#a-second-model-itu-p533)) |
| Satellite imagery and aerial photographs on Maps | Earth Search and its Sentinel-2 files, NASA for the world picture, LINZ's public bucket (New Zealand), Microsoft's Planetary Computer (United States) |
| Satellites: **Get orbital elements**; **Read about it on Wikipedia** for one satellite | `celestrak.org` and `db.satnogs.org`; `en.wikipedia.org`, sent the satellite's names ([satellites.md](satellites.md)) |
| Devices on this network: **Fetch the registry from the IEEE** | `standards-oui.ieee.org` ([tools-qr-and-network.md](tools-qr-and-network.md#who-made-each-device)) |
| The first portable drive for a kind of computer | `nodejs.org` and `download.kiwix.org`; cached after that |

Audiobook links under Explore are your browser following a link to `archive.org` or
`librivox.org`; Outpost fetches nothing.

Two connections are set by you rather than pressed. Answers, chat and search by meaning
with a local embedding server send text to the addresses in `answers.endpoint` and
`search.semantic.endpoint` (both `http://127.0.0.1:11434/v1` unless changed); **Look for
Ollama** also tries `127.0.0.1:11434` and `host.docker.internal:11434`. The mesh radio
link, once set up, keeps a connection to the household's MQTT broker or MeshCore radio
([mesh-radio.md](mesh-radio.md)). Outpost never downloads a language model.

Building Outpost or its Docker image needs a connection; running it does not. Every
connection the server can open, and why, is listed in
[security.md](security.md#no-telemetry).

## How Outpost keeps from reaching out

Every page tells the browser to load from and send to Outpost only. Fonts, map lettering,
icons, the PDF viewer and the model for search by meaning are part of the build.
Reference pages and saved web pages load nothing from the live web. Nothing is scheduled:
no update check, no background refresh, no telemetry.

## What the interface says when offline

**Ready offline**, at the foot of the sidebar, means nothing is running and every drive is
connected; Outpost does not probe the internet. Explore keeps the last known details,
downloads resume by themselves or wait for **Retry**, and search notes any source it
could not reach. "Server not responding" means the browser cannot reach Outpost; notes
being edited wait and retry. The messages are in [troubleshooting.md](troubleshooting.md).

## A phone out of reach of the server

Over HTTPS, the app keeps its own files in the phone's browser the first time it opens
(about 4.5 MB), so it opens anywhere. Nothing of your library goes onto the phone until
you ask:

| What | Where | What comes with it |
| --- | --- | --- |
| A page of notes | The page's menu, **Keep on this phone** | Every page inside it, with their pictures and files; at most 300 pages, files over 50 MB left out |
| A route or track | Its panel on the map, **Keep on this phone** | Line, heights, waypoints |
| Saved places | Under the list of places, **Keep on this phone** | All of them |
| An emergency plan | Foot of its **Use now**, **Keep on this phone** | Steps, emergency number, people and their numbers, meeting places, ticks |
| Medical sheets | Under their list, **Keep on this phone** | Every sheet; an encrypted one stays encrypted and opens with its passphrase |
| An area of the map | **Offline maps**, "Map areas on this phone" | The map tiles, lettering, icons, and terrain if ticked |

On a tablet the button reads "Keep on this tablet", on a laptop "Keep on this computer".
**On this phone** lists what is kept, with size and date, and removes copies. Removing a
copy never touches the server.

### An emergency plan

Keeping a plan puts people's names and numbers on the phone, readable by anyone who can
open the browser; the button says so first. Out of reach, **Use now** opens the kept
copy with its age. Numbers still call, places open the kept map, and **steps can be
ticked**. Ticks wait on the phone, counted beside the copy, and are sent when the server
is back:

- A tick is kept with the earlier time if the step was also ticked elsewhere.
- An untick removes only the very tick the phone saw.
- A plan **reset** at home since the copy was made wins: earlier phone ticks are dropped.
- Ticks for steps removed meanwhile are dropped. A message says how many.

"Reset for next time" and "Start using this plan" need the server.

### A map area

The phone copies tiles from the server's installed regions; nothing comes from the
internet, and an area is only as detailed as the region at home.

1. Put the area in view, or choose **All of** an installed region under "What to keep".
2. Choose the detail and whether terrain comes too. Press **Measure the area in view**
   for the exact size (plus up to about 2 MB of lettering and icons).
3. Press **Keep this area** and keep Outpost open until it says the area is kept. If it
   is interrupted, **Carry on** fetches only what is missing.

One area holds at most 12,000 map tiles, 12,000 terrain tiles and 400 MB, and is refused
if the browser reports too little room. A whole country usually fits only at less
detail: when an area is too large, Outpost says the deepest zoom it fits to, and
**Measure at zoom …** measures it again there. Otherwise keep less of the map: zoom in,
or for a region keep the part of it in view. Outside a kept area the map draws coarsely from the low zooms and the world
outline. With terrain kept, contours, hill shading, the height readout and **Estimated
radio range from the centre** work out of reach (the range only over ground the phone
holds). Line of sight, walk reach, the relay planner and route heights need the server.

When the server's regions change, "On this phone" offers **Fetch again**. The old copy
stays whole until every new tile has arrived.

### What out of reach looks like

- A line across the top says the server is out of reach, with **Try again**. The app
  asks again every ten seconds while on screen, and returns to normal by itself.
- The navigation holds only **On this phone**, **Maps**, **Write** and the kept pages.
  Other screens say they need the server.
- A screen already open when the server went is left as it is, so nothing half-written
  is lost. The kept copies take over from the next screen.
- The steps of the [offline drill](readiness.md#offline-drill) can be answered.

### Writing while out of reach

**Write** holds a **Check in** (name, where you are, a few words, **I'm safe** or **I
need help**) and **a new page** (title and plain text). A kept page's **Edit** changes its
title and text; pictures cannot be added, and an encrypted page cannot be changed here.

Everything waits under **Written here, waiting to be sent** and goes, oldest first, when
the phone next reaches Outpost:

- A check-in goes on the board with the time it was written (up to a week back).
- A new page becomes a new page in Notes; sending twice makes it once.
- Changes to a kept page are saved unless the page changed at home meanwhile. Then they
  stay marked **Changed on Outpost too**, and the page offers **Keep my version** or
  **Load the other version**.
- With a household PIN set, nothing is sent until the phone is unlocked with it
  ([security.md](security.md#the-household-pin)).

Anything Outpost refuses stays on the phone with the reason and **Try again**.

### Keeping copies up to date

Copies are brought up to date whenever the phone has Outpost open within reach. A phone
that is not running Outpost learns nothing, so **open Outpost on the phone once before
you leave**. A copy of something deleted at home stays, marked "No longer on the
server", until you remove it. Within reach, the phone always loads the app the server
is serving; a new version replaces the kept one.

### It needs HTTPS

Browsers keep sites only on HTTPS, or on `localhost` at the computer itself. Over plain
`http://192.168.1.20:8080`, nothing can be kept and "On this phone" points to **Settings
→ HTTPS on your network**. Make the phone trust Outpost's certificate rather than
clicking through the warning.

### What the browser may do with kept copies

Kept copies are in the browser's storage, not encrypted beyond the phone's own
protection, and readable by anyone who can open that browser. The browser decides how
much may be kept and when it is cleared (from each browser's documentation, read
16 November 2026):

- **Safari on iPhone and iPad** deletes a site's stored data after seven days of using
  Safari without visiting it, unless the site is on the Home Screen. **Add Outpost to
  the Home Screen** (Share, then Add to Home Screen) **and keep things from there**: the
  Home Screen app has its own storage, separate from Safari's. A site may use up to
  about 60% of the disk.
- **Chrome on Android** allows up to 60% of the disk and clears only when the device
  runs out of room, least recently used sites first, sparing sites it judges important.
- **Firefox** allows the smaller of 10% of the disk and 10 GiB (half the disk with
  persistent storage, which it asks you about).

**Ask the browser to keep this data** on "On this phone" asks for persistent storage
and reports the answer. The room figures shown are the browser's rough estimates.

## Before you leave: a checklist

1. Download the reference collections you need, and add each place you need under **Maps → Offline maps** (its map, routes and nearby places).
2. Wait until Downloads shows nothing running and the status line reads **Ready offline**.
3. Use **Check files** on anything you could not replace.
4. Open one of each: an article per collection, a PDF, the map at the zoom you will use,
   a place search.
5. Unplug the server from the internet and try what you rely on.
6. If you use search by meaning, check its index is built and its server starts offline.
7. If you will make portable drives away, make one now for each kind of computer.
8. If you will be out of reach, keep what you need on the phone (on an iPhone, from the
   Home Screen app) and check the dates under **On this phone**.
9. Save a backup (**Settings → Backup**) and keep it somewhere other than this device.
10. Charge the drives, and eject them properly before unplugging.
