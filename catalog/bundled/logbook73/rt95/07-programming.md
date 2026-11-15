# Programming, backups and custom keys

Front-panel programming proves you understand one channel. Software makes 200 channels consistent, reviewable and recoverable.

## Start by reading, never by writing

1. Install the correct cable driver and programming application for your operating system and cable chipset.
2. Switch the RT95 on.
3. Connect the programming cable and note the serial/COM port assigned to **that USB socket**.
4. In the software choose the matching RT95 model/port.
5. **Read from radio.** Save the untouched result as a dated factory backup.
6. Make a second working copy and edit that.
7. Validate frequency, shift, tones, bandwidth, power, TX permission and names.
8. Write once, then power-cycle only after the software reports completion and the cable is safely disconnected.
9. Read back into a new file and compare important channels.

The factory manual specifically warns against switching radio power while a read/write session is connected. If communication fails, close the software, disconnect the cable, restore normal power, reconnect and select the new/current COM port rather than repeatedly writing into an uncertain state.

## Official CPS and CHIRP

Retevis provides official RT95 programming software from its download page, and its current product listing advertises **CHIRP support**. Support can vary by CHIRP release, cable and radio revision, so verify that your installed build explicitly lists the RT95 before writing. The safe order is the same in either tool: read, back up, edit, validate, write, read back.

Do not import a code plug built for a rebadged or visually similar radio merely because the case looks identical. Model identity, band limits and option fields must match.

## A useful channel-sheet discipline

Before software entry, prepare columns for:

| Field         | Question to answer                             |
| ------------- | ---------------------------------------------- |
| Name          | Will it still make sense away from home?       |
| Receive       | What exact published output/simplex frequency? |
| Duplex/offset | What transmit frequency will result?           |
| TX tone       | What access CTCSS/DCS is published?            |
| RX tone       | Do I truly want to hide other carriers?        |
| Bandwidth     | What does the national/local plan specify?     |
| Power         | Can this begin on low?                         |
| Scan          | Is this useful to hear during a scan?          |
| TX allow      | Should accidental PTT be impossible?           |
| Notes/source  | Where and when was the channel confirmed?      |

That final source/date field may live outside the radio, but it stops a code plug fossilising old repeater data.

## Programmable front keys

`MINI KEY` assigns actions to `P1`–`P6` for the available key groups. A practical amateur layout keeps the frequent, reversible operations close:

| Priority | Action               | Why                                            |
| -------: | -------------------- | ---------------------------------------------- |
|        1 | `A/B`                | make the intended display side main before PTT |
|        2 | `V/M`                | move between VFO workbench and saved memories  |
|        3 | `CDT`                | inspect/set CTCSS/DCS and start tone scan      |
|        4 | `SCN`                | scan and scan-list control                     |
|        5 | `MON`                | open squelch for weak/muted-signal diagnosis   |
|        6 | `VOL`, `FRQ` or `CH` | match what the channel knob normally controls  |

Do not assign six clever fleet features and bury the safety/diagnostic controls you use daily.

## Microphone keys and lighting

`HANDY KEY` includes microphone keypad brightness from `OFF` through `31` and four configurable actions described by the manual as `H-PA` through `H-PD`. Choose a modest night brightness that does not reflect in the windscreen. Keep any action that could change frequency, transmit mode or signalling away from a key likely to be pressed by grip.

## Password and professional mode

Programming software can set the power-on password and restrict the working/display mode. These features suit a managed fleet, but they can make a personal radio appear broken:

- forgotten password blocks startup;
- channel-only lock removes front-panel VFO access;
- strict signalling can mute ordinary calls;
- a foreign code plug may enable TX or optional decoding unexpectedly.

Before changing them, keep the factory backup and a plain-language record of what was enabled.

## Versioned backups

Keep at least:

- `RT95-factory-read-YYYY-MM-DD` — untouched;
- `RT95-known-good-YYYY-MM-DD` — tested on-air;
- `RT95-working` — current edits;
- an exported channel list in a non-proprietary format where the software permits it.

Store a copy away from the programming laptop. The fastest recovery from a reset or bad experiment is a known-good file plus notes explaining its assumptions.
