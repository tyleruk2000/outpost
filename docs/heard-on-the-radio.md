# Heard on the radio

Outpost shows on the map what your own receivers hear: APRS stations, aircraft and ships.
A decoder program, on the Pi or a computer on the network, listens to a radio or SDR and
offers what it decodes on a network port; Outpost connects and reads. Nothing comes from
the internet.

## Listening only

Outpost never transmits and writes nothing to a decoder; no setting changes that. Sending
APRS needs an amateur licence.

- **UK.** "Generally, the use of radio receivers is exempt from requiring a licence unless
  it is also capable of transmission", and "receivers and scanners can only be used for
  'general reception'" (Ofcom, [Rules on using radio equipment](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law),
  read 21 Nov 2026). Ofcom does not say whether aircraft and ship transmissions count as
  general reception; Outpost does not know.
- **US.** Intercepting an amateur station on an authorised frequency, or "any marine or
  aeronautical communications system", is not unlawful
  ([18 U.S.C. 2511(2)(g)(ii)](https://www.law.cornell.edu/uscode/text/18/2511), read
  21 Nov 2026).
- **Elsewhere**, check your regulator.

Aircraft and ships on Outpost's map are not for navigation, separation or collision
avoidance.

## Setting it up

1. Start a decoder where the radio or SDR is plugged in. The **Setting up** part of
   **Radio → Heard on the radio** has the commands for a Raspberry Pi, a Mac and Windows.
2. In **Settings → Receivers**, add a receiver: what it hears, a name, the decoder's
   address and port. This is done at the computer Outpost runs on (or anywhere with
   `OUTPOST_ALLOW_REMOTE_SETTINGS=true`).
3. The receiver then shows **Connected** and when the last packet came.

| What | Decoder | What Outpost reads | Usual port |
| --- | --- | --- | --- |
| APRS | Dire Wolf, a KISS modem, a LoRa APRS iGate | KISS over TCP | 8001 |
| Aircraft | readsb, dump1090 | BaseStation (SBS) text | 30003 |
| Ships | AIS-catcher, rtl-ais | NMEA (`!AIVDM`) over TCP, or UDP from one address | 10110 |

In Docker, a decoder on the same Pi is at `host.docker.internal`. On a Mac or Windows,
keep the computer awake and let the decoder through the firewall.

**Decoders on the Pi.** `deploy/pi/install.sh --decoders` installs Dire Wolf and readsb,
switched off (`--aprs-frequency=144.39M` sets the SDR's frequency; 144.80M by default).
In **Settings → Receivers** each then has **Switch on** and a list of the sound devices and
SDRs found. Set the radio's volume so most stations show an audio level of about 50 in
Dire Wolf's last lines.

**LoRa boards.** CA2RXU's LoRa_APRS_iGate firmware serves KISS on port 8001 once its `tnc`
setting `enableServer` is on. It ships receive-only; without a licence, keep it so.
ESP32APRS offers KISS only over Bluetooth and serial, which Outpost cannot read.

## On the map

In **Maps → Layers**, **Heard on the radio** has a switch for mesh radios, APRS, aircraft
and ships. Marks fade with age (last hour,
1 to 6 hours, longer) and every label gives the age in words. Zoomed out they gather into
counts; your own stations, pinned, stay on top under the name you give them.

Pressing a mark opens a card: what it is, which receiver heard it and how, its age, trail,
distance and bearing, with **Line of sight**, **Estimated range**, **Pin as one of ours**
and **Remove**. **Print or save as PDF** can include what is heard.

## The list, and keeping it

**Radio → Heard on the radio** lists what was heard, nearest or newest first. Everything is
kept until you clear it (all, one source, before a date, or one station); aircraft can be
limited to the last 6, 24, 72 or 168 hours. So that a flood of made-up callsigns or ships
cannot fill the disk, Outpost keeps at most 20,000 stations of each kind, taking off the
longest unheard first (never a pinned one), and the latest 10,000 positions of each.

## Range heard

Choose a receiver, a station or all, and a time span (a walk one afternoon is one test).
Outpost outlines the furthest position heard directly in each of 36 directions and names
the furthest report; positions heard through a digipeater are hollow. Keep a test by name
and compare two (before and after moving the aerial), or set it beside the **Estimated
radio range**. It shows where these radios were heard, not promised coverage.

## APRS weather

**Weather → Heard on the radio** lists APRS weather stations heard: amateur stations of
unknown calibration. **Add to the barometer log** copies
a station's pressure into your log; APRS does not say whether it is reduced to sea level.

## In a power cut

The map works only while the Pi, the receiver and the phones' Wi-Fi have power. A decoder
on another computer also needs that computer and the router. The Pi's own hotspot
(`deploy/pi/hotspot.sh`) can stand in for the router; **Power and batteries** has the
figures.
