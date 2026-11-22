# What has not been tried

Outpost's automated tests run a real server against stand-ins for the outside world. This page lists,
by feature, what has not yet been tried with real hardware, real data or a real browser. A feature not
listed here has nothing known to be untried beyond the general points in the first section. The limits
of what each feature does are in its own guide.

## Everywhere

### Computers

- Used daily only on macOS on Apple Silicon: from source, as the packaged app, and with the Compose
  stack on the `arm64` image. Nothing builds or tests it automatically, and no image is published.
- Not tried: Linux on x86-64, an Intel Mac, Windows 10 or 11 (with Docker Desktop and WSL 2, or the
  packaged app), Outpost on a NAS, Outpost behind a reverse proxy.
- Raspberry Pi: one Pi 5 (8 GB, Raspberry Pi OS based on Debian 12, Docker 27.5) was set up once with
  `install.sh --lan --https --sudo` and opened from a Mac; `nas-share.sh` connected a Synology folder
  over SMB that survived an unmount and a restart. Not tried: a Pi 4, a 4 GB board, writing the card,
  `--install-docker`, `hotspot.sh` (only `--dry-run`), the `outpost.local` name service, the clock
  service, `--metrics` with a real Prometheus, `--decoders`, HTTPS from a phone, restoring a backup,
  NFS, reading a collection from the share, the `cgroup_enable=memory` remedy, and everyday use with a
  real library. No feature's speed has been measured on a Pi unless its section below says so.

### Phones and browsers

- No real iPhone or Android phone has been used. Phone sizes were tried in Chromium's emulation (Pixel 7
  profile, 390 × 844 and 320 px) with touch.
- Screens are built and tested in Chromium. Safari and Firefox are untried except where a section says.
- At 125% and 150% text on 320–375 px phones, some map cards reach the centre cross, some panels scroll
  sideways, and the shared dialog's buttons fall below the screen at 150% on 320 × 568.
- No screen reader has been used; spoken names are checked by tests.

### Paper

- Nothing has been printed: map pages, emergency and wallet cards, cipher pads, the binder, the sundial
  and the nocturnal were checked as PDF files only. Printers that scale to fit print cards smaller.

## Accessibility

- **Checked automatically:** every screen reached from the navigation, wide and on a
  phone, light and dark, with axe-core against WCAG 2.2 AA. Serious and critical
  findings fail the suite; waivers and their reasons are in `e2e/tests/a11y-waivers.ts`.
  Only the first state of each screen is checked: dialogs, menus and screens opened
  from inside another are not.
- **Not tried:** a pass by hand with a screen reader. No one has used the map, the notes
  editor or the reader with VoiceOver from start to finish.
- **Maps, not tried:** VoiceOver, TalkBack or a switch on a real phone; Safari on a real
  iPhone with its bars and on-screen keyboard (WebKit in a test is not that); a real
  compass, GPS fix or long press on glass. The keyboard routes (Shift F10 for the
  centre's menu, Enter to measure or save at the centre, a search result's card taking
  the keyboard) were checked in Chromium only; whether a screen reader in browse mode
  passes Shift F10 and Enter through to the map is not known. Contrast of names drawn on
  the map was worked out from the style's colours, not measured on screen.
- **Home, Search, Help, Settings and the app's bars:** walked in Chromium at 1280 by 800,
  390 by 844 and 320 by 568, in WebKit at an iPhone's size, light and dark, with the text at
  200% and at Largest, by keyboard alone, with axe-core and Playwright's reading of the
  accessibility tree. Not tried: VoiceOver, TalkBack or NVDA reading the screen names and the
  setting hints aloud; a real phone or tablet with a keyboard, switch access or the
  on-screen keyboard over a setting's field; Windows high contrast.
- **Library, reader, notes, contacts, messages and Kept:** walked full and empty at 1280 by 800,
  390 by 844 (Chromium and WebKit) and 320 by 568, light and dark, at 150% and 200% text, by
  keyboard, and with their menus and dialogs open. Not tried: VoiceOver or TalkBack on a real
  phone, a phone's own text size, the on-screen keyboard over the notes editor and the contact
  form, a switch or voice control, and a real audiobook played to the end. The notes editor's
  formatting bar over a selection is reached by its shortcuts, not by Tab; that it is enough has
  not been tried with anyone who uses only a keyboard.
