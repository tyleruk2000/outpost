# FT8, JS8, fldigi and SSTV

Beyond packet and email, DigiPi carries the modes that made the last decade of HF so lively: **FT8** through WSJT-X, **JS8Call** for actual conversations at FT8-like signal levels, the great **FLDigi** toolbox of keyboard modes — CW, PSK31, RTTY, MFSK, Olivia and friends — and **slow-scan television**. All of them, from a browser. This chapter takes each in turn, with the DigiPi-specific craft; the modes themselves have proper homes in the handbook ([FT8](outpost:entry/logbook73.handbook/ft8), [HF data modes](outpost:entry/logbook73.handbook/hf-data-modes), [SSTV](outpost:entry/logbook73.handbook/sstv)) that this chapter leans on rather than repeats.

## FT8 via WSJT-X: contacts at the noise floor

DigiPi bundles WSJT-X, the home of FT8 — the fifteen-second, structured-exchange mode that decodes signals your ear flatly denies exist (the project's feature list notes the "low SNR" capability with justified pride). Through the web interface you get the WSJT-X environment served to your browser: waterfall, decodes, and the standard QSO sequence.

The DigiPi angle on standard FT8 practice:

- **The station settings live on the Pi.** Callsign and grid came from [setup](outpost:entry/logbook73.guide.digipi/install); confirm them inside the WSJT-X environment once, because FT8's exchange _is_ those two facts.
- **Time discipline matters and the Pi is on your side** — FT8's time slots need clock accuracy that a network-connected Pi maintains naturally. A field build without internet should get a time check before serious operating ([phone-operating](outpost:entry/logbook73.guide.digipi/phone-operating) touches this).
- **Levels are the whole audio game.** The classic FT8 failure is transmit overdrive splattering the band. Set levels by the [interface levels method](outpost:entry/logbook73.guide.digirig/levels) and the watch-the-power test; on Type A radios use the rig's own USB level menus.
- **Band and dial frequency** follow the universal FT8 conventions — the software knows the standard dial frequencies per band; your radio must actually be there (CAT helps; eyes work too).

Expectation-setting, honestly: FT8 through a browser is operationally identical to FT8 at a desk — the Pi does the decoding regardless. What you gain is _placement freedom_: the radio and Pi live wherever the antenna is happiest, and you operate from wherever you are.

## JS8Call: conversation returns to the noise floor

JS8Call takes FT8's modem and rebuilds it for **actual chat** — free text, directed messages, relays, and store-and-forward inboxes among a network of stations that heard each other. DigiPi ships the improved JS8Call build in the same browser-served fashion.

Where it fits: when "59 73" is not the point and _talking_ is, at signal levels where SSB and even CW have gone home. Its culture is patient — sentences arrive at a walking pace — and unusually neighbourly, with stations relaying for each other by design. If you enjoyed packet's community feel but crave HF's reach, this is the mode this box was born for.

## FLDigi: the keyboard-modes toolbox

FLDigi is the Swiss-army program of the older keyboard modes, and DigiPi includes it whole: **PSK31** (the narrow, chatty classic), **RTTY** (the venerable warhorse of contests and bulletins), **MFSK** and **Olivia** (robust conversers for rough conditions), **CW** (decoded and, where configured, sent), and more. The handbook's [HF data modes](outpost:entry/logbook73.handbook/hf-data-modes) chapter compares them; [CW operating](outpost:entry/logbook73.handbook/cw-operating) covers the Morse world FLDigi's decoder peeks into.

Craft notes for FLDigi-on-DigiPi:

- **Waterfall literacy is the skill.** These modes are tuned by clicking signals on a waterfall; ten minutes of watching a busy band teaches more than any table.
- **Each mode has its neighbourhood** — PSK31 clusters near its customary frequencies, RTTY in its segments; the band plan and the waterfall together are your map.
- **Same audio path, same levels** as everything else on the box: clean in, unclipped out. One discipline serves all modes.

## Slow-scan television: pictures by radio

SSTV rounds out the set: images transmitted as sound, a minute or so per picture, with an enthusiastic worldwide community and regular activity (the [SSTV chapter](outpost:entry/logbook73.handbook/sstv) covers modes and frequencies). On DigiPi it means your station can send and receive pictures with the same browser workflow as everything else — and it is, hands down, the best demonstration mode this hobby owns. A received picture assembling line by line converts more bystanders than any explanation of decibels ever has.

## Sharing one station among four modes

All of this rides the hat-rack model from [the web-interface chapter](outpost:entry/logbook73.guide.digipi/web-interface): one audio path, one PTT, one hat at a time. A workable rhythm for a mixed evening:

1. **Scout** with the mode that shows the most at a glance — FT8's decode flood tells you instantly whether a band is alive.
2. **Work** whatever the evening is for: rapid grid-filling on FT8, a slow ragchew on JS8 or Olivia, picture traffic on SSTV.
3. **Stop the service when you switch** — deliberate hat changes keep the audio path unambiguous and the [troubleshooting chapter](outpost:entry/logbook73.guide.digipi/troubleshooting) unvisited.

And a closing honesty: these modes reward exactly the station virtues the rest of this guide preaches — clean levels, sane power, a decent antenna ([the handbook's antenna chapters](outpost:entry/logbook73.handbook/antennas) outrank any software setting), and a clock that tells the truth. The browser is new; the radio craft is eternal.

Next: the workflow that makes DigiPi feel like the future — [operating it all from your phone](outpost:entry/logbook73.guide.digipi/phone-operating).
