# Heard on the radio

Outpost shows on the map what your own receivers hear: APRS stations, aircraft and
ships, beside the positions your mesh radios report. A decoder program, on the Raspberry
Pi Outpost runs on or on a Mac or PC on the network, listens to a radio or an SDR and
offers what it decoded on a network port. Outpost connects to that address and port and
reads. Nothing comes from the internet.

**Not yet tried with a real radio.** It was built against packets recorded from Dire Wolf,
lines recorded from readsb, sentences decoded by pyais, and stand-in decoders.

## Listening only

Outpost never transmits. It sends no APRS (no beacon, no message, no acknowledgement, no
digipeating), keys no radio and writes nothing to a decoder's port. There is no setting
that would. Sending is done elsewhere, by a person with their own equipment and licence.

- **UK.** "Generally, the use of radio receivers is exempt from requiring a licence
  unless it is also capable of transmission", and "receivers and scanners can only be
  used for 'general reception'" (Ofcom, [Rules on using radio equipment](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law),
  read 21 Nov 2026). Ofcom's page does not say whether aircraft and ship transmissions
  count as general reception; Outpost does not know.
- **US.** It is not unlawful to intercept radio communication transmitted by an amateur
  station on an authorised frequency, or "by any marine or aeronautical communications
  system" ([18 U.S.C. 2511(2)(g)(ii)](https://www.law.cornell.edu/uscode/text/18/2511),
  read 21 Nov 2026).
- **Elsewhere**, check your regulator.
- Sending APRS, on VHF or LoRa, needs an amateur licence.

Aircraft and ships on Outpost's map are not for navigation, separation or collision
avoidance.

## Setting it up

1. Start a decoder where the radio or SDR is plugged in. The **Setting up** part of
   Radio, Heard on the radio has the commands for a Raspberry Pi, a Mac and Windows, each
   marked as tried or untried.
2. In **Settings, Receivers**, add a receiver: what it hears, a name, the decoder's
   address and port. Adding or changing one is done at the computer Outpost runs on (or
   from every device with `OUTPOST_ALLOW_REMOTE_SETTINGS=true`), as for the mesh radio.
3. The receiver says Connected, when the last packet came, how many were read and how
   many could not be read.

| What | Decoder | What Outpost reads | Usual port |
| --- | --- | --- | --- |
| APRS | Dire Wolf, a KISS modem, a LoRa APRS iGate | KISS over TCP | 8001 |
| Aircraft | readsb, dump1090 | BaseStation (SBS) text | 30003 |
| Ships | AIS-catcher, rtl-ais | NMEA (`!AIVDM`) over TCP, or UDP from one address | 10110 |

On the Pi in Docker, a decoder on the Pi itself is at `host.docker.internal`. On a Mac or
Windows, keep the computer from sleeping and allow the decoder through the firewall.

Aircraft are read as SBS rather than Beast: SBS is the decoder's own result with the
position worked out; Beast is raw Mode S frames that Outpost would have to decode itself.

### Decoders on the Pi, with one press

`deploy/pi/install.sh --decoders` installs Dire Wolf and readsb switched off (AIS-catcher
is used if you install it), and a helper that only starts and stops them. In Settings,
Receivers, each has a **Switch on** button and a list of the sound devices and SDRs the Pi
found. Dire Wolf's last lines show its audio level; turn the radio's volume until most
stations show about 50, as Dire Wolf's guide suggests. `--aprs-frequency=144.39M` sets
the frequency an SDR is tuned to (144.80M by default). Not yet tried on a real Pi.

### Boards on the Wi-Fi

A LoRa board running CA2RXU's LoRa_APRS_iGate firmware has a KISS TCP server on port
8001, off until its `tnc` setting `enableServer` is on: add it as an APRS receiver. As it
ships it is receive-only (no beacon, no digipeating, no APRS-IS, `txActive` off); someone
with no licence must keep it so. An ESP32 running ESP32APRS offers KISS only over
Bluetooth and serial, so Outpost cannot read it yet.

## On the map

In the Maps screen's **Layers** tab, the **Heard on the radio** group has a switch and a
count for mesh radios, APRS, aircraft and ships. Each source has its own colour, named in
the group. Marks fade with age (in the last hour, 1 to 6 hours, longer) and every label
gives the age in words. Zoomed out, each source gathers into counts of its own; your own
stations, pinned, stay on top under the name you give them. Marks move as reports arrive.

Pressing a mark opens one card, the same for every source: what it is, which receiver
heard it and how (directly, or through which digipeater), how old the report is, its
trail, the distance and bearing from home, then **Measure from here**, **Line of sight**,
**Estimated range** and **Sun times**, **Pin as one of ours**, and **Remove**.

**Print or save as PDF** can include what is heard, with the time the marks were taken.

## The list, and keeping it

Radio, Heard on the radio lists each source with distance and bearing from home, the age
of the last report and which receiver heard it, nearest or newest first. Everything is
kept until you clear it: all of it, one source, what was last heard before a date, or one
station. The screen says how much space it takes. Aircraft are many: you can keep only the
last 6, 24, 72 or 168 hours of them (pinned ones always stay).

## Range heard

Choose a receiver, a station (your own radio) or all, and a time span: a walk on one
afternoon is one test. Outpost joins the furthest position heard directly in each of 36
directions from home into an outline, and names the furthest single report. Positions
that came through a digipeater are drawn hollow and listed with its callsign. A mesh
position that does not say how many radios it came through may not have been heard
directly. Keep a test by name and compare two on the map (before and after moving the
aerial). Set it beside the **Estimated radio range** from home. It is where this receiver
heard these radios at these times, not a promise of coverage.

## APRS weather

Weather, **Heard on the radio** lists the APRS weather stations your receiver heard, with
distance and the age of the reading. They are amateur stations of unknown calibration.
**Add to the barometer log** writes a station's pressure into your log, only when
pressed; APRS does not say whether a station reduces its pressure to sea level.

## In a power cut

The map of who is out keeps working only while the Pi, the receiver and the Wi-Fi the
phones use have power. A radio or SDR on the Pi needs only the Pi; a decoder on another
computer needs that computer and the router; a Meshtastic radio reaches Outpost over the
Wi-Fi, so it needs the router. The Pi's own hotspot (`deploy/pi/hotspot.sh`) can stand in
for the router. Power and batteries has the Pi, the RTL-SDR and the routers with each
maker's figures; a Digirig's maker publishes none.