- **Tools and Games, not tried:** VoiceOver or TalkBack playing any game or working any
  calculator (the move and state announcements were read from the page, not heard); a real
  phone's touch, on-screen keyboard and safe areas (only Chromium and WebKit with touch at
  phone sizes); the live compass, the phone's motion sensors and the camera on a real device;
  Windows High Contrast and forced colours; a switch device or voice control.
- **Preparedness screens** (plans, medical sheets, Keeping in touch, grab cards, check-in, log, checks,
  offline drill, supplies, weather): walked in Chromium at 1280, 390 and 320 wide, light and dark, text
  at 200% and at Largest, with axe, a layout measure, a Tab walk and the accessibility tree read back,
  and every dialog opened from the keyboard. Not tried: VoiceOver or TalkBack reading them, Safari on a
  real iPhone (the bar of screens' room for the home indicator is worked out, not seen), Windows High
  Contrast, a switch or voice control, the barcode scanner with a screen reader, and the sheets and
  cards printed and read by someone with low vision.
- **Storage, backups, downloads, import and access, not tried:** VoiceOver or TalkBack through
  adding a location, connecting a share, restoring a backup or entering the PIN; a real USB drive
  pulled out, a real NAS switched off and a really full disk (each was stood in for by a removed
  folder or a changed answer from the server); the Mac Keychain prompt and real SMB mounts from
  the Connect a network share dialog; Docker's and Linux's mount lines typed into a real system.
- **Game boards on small phones, accepted:** Sudoku's cells are 40 px on a phone 390 px wide,
  and the squares of Chess and Draughts, the holes of Peg solitaire, Solitaire's cards and
  Allotment's stall are 36 to 41 px at 320 px wide. A whole board has to fit the screen, so they
  stay under the 44 px the design asks of touch controls. They meet WCAG 2.5.8 (24 px), each is a
  separate square with no other control inside it, and every board can also be played from the
  keyboard.
- **Radio screens, not tried:** VoiceOver or TalkBack on a real phone reading the
  propagation charts, the coverage map's legend and a plan's tables; a real iPhone or
  Android phone's on-screen keyboard over the forms (the phone sizes were browsers set to
  that size, and WebKit); Morse sent with a real key or paddle while a screen reader runs;
  the app's own large-text setting with the phone's text size raised as well.

## Installing and looking after it

### HTTPS on your network

- Chains and the authority's name limits were checked with Node, OpenSSL, `curl` and macOS's own
  verification on macOS 15.6. Name limits in Chrome, Edge and Firefox on computers, and on Android, were
  read from their documentation and source, not tried; other Windows programs and Firefox for Android
  are not known.
- Not tried: trusting the certificate on a real iPhone, iPad, Android phone, Windows or Linux computer,
  or in a browser with it really trusted; marking it trusted in a real macOS keychain.
- The device steps were written from makers' documentation. Not confirmed: that the iOS download must be
  made in Safari; which Android phones say "More security & privacy" instead; the Windows wizard's
  "Current User" label and the exact `certutil` lines; removal on Fedora and openSUSE; whether Chrome on
  Linux uses the system list.
- A certificate of your own: not tried from a real public authority, as a PKCS#12 file made by anything
  but OpenSSL 3.6, in Docker, or with a real renewal by Certbot. The renewal `install` example and the
  Docker `cat` lines have not been run.
- The end-to-end test makes Chromium accept the server's exact key; it cannot add an authority.

### Storage and backups

- The Linux `/etc/fstab` line and the Compose volume that Storage writes out were followed as written on
  a Raspberry Pi against a real NAS over SMB, by IPv4 and by link-local IPv6. NFS is untried (that NAS
  has no NFS), and so is a global IPv6 address.
- Container detection (Docker, Podman, LXC, Kubernetes) is checked against made-up files, not in real
  containers.
- The read-back check after a download catches a block written wrongly; a system that caches the right
  bytes and stores wrong ones would pass it.
