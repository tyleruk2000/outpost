# Getting started: one knob, two buttons

A radio with one knob and two buttons should be simple, and it is — but its economy of controls means each of them has several jobs, distinguished by short presses, double presses, and holds. This chapter walks the hardware, powers the radio for the first time, and builds your fingers' vocabulary. Half an hour here makes the rest of the guide obvious.

## First look: the case and its connections

Pick the radio up. At `90 × 60 × 30 mm` and `140 g` it is smaller than most hand microphones. Around the case edges you will find:

| Connection                                  | What it is for                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BNC antenna socket**                      | Your antenna, always, before any transmit. `50 Ω`.                                                                                                                                                                 |
| **DC power input**                          | Main supply — nominally `13.8 V` for full output. Centre polarity and acceptable range are printed in the official documentation for your revision; never exceed the mid-teens of volts, never AC, never reversed. |
| **Micro-USB**                               | Firmware updates, CAT control and — on current firmware — digital-mode audio. Also powers the radio at reduced output (about `0.5 W`) from `5 V`.                                                                  |
| **Phones / external speaker jack** (3.5 mm) | Plugging anything in here automatically disconnects the internal speaker.                                                                                                                                          |
| **Key / external mic jack** (3.5 mm)        | Straight key or paddle in CW; external microphone/PTT in voice modes. The onboard microphone is disabled when an external one is connected.                                                                        |

Two details are worth absorbing on day one. First, **USB and the DC supply may be connected at the same time**; the official manual is explicit that the main supply always takes priority, so leaving both plugged in while you experiment is fine. Second, the **speaker and microphone are on the board itself** — so out of the box, with nothing plugged in at all, the radio can receive and even transmit SSB, which is a party trick no other HF rig this size can perform.

## The front panel

The OLED display sits above three controls:

- **The rotary encoder** (with push action) — tuning, value adjustment, and volume.
- **The left button** — the menu, mostly. Also power-on.
- **The right button** — mode changes and "get me out of here".

The (tr)uSDX's official documentation writes control gestures in a compact notation; this guide spells them out instead. "Double-press" means two quick presses; "hold" means press and keep pressed for about a second.

## Powering up (and down, and the reset trap)

1. Connect an antenna (or at least accept you are only listening).
2. Connect power — DC supply or USB.
3. **Press the left button.** The radio starts, and briefly shows its **serial number** — the number that identifies your board to the official firmware system. If you ever plan a firmware update, write it down now; [chapter 9](outpost:entry/logbook73.guide.trusdx/firmware) explains why.
4. You land on the main screen: frequency, mode, and meters.

Powering **off** is done through the volume: **turn the volume all the way down past zero** and the radio switches off. (On the menu scale, volume `0` is the off position; the display goes dark and the radio draws almost nothing.)

> **The reset trap.** _Holding the encoder button_ performs a **factory reset** — deliberately, as a documented recovery feature. It wipes your settings, including calibration values. It is astonishingly easy to trigger while fumbling in a pocket or pack, so learn this on day one: nothing in normal operation ever requires holding the encoder in. If your radio one day powers up with strange defaults and your calibration gone, this is almost certainly what happened; [chapter 6](outpost:entry/logbook73.guide.trusdx/calibration) covers writing your calibration numbers down so a reset is an annoyance, not a loss.

## The display

The exact layout varies a little between firmware versions, but the anatomy is stable:

- **Frequency**, large, centre — with the tuning-rate digit indicated so you know how far one encoder click will move you.
- **Mode** — LSB, USB, CW, AM or FM.
- **VFO letter** — A or B, and split status.
- **S-meter / power area** — signal strength on receive (in whichever style you chose in menu 1.12); during transmit, builds with metering enabled show forward power and SWR readings from the onboard bridge.
- **Supply voltage / status** — the radio measures its own supply; keep half an eye on it when running from batteries.
- **Decoded CW text** — in CW mode with the decoder enabled, received Morse prints along the display.

There is even a **spectrum view** on recent firmware (2.00t and later): **hold the left button and turn the encoder** and the radio sweeps and draws the band around you; your current tuning-rate setting acts as the zoom. It is a narrow, slow waterfall compared to a big SDR, but for "where is the activity?" it is genuinely useful. Release back to normal operation when done.

## The control vocabulary

This table is the heart of the chapter. The gestures are consistent across current firmware, and they are what the rest of this guide means by "select a mode" or "open the menu".

