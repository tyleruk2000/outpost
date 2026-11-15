# CB, 6 m and the FM-only limit

Look down the RT-950 Pro's specification and you will see it listed as transmitting on the 27 MHz Citizens' Band, on 6 metres, and across the usual 2 m and 70 cm amateur bands. That makes it tempting to think of it as a do-everything transmitter. It is not — and the two reasons why (it is **FM-only**, and it is **not a legal CB set**) are worth understanding properly, because getting them wrong is one of the few ways this radio can land you on the wrong side of the rules.

## The FM-only limit

Here is the single most important fact about the RT-950 Pro's transmitter: **it transmits FM, and only FM, on every band.** The receiver is gloriously versatile — it will demodulate AM, single sideband (USB and LSB) and CW, which is why it makes such a good shortwave listener (the [next chapter](outpost:entry/logbook73.guide.rt-950-pro/receive-radio) is all about that). But none of those modes work on _transmit_. Key up and the radio sends FM, whatever the display says you are listening to.

That one limitation quietly decides where the radio is actually useful on the air, because the popular modes on the bands it can _reach_ below 2 m are mostly **not** FM:

- On **CB**, the traditional modes are AM and SSB.
- On **10 m and the low end of 6 m**, the DX action is SSB and CW.

An FM-only set simply cannot join those conversations, even where it would otherwise be allowed to. So although the hardware "can transmit" on several bands, the modes it can transmit in narrow that down a great deal.

## What it can actually transmit

Radtel's own specification lists the transmit ranges as the **27 MHz CB segment**, roughly **49–53 MHz**, **136–174 MHz** (2 m) and **400–520 MHz** (70 cm). Everything else the radio hears — long, medium and short wave, the aviation airband, FM broadcast — it can only _receive_.

| Band            | Transmit?   | Mode    | In practice                                      |
| --------------- | ----------- | ------- | ------------------------------------------------ |
| 27 MHz (CB)     | Yes, ~3–4 W | FM only | Legally a dead end — see below                   |
| 6 m (50–53 MHz) | Yes, ~4–5 W | FM only | Usable for a licensed amateur, in the FM segment |
| 10 m (28 MHz)   | **No**      | —       | Receive only, despite some reviews               |
| 2 m (144 MHz)   | Yes         | FM      | Your everyday band                               |
| 70 cm (430 MHz) | Yes         | FM      | Your everyday band                               |

For a UK amateur, then, the bands you will genuinely use on transmit are **2 m, 70 cm and the FM part of 6 m**. The rest is either receive-only or, in CB's case, off-limits.

## CB (27 MHz): it can, but you must not

The radio _will_ transmit on the 27 MHz Citizens' Band, in FM, at around 3–4 watts. It is still the wrong tool for two separate reasons, and either one on its own settles it. (Tellingly, CB does not even appear on the radio until you switch it into [All Band Test Mode](outpost:entry/logbook73.guide.rt-950-pro/getting-started) — it sits off the normal operating path for a reason.)

**First, the mode is wrong.** UK and European CB does allow FM (that is the traditional UK CB mode), so on the face of it an FM set fits. But most of the CB activity you will actually hear — especially the long-distance "skip" that makes CB fun when the band is open — is **AM and SSB**, which this radio cannot transmit. So even in a world where using it were fine, you would be talking in a mode much of the band is not listening to.

**Second, and decisively, it is not a legal CB radio.** In the UK, CB is _licence-exempt_ — but only for equipment that **conforms to Ofcom's CB technical requirements** (the interface requirements: IR 2027, for angle-modulated FM/PM sets, and IR 2027.2, June 2021, for AM/SSB and DSB). Ofcom is explicit that it is an offence to use CB equipment that does not conform. A wide-transmit "export"-style amateur handheld like the RT-950 Pro does not carry that conformity, so using it on CB is **not covered by the exemption — regardless of mode, FM included.** And your amateur licence does not rescue it either, because 27 MHz is not an amateur allocation (the 10 m amateur band begins at 28 MHz). The transmission is authorised by neither route, which makes it unlawful.

