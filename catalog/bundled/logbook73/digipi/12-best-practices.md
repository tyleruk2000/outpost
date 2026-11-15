# Best practices

A DigiPi run well is invisible: packets repeat, mail moves, the map fills, and nobody — on the channel or in the house — ever has cause to think about your station. This chapter is the collected habits that produce that invisibility, gathered from everywhere the guide has touched them and finished with the licence questions that deserve their own plain summary.

## The transmitter you are not watching

DigiPi's superpower — transmitting usefully without you — is also its whole risk surface. The habits that keep it a superpower:

- **Know what every enabled service will send.** Before a service runs unattended, you should be able to say aloud what it transmits, when, and why: "repeats qualifying packets", "beacons my position every N minutes", "answers Winlink connections". If you can't, the [mode's chapter](outpost:entry/logbook73.guide.digipi/aprs) first, the enable switch second.
- **One deliberate attended transmission after any change** — new image, new radio, new levels, new antenna. The [shakedown ritual](outpost:entry/logbook73.guide.digipi/install) is three minutes; a station that has been mis-transmitting for a week is a much longer conversation.
- **Stop what you aren't using.** Idle services are ambiguity: about audio ownership ([the hat rack](outpost:entry/logbook73.guide.digipi/web-interface)), and about what your station might do at 3 a.m. The enabled set should equal the intended set, always.
- **Identify correctly by construction.** The callsign and SSIDs from [setup](outpost:entry/logbook73.guide.digipi/install) are transmitted verbatim, thousands of times. Set them right once, check them after every re-flash ([the settings card](outpost:entry/logbook73.guide.digipi/updates) habit), and the identification question answers itself forever.

## Duty cycle and the radio's wellbeing

Data modes work transmitters harder than voice ever did — a busy digipeater or an FT8 evening is transmit-heavy in a way FM chat never is.

- **Match the radio to the role**: HTs for personal and portable use; an always-on role gets a rig with heatsinking built for it ([the shelf build](outpost:entry/logbook73.guide.digipi/configs)).
- **Power modesty serves everyone**: cooler finals, cleaner channel, longer batteries — and on a shared channel, the polite footprint is the professional one.
- **Airflow and placement**: the loft shelf that is lovely in January is an oven in July; radios aging in ovens fail in interesting ways that [troubleshooting](outpost:entry/logbook73.guide.digipi/troubleshooting) can only mislabel.

## Channel citizenship

- **APRS is a commons.** Sensible beacon intervals, short [paths](outpost:entry/logbook73.handbook/aprs-paths), digipeating only where coverage needs it, comments that inform or stay empty — the [APRS chapter](outpost:entry/logbook73.guide.digipi/aprs) details; the summary is _add signal, not noise_.
- **Gateways and infrastructure are gifts** — Winlink RMS stations, iGates, the volunteers behind them. Efficient sessions and spread custom are the thanks ([chapter 5](outpost:entry/logbook73.guide.digipi/winlink)).
- **Data segments and band plans exist**; the box will transmit wherever the radio is tuned, so the tuning discipline is yours. When in doubt, the band plan and [the handbook](outpost:entry/logbook73.handbook/hf-data-modes) before the PTT.
- **Postcard rule**: no encryption for privacy on amateur bands — everything your station sends is public by law and by culture. Compose accordingly, on [chat](outpost:entry/logbook73.guide.digipi/aprs) and [email](outpost:entry/logbook73.guide.digipi/winlink) alike.

## The unattended-operation question, plainly

This guide has raised it wherever it bites; here is the one-place summary. **Digipeaters, iGates that transmit, Winlink server roles, and any beacon left running are automatic and potentially unattended operation, and national licences regulate that specifically.** The UK licence, for example, attaches its own conditions to unattended operation; other administrations differ in the details and sometimes in the substance. The responsible sequence:

1. **Read your licence's actual terms** for automatic/unattended/remote operation — the primary text, not a forum summary.
2. **Prefer the roles with no automatic transmission** until you have: receive-only iGating and attended operating cover most of the fun with none of the questions.
3. **When you do run automatic roles, run them conservatively** — power, interval, path — and remain genuinely able to shut the station down when needed, which the web interface makes easy from anywhere in wifi reach.

None of this is meant to chill the hobby's infrastructure tradition — the network _needs_ well-run digis and gates. It is meant to ensure yours is one of the well-run ones.

## Caring for the box itself

- **Two cards, rotated**; version stickers; the settings card in the kit — the whole [updates chapter](outpost:entry/logbook73.guide.digipi/updates) discipline in one line.
- **Quality power, always**: the single biggest determinant of Pi reliability, at home and afield ([hardware chapter](outpost:entry/logbook73.guide.digipi/hardware)).
- **Let the read-only design work for you**: no clever persistent tweaks outside sanctioned configuration; the box's virtue is being boring and identical after every boot.
- **Ferrites before you need them** on USB and audio leads — [RF hygiene](outpost:entry/logbook73.handbook/emc-rfi) is cheaper as prevention, and data stations transmit close to their own wiring by nature.
- **Log the station like a station**: image version, settings, what worked from where. Future-you, cold on a summit or debugging at midnight, reads that log with gratitude.

## The one-paragraph version

Enable only what you understand, identify correctly by construction, keep power and beacons modest, respect duty cycle and the commons, read your licence before anything runs unattended, rotate two cards, and buy the good power supply. Do these and DigiPi becomes what it promised in [the overview](outpost:entry/logbook73.guide.digipi/overview): an appliance — quietly moving your packets and your mail while you get on with the parts of the hobby that need a human.

Last stop: the whole guide on one page — [the quick reference](outpost:entry/logbook73.guide.digipi/quick-reference).