- A share dropping part-way through a backup on a real NAS is untried.
- The map kept answering with the NAS off on one Pi; other hardware is unmeasured.
- Protected backups: not tried on a computer with too little memory for the cost they ask; not read by
  any program but Outpost.
- On macOS no documentation was found that arriving packets forged with the computer's own address are
  dropped; the "this computer only" rule rests on the TCP argument there.

### Portable drives

- Not tried: starting a drive on an Intel Mac, Linux, Windows or a Pi; carrying a real USB drive to a
  second computer and merging it back (tests use a folder on one computer); a drive written by an older
  release (none exists yet).
- Search by meaning from a drive gave identical vectors on an Apple Silicon Mac and in ARM64 and AMD64
  Linux containers; not tried on Windows or an Intel Mac.

### Updating

- No release has been published or signed. Not tried: fetching from a release page, loading a real
  image and replacing the container on a Pi, `scripts/make-release.mjs` with a real image.
  `update.sh` was run in a Debian container with a stand-in for Docker.

### The server process

- In the packaged app, OCR, the built-in embedding model and the HF engines run WebAssembly in worker
  threads without the V8 setting used from source; the fault it avoids has not been seen there.

## Search, answers and the library

### Search by meaning and OCR

- The built-in model has not been run on a Pi, an Intel Mac, Windows or musl Linux (Alpine); AMD64
  only under emulation. Its memory use on a Pi is unmeasured (about 430 MiB for the container during an
  index build on a laptop).
- A local embedding server is tested against a stand-in only.
- OCR speed on a Pi is unmeasured; JBIG2 scans are untried.

### Answers and Chat

- Tried only with Ollama 0.40.16 on one Apple M2 Max Mac, with seven small models, on a made-up
  16-document library. Not tried: a real household library, a Pi (no model has been timed on one),
  Windows, Linux, Docker, a model server on another computer, llama.cpp's server, LM Studio.
- Not tried with a real model: the server stopping mid-answer, a first load from disk, the retry with
  fewer passages, the screens themselves (trials read the same events from the command line), a real
  model's Markdown on screen, and Ollama's `"think": false`.
- The Chat box above a phone's on-screen keyboard: emulated phone only.

### MCP

- No real MCP client (Claude Code, VS Code or another) has been connected; only hand-written requests.
  The connection steps come from each program's documentation, read 17 November 2026.

### Reference archives and collections

- Archives whose page is a small web app, and the reader's second token-protected frame address, are
  checked in Chromium only.
- Collections that are a list of documents: one real collection (Post Disaster Resource Library, May
  2024, 108 PDFs); none with recordings or films, none made before October 2022. **Add all to
  library**, sizes and the room check were tried against a stand-in only, and not timed on a Pi.

### EPUB books

- Tested with books built for the tests, not a set of published books. Not tried: real copy-protected
  books (Adobe ADEPT, Readium LCP, Apple FairPlay; detection goes by the files those schemes leave),
  right-to-left and vertical text, a Pi or Windows.

### Audiobooks, Calibre and PDFs

- Lock-screen controls, playing with the screen off and the next chapter while locked: not tried on a
  real phone. No real LibriVox zip has been downloaded.
- Calibre: tried with folders laid out as Calibre writes them, not a library Calibre made.
- PDFs made in Outpost: not tried in iOS Safari or from an iPhone's Home Screen.

### Learning progress

- Not tried with the real Khan Academy archive (180 GB) or any real course archive, or on a phone.

### Notes and imports

- Saving a web page was tried by hand on two public pages (a Wikipedia article and an MDN guide).
- Notion imports cover its Markdown & CSV export; Notion's menu names may change.

### Encryption

- Only Chromium; not Firefox, Safari or a phone. Not tried: printing or saving the PDF on an iPhone
  (or whether `beforeprint` arrives on iOS); HTTPS on a real home network (tested on `localhost`); long
  pages on a slow device; any OpenPGP program but GnuPG 2.5.18. Outpost's use of OpenPGP.js has not been
  audited.
- A 1 GiB file did not complete in Chromium (the browser cancelled the save), so the limit is 512 MiB.

### Contacts

