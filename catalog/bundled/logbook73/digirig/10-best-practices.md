# Best practices

Everything here you could learn by breaking things slowly. Collected instead: the habits that make a Digirig station boring — in the way an airline cockpit is boring — so the interesting parts of the hobby get your attention instead.

## Signal quality is reputation

- **Run the [levels procedure](outpost:entry/logbook73.guide.digirig/levels) once per station, then freeze it.** ALC asleep, meters mid-zone, values written on the card. The clean-signal reputation you build on a band is worth more than any watt.
- **Glance at your own waterfall trace occasionally** (any WebSDR will show you yourself): a single tidy bar is the goal; sidebars mean a stage has crept up — find it, don't compensate elsewhere.
- **Full duty cycle deserves modest power.** Data modes hold the transmitter at full output for the whole over; most radios' comfort (and neighbours' patience) favour running well inside the maximum. The decibels you give up are barely visible at the far end; the [RF Power chapter](outpost:entry/logbook73.handbook/rf-power) does the arithmetic.

## Hardware habits

- **One good USB data lead, labelled, kept with the unit** — and a second in the bag. Charge-only lookalikes cause more "failures" than every other cause combined.
- **Label every radio cable the day it arrives**, and every Digirig if you own two — official advice born of collective 2 a.m. experience.
- **Ferrites before problems**: a clip-on on the USB lead and a few coax turns through a ring cost little and pre-empt the whole [RF-on-transmit fault family](outpost:entry/logbook73.guide.digirig/troubleshooting).
- **Be gentle with 3.5 mm sockets**: strain-relieve the leads; the plugs are the smallest structural members of your station.
- **Don't hot-swap mid-transmission.** Unplugging things while RTS is high leaves radios keyed and software confused; stop the app first.

## Software hygiene

- **The Digirig is never the default sound device.** Say it once a year to every new computer in your life; notification chimes on 40 m amuse nobody twice.
- **One owner per COM port**; the moment two programs want the rig, set up [flrig or rigctld](outpost:entry/logbook73.guide.digirig/rig-control) rather than playing port roulette.
- **Handshake off, one PTT method, deliberately chosen** — the three-line settings audit that prevents the phantom-keying class of trouble entirely.
- **After OS updates, re-check privacy permissions and device names** — updates enjoy renaming audio devices and re-blocking microphones.

## Field craft

- **The settings card travels with the hardware** ([the template](outpost:entry/logbook73.guide.digirig/configs)): serial configuration, baud, level percentages, volume marks. A station that can be rebuilt from its card in ten minutes is a station you actually own.
- **Battery power is the quiet path**: field stations dodge ground-loop hum entirely — one of the honest joys of [portable operating](outpost:entry/logbook73.handbook/portable-operating).
- **Prove the kit quarterly** — a Winlink message to yourself, one FT8 contact, one APRS beacon [confirmed via an iGate](outpost:entry/logbook73.handbook/aprs-igates). Go-kits rot invisibly; rehearsal is the only preservative.
- **Licence manners are unchanged by automation**: identify per your conditions, mind band plans for data segments, and stay attended when your station is transmitting — machine-keyed is not permission-free. [Amateur Radio](outpost:entry/logbook73.handbook/amateur-radio) and your national conditions are the authorities.

## Buying and upgrading sense

- **Choose Mobile vs Lite by the CAT question**, nothing else — [the table](outpost:entry/logbook73.guide.digirig/overview) settles it in four rows. When in doubt, the Mobile's serial port is the door you may want open later (a [DigiPi](outpost:entry/logbook73.guide.digipi/hardware) will insist on it).
- **Order the serial configuration for the radio you'll actually CAT** ([the mapping](outpost:entry/logbook73.guide.digirig/how-it-works)); re-jumpering is possible but is a bench afternoon, not a field fix.
- **Resist interface sprawl.** One Digirig plus one cable per radio is the tidy pattern; a drawer of assorted interfaces with assorted quirks is how settings knowledge dies.

## The one-paragraph version

Data lead not charge lead, levels set once and frozen, ALC asleep, defaults never, ports owned singly, ferrites early, cables labelled, card in the bag, kit rehearsed, licence minded. Do these and the little aluminium box disappears from your awareness entirely — which is the highest compliment station equipment can earn.

Last stop: the whole guide on one page — the [quick reference](outpost:entry/logbook73.guide.digirig/quick-reference).
