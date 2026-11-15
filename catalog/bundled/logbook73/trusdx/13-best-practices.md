# Best practices

Everything in this chapter you could learn the slow way. It is the distilled habits of operating a tiny, efficient, slightly opinionated radio well — collected here so the radio lasts, the neighbours on frequency stay friendly, and the log keeps filling.

## Protect the PA like it is the whole radio (it nearly is)

- **Never transmit without a load.** Antenna or dummy load, checked by eye, every session. This single habit prevents the most common (tr)uSDX repair.
- **SWR check before power**: the three-second key-down ritual from [chapter 7](outpost:entry/logbook73.guide.trusdx/antennas-swr), every band change, every new antenna, every "the wind moved things" moment. Under `1.5:1`, operate; over `2:1`, stop and fix.
- **Calibrate `8.2` at the knee, not past it** ([chapter 6](outpost:entry/logbook73.guide.trusdx/calibration)). Past-the-knee is heat in the finals for zero extra signal.
- **Respect duty cycle in the sun.** FT8 afternoons on a black summit rock are the hardest thing you will ask of the PA. Shade, airflow, and the occasional receive-only cycle cost nothing.

## Power discipline, both meanings

- **Run the supply the design expects:** `13.8 V` nominal for full output, comfortably below the mid-teens ceiling, correct polarity, never AC. Between sessions, unplug — the off-state draw is tiny, but batteries left connected for months have their own opinions.
- **Match watts to the job.** Five is the ceiling, not the obligation: FT8 rarely needs it all, a local net needs less, and a lowered `8.2` or drive setting is kinder to everything. The [QRP argument](outpost:entry/logbook73.guide.trusdx/theory) cuts both ways — decibels you don't need are battery you get to keep.
- **Know your half-watt mode.** USB-only power is the built-in reserve tank; practising with it once means the day the main battery dies on a summit is an anecdote, not an early descent.

## Operate like a five-watt station, not an apologetic one

- **Listen twice, call once.** At QRP the biggest gains are in _when_ and _whom_ you call: a station ending a contact, a band just opening, a CQ with no takers. [Making Contacts](outpost:entry/logbook73.handbook/making-contacts) is the syllabus.
- **Never sign "/QRP" as an excuse** — and don't expect the other station to work harder than you did on your antenna. Wire height and resonance are worth more than any suffix.
- **Choose the mode for the day.** CW and FT8 are your strong suits; SSB is for good bands and good moments. Changing mode is cheaper than shouting.
- **RIT off, split off, after every use.** The two switches that most reliably confuse the next contact. The display tells you; glance at it.
- **Keep the auto-CQ on a leash.** Message memories with a repeat interval are for calling _while you are present and listening_. Unattended transmission is discourteous and, for most licences, simply not permitted.

## Care and feeding of a pocket radio

- **The calibration card is part of the radio.** Values from [chapter 6](outpost:entry/logbook73.guide.trusdx/calibration), serial number, firmware version — laminated, in the pouch. Every firmware update and any factory reset is then a ten-minute non-event.
- **Guard the encoder in transit.** The hold-to-factory-reset gesture and a tightly packed rucksack are natural enemies; pack the radio where nothing presses the knob.
- **Micro-USB deserves gentleness.** It is the radio's one mechanically delicate connector, and it carries firmware, CAT and audio. Support the cable, avoid torque, keep a known-good data lead in the kit.
- **Ferrites live in the pouch too.** A clamp-on core for the USB lead and a few coax turns through a ring solve the tiny-station RF problems of [chapters 7](outpost:entry/logbook73.guide.trusdx/antennas-swr) and [8](outpost:entry/logbook73.guide.trusdx/digital) before they start.
- **Kit builders: revisit your filters once.** An hour with the official tuning guidance (and any spectrum-measuring tool you can borrow) after the build settles is the difference between "it works" and "it is right" — in watts out and in harmonic cleanliness. Your licence conditions care about the second one.

## Firmware hygiene

- **Update deliberately, not reflexively.** Read the changelog, decide the feature is worth the re-commissioning ritual, then follow [chapter 9](outpost:entry/logbook73.guide.trusdx/firmware) step by step. Stable channel unless you enjoy the beta conversation.
- **After any update:** calibration back in, CAT baud rechecked (the 2.00t change catches everyone once), one key-down sanity check. Note the version on the card.
- **Menu moved? Screen wins.** When your build disagrees with any documentation — including this guide — the item name on your display plus the [menu reference](outpost:entry/logbook73.guide.trusdx/menu-reference)'s explanation of that name is the operating truth.

## The licence and the neighbours

- **The filter board is not a band plan.** The radio serves five bands; your licence may permit fewer, with power and mode conditions attached — 60 m in particular is channelised and nationally specific. Check before calling, not after.
- **Identify as required, log honestly, and keep test transmissions on dummy loads** where they belong.
- **RF safety scales down but never to zero:** at five watts the [exposure question](outpost:entry/logbook73.handbook/rf-safety) is easily satisfied, but a wire antenna at head height across a busy summit path is a courtesy problem before it is a physics one. String it high, flag the ends.

## The one-paragraph version

Load before power, SWR before watts, calibration on a card, ferrites in the pouch, RIT off after, updates read-then-done, licence before filter board — and the mode chosen to fit the day. Do those and the (tr)uSDX will spend years being what it was designed to be: the radio that is _with you_, working, while the big rig is at home being impressive.

Next and last: the whole guide on one page — the [quick reference](outpost:entry/logbook73.guide.trusdx/quick-reference).