| Gesture                                             | What it does                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Turn encoder**                                    | Tune the VFO (or adjust the highlighted value when in a menu).                                                            |
| **Press encoder** (short)                           | Step the **tuning rate** to the next digit — the single most-used control on the radio.                                   |
| **Press encoder** (long-ish, still short of a hold) | Jump the tuning rate to a coarser digit for big excursions.                                                               |
| **Double-press encoder**                            | **Band selection** — hop between the configured bands.                                                                    |
| **Hold encoder**                                    | **Factory reset.** Do not.                                                                                                |
| **Press left button**                               | Open the **menu** (or power on, when off).                                                                                |
| **Hold left button + turn encoder**                 | **Quick menu**: skims straight through menu items and adjusts them live — the expert path once you know the menu numbers. |
| **Hold left button + turn encoder (2.00t+)**        | On spectrum-capable firmware this same gesture draws the **spectrum view** while tuning.                                  |
| **Press right button**                              | Change **mode** (LSB → USB → CW …); inside the menu, **exit**.                                                            |
| **Double-press right button**                       | Cycle the **audio filter bandwidth** for the current mode.                                                                |
| **Slow double-press right button**                  | Cycle **VFO mode** — VFO A, VFO B, split.                                                                                 |
| **Hold right button**                               | Toggle **RIT** (receive incremental tuning).                                                                              |

Two habits to build immediately:

1. **Tuning rate first.** The encoder moves by the selected digit — `1 kHz` per click for casual band-cruising, `100 Hz` or finer to net an SSB voice or CW note. A short encoder press moves the underline; you will do this constantly and unconsciously within a day.
2. **Right button means "back".** Whatever menu you are in, the right button walks you out. You cannot get lost.

## Navigating the menu properly

Press the left button and the menu opens; the encoder scrolls through numbered items (`1.1 Volume`, `1.2 Mode`, and so on — the numbering groups related items, and [chapter 2](outpost:entry/logbook73.guide.trusdx/menu-reference) tables them). Press the left button again to _enter_ an item, turn the encoder to change its value, and press the left button to confirm. The right button backs out to the main screen at any point.

The **quick menu** (hold left, turn) is the same menu without the ceremony: items stream past as you turn, values adjust immediately. Once you know that volume is `1.1`, filter is `1.3` and keyer speed is `2.5`, the quick menu is how you will actually drive the radio in the field.

Settings are saved to the radio's EEPROM so they survive power-off. (Firmware _updates_ are another matter — they erase settings, which is why calibration values belong on paper. [Chapter 9](outpost:entry/logbook73.guide.trusdx/firmware) has the ritual.)

## First listen: a five-minute exercise

1. Antenna on, power on, volume comfortable (menu `1.1`, or simply live with the default for now).
2. **Double-press the encoder** until you are on 40 m.
3. **Press the right button** until the mode reads **LSB**.
4. **Press the encoder** until the tuning rate is `1 kHz`, and cruise `7.10`–`7.20 MHz` in the late afternoon or evening. Voices will sound garbled until you slow down: drop the rate to `100 Hz` and tune until the voice snaps into naturalness. That two-stage hunt — coarse, then fine — is HF tuning in a nutshell.
5. **Double-press the right button** and hear the audio bandwidth tighten and relax. On a noisy band, the narrower settings buy comfort.
6. Drop down to `7.00`–`7.03 MHz`, switch mode to **CW**, and find a steady beacon-like signal. With the decoder on (menu `2.1`), text prints as it copies. Watch how it prefers clean, steady sending — a lesson every CW operator relearns forever.

## The first transmit checklist

Not yet — but soon. Before your first transmission of any kind, walk this list:

- **Licence covers the band and mode.** The fitted filter board defines what the radio can do; your licence defines what you may do. They are not the same list.
- **Antenna is resonant, or a tuner sits in line.** No ATU lives inside this radio, and its PA has no interest in forgiving a bad match. [Chapter 7](outpost:entry/logbook73.guide.trusdx/antennas-swr) first.
- **Supply is healthy.** Full output wants `13.8 V`; a sagging battery means less power and, at the extreme, odd behaviour. The display tells you.
- **Calibration has been done once.** PA bias and reference-frequency calibration ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)) make the difference between a rough radio and a right one — assembled units arrive with sane values, kits need you to set them.
- **You know where the power is going.** Enable the SWR/power metering ([chapter 2](outpost:entry/logbook73.guide.trusdx/menu-reference)) for your early transmissions and _look_ at it. Forward power where you expect, SWR under about `1.5:1`, no drama — then operate with confidence.

Next, the whole control system in one place: the [menu and button reference](outpost:entry/logbook73.guide.trusdx/menu-reference).
