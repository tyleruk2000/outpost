# Menu reference — documented options at a glance

Every setting on the Baofeng UV-5R hides behind a two- or three-letter code and a number from 0 to 40, and the factory manual does little more than list them. It will tell you that menu 36 is `RP-STE` with values `OFF/1…10`, but not what a repeater squelch tail is, why you would want to eliminate it, or which number to choose. This page is the map: all forty-one items in the order the radio presents them, each with a one-line job and a sensible starting value — and a link to the chapter that tells the whole story.

## How to read this page

Use it two ways. As a **quick reminder** when a cryptic code on the screen has you stumped, and as an **index** into the two deep-dive chapters, where every item worth explaining gets the full treatment: what it does, what the radio is doing inside, why the feature exists at all, sensible values, a UK-leaning recommendation, a worked example and the mistakes people make.

The **Set to** column is a starting point, not gospel — a UK-flavoured "if in doubt, this" — and every recommendation carries a one-glance verdict:

| Symbol | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| ✅     | Set it like this and forget it — right for almost everyone |
| ⭐     | Genuinely useful, depending on how you operate             |
| ⚠️     | Advanced — understand it before you enable it              |
| ❌     | Leave it off unless you have a specific reason             |

Where a cell just says "taste", "as needed" or "match the repeater", the honest answer is that there is no universal right value — the linked chapter explains how to choose. Throughout, recommendations lean towards UK amateur practice; the underlying reasoning is universal, so elsewhere take the concept and check your national band plan and licence conditions.

## How the UV-5R menu works

The whole menu is one flat list of numbered items, and just three keys drive it:

- **`MENU`** opens the list and, pressed again, dives into the highlighted item — and once you are inside, `MENU` a third time saves your choice.
- **`▲` / `▼`** step through the items, and step through an item's values once you are inside it.
- **`EXIT`** backs out one level and clears a half-typed entry.

So the rhythm for any setting is: press `MENU`, either scroll with `▲`/`▼` or **key the item's number straight in** (on most units, typing `2` `5` jumps you to menu 25 far faster than scrolling to it), press `MENU` to open it, change the value with `▲`/`▼`, then press `MENU` once more to save. `EXIT` a couple of times returns you to the standby screen, and if you walk away the menu times out on its own. Crucially, **nothing commits until you press `MENU` on the value**, so you can browse the whole list freely without changing a thing — a good way to learn the radio on a wet afternoon.

Two UV-5R quirks are worth knowing before you start, because between them they cause most of the "why won't this menu change?" confusion:

- **Most per-channel settings are frozen in memory mode.** The manual is blunt about it: in channel mode, the tones (CTCSS/DCS), wide/narrow, PTT-ID, busy lockout, S-CODE, scan-add and the channel name are all locked — only High/Low power can be nudged. That is because a memory channel is a saved snapshot, not a live frequency. To change any of the rest, switch to VFO (frequency) mode, make the change there, and store it back into the channel. If you are new to VFO versus memory mode, [Getting Started](outpost:entry/logbook73.guide.uv-5r/getting-started) walks through both.
- **A few items can only be set from a computer.** `ANI` (menu 15), `S-CODE` (menu 17) and channel _names_ are all marked "PC software only" — the radio shows them but will not let you edit them from the keypad. You program the UV-5R with the free, open-source CHIRP over an inexpensive USB cable, which is one of this radio's genuine strengths, and that is where those items — and the fastest way to load a hundred channels — actually live.

One control is not on the menu at all: the **1750 Hz toneburst** that some repeaters need to open. Hold `PTT`, then tap the `BAND` key, and the radio sends the burst. [Repeaters](outpost:entry/logbook73.handbook/repeaters) explains where you still meet it — much of Europe, including a good number of older UK machines, though CTCSS tone access has largely taken over.

## Find a setting by what you want to do

If you know the _job_ but not the number, start here, then read the item's full entry in the linked chapter.

| I want to…                        | Look at                                                  |
| --------------------------------- | -------------------------------------------------------- |
| Quiet the background hiss         | `SQL` (0)                                                |
| Turn the transmit power down      | `TXP` (2)                                                |
| Set up a repeater                 | `SFT-D` (25), `OFFSET` (26), `T-CTS` / `T-DCS` (13 / 12) |
| Only hear my own group            | `R-CTS` / `R-DCS` (11 / 10)                              |
| Match a narrow (12.5 kHz) channel | `W/N` (5)                                                |
| Stop talking over people          | `BCL` (23)                                               |
| Stretch the battery               | `SAVE` (3), `ABR` (6)                                    |
| Watch two frequencies at once     | `TDR` (7), `TX-AB` (34)                                  |
| Store or tidy a memory            | `MEMCH` (27), `DELCH` (28)                               |
| Start again from factory defaults | `RESET` (40)                                             |

## A few honest notes before you dive in