- No phone has been connected to the CardDAV address book; tried with tsdav 2.5.0 and vdirsyncer 0.21.0.
  Unknown: whether an iPhone accepts an address book without `sync-collection`, what it does when an
  edit is refused, and whether it goes on with no password.
- The Contact Picker over Outpost's own certificate on a real Android phone; the export steps for iPhone
  and Android (from Apple's and Google's help pages; Samsung's menu path not confirmed).

## Maps

- **Recording a track**: nobody has walked with it. Real GPS noise, a locked screen, Safari on iPhone,
  Chrome and Firefox on Android, a browser stopped for memory, and battery life are untried.
- **Not walked on a phone**: the long-press menu, a repeater's card, the card of where you are, a phone
  on its side, browsers without container queries (Safari before 16).
- **Height of the ground, line of sight, radio range**: not checked with a real Mapterhorn download (what
  tiles hold over the sea, decode time); speed measured with made-up terrain; whether each terrain
  source is bare ground or surface is not checked.
- **Radio range beyond 50 km**: now read from finer tiles where they are installed; not compared again
  with `gdal_viewshed` or a 5 m walk, and its time on a Raspberry Pi not measured.
- **Irish Grid and ITM**: checked against OSi's worked examples, one NISRA reference and PROJ; not
  against a printed OSi or OSNI map or a GPS on the ground.
- **Night style**: its reds for a range and a walk, and the dimmed satellite imagery, are worked out from
  contrast figures; not looked at in the dark with eyes adapted to it.
- **UTM grid on the map**: not checked against a printed map's grid on paper.
- **Icons**: speed not measured on a phone; exported symbols not opened in Garmin software or units.
- **GPX**: exported files have not been opened in another program (BaseCamp, OsmAnd, Organic Maps, Gaia
  GPS, Komoot, QGIS, GPXSee, gpx.studio, Google Earth, JOSM). No long national trail has been fetched to
  try the size limits.
- **Finding a known route**: not tried with a route of thousands of ways from a real source, with real
  gaps or branches, from a phone, or over a slow connection; a found route's heights not seen on real
  terrain.
- **Printing**: not tried on an iPhone, iPad or in Safari; canvas limits come from WebKit's source and
  bug tracker. Poppler drew bold lines regular.
- **Place names for Great Britain**: search speed not measured on a Pi.
- **Satellite imagery**: the encoder was tried only on macOS arm64; not tried on an iPhone, iPad or Pi;
  the 500 m world has never been built (its size is estimated).
- **Keeping maps on a phone**: areas of thousands of tiles, and how long a phone takes to work out a
  radio range, are untried; Safari older than 16.4 gets unpacked tiles two to three times larger.

## Keeping things on a phone

- Not tried on a real phone, in Safari or Firefox, or from a Home Screen app. What browsers do with kept
  copies over days comes from their documentation.
- A phone with a network but no route to the server (the four-second limit) is not exercised.
- Kept emergency plans and their ticks, and heights and range from kept terrain, are tested with a
  stand-in for browser storage, not end to end with the server stopped.

## Radio

### Repeaters

- **Get the list** has been tried against a stand-in only, never Hearham or the IRTS. Each file was read
  once by hand on 16 November 2026 (Hearham 22,816 of 22,947 rows, IRTS 45 of 45, WIA 914 repeaters
  from 1,023 rows).
- The by-hand steps for RepeaterBook and the Finnish site have not been walked through.
- Quotations of several repeater publishers' pages were read through an extracting fetch tool and are
  worth a second look by eye.
- The CHIRP export has not been loaded into CHIRP or a radio.
- 50,000 entries were measured on an Apple M2 Max, not a Pi.
- The no-terrain radio-horizon formula has not been checked against a published copy.

### Reference sheets

- The LogBook73 radio guides have not been checked against the manufacturers' manuals.
- The distress and bands entries in **Frequencies to listen to** were not compared again by hand (92
  other facts were, none wrong).

### HF propagation

- No prediction, from either model, has been compared with signals measured on the air. The engine was
  held to the Fortran original's printed output on three circuits.
- Wire and antenna models not compared with NEC or a real antenna.
- Not run on Windows or an Intel Mac; on a Pi only as a linux/arm64 container on a Mac.
- The coverage layer not seen over a real installed region; a coverage PDF crossing the 180° meridian
  not tried.
- No ADIF file from a real logging program imported.

### Morse trainer

- Not tried on a real iPhone (first-tap sound, the silent switch, sound after sleep), or with a real
  paddle on a USB serial adapter, game-controller interface or mouse adapter. The suite's audio was not
  listened to.
- The Farnsworth formula was not checked against the QEX article itself, the Koch order against LCWO's
  list, or the keyer presets against makers' manuals.

### Mesh radio and the board

- No real Meshtastic or MeshCore radio has been connected, and Outpost's opening of a real USB radio
  has not been run. Stand-ins: an MQTT client as a Meshtastic radio, a MeshCore companion on a socket.
- Unseen: a Meshtastic radio's real JSON for a text message and for positions; MeshCore's network port
  (assumed to use the USB frames); TLS from a radio to a broker; what a real radio does with the
  broker's limits (no QoS 2, retained messages or sessions).
- Mosquitto tried in Docker and on a Mac only, not on Raspberry Pi OS or Windows.
- The board: not tried on real phones on a real home network, with a real device's position, or with
  iOS's handling of a downloaded file.

### Heard on the radio

- No real receiver: built against recordings from Dire Wolf, readsb and pyais, and stand-in decoders.
  The decoder set-up commands are marked tried or untried per platform on the screen.

## Tools

- **Calculators**: the timer's tone and vibration, and Safari's handling of it while locked, are untried
  on an iPhone.
- **Compass**: the live compass has not been tried on a phone (whether a browser fires the orientation
  events, and whether its heading is magnetic or already true); nor the landscape correction. No
  Ordnance Survey publication with worked grid-convergence figures was found; the method is checked
  against NOAA's UTM example and textbook series.
- **Solar clock**: nobody has gone out with a stick; methods are checked by running the arithmetic back
  from a known instant. The sundial and nocturnal were not cut out or used; the gnomon's thickness is
  left out. The decorative Plough and Cassiopeia stars were not re-read from the source (no time is
  worked from them).
- **QR codes**: decoding is checked with jsQR only, not a phone camera.
- **Devices on this network**: one real scan, on the build Mac's network, before the fix to "this
  computer" marking. Not tried on Linux, a Pi (including whether ping works without root), or a
  container with host networking.
- **Cooking**: USDA's food-safety pages refused every request on the day the figures were
  gathered, so none of its figures is used.

## Preparing

- **Weather and hazards**: the publishers' real answers were fetched by hand once (Bedford, 16 November
  2026; King's Lynn river stations, 17 November); the tests use recorded answers. Environment Agency
  warning times carry no zone and are read as UK time, unverified in summer and across a clock change.
  No real device position was asked for; a whole river-levels press for a real place was not timed.
  Two publishers' pages that build themselves with JavaScript were read through a summary (marked
  "(summary)" in [sources.md](sources.md)) and not read again on the page.
- **Reference layers**: Overpass, Wikidata, Natural Earth, OurAirports, WorldPop, BABS and one Geofabrik
  extract were each fetched once by hand; the airport frequencies file, flood zones, Food Standards
  Agency and Geofabrik region downloads only against stand-ins. No whole state or country extract has
  been downloaded (large-file figures are Monaco's extract repeated to Ohio's size). Flood zones have no
  browser test; a first world view on a Pi is unmeasured (about a second on a laptop).
- **Nuclear preparedness**: effect colours over imagery measured against three ground tones; PDF maps
  over a real region not measured for size or time.
- **Emergency plans**: `tel:` links, adding **Use now** to the Home Screen and the type at arm's length,
  untried on a phone.
- **Supplies**: the barcode reader is tested on generated pictures and a stand-in camera, not a phone's
  camera; the browser's own BarcodeDetector path has no test.

## Games

- **Allotment**: rain, drying and seasons are checked in engine tests and with a server's clock moved,
  not by leaving a plot for days or across a real change of month.
- **Steading**: a settlement left a day, a month and a year, in engine tests only.
- **Chess**: reply time on a Pi or old phone, and the levels' strength against real players, unmeasured.
- **Snake**: swipes and arrow buttons untried on a phone.
