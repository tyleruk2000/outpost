# Menu reference — documented options at a glance

This is the map. Every menu item on the RT-950 Pro is listed here in the order the radio presents it, with a one-line description and a link to the full explanation. Use it two ways: as a **quick reminder** when you half-remember what a setting does, and as an **index** into the deep-dive chapters when you want the whole story.

The **Set to** column is a sensible UK-leaning starting point, not gospel — the reasoning behind each lives in the linked chapter. Symbols follow the same key used throughout: ✅ set and forget · ⭐ useful, depends · ⚠️ advanced · ❌ leave off.

> **Reaching a setting:** press **MENU/OK**, move with the direction keys or the channel knob, **MENU/OK** to open an item, choose a value, **MENU/OK** to save, **Exit** to leave. Some items only appear (or only change) in the matching mode — VFO items in frequency mode, channel items in memory mode.

## VOX, Zone & VFO/CH

Full explanations in [VFO, Steps, Zones & VOX](outpost:entry/logbook73.guide.rt-950-pro/menus-vfo).

| Option        | What it does                                         | Set to              |
| ------------- | ---------------------------------------------------- | ------------------- |
| VOX Switch    | Transmit hands-free when it hears your voice         | ❌ OFF              |
| VOX Level     | How loud your voice must be to trigger it (1–9)      | ⭐ 3–5              |
| VOX Delay     | How long it keeps transmitting after you stop        | ⭐ 0.5–1.0 s        |
| Zone          | Choose which folder of channels is active (15 × 64)  | ✅ by purpose       |
| Step          | Tuning increment per click (12.5 / 25 / 8.33 kHz…)   | ✅ match service    |
| Direction     | Duplex offset direction for repeaters (None / + / −) | ⭐ None for simplex |
| Offset        | Size of the repeater duplex shift, in MHz            | ⭐ match band plan  |
| RX Modulation | FM or AM demodulation for this VFO                   | ✅ FM / AM airband  |
| CH-Memory     | Save the current VFO setup into a memory channel     | ✅ as needed        |
| CH-Delete     | Remove a stored channel                              | ⭐ housekeeping     |
| MDF-A / B / C | Show name, frequency or channel number on each row   | ⭐ taste            |
| CH-Edit Name  | Rename the current stored channel                    | ⭐ do it            |

## CTCSS & DCS

Full explanations in [CTCSS, DCS & Sub-tones](outpost:entry/logbook73.guide.rt-950-pro/menus-ctcss).

| Option       | What it does                                           | Set to             |
| ------------ | ------------------------------------------------------ | ------------------ |
| RX CTCSS     | Only open the squelch for a matching analogue tone     | ⭐ shared channels |
| RX DCS       | Same idea with a digital code                          | ⭐ shared channels |
| TX CTCSS     | Send an analogue sub-tone (to open a repeater)         | match repeater     |
| TX DCS       | Send a digital sub-tone                                | match repeater     |
| FHSS Code    | Vendor frequency-hopping feature; little public detail | ❌ OFF             |
| Encryption   | Proprietary voice encryption                           | ❌ illegal on ham  |
| Scan SubCode | Find which CTCSS/DCS a signal is using                 | ⭐ very handy      |
| Scan Memory  | Store the tone the scan found                          | ⭐                 |

## The Radio menu

Full explanations in [The Radio Menu](outpost:entry/logbook73.guide.rt-950-pro/menus-radio).

| Option       | What it does                                           | Set to                |
| ------------ | ------------------------------------------------------ | --------------------- |
| SQL          | Squelch threshold — silences the hiss below it (0–9)   | ✅ 3–5                |
| Trans Power  | High / Mid / Low transmit power                        | ⭐ lowest that works  |
| Bandwidth    | Wide or narrow FM deviation                            | ✅ match channel      |
| Scramble     | Analogue voice scrambler                               | ❌ not for ham        |
| Standby Set  | Tri-watch: monitor all VFOs at once (not a power save) | ✅ ON                 |
| Battery Save | Receiver micro-sleep to save power                     | ✅ Normal             |
| Busy Lockout | Refuse to transmit onto an already-busy channel        | ✅ ON                 |
| TOT          | Time-out timer — cuts an over-long transmission        | ⭐ 180 s              |
| TALL         | Alarm as the time-out timer runs out                   | ⭐ ON                 |
| R-TONE       | Repeater access tone burst (1000/1450/1750/2100 Hz)    | ⭐ 1750 Hz where used |
| Scan Mode    | How scanning resumes (time / carrier / search)         | ⭐ Carrier            |
| ROGRE        | Roger beep at the end of each transmission             | ❌ OFF                |
| RP-STE       | Repeater squelch-tail elimination                      | ⭐ if supported       |
| RPT-RL       | Repeater relay delay                                   | ⚠️ default            |
| RPT-Mode     | Cross-band repeater on/off                             | ⚠️ OFF unless needed  |
| RPT-Speaker  | Speaker live while repeating                           | taste                 |
| SOS Mode     | Emergency alarm behaviour                              | ⚠️ understand first   |

