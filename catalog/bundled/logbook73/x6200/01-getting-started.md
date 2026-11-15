# Getting started: controls, screen, battery and power

The quickest way to become comfortable with the X6200 is to stop treating every visible control as a separate mystery. There are four groups: the six function buttons beside the display, five physical soft-keys below it, two tuning/control knobs, and a row of direct operating buttons on top. The words shown above the soft-keys change; the buttons themselves do not. Once that pattern clicks, APP, KEY, DFN, DFL and the deeper GEN pages all work the same way.

## Before applying power

Make these checks once rather than learning through a damaged connector:

1. The antenna is connected to the left-side `ANT` BNC socket and is suitable for the frequency. For transmit testing, a 50 Ω dummy load is safer than an unknown antenna.
2. The detachable battery panel is seated and locked, or the external supply is wired centre-positive and set between `12` and `15 V DC`. Xiegu calls for at least `3.5 A` capacity for an external source.
3. Nothing is forcing the `PTT` or KEY line active. Connect a paddle or straight key only while the radio is off.
4. The `S/P` accessory has a **stereo TRS plug**, not a mono plug.
5. The working area is dry, ventilated and away from an antenna you could touch while transmitting.

The body is not weather-sealed. A light field cover and a dry bag are much cheaper than trying to rescue a rain-soaked SDR.

## The front panel

### Power and status light

The power button sits at the upper left. To start, press it briefly until the logo indicator turns green, then release it and allow the Linux-based interface to load. Do not keep holding while it boots.

For normal shutdown, hold power until the display closes, then release. Wait at least five seconds before starting again. A hold longer than twelve seconds is the documented forced-shutdown method for a frozen unit; frequent forced shutdown risks storage corruption and is not a substitute for the orderly sequence.

The logo light provides basic state information: green when running/receiving, red in transmit, and charging indications when the radio is off. A flashing red charging indication means stop and inspect the battery installation and power source.

### Six function buttons

The vertical function area opens the radio's main tool families:

| Button  | Opens                                                          | Think of it as           |
| ------- | -------------------------------------------------------------- | ------------------------ |
| **GEN** | SETTING 1, SETTING 2, DISPLAY, SYSTEM and MEMORY               | radio-wide configuration |
| **APP** | MODEM, SWR SCAN, VOICE CALL and FT8 DECODER                    | built-in applications    |
| **KEY** | keyer controls; later firmware adds CW decode on page 2        | Morse setup              |
| **MSG** | five text memories on page 1 and five voice memories on page 2 | stored transmissions     |
| **DFN** | NR/NB on page 1 and notch controls on page 2                   | unwanted-noise tools     |
| **DFL** | three per-mode filter banks and their edges                    | wanted-signal bandwidth  |

Pressing KEY, MSG or DFN again advances to its second page. On current firmware, MODEM has its own page selector. If the labels below do not match this table, confirm the installed version before assuming a hardware fault.

### Five soft-keys

There are five **physical buttons** along the lower edge of the display. A label shown immediately above a button tells you what pressing it will do in the current context. The same first button might select `MODEM` in APP, `KEY TYPE` in KEY, or `FILTER1` in DFL.

This distinction matters because the display itself should not be treated as a touch interface. Navigate with the physical keys and MFK. A manual instruction translated as “click a label” means operate the corresponding soft-key or select it with the knob.

### Main tuning knob

The large right-hand knob changes the operating frequency. Clockwise raises it; anticlockwise lowers it. The selected digit/step determines how fast it moves. A short press of the top `FST` button changes the fast-tuning step; a long press locks knobs and buttons against a backpack or sleeve.

In a value-entry screen the main knob may change a numeric field. Read the on-screen focus marker before turning it.

### MFK: two rings and a press

The MFK is a concentric multi-function control:

- On the main screen, the **inner ring** tunes frequency by default and the **outer ring** adjusts transmit power by default.
- In a list menu, the **outer ring** normally moves the highlight between items and the **inner ring** changes the selected value.
- Pressing the MFK selects, confirms or moves focus, depending on the screen.

The main screen can hold shortcut tags for frequently changed settings. In a GEN list, select an item and use **Set as shortcut tag** to put it in a quick-access slot. A good first set is PRE/ATT, AGC, TX POWER and one display reference control. Do not fill every tag on day one; shortcuts are only helpful when their purpose is remembered.

### VOL / SQL / RFG

The lower right knob controls three related but very different things. Rotate it for the currently selected function; press the knob to cycle:

- **VOL** changes listening level without changing receiver sensitivity.
- **SQL** sets the squelch threshold. A high value can make an active band sound completely dead. For HF SSB and CW, begin open or very low.
- **RFG** changes RF gain. Reducing it can calm a noisy band or help with overload; leaving it low can make weak signals disappear.

When troubleshooting a “deaf” radio, read the label, not just the knob position. Return SQL low/open and RFG high before changing filters or opening the case.

### Built-in speaker and microphone

The front speaker is adequate for checking activity; headphones or a suitable external speaker are clearer in wind and noise. The built-in microphone opening is near the main knob. Select `MIC SEL = AUTO` so plugging in the H-22 automatically transfers microphone duty, or explicitly choose BUILT-IN/HANDLE when diagnosing an audio path.

## The top row

The top controls are designed for gloved, eyes-up operation:

| Control     | Short operation                        | Long operation / note                                   |
| ----------- | -------------------------------------- | ------------------------------------------------------- |
| **PTT**     | transmit using the selected microphone | release to receive in NORMAL PTT mode                   |
| **← / →**   | move down/up through bands or channels | coverage depends on BANDSTACK                           |
| **AM / FM** | choose AM or narrow FM family          | WFM is receive-only and reached in its coverage context |
| **CW**      | choose CW family                       | CW-R may be available through repeated/mode selection   |
| **SSB**     | choose USB/LSB family                  | select the sideband appropriate to band/activity        |
| **A/B**     | swap active VFO A and B                | long press copies/equalises the VFO parameters          |
| **ATU**     | insert/bypass the tuner                | long press, about one second, starts a match            |
| **FST**     | change fast step                       | long press locks controls                               |

A short `ATU` press only puts the tuner in the signal path; it does not run a tuning cycle. A long press while ATU is enabled initiates tuning. That difference prevents many “the tuner did nothing” reports.

## The H-22 hand microphone

The supplied H-22 is a remote control panel. Its receive and transmit indicators show green/red state. Its documented operator controls are:

| Control          | Purpose / boundary                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| **F1**           | assignable in SETTING 2; documented default PRE                                                          |
| **F2**           | assignable in SETTING 2; documented default NR                                                           |
| **F3**           | assignable in SETTING 2; documented default filter selection                                             |
| **HOME**         | current manufacturer V06: CE/clear-entry during keypad input; older English manuals describe home recall |
| **STEP UP/DOWN** | changes frequency by the current step                                                                    |
| **VOL UP/DOWN**  | changes receive volume                                                                                   |
| **A/B**          | short swap and long equalise, like the body key                                                          |
| **MODE**         | changes operating mode                                                                                   |
| **V/M**          | changes between VFO and memory/channel operation                                                         |
| **0–9**          | band access and direct frequency digits                                                                  |
| **CH DOWN/UP**   | changes memory/channel                                                                                   |
| **F-INP ENT**    | begins and confirms direct frequency entry                                                               |

The current manufacturer V06 manual says **HOME acts as CE (clear entry)** while entering a frequency from the H-22. Earlier English Rev01/Rev05 manuals instead describe it as recalling a configured frequency; Rev05 points to SETTING 2, but its complete SETTING 2 inventory contains no HOME assignment. Neither the `1.0.6` nor `1.0.7` release note resolves that contradiction. Treat HOME as manual/firmware-revision dependent, and do not assume MEMORY `MARK` programs it. Use an ordinary tagged memory through `V/M` when you need dependable recall.

