# Troubleshooting

A radio this simple has refreshingly few ways to fail, and most "failures" are one setting, one cable or one habit. This chapter is organised by symptom, worst-panic first, and each entry ends at either a fix or an honest "this is now a hardware matter". Keep the [menu reference](outpost:entry/logbook73.guide.trusdx/menu-reference) open beside it.

## It will not transmit (or transmits nothing)

**Perfect receive, key or PTT does nothing measurable — no forward power, nobody answers.**

1. **`2.8 Practice` is ON.** The classic, and it survives power cycles. On beta builds without a Practice item, the same silence comes from **`3.3 TX Drive` at `0`** — check both first, always.
2. **Wrong jack.** Key and mic share one jack; phones/speaker is the other. A paddle in the phones jack keys nothing.
3. **Keyer mode mismatch.** A straight key with `2.6 Keyer Mode` on Iambic gives one endless dit or dah, or nothing sensible. Straight key → Straight mode.
4. **Metering says power but nobody answers?** That is not "no transmit" — that is [an antenna problem](#swr-is-high-or-power-is-low) or a band with nobody on it. Different disease, below.
5. Still nothing into a dummy load, with drive up and practice off — suspect the PA. If the radio also behaves oddly on receive after a known event (transmit into no antenna, a lightning-adjacent day), the output transistors head the suspect list; see [the last section](#when-it-is-actually-hardware).

## SWR is high, or power is low

**The onboard meter shows SWR beyond `2:1`, or forward power far below expectation.**

- **Antenna first, always:** connections, the right link closed on a linked dipole, the counterpoise attached, the wire not fallen out of its tree. An antenna analyser or [NanoVNA](outpost:entry/logbook73.handbook/nanovna) settles it without transmitting.
- **Right band, right filter?** Check `8.7` LPF config matches the fitted board, and that you are on a band the board actually serves ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)). A mismatch produces exactly this pair of symptoms.
- **Supply voltage.** Power scales with supply: a tired battery at `11 V` simply makes fewer watts than `13.8 V` — graceful, not broken. The display shows the voltage; believe it.
- **Kit builds, one band low:** that band's filter toroids. Rewinding and tuning per the official assembly guidance has rescued many a "weak on 30 m" kit.
- **Calibration:** `8.2 PA Bias max` set timidly gives low power everywhere; set past the knee it gives heat, not power ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration) has the procedure).

## Receive is deaf, distorted or haunted

- **Deaf everywhere:** antenna and band checks first (the number of "dead receivers" cured by reconnecting the BNC is humbling). Then attenuators: `1.10 ATT` and `1.11 ATT2` back to `0` — a forgotten `−33 dB` reads as deafness. Volume above zero; earphones out if you meant the speaker (plugging in kills the internal speaker by design).
- **Everything is loud mush at night on 80/40 m:** not deafness — overload. Step in `1.10 ATT`; the band will _clean up_, not quieten. [Overload and Ghost Signals](outpost:entry/logbook73.handbook/overload-and-ghost-signals) explains why less is more.
- **Every strong station has a backwards twin nearby:** IQ balance. Trim `8.4 IQ Phase` for a null ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)).
- **Voices only sound right off the round numbers; FT8 sits at the waterfall's edge:** reference-frequency drift. Recalibrate `8.3 Ref freq`.
- **Audio watery and muffled:** `1.9 NR` set high. Bring it toward `0` and fix the real problem with filters or attenuation.

## SSB reports are bad

**"Distorted", "harsh", "clipped" —** `3.3 TX Drive` too high; do the honest test in [chapter 4](outpost:entry/logbook73.guide.trusdx/ssb). **"Very weak" —** drive too low, or the wrong sideband for the band. **"Chopped-off words" —** `3.2 Noise Gate` set too high, eating your consonants. **"Hum/buzz on your audio" —** RF getting back into the mic path: choke the coax, rearrange the antenna ([chapter 7](outpost:entry/logbook73.guide.trusdx/antennas-swr)), and try battery power to rule out a noisy supply.

## CAT and digital modes misbehave

- **No CAT connection:** rig type must be **Kenwood TS-480**; baud **`115200` on firmware 2.00t and later, `38400` before** — the single most common mismatch after an update. Then the CH340 driver, then the cable (charge-only USB leads exist to waste your evening).
- **Port number keeps changing / vanishes:** plug in and power the radio _before_ starting driver and apps; on some systems ports are assigned at connection time. One physical USB socket, used consistently, helps.
- **USB drops out only when transmitting:** RF on the cable. Ferrites on USB and coax, antenna further away, lower drive to confirm the diagnosis ([chapter 8](outpost:entry/logbook73.guide.trusdx/digital) has the full list).
- **Audio-over-USB silent or glitchy:** confirm firmware **2.00u or later**, the driver/bridge app actually running, and the _virtual_ audio device selected in WSJT-X (not the laptop's speakers). When in doubt, the audio-cable-and-VOX path still works on any firmware and isolates the fault.
- **VOX won't trigger (cable path):** computer volume up a little, `3.2 Noise Gate` down a little, until transmit starts crisply with the tones.

## Settings, resets and firmware surprises

- **All settings suddenly default, calibration gone:** the encoder-hold **factory reset** ([chapter 1](outpost:entry/logbook73.guide.trusdx/getting-started)'s trap) or a firmware update. Either way the cure is the [calibration card](outpost:entry/logbook73.guide.trusdx/calibration) — ten minutes, done. Without a card: redo [chapter 6](outpost:entry/logbook73.guide.trusdx/calibration) from scratch.
- **Menu items missing compared to this guide:** your firmware version prunes or renames them — the beta series has removed and restored items ([chapter 9](outpost:entry/logbook73.guide.trusdx/firmware)). The screen is the truth for your build.
- **Update fails / radio won't take firmware:** AVRDudess settings exactly as documented — Programmer _Arduino_, baud `115200`, MCU _ATmega328P even on a 328PB board_, fuse boxes **unchecked**. Wrong COM port and charge-only cables cause most of the rest.
- **No serial number at power-up (or one starting `7000…`):** the official pages are explicit — bootloader absent or fuse trouble, or a hardware defect. An official-seller radio deserves a support conversation; a bare kit needs the one-time ISP bootloader install ([chapter 9](outpost:entry/logbook73.guide.trusdx/firmware)).

## The speaker/mic/key jack family

Symptoms that turn out to be the two 3.5 mm jacks doing their documented jobs: **internal speaker silent** (something is in the phones jack), **onboard mic dead** (an external mic is connected), **key does nothing** (it is in the phones jack), **PTT sends dits** (you are in CW mode, where PTT is the documented emergency key — a feature wearing a disguise).

## When it is actually hardware

The honest short list for a radio built from published schematics:

- **Output transistors (the PA finals):** the usual casualty of transmitting into a bad mismatch or no load. Symptoms: no or tiny output with everything else normal. On the standard build these are inexpensive parts, and replacing them is a known, documented community repair — this is the most fixable "dead radio" in amateur radio.
- **The USB interface chip:** static or a hostile USB source can kill CAT while the radio otherwise works. The radio remains a radio; the repair is fiddlier.
- **Anything after a kit build that never worked right:** back to the assembly documentation with a multimeter, in order — supply rails, then the digital section, then RF. The official assembly resources and forum are genuinely good at this, and [Measurement and Construction](outpost:entry/logbook73.handbook/measurement-and-construction) covers the bench skills.

The pattern across this whole chapter: check the _setting_, then the _cable_, then the _antenna_, and only then the silicon. The radio is simple enough that this order resolves almost everything — which is one more thing the big rigs quietly envy about it.
