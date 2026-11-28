# Pi-only review

"An important use case is we can just run on a pi" (the owner, 23 Nov 2026). This page
checks, from the code and the guides, that someone who downloads Outpost and runs it on a
Raspberry Pi with nothing else can do everything, and lists what still has to be measured
on a real Pi. Helpers that use a faster computer (`scripts/build-vectors.mjs`,
`deploy/valhalla/build-tiles.sh`, `scripts/build-p533-engine.mjs`) are optional extras
and must never be a step.

Reviewed 28 Nov 2026 from the code; nothing on this page was run on a Pi. The measured
figures it quotes come from [street-routes-measurements.md](street-routes-measurements.md)
(23 Nov 2026), [testing-status.md](../testing-status.md) and the search tuning (22 and
23 Nov 2026), all on the owner's Pi 5 with 8 GB and an SD card.

The Pi in question: a Pi 5 or 4, 4 or 8 GB, four cores, an SD card, 64-bit Raspberry Pi
OS, Docker Compose as `deploy/pi/install.sh` sets it up. Compose caps Outpost at 1 GB,
Kiwix at 512 MB and the streets service at 3 GB (`compose.yaml`), but Raspberry Pi OS
applies those caps only with `cgroup_enable=memory cgroup_memory=1`; as it comes, nothing
is capped ([deployment.md](../deployment.md#raspberry-pi-4-and-5)).

## States

- **Works on a Pi**: run on the owner's Pi, with a figure in the repository.
- **Works, unmeasured**: nothing in it needs another computer and its memory is bounded,
  but no one has timed it on a Pi.
- **Needs another computer**: no Pi-only path. (None found.)
- **Risky**: could run a Pi out of memory or disk, or take so long it looks broken,
  without saying so first.

## The review

| Item | State | Evidence | Measure on the Pi | Fix |
| --- | --- | --- | --- | --- |
| Installing: building Outpost's image | Works, unmeasured; risky on 4 GB | `deploy/pi/install.sh:344-358` runs `docker compose up -d --build`; `Dockerfile:6` builds the web app and the server bundle on the build platform, which on a Pi is the Pi. The script and [deployment.md](../deployment.md) say the first build is untimed. | M1 | None needed now; once timed, put the figure in `install.sh`'s message and step 3 of the Pi guide. If a 4 GB Pi runs out, ship a built image with releases. |
| Search by meaning: built-in model, building the index | Works on a Pi | About four minutes per thousand passages on a Pi 5 ([search-by-meaning.md](../search-by-meaning.md#what-it-costs)). Threads capped at four and at half the processors (`semantic/built-in-model.ts:166`); worker heap 512 MB (`semantic/built-in.ts:36`); a second copy on one thread answers searches during a build. | M2 (memory on a Pi is unmeasured; about 430 MiB was seen once) | Guides now say the Pi does it on its own and the laptop is optional (this review). **Settings** quotes the laptop's time first and the Pi's as "five times longer" (`settings/semantic-options.tsx:253`); it should quote the Pi's first on a Pi. Left to whoever owns Settings. |
| Search by meaning: `scripts/build-vectors.mjs` | Optional extra | Presented as optional in [search-by-meaning.md](../search-by-meaning.md#reading-the-library-on-a-faster-computer); copies default to a quarter of the processors (`scripts/build-vectors.mjs:50`), on the laptop. | — | None. |
| Answers and Chat: a model server | Works, unmeasured | No model has been timed on a Pi; [which-model.md](../which-model.md) and its screen say so (`chat/which-model-page.tsx:31`) and name `lfm3:1.7b` (1.7 GB) for a 4 GB Pi 5. | M3 | None until measured. |
| Routes (Outpost's own main roads) | Works on a Pi | Great Britain: 168 s, 367 MB at most, 47 MB written; routes in 0.08–0.18 s. One file read whole to load the network (`roads/network-file.ts:121`), 30 MB for Great Britain. | M4 for France | Guides said "unmeasured" or "minutes"; now quote the measurement (this review). |
| Routes for France or joined countries | Risky | 852 MB at most for France on a Mac (from source, 266 MB of it the idle process) ([road-routes.md](road-routes.md#measured)), against Outpost's 1 GB cap when the memory cgroup is on. The "import" queue runs one at a time (`core/jobs.ts:157`), so it is not doubled by another read. | M4 | If it fails with the cap on: say so before the build on a computer with the cap, or raise `OUTPOST_MEMORY_LIMIT` in the Pi guide. |
| Walking and cycling (Valhalla) for Great Britain or the UK | Works on a Pi | 56 and 91 minutes, 2.3 GB of memory, 8 GB free while building, 53 GB written; the screen says all of it before the button (`streets/tiles.ts:45-105`); the service stops a build below 800 MB available (`docker/valhalla/outpost-valhalla.sh:40,138`); two threads by default. | M5 (in Compose, and on a NAS work folder) | None. |
| Walking and cycling for France or joined countries | Risky, said so | Not built on a Pi; past Great Britain's size the screen says the figures are guesses and to expect several hours (`streets/tiles.ts:96-98`). Under 6 GB of memory a large area gets a warning (`streets/tiles.ts:100`). Compose caps the service at 3 GB when the cgroup is on; the Pi build's processes reached 7.5 GB resident, mostly mapped files. | M5, M6 | None until measured. |
| `deploy/valhalla/build-tiles.sh` | Optional extra | [street-routes-measurements.md](street-routes-measurements.md) and [deployment.md](../deployment.md#street-routes) build on the Pi; the script is "build on any computer with Docker, optional". | — | None. |
| Reachable from here | Works on a Pi (to 1 hour by car); unmeasured beyond | An hour's drive over Great Britain's streets took about 5 s; 15 to 60 min over main roads 59–349 ms. 2 hours' drive and walks over terrain are untimed; [map-getting-around.md](../map-getting-around.md) had "tens of seconds" and "about ten" with nothing behind them. | M7 | Guide now says what was measured and what was not (this review). |
| OCR (scanned PDFs and pictures) | Works, unmeasured | One worker with a 1 GB heap (`ocr/host.ts:22`); pages up to 12 MP, sources up to 40 MP, 1,000 pages, PDFs up to 512 MB (`ocr/types.ts:99-112`). The whole PDF is read into memory first (`ocr/pdf-pages.ts:278`). OCR speed on a Pi is unmeasured ([testing-status.md](../testing-status.md)). | M8 | If a 512 MB PDF fails with the cap on, open it through PDF.js's range reading instead of the whole file. |
| Reading documents (text extraction) | Works, unmeasured; risky with several at once | Workers with a 1 GB heap each (`documents/extract-host.ts:17`); a PDF up to 512 MB is read whole (`documents/extract-pdf.ts:130`). **Documents processed at once** defaults to 1 but goes to 8 (`settings/service.ts:25`), and the semantic build shares that queue. The Pi guide says to leave it at 1. | M8 | Consider capping it by memory on small computers (Settings, not done here). |
| Downloads | Works, unmeasured (bounded) | Default 2 at once, up to 8 (`settings/service.ts:16`); checksums streamed in 1 MB pieces (`core/hashing.ts`); 16 file threads so a stalled NAS does not stop the map (`core/threadpool.ts:13`). | — | None. |
| Map data: country files, nearby places, reference layers | Works, unmeasured | The PBF reader's memory grows with what matched, not with the file (`layers/adapters/pbf.ts:13`); Ohio took 650 MB on a Mac. [reference-layers.md](../reference-layers.md) had "a few minutes on a Raspberry Pi" with nothing behind it. A whole country's food and supplies (the United States, 12.3 GB) is untried anywhere. | M9 | Guide now says untimed (this review). |
| OS place names for Great Britain | Works, unmeasured | 103 MB, 519 MB in the database; "five to ten minutes on a Pi" in [map-places.md](../map-places.md) had nothing behind it; search speed on a Pi is unmeasured. | M10 | Guide now says untimed (this review). |
| Radio range and line of sight | Works, unmeasured | About 0.6 s for a new point on a laptop (commit 1ff843c); [map-sun-and-radio.md](../map-sun-and-radio.md) and [radio.md](../radio.md) said "a second or two on a Raspberry Pi". | M11 | Guides now say untimed (this review). |
| HF propagation: P.533 engine built on the device | Works on a Pi | Compiled by a job on the device, about 860 MB free, 25 s on a Pi 5 on a fast line ([hf-propagation.md](../hf-propagation.md)); `scripts/build-p533-engine.mjs` is the optional alternative. | — | None. |
| Satellite imagery | Works, unmeasured | The encoder was tried only on macOS arm64 ([testing-status.md](../testing-status.md)). | M12 | None until measured. |
| Kiwix reference collections | Works, unmeasured | kiwix-serve reads archives in place, capped at 512 MB when the cgroup is on; search on the owner's Pi asked its collections during the search tuning. Reading a collection from a NAS share on a Pi is untried ([testing-status.md](../testing-status.md)). | M15 | None until measured. |
| Backups, export, imports | Works, unmeasured | Hashes streamed; imports cap each page (`imports/plan.ts:225`) and a CSV at 32 MB (`imports/database.ts:23`), archives at 8 GB unpacked with 512 MB kept free (`imports/extract.ts:42`). | — | None. |
| Checking for an update | Was risky; fixed | The release page was read whole before its size was checked (`update/index.ts`), so a page that never ended was held in memory. Now read in pieces and stopped past 256 KB (this review, with a test). | — | Done. |
| Worker counts from `os.cpus()` | Works on a Pi | The only two: the embedding threads (capped at 4) and `build-vectors.mjs` (a laptop's). `os.cpus()` elsewhere only describes the machine (`cli/bench-propagation.ts`, `system/index.ts`). | — | None. |
| Several heavy jobs at once | Risky | Each queue runs one job at a time, but queues run side by side: a country file read ("import"), a semantic build or document reading ("index"), OCR and a Valhalla build ("streets") can all run together, about 0.9 + 0.6 + 1 + 2.3 GB, beside the server and Kiwix. Nothing waits for memory across queues; only the Valhalla build checks what is left. | M13 | If M13 shows trouble on 4 GB: have the heavy job types wait for each other below a memory threshold, with a reason on Downloads and tasks. |
| Wear on the SD card | Said so | A Valhalla build writes 53 GB; the guides and the screen say so and offer a NAS or USB disk to work on. Other jobs' writes are unmeasured. | M14 | None. |

## To measure on the Pi

Run top to bottom on a Pi 5 (and, where it says, a 4 GB board) with Outpost installed by
`deploy/pi/install.sh`, from an SSH session. Note the date, the board, its memory, the
card or disk, and whether the memory cgroup is on (`cat /proc/cgroups | grep memory`: the
last column is 1 when on). Watch memory in a second session with `free -m -s 5` and
`docker stats --no-stream` (or the Prometheus dashboard in `deploy/pi/monitoring.md`).
Write each figure where its row's Fix says, and in [testing-status.md](../testing-status.md).

- [ ] **M1. First image build.** On a freshly written card: `time ./deploy/pi/install.sh
  --install-docker --lan`. Record the wall time, the lowest `free -m` "available" during
  `pnpm` and the web build, and whether it finished on a 4 GB board.
- [ ] **M2. Search by meaning, memory.** **Settings → Search by meaning**, turn it on, and
  while it reads note `docker stats` for `outpost` every minute for ten minutes; then the
  same five minutes after it is ready (the model is given back after five idle minutes).
- [ ] **M3. A model server.** `ollama pull lfm3:1.7b`, point **Chat** at it, ask the
  sixteen questions of [which-model.md](../which-model.md); record first word and whole
  reply. The same with `llama3.2:3b` on 8 GB.
- [ ] **M4. Routes for France.** With the memory cgroup on: **Maps → Offline maps → Add a
  place → France**, tick **Routes**, keep the source file. Record the build time on
  **Downloads and tasks**, the peak of `docker stats outpost`, and whether it finished
  under the 1 GB cap. Then plan Leatherhead to Chamonix in **Directions** and note the time.
- [ ] **M5. Walking and cycling in Compose.** `./deploy/pi/install.sh --street-routes`, then
  **Add a place → United Kingdom → Walking and cycling**, once on the card and once with
  **Where it works** on a NAS connected by `nas-share.sh`. Record time, lowest available
  memory and `docker stats outpost-valhalla-1`.
- [ ] **M6. Walking and cycling on 4 GB.** On a 4 GB board, the same for Greater London,
  then for Great Britain; record whether Great Britain finishes or the service stops it
  for memory, and what the screen said before the button.
- [ ] **M7. Reachable areas.** With Great Britain's streets: **Reachable from here** at
  Trafalgar Square for a 2 hour drive, a 2 hour ride, and 4 and 8 hour walks; with terrain
  installed, an 8 hour walk on the terrain. Time each from pressing to the areas drawn.
- [ ] **M8. Documents and OCR.** Add a 200-page scanned PDF and a 300 MB text PDF to the
  library; press **Read text from the scanned pages** on the first. Record the time per
  page and the peak of `docker stats outpost`. Then set **Documents processed at once** to
  4, add ten large PDFs, and note the peak; set it back to 1.
- [ ] **M9. Nearby places.** **Add a place → England → Nearby places** (1.72 GB), tick
  every kind. Record time and peak memory. Then Ohio, for comparison with the Mac's
  minute and 650 MB.
- [ ] **M10. OS place names.** Add Great Britain's OS place names under **Offline maps**: record the
  time to read them, then the time of ten searches on the map ("SY23 3", "Box Hill",
  "Afon Rheidol").
- [ ] **M11. Radio range.** On the map, a radio range at a new point with terrain
  installed: time to the full range, then another height at the same point.
- [ ] **M12. Satellite imagery.** Download a small imagery area (a town) and record the
  time of its encoding step on **Downloads and tasks**.
- [ ] **M13. Heavy jobs together.** On a 4 GB board with the memory cgroup on: start a
  France country file read (M4), turn on search by meaning (M2), and start OCR (M8) within
  a minute of each other. Record the lowest available memory, whether any was stopped, and
  whether `/api/health` kept answering (`while sleep 5; do curl -s -o /dev/null -w
  '%{time_total}\n' http://localhost:8080/api/health; done`).
- [ ] **M14. Writes to the card.** Before and after M4, M8 and M9: `cat
  /sys/block/mmcblk0/stat` (the seventh field is sectors written, 512 bytes each).
- [ ] **M15. A collection on the NAS.** Download **Wikipedia 100** with **Where to keep it**
  on the NAS, open five articles and search for "battery"; note the time to the first
  article and the peak of `docker stats outpost-kiwix-1`.
