# Ready-made builds

Four proven builds, from parts list to first transmission. Each is a complete recipe using the choices this guide has already explained — the [hardware chapter](outpost:entry/logbook73.guide.digipi/hardware) for the parts, the mode chapters for the operating — condensed so you can build with the shopping tab open. Prices change and stock rotates, so recipes name _kinds_ of parts; the [interface table](outpost:entry/logbook73.guide.digipi/hardware) maps kinds to current products.

## 1 · The pocket digipeater / APRS box

The gateway drug. An HT you already own becomes a portable APRS station and, where appropriate, a fill-in digipeater for events and outings.

| Part      | Choice                                                |
| --------- | ----------------------------------------------------- |
| Pi        | **Zero 2 W**                                          |
| Interface | **AIOC** (two-pin HT plug)                            |
| Radio     | Any two-pin HT (the Baofeng/Kenwood connector family) |
| Power     | USB power bank; the HT's own battery                  |
| Extras    | 1.3" ST7789 TFT if you want a status face             |

**Set up:** [install](outpost:entry/logbook73.guide.digipi/install) as standard; radio on `144.390`/`144.800 MHz` per region; WebChat and map first, beacons once happy. **Roles:** messenger and map always; _fill-in digipeater_ only where coverage genuinely needs it and your licence's [automatic-operation conditions](outpost:entry/logbook73.guide.digipi/aprs) are satisfied — at an event, on a hilltop picnic, during an exercise. **Honest limits:** HT duty cycle and rubber-duck reach; this is a personal station and short-term fill-in, not town infrastructure.

## 2 · The HF Winlink go-kit

Email from anywhere with a wire in a tree. The emcomm-flavoured build, equally at home as the holiday communications kit.

| Part      | Choice                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pi        | **Zero 2 W** (or 3A+ for headroom)                                                                                     |
| Interface | **[Digirig Mobile](outpost:entry/logbook73.guide.digirig/overview)** + the [cable for your rig](outpost:entry/logbook73.guide.digirig/cables)                      |
| Radio     | Any HF transceiver you can carry; data-friendly and CAT-capable preferred ([rig control](outpost:entry/logbook73.guide.digirig/rig-control)) |
| Power     | Battery for the radio; power bank for the Pi — separately, always                                                      |
| Extras    | 3.5" TFT; laminated settings card; printed gateway shortlist for your region                                           |

**Set up:** prove [telnet first, then RF](outpost:entry/logbook73.guide.digipi/winlink) at home; log the gateways and bands that actually work from your locations. **Practice cadence:** one RF session monthly minimum — [emergency readiness is a practice](outpost:entry/logbook73.guide.digipi/best-practices). **Honest limits:** HF Winlink is propagation-dependent by nature; the printed gateway list and a band choice informed by [propagation](outpost:entry/logbook73.handbook/propagation) are as much a part of the kit as the coax.

## 3 · The shelf iGate (and, where warranted, digipeater)

The set-and-forget public service: a box that hears your area's APRS and gates it faithfully to the internet.

| Part      | Choice                                                                                      |
| --------- | ------------------------------------------------------------------------------------------- |
| Pi        | **3B+ or Pi 4** — wired Ethernet is a gift for an always-on box                             |
| Interface | **DigiPi Hat** or **DRA-Pi-Zero** for clean permanent wiring (Digirig Mobile equally valid) |
| Radio     | A VHF mobile/base rig with real heatsinking — not an HT, for an always-on role              |
| Antenna   | The best-placed VHF antenna you can manage; height is the whole game                        |
| Power     | Quality PSU; consider the household UPS if you have one                                     |

**Set up:** [receive-only iGate first](outpost:entry/logbook73.guide.digipi/aprs) — valuable, humble, and free of automatic-transmission licence questions. Watch the map for a week; learn what your station genuinely hears. **Upgrading to digipeater:** only where the map shows a real coverage gap, with your licence's unattended/automatic conditions read and satisfied, at civilised power. **Honest limits:** the role is infrastructure — boring on purpose. The reward is every traveller whose beacon your shelf quietly carried home.

## 4 · The SOTA/POTA data companion

The build that rides along with an activation and turns lunch into an FT8 session or a summit into a Winlink post office.

| Part        | Choice                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pi          | **Zero 2 W**, small TFT fitted                                                                                               |
| Interface   | **[Digirig Mobile](outpost:entry/logbook73.guide.digirig/configs)** shared with your laptop kit, or the AIOC if the day is VHF                     |
| Radio       | Your existing portable rig — this build adds ~a paperback of weight to any [SOTA](outpost:entry/logbook73.handbook/sota)/[POTA](outpost:entry/logbook73.handbook/pota) kit |
| Power       | Power bank (Pi) + the rig's battery                                                                                          |
| The console | The phone already in your pocket, via [the hotspot workflow](outpost:entry/logbook73.guide.digipi/phone-operating)                                 |

**Set up:** rehearse the hotspot join at home once (`DigiPi` / `abcdefghij` / `10.0.0.5` — the [quick reference](outpost:entry/logbook73.guide.digipi/quick-reference) carries them); time-check before leaving signal for FT8's sake. **On site:** antenna up, radio to band, one hat at a time. **Honest limits:** cold fingers and browsers are workable but deliberate; the modes that shine here are the patient ones ([FT8/JS8](outpost:entry/logbook73.guide.digipi/weak-signal), a single tidy [Winlink exchange](outpost:entry/logbook73.guide.digipi/winlink)) rather than rapid-fire anything.

## Mixing and evolving

The builds share DNA on purpose. The pocket box grows into the go-kit by adding the Digirig and an HF rig; the go-kit's parts _are_ the companion; the shelf build is the pocket box that found a permanent job and better hardware. Buy toward the build you will actually use this month, and let the station evolve — the [best-practices chapter](outpost:entry/logbook73.guide.digipi/best-practices) closes the loop on running whichever one you end up with well.
