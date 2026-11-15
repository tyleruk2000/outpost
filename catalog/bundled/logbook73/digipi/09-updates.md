# Versions, updates and the community

DigiPi moves briskly — at the time of this guide's review the current image is **2.2-1 (September 2026)**, with **2.1-3** the prior release still offered — and because the system runs as a read-only appliance, staying current works differently from the operating systems you are used to. This chapter covers the update model, where releases and help actually live, and the honest state of the source code story.

## The update model: re-flash, don't patch

There is no package manager ritual and no in-place upgrade path to babysit. A DigiPi update is:

1. **Download the new image** via the supporter link (same route as [the original install](outpost:entry/logbook73.guide.digipi/install)).
2. **Flash it to a card** — ideally your _spare_ card, keeping the current one intact.
3. **Boot, reconfigure, shake down** — wifi, callsign, passcodes, grid, then the [ten-minute shakedown](outpost:entry/logbook73.guide.digipi/install).
4. **Demote the old card to spare** once the new one has proven itself.

The costs and gifts of this model are two sides of one coin. Cost: your settings live in the sanctioned configuration, so a new image means re-entering them — keep a **settings card** in the go-kit (callsign/SSIDs, APRS-IS passcode source, Winlink account, wifi details) exactly as the [(tr)uSDX calibration card](outpost:entry/logbook73.guide.digipi/quick-reference) tradition suggests. Gift: **updates cannot half-happen.** There is no partially-upgraded state, no dependency tangle, and rollback is literally swapping cards back. For an appliance, that trade wins.

Two cards, rotated, is the whole strategy: one running, one spare carrying either the same image (disaster recovery) or the next one (upgrade in waiting).

## Versions and the pace of the project

The 2.x line is where DigiPi lives now. Release announcements arrive through the project's channels rather than any in-box updater, so "is there a new version?" is answered where the community lives (below). This guide deliberately records only the versions current at its review date — **2.2-1**, with **2.1-3** behind it — rather than pretending to a changelog it would immediately outdate; the project's own announcements are the source of truth for what each release adds.

Should you chase every release? The appliance answer: **update when a release brings something you want, or fixes something you feel** — and always via the two-card method so curiosity is free. A shelf iGate that is behaving perfectly owes nobody an upgrade this week.

## Where the project lives

| Channel                            | What it is for                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KM6LYW Radio on YouTube**        | The configuration/demo video the project points newcomers at, plus feature walkthroughs — genuinely the fastest way to _see_ a workflow before trying it |
| **The Patreon page**               | Supporter access to image downloads, and release announcements                                                                                           |
| **Discord**                        | The live community — the place where "has anyone seen this before?" gets answered while you are still holding the screwdriver                            |
| **The Google Groups mailing list** | The slower, searchable community memory                                                                                                                  |
| **`github.com/craigerl/digipi`**   | The public source and configuration files                                                                                                                |

## The source code story, told straight

The GitHub repository deserves precise words, because the project itself is precise about it. It contains the project's "original code, and modifications to existing GPL code" — and it states plainly that it is **"not a recipe for creating a bootable SD card image"**: it exists "largely for developers wanting to create their own radio/digipi project, GPL-compliance, and education."

So, the two true sentences that coexist: **all the software is open source and publicly available**, and **the convenient, assembled, bootable image is the supporter perk**. You can study any part of how DigiPi works, adapt it, or build your own path from public parts; what supporters fund is the considerable labour of the polished whole. If you build atop the repo, you are in "developer of your own project" territory — rewarding, educational, and explicitly what that code is published for — but this guide's install and troubleshooting chapters describe the official image, and the community's help naturally assumes it too.

## Housekeeping that goes with updates

- **Note the version on the card** (a sticker beats a memory) and in your station log; when behaviour changes, "which image is this?" is question one — the [troubleshooting chapter](outpost:entry/logbook73.guide.digipi/troubleshooting) asks it early.
- **Re-run the shakedown after any update**, especially the one deliberate transmission with levels checked — a new image is a new audio stack until proven otherwise.
- **Skim the announcement before flashing.** Two minutes of reading beats an evening of discovering a changed default in the field.
- **If an update changes how a mode behaves**, trust the announcement and the screen over this guide — the [web-interface chapter](outpost:entry/logbook73.guide.digipi/web-interface)'s rule that the interface evolves applies doubly across image versions.

Next: everything this guide has taught, condensed into buildable stations — [ready-made configurations](outpost:entry/logbook73.guide.digipi/configs).