To enter a frequency, press `F-INP ENT`, key the digits shown by the display's expected unit/order, and press `F-INP ENT` again to accept. Watch the result before transmitting. A missing or extra zero can land outside the intended band even though the receiver accepts it.

Assign H-22 functions that can be used safely without looking. PRE, NR and FILTER are good defaults. Putting a rarely understood transmit option on a thumb key creates surprises.

## Right-side connections

From the manual's panel map:

### CARD

The microSD slot is used by firmware workflows and supported storage tasks. Do not pull a card while it is being read or written. A firmware card is not ordinary extra memory: prepare it only with the official image and tutorial.

### DEV

`DEV` is the USB-C device port for a computer. It exposes serial control and the radio's USB audio devices. Use it for logging/CAT, digital modes and supported PC control. A computer may show more than one serial port; identify them deliberately instead of guessing during transmit tests.

### HOST

`HOST` lets the radio host a compatible keyboard, mouse, wireless adapter or WR12 module. The manual warns that available USB power is limited and says not to attach a USB hub. It is not the PC-control socket.

### MIC

The RJ45 microphone socket accepts the H-22 and carries microphone, PTT, data, ground and supply connections. Do not assume a microphone wired for another Xiegu or another brand is pin-compatible.

### ACC

The 3.5 mm stereo accessory connection carries band-voltage, transmit/receive and ALC-related signals plus ground. It is used in the documented XPA125B/L4001 arrangement. It is not a generic analogue audio socket.

### KEY

The 3.5 mm stereo KEY socket accepts a correctly wired straight key or paddle. Power off before inserting/removing. A two-pole plug or casual mono-to-stereo adapter can short the wrong contacts and hold the radio in transmit. Wire common, dit and dah to the documented TRS contacts.

### S/P

This stereo 3.5 mm output drives headphones or an external speaker. Select `EAR PHONE` or `SPEAKER` under SETTING 2. Speaker level into earbuds can injure hearing; a mono plug can short or silence the output.

## Left side and rear

### ANT

The BNC antenna socket expects a nominal 50 Ω load. A BNC-to-other-connector adapter adds leverage: support a heavy coax rather than letting it strain the chassis socket. Never transmit into an open connector.

### DC IN

The `5.5 × 2.5 mm` barrel input is centre-positive. The Xiegu EU English material specifies `12–15 V DC`, while current manufacturer V06 specifies `9–15 V`, at least `3.5 A`, and says a fitted battery takes over below `11 V`. This guide therefore recommends a regulated `12–15 V` communications supply—normally `13.8 V`—for operating, transmitting and updating. The wider V06 input rating is real, but it is not evidence that 9 V will deliver normal external-powered output. Never exceed `15 V`.

### Detachable battery panel

The lithium-ion battery panel locks to the back. Switch off and disconnect external power before removal. Inspect the contacts and latch; do not run with a loose pack. A removable battery is useful for field changes and hard recovery, but it also needs protection from impact because it forms part of the rear surface.

For storage longer than a few weeks, remove the panel and leave it near 40–50% charge in a cool, dry place. Do not store fully flat or continuously on charge. Replace a swollen, damaged or abnormally hot pack rather than attempting repair.

## Charging correctly

Charging is controlled by `GEN → SETTING 2 → CHARGER`. Set it ON only when a battery is installed and charging is intended.

The manufacturer gives these conditions:

- use the supplied charging adapter only for charging, with the radio powered off;
- allow about seven hours for a full charge under the stated conditions;
- never transmit while powered by the supplied charging adapter—it is not a radio power supply and Xiegu warns that doing so can damage the device;
- use a separate regulated `12–15 V`, at least `3.5 A` communications supply when operating from external DC; manufacturer V06 rates the input `9–15 V` but says a fitted battery takes over below `11 V`;
- charging is automatically inhibited below `0°C`;
- a flashing green logo while off means charging, steady green means full, flashing red means abnormal;
- if capacity remains red/empty after repeated normal attempts, inspect/reseat the pack and seek a replacement if faulty.