> **The short version:** the RT-950 Pro has a CB transmitter, and you should not use it as one. If you want licence-free CB, buy a type-approved CB set. If you want 27 MHz for the hobby, that is not how amateur radio works — the nearest amateur band is 10 m, which this radio cannot transmit on anyway.

Other countries frame it differently but reach the same place: the United States, for example, now permits FM as a CB mode, but still requires the radio to be **FCC Part 95 certified**, which this one is not. Wherever you are, the conclusion holds — check your national regulator, but do not expect a wide-TX amateur handheld to be a legal CB.

## 6 metres (50 MHz): where it earns its keep

Six metres is the happy exception. Here the RT-950 Pro is transmitting inside an amateur band, so a licensed operator can use it — in FM, in the band's FM area.

In the UK and across IARU Region 1, the 6 m **FM calling frequency is `51.510 MHz`**, with a set of FM simplex channels around it, and FM/digital-voice repeaters higher up. That is exactly the sort of local FM working the radio is built for, and it is a genuinely useful extra band to have in a handheld. Point it at `51.510`, listen, and call — during a summer [Sporadic-E](outpost:entry/logbook73.handbook/propagation) opening, 6 m FM can suddenly reach hundreds of kilometres.

What it _cannot_ do is join the weak-signal DX crowd lower in the band. The SSB and CW segment (around `50.100–50.500 MHz` in Region 1) is where the serious 6 m distance work happens, and it is doubly out of reach: partly because much of it sits below the radio's `49–53 MHz` transmit window's useful portion, but mostly because it is **SSB and CW — and the radio is FM-only.** Six metres, on this radio, means 6 m _FM_.

A regional note worth heeding: **do not transplant frequencies.** The UK/R1 6 m FM calling channel is `51.510 MHz`; in the US (band 50–54 MHz) the common 6 m FM calling frequency is `52.525 MHz`. The radio's `49–53 MHz` range covers both, but you must use the one your own band plan specifies. And a legal-vs-convention subtlety: in the UK the band-plan _segments_ (the FM area, the SSB area) are a **voluntary convention set by the RSGB, not law** — Ofcom sets only the band edges. So transmitting FM outside the 6 m FM segment is "against the band plan and inconsiderate", not "illegal" — but it is still the wrong thing to do, because it splatters into the weak-signal operators. Stay in the FM area.

## Not 10 metres — whatever the reviews say

You will occasionally see the RT-950 Pro described as a "10 m" transmitter. It is not. Its only transmit capability below 30 MHz is that 27 MHz CB segment, which is a completely different band from the 10 m amateur allocation at 28–29.7 MHz. The confusion comes from "11 m" (CB) and "10 m" sitting close together on the dial. On 10 m the RT-950 Pro is a **receiver only** — and a rather good one, in SSB and CW, as the next chapter explains.

## The bottom line

Strip away the marketing and the rule is simple, and it is the same rule this whole guide keeps returning to: **transmit only where your licence permits, in FM, on the bands the radio actually supports.** For almost everyone reading this in the UK, that means **2 m, 70 cm and 6 m FM** — and treating the CB transmitter as a feature that exists but stays switched off.

## Key takeaways

- The RT-950 Pro transmits **FM only** — its lovely AM/SSB/CW abilities are receive-only.
- Its transmit ranges are 27 MHz (CB), ~49–53 MHz (6 m), 2 m and 70 cm; it does **not** transmit on 10 m.
- It **can** transmit on CB but **must not** be used there: it is not a type-approved/conforming CB set (UK IR 2027/2027.2; US Part 95), and 27 MHz is not an amateur band — so the transmission is authorised by neither route.
- **6 m FM** is the worthwhile extra: call on `51.510 MHz` (UK/R1) or `52.525 MHz` (US), stay in the FM segment, and enjoy the Sporadic-E surprises.
- When in doubt: FM, in-band, within your licence — and check your own national band plan.

Its transmitter may be narrow, but its receiver is the opposite — next we open up the RT-950 Pro as a shortwave, AM and SSB listener in [The Receive-only Radio](outpost:entry/logbook73.guide.rt-950-pro/receive-radio).
