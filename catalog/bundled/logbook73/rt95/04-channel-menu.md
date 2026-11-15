# Channel Menu: tones, power, repeaters and safety

Channel-menu values apply to the selected **main** operating channel. In VFO they shape the current setup; in memory mode some front-panel changes are temporary unless the channel is stored again or edited in software. Hold `FUNC`, choose `CHAN MENU`, press `PUSH`, select the item, press `PUSH` to edit and save with `PUSH` or `P3`.

## 01 `RCDT` — receive CTCSS/DCS decode

Values are `OFF`, `CTCSS` or `DCS`, followed by the chosen tone/code. The radio offers 51 standard CTCSS tones plus one user-defined entry, and normal/inverted DCS codes from `000N` to `777I`.

- **Does:** keeps the speaker muted unless the received carrier also carries the selected tone/code.
- **Use:** shared channels where you deliberately want to hear only your group.
- **Recommendation:** leave receive decode `OFF` for most amateur repeater monitoring. You will hear every valid carrier and can diagnose a repeater more easily.
- **Truth:** CTCSS and DCS do not hide a transmission. Everyone on the frequency still receives the RF.

## 02 `TCDT` — transmit CTCSS/DCS encode

Sends a continuous sub-audible CTCSS tone or DCS code while you transmit.

- **Use:** open a repeater that publishes an access tone/code.
- **Recommendation:** set exactly the repeater listing, commonly CTCSS; do not copy a nearby repeater by guesswork.
- **Trap:** transmitting the right tone does not require receive tone decode. `TCDT` may be set while `RCDT` remains off.

## 03 power — `HI`, `MI`, `LO`

The nominal levels are **25 W, 15 W and 5 W**.

- **Recommendation:** start `LO`; use `MI` or `HI` only when the path needs it.
- **Why:** lower power reduces heat, electrical load, interference and RF exposure while preserving the channel for everyone.
- **Trap:** 25 W cannot repair a poor antenna, loose connector, bad coax or impossible terrain.

## 04 `5TENC` — 5-tone encode selection

Chooses one of 100 (`0–99`) five-tone sequences defined in the PC software. If a group is named the display may show its name instead of the number.

- **Use:** legacy commercial selective calling or an explicitly configured event system.
- **Recommendation:** unused for ordinary amateur FM.
- **Trap:** selecting a blank group achieves nothing; remote/control functions require matching, lawful programming at both ends.

## 05 `T-DEC` — optional signalling decode

Values are `OFF`, `DT` (DTMF) and `5T` (five tone). The English manual accidentally says both `DT` and `5T` mean DTMF; its own headings and broader description make clear that `5T` selects 5-tone.

- **Does:** adds a fleet-style selective-calling gate.
- **Recommendation:** `OFF` unless you know the complete signalling design.
- **Trap:** with this active, a perfectly strong amateur call can leave the receiver apparently silent because it lacks the optional code.

## 06 signalling combination — `SQ`, `CDT`, `TONE`, `C&T`, `C/T`

This decides which gates must pass before audio opens:

- `SQ`: matching carrier/squelch only.
- `CDT`: carrier **and** matching CTCSS/DCS.
- `TONE`: carrier **and** matching optional DTMF/5-tone.
- `C&T`: carrier plus matching CTCSS/DCS **and** optional signalling.
- `C/T`: the manual describes a looser “any matching carrier or CTCSS/DCS or optional signalling” relationship.

For normal amateur use choose `SQ`, or `CDT` only where receive tone gating is intentional. `C&T` is the strictest and easiest way to make a radio seem deaf after loading an unfamiliar code plug.

## 07 bandwidth — `WID`, `MID`, `NAR`

- `WID`: 25 kHz channel spacing / wide FM profile.
- `MID`: 20 kHz profile.
- `NAR`: 12.5 kHz narrow profile.

Match the local plan and the station at the other end. A wrong width can produce quiet audio, clipping or adjacent-channel interference. Do not confuse the channel's spacing with the receiver's tuning step, although they are often chosen together.

## 08 frequency reverse — `ON/OFF`

Swaps receive and transmit frequencies and also swaps their CTCSS/DCS roles.

- **Use:** briefly listen on a repeater's input to see whether another station is within direct range.
- **Recommendation:** use momentarily, then turn it off.
- **Trap:** leaving reverse on makes the display and PTT behave opposite to the saved repeater plan.

## 09 talk-around — `ON/OFF`

Temporarily bypasses the repeater split so stations communicate directly on the repeater output.

- **Use:** a coordinated local fallback when everyone can hear each other direct and the band plan permits it.
- **Difference from reverse:** reverse exchanges both directions; talk-around deliberately makes transmit follow the direct/output side.
- **Important:** this item is hidden while `RTDF` is active.

## 10 offset and direction — `OFF`, `+`, `−`

Sets a standard repeater transmit shift relative to the receive frequency. Press `FUNC` while editing to choose direction; adjust magnitude in the current step. The manual permits a broad adjustment range (VHF up to 38 MHz, UHF up to 90 MHz), but that technical range is not a recommendation.

- `−`: transmit below receive.
- `+`: transmit above receive.
- `OFF`: simplex/no offset.

Enter the repeater's published shift, then verify the derived transmit frequency before saving. This menu is hidden during `RTDF` because the two frequencies are already explicit.

## 11 channel name

Edits the memory label one character at a time with the knob and `PUSH`. It appears in `NM` display mode.

Good labels are short and unambiguous: `GB3LI`, `S20`, `CLUB`, `EVENT1`. Avoid a label such as `LOCAL` that stops meaning anything when the radio travels. This item is hidden in VFO and during `RTDF`.

## 12 busy-channel lockout — `BU`, `RL`, `OFF`

- `BU`: inhibit PTT whenever a carrier occupies the channel.
- `RL`: inhibit when a carrier is present with a **different** CTCSS/DCS condition, intended for shared-tone systems.
- `OFF`: allow PTT regardless of receive activity.

`BU` is the conservative amateur courtesy setting because it protects conversations you can receive whether or not their tone matches yours. It cannot detect a station hidden by terrain (“hidden transmitter”), so listen and leave a gap anyway.

## 13 TX permission — the label is easy to misread

The official manual states:

- `ON`: transmitting **allowed**.
- `OFF`: transmitting **not allowed**; PTT beeps and the channel remains receive-only.

That is the opposite of a setting named “TX OFF” if you read only the value. Trust the behaviour description and test after programming. Use `OFF` deliberately for receive-only weather, event, link or monitoring memories so an accidental PTT cannot radiate there.

## 14 `OWNID` — self-ID enquiry

A read-only display of the DTMF or 5-tone identity attached to the current channel. It is a diagnostic, not an editor. If it shows an unexpected identity, inspect the code plug and optional signalling settings rather than changing ordinary repeater tones.

## A dependable repeater recipe

For a conventional analogue repeater memory:

1. receive frequency = published output;
2. Channel 10 = published `+`/`−` shift and magnitude;
3. Channel 02 `TCDT` = published access tone/code;
4. Channel 01 `RCDT` = `OFF` unless receive gating is specifically wanted;
5. Channel 06 = `SQ`;
6. Channel 07 = local bandwidth;
7. Channel 12 = `BU`;
8. Channel 13 = `ON` only after every transmit value has been checked;
9. Channel 11 = useful name;
10. store and perform a low-power identification test after listening.