- **Two power levels, not three.** Menu 2 `TXP` offers only High (roughly 4–5 W) and Low (around 1 W) — there is no medium step. Run Low whenever it reaches the other station; it is easier on the battery and kinder to the band. [RF Power](outpost:entry/logbook73.handbook/rf-power) explains why lowest-that-works is good manners as well as good sense.
- **No 8.33 kHz step.** Menu 1 `STEP` tops out at 25 kHz, so the UV-5R cannot land exactly on the 8.33 kHz channels the European aviation band now uses. For the 2 m and 70 cm amateur bands, where you will spend all your transmitting time, 12.5 kHz and 25 kHz cover everything.
- **The signal-strength meter is mostly decorative.** Many UV-5R units peg the S-meter or leave it dead, so do not read much into the bars. It is not a menu setting — just a thing to know so you do not chase a fault that is not there.
- **It is a sensitive receiver with a wide-open front end.** The UV-5R hears well, but with very little filtering ahead of its first stage it can overload near strong transmitters — broadcast, paging or cellular sites, or a big outdoor antenna — and serve up [ghost signals](outpost:entry/logbook73.handbook/overload-and-ghost-signals) that are not really on the frequency you are hearing. No menu setting cures this; a modest antenna, or a band-pass filter for fixed use, does. It is the classic trade-off for the price, and worth knowing before you blame the radio.

## Menus 0–20 — the everyday settings

These are the items you actually touch: squelch, power, tones, dual-watch and the time-out timer. Full explanations, item by item, in [Menus 0–20 explained](outpost:entry/logbook73.guide.uv-5r/menus-1).

| No. | Item     | What it does                                                                                      | Set to                |
| --- | -------- | ------------------------------------------------------------------------------------------------- | --------------------- |
| 0   | `SQL`    | Squelch threshold — mutes the background hiss until a signal is strong enough to cross it (0–9)   | ✅ 3–5                |
| 1   | `STEP`   | How far the frequency moves per knob click or arrow press (2.5 / 5 / 6.25 / 10 / 12.5 / 25 kHz)   | ✅ 12.5 kHz for ham   |
| 2   | `TXP`    | Transmit power — the UV-5R offers only High (~4–5 W) or Low (~1 W)                                | ⭐ Low where it works |
| 3   | `SAVE`   | Receiver battery-save micro-sleep to stretch the charge (OFF / 1–4)                               | ✅ ON (e.g. 3)        |
| 4   | `VOX`    | Transmit hands-free when it hears your voice; the number sets sensitivity (OFF / 1–10)            | ❌ OFF                |
| 5   | `W/N`    | Wide or narrow FM deviation for the current channel                                               | ✅ match the channel  |
| 6   | `ABR`    | How long the backlight stays lit after a key-press (OFF / 1–5 s)                                  | ⭐ 5 s                |
| 7   | `TDR`    | Dual-watch — keep an ear on both VFOs and receive on whichever wakes up                           | ⭐ ON                 |
| 8   | `BEEP`   | The confirmation chirp on each key-press                                                          | ✅ ON (taste)         |
| 9   | `TOT`    | Time-out timer — cuts a transmission that runs on too long (15–600 s)                             | ⭐ 180 s              |
| 10  | `R-DCS`  | Only open the squelch when a matching digital code arrives (OFF / D023N…D754I)                    | ⭐ shared channels    |
| 11  | `R-CTS`  | Only open the squelch for a matching analogue sub-tone (67.0–254.1 Hz)                            | ⭐ shared channels    |
| 12  | `T-DCS`  | Send a digital sub-tone on transmit, e.g. to open a repeater                                      | match the repeater    |
| 13  | `T-CTS`  | Send an analogue CTCSS sub-tone on transmit                                                       | match the repeater    |
| 14  | `VOICE`  | Speaks menu numbers and actions aloud as you press keys                                           | ❌ OFF (taste)        |
| 15  | `ANI`    | The radio's automatic ID code — set only via PC software                                          | ⚠️ leave default      |
| 16  | `DTMFST` | Whether you hear the DTMF tones as the radio sends them                                           | ⭐ taste              |
| 17  | `S-CODE` | Which of 15 DTMF signalling groups is active — set only via PC software                           | ⚠️ leave default      |
| 18  | `SC-REV` | How a scan resumes: on a timer (TO), when the carrier drops (CO), or search-and-hold (SE)         | ⭐ CO                 |
| 19  | `PTT-ID` | Send an identifying DTMF burst at the start and/or end of a transmission (OFF / BOT / EOT / BOTH) | ❌ OFF for ham chat   |
| 20  | `PTT-LT` | A short delay before that PTT-ID code is sent (0–30 ms)                                           | ✅ default            |

## Menus 21–40 — display, repeater and reset

The back half of the list handles how channels show on screen, the repeater duplex shift, the backlight colours and the housekeeping items. Full explanations in [Menus 21–40 explained](outpost:entry/logbook73.guide.uv-5r/menus-2).