Do not key FT8 for hours merely because external power is connected. Charging heat plus transmitter heat is a poor combination.

## Reading the main screen

The stock display has several information areas rather than one picture:

- top-left state icons show split, ATU, squelch, NB, NR and notch status;
- PRE, ATT, mode and AGC appear in another status area;
- the active VFO frequency is prominent, while VFO B and RIT have smaller areas;
- the spectrum shows signal level against frequency now;
- the waterfall records frequency against recent time;
- a filter marker shows the passband around the tuned point;
- S, power and SWR meters change meaning between receive and transmit;
- LAN, battery/external voltage, time and quick tags occupy the remaining status areas;
- a coloured amateur-band allocation strip is a visual aid, not legal authority.

Firmware `1.0.7` can add a numerical receive-level display and 3D bandscope from DISPLAY page 3. If those controls are absent, verify firmware rather than searching every older page.

## The first receive setup

Use this neutral starting point:

1. `ATT = OFF`, `PRE = OFF`, `AGC = AUTO`.
2. SQL open/low; RFG near maximum; comfortable volume.
3. `NR = OFF`, `NB = OFF`, `NOTCH = OFF`.
4. Choose the correct mode and a normal filter bank.
5. Use a moderate spectrum span such as `96 kHz` or `192 kHz`; adjust waterfall reference until noise is visible but not a solid bright sheet.
6. Leave ATU bypassed while receiving a resonant antenna; its state does not make an antenna efficient.

Only then add one tool for one problem. PRE is for a genuinely weak signal on a quiet band. ATT is for too much signal. NR is for steady random noise. NB is for impulses. NOTCH removes a tone. Narrow DFL reduces adjacent signals.

## Try it yourself

With transmit power at its minimum and without pressing PTT:

1. Open each of the six function families and identify which ones have page 2.
2. Cycle VOL/SQL/RFG and return to VOL.
3. Swap VFOs with A/B, then long-press A/B to copy them; verify what changed.
4. Set one H-22 function key and test it on receive.
5. Save a receive frequency, tag it, recall it with `MEM TO VFO` on 1.0.3+ firmware, then erase it.
6. Open SYSTEM INFO and photograph the version screen for future support.

## Key takeaways

- The five labels along the bottom belong to **five physical soft-keys**; operate the radio with those keys and the MFK rather than assuming a touch display.
- On the main screen the MFK inner ring tunes and outer ring changes power; in lists, outer selects and inner changes the value.
- VOL/SQL/RFG share one knob. An accidental high squelch or low RF gain is the first check for a silent receiver.
- `DEV` is the computer/audio/control port; `HOST` is for hosted peripherals and WR12. Do not swap their roles or add an unpowered hub.
- The H-22 provides direct entry, VFO/memory, mode, volume and three assignable functions.
- Run the radio from a regulated `12–15 V DC`, centre-positive communications supply rated at least `3.5 A`. Charge the powered-off radio with the supplied charge-only adapter, and enable CHARGER deliberately.
- Short ATU enables the tuner; long ATU starts a tuning cycle.
- Use orderly shutdown; reserve the twelve-second hold and battery removal for a genuine freeze.

With the physical radio mapped, use the [Complete Menu Reference](outpost:entry/logbook73.guide.x6200/menu-reference) as the index for every documented setting.

### Primary references

- [X6200 English user manual](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200-USER-MANUAL-V01-PileupDX.com.pdf)
- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
- [Current manufacturer manual downloads (including V06)](https://www.cqxiegu.com/zlxz)
- [Xiegu X6200 firmware notes](https://xiegu.eu/downloads/)
