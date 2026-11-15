# Appendix

This is the reference card at the back of the book: the formulas, tables and conventions you will reach for again and again once the chapters that explain them have faded to a pleasant memory. Everything here has a home chapter where the _why_ lives — this page is for the _what_, laid out for quick lookup mid-session with a radio warm beside you. Bookmark it — and for interactive versions of the same material, the Toolbox keeps formulas and constants a click away.

## Formula collection, with worked examples

### Wavelength and antenna lengths

From [Frequency & Wavelength](outpost:entry/logbook73.handbook/frequency-and-wavelength), the 300 rule:

- `λ (metres) = 300 / f (MHz)`
- Half-wave dipole length in practice: `length (m) ≈ 143 / f (MHz)` — slightly shorter than λ/2 because wire is not free space.
- Quarter-wave vertical: `length (m) ≈ 71.5 / f (MHz)`

_Worked example:_ for the 20 m band at `14.2 MHz`: wavelength `300 / 14.2 = 21.1 m`; a half-wave dipole is `143 / 14.2 = 10.1 m` end to end (two 5.05 m legs); a quarter-wave vertical is `71.5 / 14.2 = 5.0 m`. Cut a little long and trim while measuring [SWR](outpost:entry/logbook73.handbook/swr) — wire is cheap, and you can only trim one way.

### Decibel conversions

From [Decibels](outpost:entry/logbook73.handbook/decibels):

- Power ratio to dB: `dB = 10 × log₁₀(P₂/P₁)`
- dB to power ratio: `ratio = 10^(dB/10)`
- Absolute power: `P(dBm) = 10 × log₁₀(P / 1 mW)`

The ladder worth memorising:

| dB    | Power ratio | Rough meaning        |
| ----- | ----------- | -------------------- |
| 0 dB  | ×1          | No change            |
| 3 dB  | ×2          | Double               |
| 6 dB  | ×4          | One S-unit (nominal) |
| 10 dB | ×10         | Order of magnitude   |
| 20 dB | ×100        | Two orders           |
| 30 dB | ×1,000      | Three orders         |

_Worked example:_ your 10 W transmitter, 3 dB of coax loss, an antenna with 6 dB gain: `+40 dBm − 3 dB + 6 dB = +43 dBm ≈ 20 W` effectively radiated in the favoured direction. The arithmetic is addition — that is the entire point of decibels.

### dBm ↔ watts

| dBm      | Power                | dBm     | Power     |
| -------- | -------------------- | ------- | --------- |
| −121 dBm | ~0.2 µV in 50 Ω (S3) | +20 dBm | 100 mW    |
| −73 dBm  | 50 µV in 50 Ω (S9)   | +30 dBm | 1 W       |
| −30 dBm  | 1 µW                 | +37 dBm | 5 W (QRP) |
| 0 dBm    | 1 mW                 | +40 dBm | 10 W      |
| +10 dBm  | 10 mW                | +44 dBm | 25 W      |
| +14 dBm  | 25 mW                | +50 dBm | 100 W     |

Every 10 dBm is ×10 in power; every 3 dBm is ×2. Between rows, interpolate with those two facts.

### Radio horizon

From [VHF](outpost:entry/logbook73.handbook/vhf), for antenna height `h` in metres, the radio horizon (which bends slightly beyond the visual one) is approximately:

- `d (km) ≈ 4.12 × √h (m)`
- Two stations: add their horizons.

_Worked example:_ your handheld at 2 m above ground: `4.12 × √2 ≈ 5.8 km`. The same handheld on a 300 m hill: `4.12 × √300 ≈ 71 km`. A repeater at 250 m talking to you at 10 m: `4.12 × √250 + 4.12 × √10 ≈ 65 + 13 = 78 km`. This is why [Building Your First Station](outpost:entry/logbook73.handbook/building-your-first-station) kept saying that height beats power.

### SWR ↔ return loss ↔ reflected power

From [SWR](outpost:entry/logbook73.handbook/swr): reflection coefficient `Γ = (SWR − 1) / (SWR + 1)`, return loss `RL (dB) = −20 × log₁₀(Γ)`, reflected power fraction `= Γ²`.

