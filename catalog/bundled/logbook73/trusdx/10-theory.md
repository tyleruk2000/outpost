# The theory: class E, polar SSB and one small chip

You can operate the (tr)uSDX forever without this chapter. But this radio is one of the hobby's great teaching machines — a complete HF transceiver whose every trick is visible and explainable — and knowing _why_ it works turns its quirks into old friends. Four ideas carry the whole design: a switching amplifier, a polar transmitter, a direct-conversion receiver, and a small processor doing all of it in software.

## Idea one: the class-E amplifier, or why it barely gets warm

A conventional transmitter's power amplifier works like a precise volume knob: its transistors conduct _partially_, tracking the signal's shape. Faithful — and wasteful, because a transistor that is half-on with voltage across it and current through it is a heater. Linear HF amplifiers turning half their input into warmth is normal.

A **class-E** amplifier refuses the compromise. Its transistors are switches: fully on (current, no voltage) or fully off (voltage, no current) — in both states, almost no power is lost in the transistor. A carefully designed resonant network on the output turns the resulting square-ish switching into a clean sine wave at the antenna. The arithmetic is the radio's whole personality: with a typical efficiency around **85%**, five watts of RF costs about six watts of battery — which is how a `140 g` radio transmits without a heatsink worth the name, and why the receive-to-transmit current step (about `80 mA` to about `500 mA` at `13.8 V`) is so undramatic. [Amplifiers](outpost:entry/logbook73.handbook/amplifiers) covers the class alphabet properly.

The price: a switch has no "half". A class-E stage makes _one loudness_. Fine for CW and FM. A catastrophe for SSB — unless you cheat.

## Idea two: the polar transmitter, or how to cheat honestly

Any radio signal, however complex, can be described two ways. The familiar way: a wiggly voltage. The polar way: **a loudness (envelope) plus a pitch/timing (phase)** — like describing a singer by volume and note rather than by air-pressure graph. The (tr)uSDX transmits SSB by controlling the two halves separately:

- The **phase** half becomes a command stream to the clock-generator chip: _nudge the carrier this way, now that way_ — a frequency-agile carrier at constant strength, which the class-E stage amplifies happily.
- The **envelope** half throttles the PA's effective supply drive via PWM — the "PA Bias" machinery you calibrated in [chapter 6](outpost:entry/logbook73.guide.trusdx/calibration) — so the constant-loudness carrier acquires your voice's rises and falls at the last possible moment, _efficiently_.

Recombined at the antenna, envelope times phase equals SSB. The textbook name is **EER — envelope elimination and restoration** (Kahn's technique, 1952), reborn as "polar modulation" in every modern phone. Your (tr)uSDX is the rare place a radio amateur can own the technique bare, and its behaviours suddenly read as consequences: **TX Drive 8 = constant amplitude** is "envelope pinned to full" (CW/FM); SSB overdrive sounds _particular_ because it is the envelope path clipping; and the whole transmitter's cleanliness depends on those two paths staying in step — which the firmware sweats over, release after release ([Modulation](outpost:entry/logbook73.handbook/modulation) and [Transmitters](outpost:entry/logbook73.handbook/transmitters) give the broader map).

## Idea three: the direct-conversion receiver

The receive path is a **direct-conversion SDR**: the antenna signal is mixed straight down to audio by a switching mixer running at the tuning frequency — no intermediate frequencies, no crystal-filter chains. One mixer, one trick: the mixing happens _twice_, a quarter-cycle apart, producing the **I and Q** pair of audio signals. With both in hand, software can do what one signal alone cannot: tell **above** the tuning frequency from **below** it, select a sideband, and reject its mirror.

```viz
{
  "type": "spectrum",
  "title": "Why I/Q matters: the wanted sideband and its mirror",
  "caption": "A direct-conversion receiver hears both sides of its tuning frequency at the same audio pitch. The I/Q pair lets the firmware keep the wanted sideband and cancel the mirror — and menu 8.4 trims the cancellation to your board's actual components.",
  "components": [
    { "f": 30, "amp": 0.85, "width": 9, "label": "wanted USB signal", "tone": "primary" },
    { "f": 70, "amp": 0.85, "width": 9, "label": "mirror (cancelled in software)", "tone": "muted" }
  ],
  "noiseFloor": 0.12,
  "mask": { "kind": "bandpass", "from": 24, "to": 38 },
  "xLabel": "below ← tuning frequency → above"
}
```

The cancellation is only as good as the ninety-degree relationship between I and Q — hence `8.4 IQ Phase`, your board's personal trim. And the architecture explains the receiver's manners: superb simplicity and sensitivity for its size, but no big-rig filter fortress in front of the mixer, so very strong signals land on the attenuators' doorstep ([Receivers](outpost:entry/logbook73.handbook/receivers) compares the architectures; [Overload and Ghost Signals](outpost:entry/logbook73.handbook/overload-and-ghost-signals) names the failure modes).

## Idea four: all of it on a microcontroller

Here is the part that made the uSDX movement famous. Everything above — SSB generation, sideband selection, filtering, AGC, noise reduction, the CW decoder, the metering, the screen — runs on an **ATmega328-family microcontroller**: an 8-bit chip, the same silicon family as an Arduino Uno, with vastly less computing power than a musical greetings card believes in. PE1NNZ's firmware achieves it by ruthless economy — integer maths everywhere, samples processed the moment they arrive, every cycle budgeted.

That economy is why the menu wars of the beta series happen at all: flash and RAM are _full_. A new feature (spectrum view, USB audio, message memories) genuinely must evict something else, which is how menu items come and go between versions ([chapter 9](outpost:entry/logbook73.guide.trusdx/firmware)). It is also why the radio's DSP has character rather than luxury — the `50 Hz` filter rings, the NR gets watery at 8 — and why none of that matters: the engineering achievement is that a five-band, five-mode SDR transceiver _lives in that chip at all_, next to a clock generator (the MS5351/Si5351 family — see [Oscillators](outpost:entry/logbook73.handbook/oscillators)) and a handful of transistors.

## The philosophy: why QRP plus efficiency is a real strategy

Five watts sounds like a handicap and arithmetically barely is: the step from `5 W` to a `100 W` big rig is about `13 dB` — real, but just over two S-points on the meter of the station receiving you ([RF Power](outpost:entry/logbook73.handbook/rf-power) and [Decibels](outpost:entry/logbook73.handbook/decibels) make the case in full). [Propagation](outpost:entry/logbook73.handbook/propagation) and antenna quality swing far more than that between one day and the next. The (tr)uSDX's wager compounds it: if the transmitter wastes almost nothing, the battery you carry shrinks; because the battery shrinks, the whole station fits in a pocket; because the station is in your pocket, _you are on more summits, more parks and more holidays_ — and the operating you actually do beats the kilowatt you left at home.

Choose modes to match the wager — CW's narrow filter buys back most of the missing decibels, FT8's decoder buys back more than all of them — and the little radio stops feeling like a compromise and starts feeling like a strategy. The next chapter turns that strategy into [ready-made configurations](outpost:entry/logbook73.guide.trusdx/configs).