| No. | Item     | What it does                                                                            | Set to              |
| --- | -------- | --------------------------------------------------------------------------------------- | ------------------- |
| 21  | `MDF-A`  | What the top line shows in channel mode: frequency, channel number or name              | ⭐ FREQ or NAME     |
| 22  | `MDF-B`  | The same choice for the bottom line                                                     | ⭐ FREQ or NAME     |
| 23  | `BCL`    | Busy-channel lockout — refuse to transmit onto a channel already in use                 | ✅ ON               |
| 24  | `AUTOLK` | Lock the keypad automatically after a spell with no key-presses                         | ⭐ ON               |
| 25  | `SFT-D`  | Duplex offset direction for repeaters (OFF / + / −)                                     | ⭐ OFF for simplex  |
| 26  | `OFFSET` | Size of the repeater duplex shift, in MHz (00.000–69.990)                               | ⭐ match band plan  |
| 27  | `MEMCH`  | Store the current VFO setup into a numbered memory (000–127)                            | ✅ as needed        |
| 28  | `DELCH`  | Delete a stored memory channel (000–127)                                                | ⭐ housekeeping     |
| 29  | `WT-LED` | Backlight colour on standby (OFF / blue / orange / purple)                              | taste               |
| 30  | `RX-LED` | Backlight colour while receiving                                                        | taste               |
| 31  | `TX-LED` | Backlight colour while transmitting                                                     | taste               |
| 32  | `AL-MOD` | What the alarm does: sound locally (SITE), send a tone (TONE) or send a code (CODE)     | ⚠️ understand first |
| 33  | `BAND`   | Which band the current VFO tunes — VHF or UHF                                           | ✅ as needed        |
| 34  | `TX-AB`  | While dual-watching, which VFO the PTT transmits on (OFF / A / B)                       | ⭐ default          |
| 35  | `STE`    | Squelch-tail elimination on simplex — trims the noise burst as the other station unkeys | ✅ ON               |
| 36  | `RP-STE` | Squelch-tail elimination when working through a repeater (OFF / 1–10)                   | ⭐ default          |
| 37  | `RPT-RL` | Repeater tail-tone delay (OFF / 1–10)                                                   | ⚠️ default          |
| 38  | `PONMSG` | Boot screen — full display or your welcome message (FULL / MSG)                         | taste               |
| 39  | `ROGER`  | A "roger" beep at the end of every transmission                                         | ❌ OFF              |
| 40  | `RESET`  | Restore defaults — just the VFO settings, or everything (VFO / ALL)                     | ⚠️ keep a backup    |

## The handful that actually matter

Forty-one items looks daunting, but on a day-to-day UV-5R only a few move the needle. Get these five right and the rest is refinement:

- **`SQL` (0)** — set it just high enough to silence the hiss and no higher. Wind it up too far and you will miss weak signals; the sweet spot for most operators is 3–5. It is the setting you will reach for most often.
- **`TXP` (2)** — run **Low** unless you genuinely need the extra range. It is easier on the battery, cleaner on the band, and the mark of a considerate operator. High is there when you need to reach a distant repeater; it is not the everyday default.
- **`W/N` (5)** — match the channel's spacing. UK 2 m and 70 cm are largely **narrow** (12.5 kHz) now; get this wrong and you will either splatter into the neighbouring channel (wide on a narrow channel) or sound quiet and muffled (narrow on a wide one). See [modulation](outpost:entry/logbook73.handbook/modulation) for why deviation matters.
- **`BCL` (23)** — turn it **on**. Busy-channel lockout stops you keying up on top of a conversation already in progress, which is the single easiest courtesy the radio can enforce for you.
- **`TOT` (9)** — leave it at a few minutes. If a PTT sticks down in your bag, the time-out timer drops the transmitter before you hold an entire repeater hostage.

Everything else on the list is either a per-repeater detail (the tone and offset menus), a personal preference (backlight colours, boot screen, beeps) or an advanced feature you will grow into. When one puzzles you, that is what the two deep-dive chapters are for.

## Key takeaways

- The UV-5R exposes **41 numbered menu items (0–40)**; this page indexes every one with a one-line job and a UK-leaning starting value, plus a verdict symbol.
- Drive the menu with **`MENU` → scroll or key the number → `MENU` → `▲`/`▼` → `MENU` to save**, with `EXIT` to back out — and nothing commits until you confirm, so browsing is safe.
- **Most per-channel settings are frozen in memory mode** — edit them in VFO mode and store them back — and a few (`ANI`, `S-CODE`, channel names) are **software-only**, best handled in CHIRP.
- The five worth burning into memory: **`SQL` 3–5, `TXP` Low, `W/N` to match the channel, `BCL` on, `TOT` a few minutes**.
- Menus **0–20** cover everyday operating; menus **21–40** cover display, repeater and reset — each block links to its full explanation.

Ready for the detail? Start with the everyday settings in [Menus 0–20 explained](outpost:entry/logbook73.guide.uv-5r/menus-1).
