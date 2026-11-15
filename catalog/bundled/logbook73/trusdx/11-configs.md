# Ready-made configurations

Everything the earlier chapters explain, condensed into setups you can copy. Each configuration lists the menu items that matter for the job and the values to start from; anything not listed stays at the sane defaults from the [menu reference](outpost:entry/logbook73.guide.trusdx/menu-reference)'s five-minute setup. Menu numbers follow the documented baseline — if your firmware hides or renumbers one ([chapter 9](outpost:entry/logbook73.guide.trusdx/firmware) explains why that happens), the _name_ is the thing to find.

## Before all of them: the once-only base

| Item                              | Value                | Why                                                                            |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `8.3` / `8.2` / `8.4` / `8.7`     | Calibrated, recorded | [Chapter 6](outpost:entry/logbook73.guide.trusdx/calibration) — nothing below works right without it |
| `1.8 AGC`                         | ON                   | Comfortable receive everywhere                                                 |
| `1.9 NR`, `1.10 ATT`, `1.11 ATT2` | `0`                  | Clean defaults; deploy on demand                                               |
| `1.12 S-meter`                    | `S-bar` (taste)      | Relative readings at a glance                                                  |
| `1.13 SWR meter`                  | `FWD-SWR`            | Trust, then verify anyway                                                      |

## 1 · SOTA / POTA CW day out

The radio's signature mission: summit or park, wire in a tree, minimum grams.

| Item              | Value                             | Why                                                |
| ----------------- | --------------------------------- | -------------------------------------------------- |
| `1.2 Mode`        | CW                                | The five-watt power mode                           |
| `1.3 Filter BW`   | `500 Hz` (→ `200` in pile-ups)    | Noise down, copy up                                |
| `2.1 CW Decoder`  | ON                                | A second pair of ears when wind and fatigue arrive |
| `2.4 Semi QSK`    | ON                                | Hear callers in your gaps                          |
| `2.5 Keyer Speed` | Your speed (`16–22` typical)      | Activations reward steadiness over speed           |
| `2.8 Practice`    | **OFF — check it**                | The classic "why is nobody answering"              |
| `4.2 CQ Message`  | `CQ SOTA DE <call>/P K` (or POTA) | Let the radio call while you log                   |
| `4.1 CQ Interval` | `5 s`                             | Calls itself, leaves listening room                |

Kit notes: linked dipole or EFHW ([chapter 7](outpost:entry/logbook73.guide.trusdx/antennas-swr)), a three-cell LiFePO4 or similar battery beltable in a jacket pocket, paddle, pencil. Power check on arrival: brief key-down, forward power sensible for your battery's voltage, SWR happy. The [SOTA](outpost:entry/logbook73.handbook/sota) and [POTA](outpost:entry/logbook73.handbook/pota) chapters cover spotting and the activation dance itself.

## 2 · FT8 anywhere

The most contacts per battery the hobby offers; the full walkthrough is [chapter 8](outpost:entry/logbook73.guide.trusdx/digital).

| Item             | Value                                               | Why                                   |
| ---------------- | --------------------------------------------------- | ------------------------------------- |
| `1.2 Mode`       | USB (all bands)                                     | Digital convention                    |
| `1.3 Filter BW`  | `3000` or Full                                      | The software wants the whole passband |
| `3.1 VOX`        | OFF with USB-audio driver · ON for audio-cable path | Keying per path                       |
| `3.2 Noise Gate` | Just above computer hiss (cable path)               | Clean VOX triggering                  |
| CAT              | TS-480 · `115200` (2.00t+)                          | Rig control and logging               |

Drive lightly (computer volume low, power steady and believable, never at the flat top), ferrites on coax and USB, and mind FT8's duty cycle on hot days.

## 3 · Evening SSB from the garden

Five-watt voice, done on its best terms: 40 m as the light goes, or 20 m on a good afternoon.

| Item                  | Value                           | Why                                                         |
| --------------------- | ------------------------------- | ----------------------------------------------------------- |
| `1.2 Mode`            | LSB (40/80 m) · USB (20 m)      | Band convention                                             |
| `1.3 Filter BW`       | `2400` (→ `1800` in crowds)     | Voice clarity vs. neighbours                                |
| `3.3 TX Drive`        | `4`–`6`, set by the honest test | [Chapter 4](outpost:entry/logbook73.guide.trusdx/ssb) — the sound of your station |
| `3.2 Noise Gate`      | Trimmed in a quiet moment       | Silence between words                                       |
| `3.1 VOX` / `3.5 MOX` | OFF / `0`                       | PTT discipline; self-monitoring only for checks             |
| `1.7 RIT`             | As needed — then OFF            | The eternal rule                                            |

Call answering rather than CQing when the band is busy — five watts wins by picking moments. Strong evening bands may also want a step of `1.10 ATT` on receive.

## 4 · The USB-only curiosity station

Everything from one USB power bank or laptop port: about half a watt out, and genuinely usable on FT8 and CW when propagation smiles.

| Item         | Value            | Why                                |
| ------------ | ---------------- | ---------------------------------- |
| Power        | USB `5 V` only   | The whole point                    |
| `1.2 Mode`   | USB + FT8, or CW | The modes that forgive milliwatts  |
| Expectations | QRPp             | Log distances-per-watt, not totals |

This configuration exists because it can, and because a first "impossible" contact at half a watt teaches more about [propagation](outpost:entry/logbook73.handbook/propagation) than a textbook. Check the reported supply voltage on the display and enjoy the absurdity.

## 5 · The go-bag / emergency-practice kit

Not a substitute for proper emergency services — a personal resilience exercise and a fine excuse to actually pack the bag.

| Item                 | Value                                                                                                                       | Why                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `1.2 Mode`           | CW first; SSB fallback                                                                                                      | Reach per watt                       |
| `4.2`–`4.7` messages | Call + locator strings pre-stored                                                                                           | Cold fingers, stored sense           |
| `10.1 Backlight`     | OFF when hoarding milliamps                                                                                                 | Every little helps                   |
| Kit                  | Radio, EFHW + cord, battery + USB lead (dual power paths), paddle, laminated [calibration card](outpost:entry/logbook73.guide.trusdx/calibration) | Two ways to power, one page of truth |

Remember the PTT-as-straight-key fallback ([chapter 5](outpost:entry/logbook73.guide.trusdx/cw)): even a broken paddle doesn't silence CW.

## 6 · The Hi-bands sunspot chaser

For the `20/17/15/12/10 m` filter build in years when the sun cooperates.

| Item             | Value                  | Why                                                               |
| ---------------- | ---------------------- | ----------------------------------------------------------------- |
| `8.7 LPF config` | Hi                     | Firmware must match the board                                     |
| `1.2 Mode`       | USB everywhere         | All five bands sit above 10 MHz                                   |
| Favourite band   | 10 m on open days      | Small antennas, worldwide DX, FM segment exists                   |
| `1.6 VFO Mode`   | Split, when chasing DX | The pile-up tool ([chapter 3](outpost:entry/logbook73.guide.trusdx/everyday-operating)) |

High bands are feast-or-famine: check a propagation view or cluster first, and when 10 m opens, a five-watt signal and a quarter-wave vertical behave like far more radio than you paid for in grams.

## Switching between configurations

The radio holds one set of settings, so "configurations" are really habits plus the handful of items in these tables — thirty seconds in the quick menu (hold left, turn) once the numbers are familiar. The items that never change between them are exactly the ones on your calibration card. If a firmware update or the factory-reset trap wipes the slate: card back in, base table above, then the job-specific column — five minutes to any of these setups from bare metal.