## APRS, GPS & Digipeater

Full explanations in [APRS, GPS & Digipeater](outpost:entry/logbook73.guide.rt-950-pro/menus-aprs) — the biggest chapter, and the one the factory manual explains least.

| Option                                        | What it does                                            | Set to               |
| --------------------------------------------- | ------------------------------------------------------- | -------------------- |
| APRS ON/OFF                                   | Master switch for the APRS engine                       | ⭐ ON to use         |
| GPS                                           | Enable the position receiver                            | ✅ ON to beacon      |
| Position / Time / Distance / Altitude / Speed | Display format and units for position data              | taste                |
| Callsign                                      | Your amateur callsign — required to transmit APRS       | required             |
| SSID                                          | Which of your stations this is (-7 handheld, -9 mobile) | ⭐ by convention     |
| Path Choose                                   | The relaying request your beacon carries                | ✅ WIDE1-1,WIDE2-1   |
| User Path (Digi1/2 + SSID)                    | Build a custom path by hand                             | ⚠️ leave default     |
| Source Position                               | Beacon your GPS fix, or a fixed position                | ✅ GPS (portable)    |
| My Position Set                               | Enter fixed coordinates for a base station              | base only            |
| Stations Symbol                               | The icon you appear as on the map                       | choose to suit       |
| Custom Icons                                  | A user-defined symbol                                   | ⭐                   |
| Mic-E Type                                    | Compact status (En Route, Off Duty, Emergency…)         | ⭐ En Route          |
| Message                                       | Send/receive APRS text messages                         | ⭐                   |
| Digi CH                                       | Which VFO the built-in digipeater listens on            | ⚠️                   |
| Routing                                       | Digipeater behaviour (OFF / WIDE1 / …)                  | ✅ OFF unless a digi |
| Digi TX Wait                                  | Delay before repeating a heard packet                   | ⭐ 0.2–0.5 s         |
| APRS TX Delay                                 | Quiet lead-in before each packet                        | ⭐ default           |
| APRS Ringer                                   | Beep on an incoming message                             | ⭐                   |
| RX Popup                                      | Pop received stations onto the screen                   | ⭐                   |
| RX Beacon Clear                               | Wipe the received-stations list                         | as needed            |
| TNC Type                                      | OFF, or KISS (act as a modem over Bluetooth/serial)     | ⭐ KISS for apps     |
| Factory Setting                               | Reset just the APRS configuration                       | ⚠️                   |

## Keys, Bluetooth, Signalling & Settings

Full explanations in [Keys, Bluetooth, Signalling & Settings](outpost:entry/logbook73.guide.rt-950-pro/menus-system).

| Option                | What it does                                        | Set to              |
| --------------------- | --------------------------------------------------- | ------------------- |
| PF2 / Long-press PF2  | Assign a shortcut to the side key (short and long)  | ⭐ Monitor          |
| Long-press 0–9        | Assign a quick function to each number key          | ⭐ your favourites  |
| Bluetooth             | Enable Bluetooth (programming, app, KISS)           | ⭐ as needed        |
| S-CODE                | Which DTMF signalling code group is active          | ⚠️                  |
| PTT-ID                | Send an identifying DTMF code before/after transmit | ⚠️ off for ham chat |
| DTMFST                | Whether you hear DTMF side tones                    | taste               |
| Beep Prompt           | Key-press confirmation beep                         | ✅ ON               |
| Voice                 | Spoken menu prompts                                 | taste               |
| Keypad Lock           | Auto-lock the keypad after a delay                  | ⭐ 5–10 s           |
| Back Light            | How long the screen stays lit                       | ⭐ 30–60 s          |
| Menu OutTime          | How long the menu waits before exiting              | ⭐ 15–30 s          |
| Power On Display      | Boot screen (picture or voltage)                    | taste               |
| Language              | Menu language                                       | English             |
| VFO Reset / Reset All | Restore VFO settings, or a full factory reset       | ⚠️ keep a backup    |
| About Machine         | Firmware, hardware and ANI code — read-only         | —                   |

## Key takeaways

- This page is the **index**: skim it to jog your memory, click a section heading to read the full nine-field explanation of any item.
- The **Set to** column is a UK-leaning starting point; the _why_ behind each recommendation is in the linked chapter.
- The two settings worth burning into memory: **Busy Lockout ON** and **Trans Power as low as works** — good manners in one glance.
- The APRS group is the largest and least-documented; give [its chapter](outpost:entry/logbook73.guide.rt-950-pro/menus-aprs) proper time before you beacon.

Start at the top with [VFO, Steps, Zones & VOX](outpost:entry/logbook73.guide.rt-950-pro/menus-vfo), or jump to whichever group you need.