| SWR   | Return loss | Power reflected | Verdict                                    |
| ----- | ----------- | --------------- | ------------------------------------------ |
| 1.0:1 | ∞           | 0%              | Perfect (and suspicious — check the meter) |
| 1.5:1 | 14 dB       | 4%              | Excellent; stop tweaking                   |
| 2.0:1 | 9.5 dB      | 11%             | Fine for most rigs                         |
| 3.0:1 | 6 dB        | 25%             | Rig may reduce power; use an ATU           |
| 5.0:1 | 3.5 dB      | 44%             | Something is wrong — investigate           |
| 10:1  | 1.7 dB      | 67%             | Fault: open, short, or very wrong antenna  |

_Worked example:_ SWR 2:1 reflects 11% of your power — with 25 W out, 2.8 W comes back and ~22 W still leaves the antenna. Loss from mismatch is almost never the real problem below 2:1; the [transmission line](outpost:entry/logbook73.handbook/transmission-lines) loss usually matters more.

```viz
{
  "type": "response",
  "title": "The classic SWR dip",
  "caption": "What the table looks like on an analyser: SWR falls to a minimum at resonance and climbs either side — trimming the antenna moves the dip, it does not deepen it.",
  "curve": { "preset": "swr", "f0": 50, "bw": 30 },
  "markers": [
    { "x": 50, "label": "resonance" }
  ],
  "xLabel": "frequency",
  "yLabel": "SWR"
}
```

## Amateur bands at a glance

Frequencies shown per IARU Region 1; **allocations vary by region** (2 m runs to 148 MHz and 40 m to 7.3 MHz in Regions 2/3, for example), so treat this as the map and **check your national band plan and licence terms** via your national society (RSGB, ARRL, DARC…). Entry-level licences typically allow lower power on most of these bands — see [Getting Licensed](outpost:entry/logbook73.handbook/getting-licensed).

| Band  | Frequency range     | Character                                       |
| ----- | ------------------- | ----------------------------------------------- |
| 160 m | 1.810–2.000 MHz     | Night band; big antennas, atmospheric noise     |
| 80 m  | 3.500–3.800 MHz     | Regional nets, evenings and winter              |
| 60 m  | 5 MHz (channelised) | Restricted segments — check licence terms       |
| 40 m  | 7.000–7.200 MHz     | The reliable workhorse, day and night           |
| 30 m  | 10.100–10.150 MHz   | CW/data only; quiet and steady                  |
| 20 m  | 14.000–14.350 MHz   | The classic daytime DX band                     |
| 17 m  | 18.068–18.168 MHz   | 20 m's quieter sibling                          |
| 15 m  | 21.000–21.450 MHz   | Lively in high solar years                      |
| 12 m  | 24.890–24.990 MHz   | Sporadic but rewarding                          |
| 10 m  | 28.000–29.700 MHz   | Huge when open; FM and satellites at the top    |
| 6 m   | 50–52 MHz           | "The magic band" — sporadic-E summers           |
| 4 m   | 70.0–70.5 MHz       | A Region 1 speciality, not allocated everywhere |
| 2 m   | 144–146 MHz         | FM, repeaters, SSB DX, satellites               |
| 70 cm | 430–440 MHz         | Repeaters, satellites, high-duty digital        |

Useful spot frequencies (Region 1 conventions — check your band plan): `145.500 MHz` 2 m FM calling; `144.300 MHz` 2 m SSB calling; `433.500 MHz` 70 cm FM calling. FT8 sits at `7.074`, `14.074`, `21.074`, `28.074 MHz` worldwide (dial, USB — see [FT8](outpost:entry/logbook73.handbook/ft8)).

## Repeater conventions

Full detail in [Repeaters](outpost:entry/logbook73.handbook/repeaters); conventions vary by country, so here are the common ones side by side:

| Band  | Offset (input relative to output) | Notes                                                                   |
| ----- | --------------------------------- | ----------------------------------------------------------------------- |
| 10 m  | −100 kHz                          | 29.6 MHz region                                                         |
| 6 m   | −500 kHz                          | Sparse but present; varies by country                                   |
| 2 m   | **−600 kHz**                      | Near-universal: transmit 600 kHz below where you listen                 |
| 70 cm | **varies by country**             | +1.6 MHz in the UK, ±5 MHz in the Americas, +7.6 MHz in parts of Europe |

Access is almost always by **CTCSS** tone, but the conventions differ: in the UK each area shares one of a small set of tones (such as 71.9, 77.0, 82.5, 88.5, 94.8, 103.5, 110.9 or 118.8 Hz), while in North America tones are set repeater by repeater. Your radio must transmit the tone continuously; setting it to _receive_ tone squelch too keeps co-channel noise out. Find any repeater's frequencies and tone in your national society's repeater listings (RSGB, ARRL…) or community directories, then store the lot in your radio and on your LogBook73 Repeaters page. Modern rigs' "auto repeater shift" usually handles the offset once the band and direction are right.

## Connector guide

The full story lives in [Transmission Lines](outpost:entry/logbook73.handbook/transmission-lines); this is the identification parade:

| Connector               | Looks like                    | Typical use                                    | Watch out for                                                                                            |
| ----------------------- | ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PL-259 / SO-239 ("UHF") | Large threaded plug/socket    | HF and VHF rigs, most amateur coax             | Not truly 50 Ω — fine below ~150 MHz; solder joints need care                                            |
| BNC                     | Small bayonet twist-lock      | Handhelds (older), test gear, NanoVNA          | Quick and good to ~4 GHz; check it clicked home                                                          |
| SMA                     | Small threaded, ~6 mm         | Handheld antennas, SDR dongles, TinySA         | Male/female and **reverse-polarity (RP-SMA, from Wi-Fi gear)** confusion; finger-tight plus a nudge only |
| N-type                  | Large threaded, weatherproof  | VHF/UHF/microwave, masthead joints, high power | Excellent to 11 GHz+; don't confuse with PL-259 at a distance                                            |
| F                       | TV/satellite screw type, 75 Ω | TV coax, some SDR uses                         | 75 Ω, not 50 Ω; centre pin _is_ the cable's core wire                                                    |

Adaptors exist for every combination; each one adds a small loss and a possible fault, so use as few as you can and buy decent ones.

## RST and the phonetic alphabet

Traditional signal reports ([Amateur Radio](outpost:entry/logbook73.handbook/amateur-radio)) use RST — Readability, Strength, Tone (tone is used for CW; voice uses RS, while many digital modes use mode-specific reports such as SNR):

| Digit  | Readability (1–5)            | Strength (1–9)  | Tone (1–9, CW) |
| ------ | ---------------------------- | --------------- | -------------- |
| Lower  | 1 = unreadable               | 1 = faint       | 1 = rough      |
| Middle | 3 = readable with difficulty | 5 = fairly good | 7 = near pure  |
| Top    | 5 = perfectly readable       | 9 = very strong | 9 = pure       |

So `59` on voice is "perfectly readable, very strong"; `599` on CW adds a clean tone. Honest reports beat ritual ones — a genuine `33` tells the other station something useful.

The NATO phonetic alphabet, for spelling callsigns unambiguously:

|           |            |           |           |
| --------- | ---------- | --------- | --------- |
| A Alfa    | H Hotel    | O Oscar   | V Victor  |
| B Bravo   | I India    | P Papa    | W Whiskey |
| C Charlie | J Juliett  | Q Quebec  | X X-ray   |
| D Delta   | K Kilo     | R Romeo   | Y Yankee  |
| E Echo    | L Lima     | S Sierra  | Z Zulu    |
| F Foxtrot | M Mike     | T Tango   |           |
| G Golf    | N November | U Uniform |           |

`M7ABC` becomes "Mike Seven Alfa Bravo Charlie". Learn it cold; hesitating over "P" mid-pileup is a rite of passage best kept short.

## S-meter scale

Nominal calibration (HF; real meters vary — see [Decibels](outpost:entry/logbook73.handbook/decibels)); each S-unit is 6 dB, and S9 is defined as 50 µV at the receiver input:

| Reading  | Level (HF)          | Meaning                      |
| -------- | ------------------- | ---------------------------- |
| S1       | −121 dBm            | At the edge of detection     |
| S3       | −109 dBm            | Weak but workable            |
| S5       | −97 dBm             | Comfortable copy             |
| S7       | −85 dBm             | Good signal                  |
| S9       | **−73 dBm (50 µV)** | Strong                       |
| S9+20 dB | −53 dBm             | Very strong local            |
| S9+40 dB | −33 dBm             | Your neighbour is on the air |

A band with an S5 noise floor hides every signal below S5 no matter how good the receiver — the moral of [Noise](outpost:entry/logbook73.handbook/noise) in one table row.

## Q-codes: the working fifteen

Born as telegraph shorthand, now everyday vocabulary (each can be a question or a statement):

| Code | Meaning                                |
| ---- | -------------------------------------- |
| QRG  | Your exact frequency                   |
| QRL  | Is this frequency in use? / I am busy  |
| QRM  | Man-made interference                  |
| QRN  | Natural static                         |
| QRO  | Increase power                         |
| QRP  | Reduce power / low-power operating     |
| QRT  | Stopping transmission, closing down    |
| QRV  | Ready to operate                       |
| QRX  | Stand by, wait                         |
| QRZ  | Who is calling me?                     |
| QSB  | Fading signal                          |
| QSL  | Confirm receipt / contact confirmation |
| QSO  | A contact                              |
| QSY  | Change frequency                       |
| QTH  | Location                               |

"QRZ?" after a pileup, "QSY to 7.150", "my QTH is York" — you will use these within your first week.

## ADIF mode names

ADIF is the universal log-exchange format, and it is fussy about mode names — useful to know when importing or exporting from LogBook73, since awards and confirmations match on these exact strings:

| What you operated           | ADIF `MODE`    | ADIF `SUBMODE`           |
| --------------------------- | -------------- | ------------------------ |
| SSB voice (either sideband) | `SSB`          | `USB` or `LSB`           |
| Morse                       | `CW`           | —                        |
| FM voice (analogue)         | `FM`           | —                        |
| AM voice                    | `AM`           | —                        |
| FT8                         | `FT8`          | —                        |
| FT4                         | `MFSK`         | `FT4`                    |
| RTTY                        | `RTTY`         | —                        |
| PSK31                       | `PSK`          | `PSK31`                  |
| SSTV                        | `SSTV`         | —                        |
| Packet / APRS               | `PKT`          | —                        |
| JT65                        | `JT65`         | —                        |
| DMR / D-STAR / Fusion voice | `DIGITALVOICE` | `DMR` / `DSTAR` / `C4FM` |

The classic trap is FT4 (a submode of `MFSK`, not a mode) and PSK31 (a submode of `PSK`). When an import is rejected or an award mysteriously doesn't count a contact, a nonstandard mode string is the first suspect.

## Further reading

A short shelf, all long-lived and worth the money or the bookmark:

- **Your national society** — the RSGB (rsgb.org) in the UK, the ARRL (arrl.org) in the US, DARC in Germany and peers worldwide: current band plans, licensing guidance, training resources, club finders, and books aimed exactly at beginners.
- **IARU** (iaru.org) — the International Amateur Radio Union, the worldwide federation of national societies and the source of the regional band plans.
- **The ARRL Handbook** (arrl.org) — the American national society's annual encyclopedia of radio theory and practice; a lifetime reference that answers the questions this handbook deliberately kept short.
- **Signal Identification Wiki** (sigidwiki.com) — the community catalogue of "what is that signal?", with waterfall images and audio samples for hundreds of transmissions; the perfect companion to an evening with [SDR++](outpost:entry/logbook73.handbook/sdr-plus-plus).
- Your **local club** — no URL required; see [Amateur Radio](outpost:entry/logbook73.handbook/amateur-radio) for why it may be the best resource of all.

That closes the handbook. The tables above will wait patiently on this page; the bands will not — they are open right now, and your log is empty only until tonight. If you ever want the tour again, it starts back at [Welcome](outpost:entry/logbook73.handbook/welcome).
