# Ready-made configurations

Four complete station recipes, each a combination this guide has already explained piece by piece — gathered here so a goal ("I want Winlink in the go-bag") becomes a shopping list and a settings card. Every recipe assumes the [getting-started](outpost:entry/logbook73.guide.digirig/getting-started) computer setup and the [levels discipline](outpost:entry/logbook73.guide.digirig/levels) as its foundation.

## 1 · HF FT8/weak-signal station (the classic)

The reason most Digirigs are bought: laptop + HF radio + wire antenna = worldwide contacts at walking-pace power.

| Piece          | Choice                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| Digirig        | Mobile, serial configuration matched to the radio ([the table](outpost:entry/logbook73.guide.digirig/how-it-works)) |
| Cable          | The radio's data/ACC set — not the mic jack ([why](outpost:entry/logbook73.guide.digirig/cables))                   |
| Software       | WSJT-X ([settings block](outpost:entry/logbook73.guide.digirig/software))                                           |
| PTT            | RTS · Handshake **none**                                                                      |
| CAT            | On — band-hopping is half the joy of FT8                                                      |
| Radio settings | Data mode, data-port input, power modest, **ALC asleep**                                      |

Field notes: work the [levels procedure](outpost:entry/logbook73.guide.digirig/levels) into a dummy load before the first on-air call; log the OS level numbers on the radio's card. Evening 40 m and daytime 20 m forgive everything except overdrive. The [FT8 chapter](outpost:entry/logbook73.handbook/ft8) covers the operating culture.

## 2 · APRS with a handheld (the budget packet station)

An HT you already own, a Digirig, and Direwolf — suddenly you are a [packet station](outpost:entry/logbook73.handbook/packet-radio) on the local APRS frequency.

| Piece          | Choice                                                                             |
| -------------- | ---------------------------------------------------------------------------------- |
| Digirig        | Mobile in any configuration (audio+PTT only) — or a Lite, if CAT will never matter |
| Cable          | The HT family's speaker-mic set (Baofeng/Kenwood two-pin etc.)                     |
| Software       | Direwolf as the modem; your APRS client of choice above it                         |
| Radio settings | **VOX off** · volume at the marked spot · squelch open                             |
| PTT            | RTS via the cable's mic-line keying                                                |

Field notes: over-deviation is the classic FM packet failure — creep the levels up only until [an iGate hears you reliably](outpost:entry/logbook73.handbook/aprs-igates), then stop. Path discipline and beacon manners live in the [APRS chapters](outpost:entry/logbook73.handbook/aprs-paths). And when you want this running 24/7 without a laptop, this exact recipe is what a [DigiPi
](outpost:entry/logbook73.guide.digipi/configs) bakes into a Raspberry Pi.

## 3 · Winlink go-kit (email when everything else is down)

The emergency-communications classic: radio email through HF or VHF gateways, rehearsed _before_ it matters.

| Piece    | Choice                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| Digirig  | Mobile — go-kits deserve CAT's set-and-verify certainty                                    |
| Software | Winlink Express (Windows) or Pat (cross-platform) with a sound-card modem such as ARDOP    |
| PTT      | RTS — deterministic keying for long machine-driven overs                                   |
| Extras   | Ferrites fitted _now_, not after the first field failure; printed settings card in the kit |

Field notes: Winlink sessions are long, full-duty transmissions — set power with the radio's duty-cycle manners in mind and prove the whole chain quarterly with a real message to yourself. The [DigiPi's Winlink service](outpost:entry/logbook73.guide.digipi/winlink) offers the same capability shelf-mounted, phone-driven.

## 4 · The DigiPi companion (shelf station, phone control)

Not a station _with_ a computer — a station that _is_ the computer. A Raspberry Pi running the [DigiPi image](outpost:entry/logbook73.guide.digipi/overview) uses the Digirig as its radio interface and hands you every mode as a web page on your phone.

| Piece   | Choice                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Digirig | **Mobile — explicitly; the DigiPi project lists the Mobile, not the Lite, among its supported interfaces**   |
| Pi      | Per the [DigiPi hardware chapter](outpost:entry/logbook73.guide.digipi/hardware) — Zero 2 W upward                                 |
| Cable   | Your radio's family set, exactly as in recipes 1–2                                                           |
| Setup   | The [DigiPi install chapter](outpost:entry/logbook73.guide.digipi/install); the Digirig side needs nothing beyond being plugged in |

Field notes: everything this guide taught about levels and RF hygiene applies unchanged — the Pi is just a very small Linux computer that never gets bored. Label this Digirig if a second one lives at the desk; the official multi-unit advice exists because everyone eventually confuses them.

## The card that lives in every bag

Whatever the recipe, the same handful of facts wants to travel with the hardware. Copy per station:

| Field                               | Value                          |
| ----------------------------------- | ------------------------------ |
| Radio + socket used                 | ____________________           |
| Digirig serial configuration        | Logic / RS-232 / CI-V / TX-500 |
| CAT baud (and CI-V address if Icom) | ____________________           |
| OS playback / recording levels      | _______ % / _______ %          |
| App level (e.g. WSJT-X Pwr)         | ____________________           |
| HT volume mark (if HT)              | ____________________           |
| PTT method                          | RTS on COM ____ / CAT          |

Ten minutes of clerical work, and any of these stations can be rebuilt from a bare computer in a car park — which is, in the end, the difference between owning equipment and owning a station.
