# Ready-made configurations

These are starting patterns, not frequency lists. Insert values from a current local source and your own licence conditions.

## Everyday local mobile

| Setting                | Start with                                            |
| ---------------------- | ----------------------------------------------------- |
| Main                   | most-used local repeater or simplex channel           |
| Sub                    | national/local calling or second coordination channel |
| Dual watch             | `ON` only when both are useful                        |
| Power                  | `LO`, increase only if needed                         |
| Squelch                | `2–3`, adjusted by test                               |
| `TCDT`                 | published repeater access tone                        |
| `RCDT` / `T-DEC`       | `OFF`                                                 |
| Signalling combination | `SQ`                                                  |
| Busy lockout           | `BU`                                                  |
| TOT                    | `3 min`                                               |
| VOX                    | `OFF`                                                 |
| Keys                   | `A/B`, `V/M`, `MON`, `SCN`, `CDT`, `VOL/CH`           |

Keep the display brightness low enough for night driving and place the microphone where PTT is reachable without looking down.

## Base station

Use a regulated 13.8 V supply with the manual's recommended 12 A capacity, a properly earthed/installed antenna system and lightning protection appropriate to the building.

| Setting  | Start with                                          |
| -------- | --------------------------------------------------- |
| Speaker  | `MAIN` or a correctly isolated external 8 Ω speaker |
| AOP      | `OFF` unless a master station switch is intentional |
| APO      | `OFF`                                               |
| Power    | low for local work; higher only by path need        |
| Scan     | `CO`, curated scan list                             |
| Password | `OFF` unless access control is genuinely required   |

## Go-box / event station

| Setting    | Start with                                                           |
| ---------- | -------------------------------------------------------------------- |
| Power      | `LO` to preserve battery and reduce co-site interference             |
| APO        | `60` or `120 min` only if missing calls after shutdown is acceptable |
| AOP        | match the box's master power design                                  |
| TOT        | `2–3 min`                                                            |
| Display    | orientation/brightness matched to enclosure                          |
| Main       | event working channel                                                |
| Sub        | control/calling channel                                              |
| Names      | role-based and date-checked (`CTRL`, `OPS1`, repeater callsign)      |
| TX inhibit | on every monitor-only channel                                        |

Co-located transmitters can overload each other's receivers even on different channels. More power can make event communications worse; use antenna separation, sensible levels and a frequency plan.

## Repeater channel template

| Field        | Value                              |
| ------------ | ---------------------------------- |
| RX           | published repeater output          |
| Offset       | published sign and magnitude       |
| `TCDT`       | published CTCSS/DCS                |
| `RCDT`       | `OFF` unless deliberately required |
| Width        | local plan                         |
| Busy lockout | `BU`                               |
| Power        | `LO` initially                     |
| Scan         | include if actively useful         |
| Name         | callsign/short identity            |

After programming, calculate the TX frequency independently and compare it with the software/radio before testing.

## Simplex channel template

Receive and transmit frequency are the same, offset is `OFF`, all optional signalling is `OFF`, width follows the plan, busy lockout is `BU`, and power begins low. Do not add CTCSS merely because a group likes quiet speakers; if used, everyone must understand it does not create privacy and can hide other channel users.

## Receive-only monitor bank

Set Channel 13 to `OFF` (TX prohibited) on every monitoring memory. Give clear names, remove permanently busy/noisy entries from scan, and use `SE` when searching for one activation or `CO` when following conversations.

## Legacy repeater with tone burst

Set Function 14 to the repeater's stated burst (often but not universally 1750 Hz), leave continuous `TCDT` off unless separately required, listen, hold PTT and tap microphone `DOWN` briefly. Do not transmit repeated bursts if the system does not respond; re-check frequency, range and published access.

## Accessibility / controlled VOX station

VOX can help an operator who cannot use a conventional PTT, but it needs an intentional environment:

1. use a headset or microphone arrangement that minimises speaker feedback;
2. test on a dummy load or quiet lawful frequency;
3. begin `VOX-L` mid-range (`1` is most sensitive);
4. set `VOX-T` just long enough not to chop words;
5. retain TOT at 2–3 minutes;
6. provide an obvious way to disable VOX immediately.

For ordinary driving, leave VOX off.
