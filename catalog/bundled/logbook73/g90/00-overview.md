# Why the G90 still earns its place

The Xiegu G90 is one of those radios whose price and size disguise how much is going on inside it. It is a `20 W` software-defined HF transceiver, a spectrum display, a general-coverage shortwave receiver and a wide-range automatic antenna tuner in one compact aluminium box. It can be a first HF station, a capable portable station or a small second radio. What it is not is self-explanatory: one button may have a short press, a long press and a **FUNC** action; the display head and radio body have separate firmware; and old manuals often describe controls that later firmware changed.

This companion is the missing operating book. It explains every control and every current System Menu item, but it also explains _why_ you would use it, what a sensible starting value is, and how to recognise when it is making things worse.

## The exact radio covered

This guide covers the **Xiegu G90 HF SDR transceiver running matched APP and BASE firmware v1.81**. Xiegu calls the display-head firmware **APP** and the main radio-body firmware **BASE**. Both matter.

The primary manual is Xiegu's June 2025 Operation Manual v5, written for `APP v1.80` and `BASE v1.80b01`. The official [v1.81 release](https://xiegu.eu/sdm_downloads/xiegu-g90-firmware-v1-81-25-08-25/) of 25 August 2025 is newer, so its release notes take priority wherever the two disagree. In particular:

- v1.81 fixes silent NFM reception;
- v1.81 fixes an automatic-tuner fault while **SPLT** is active;
- v1.81 changes the ALC indication to `0–100`, where a **higher reading means more microphone or line input**; and
- Xiegu says a digital-mode ALC reading must remain **at or below 50** for linear operation.

That last point is critical. Advice written for v1.78, v1.79 or v1.80 may tell you to chase a very different ALC indication. Do not apply an old target blindly to v1.81.

> **Firmware baseline:** all unqualified button actions in this companion mean stock v1.81. Boxes labelled “older firmware” preserve useful history without pretending it is current behaviour.

## What the G90 actually is

The receiver covers approximately `0.5–30 MHz`, while transmit is restricted to the amateur allocations from `160 m` through `10 m`, subject to the radio's regional configuration and your licence. There is no `6 m` transmitter. Current modes are:

| Display | Meaning              | Typical use                                   |
| ------- | -------------------- | --------------------------------------------- |
| `LSB`   | Lower sideband       | Voice below 10 MHz by convention              |
| `L-D`   | Lower-sideband data  | RTTY and software needing lower data sideband |
| `USB`   | Upper sideband       | Voice above 10 MHz by convention              |
| `U-D`   | Upper-sideband data  | FT8, FT4, PSK, JS8 and most sound-card data   |
| `CW`    | Morse, normal side   | CW reception and keyed transmission           |
| `CWR`   | Morse, reverse side  | Moves interfering signals to the other side   |
| `NFM`   | Narrow FM            | The limited HF FM activity where permitted    |
| `AM`    | Amplitude modulation | Shortwave listening and permitted amateur AM  |

Internally, the G90 is a direct-conversion, 24-bit/48 kHz SDR. The spectrum and waterfall show about `48 kHz` around the tuned frequency. Digital signal processing supplies the demodulation and receive passband. There is a noise blanker for repetitive pulse noise, but **no user-selectable DNR/NR or automatic notch filter** in stock G90 firmware. Instructions copied from the X6100 which mention NR or DNF do not belong on this radio.

Power is adjustable from `1–20 W` in one-watt steps. Twenty watts is four times the power of a conventional five-watt QRP radio, yet still one fifth of a typical 100 W base transceiver. That middle ground is the G90's charm: enough power to make routine HF contacts without the bulk and current draw of a large station.

## Why owners keep it

The built-in automatic tuner is the headline feature. Xiegu specifies a matching range of up to roughly `5:1`, much wider than the modest internal tuners in many larger radios. It will not turn a bad antenna into an efficient one, but it can make a sensible portable wire, non-resonant doublet system or slightly off-band antenna safe for the transmitter. Initial tune can take up to about twelve seconds; a recalled match may return in a couple of seconds.

The detachable front panel is another genuine advantage. At home the small body can sit out of the way with the head at hand. In a vehicle the body can be mounted where it has air, while the controls stay visible. Use the supplied one-to-one extension arrangement and strain relief; a DB9 cable that merely fits is not automatically wired safely.

The receiver is lively and pleasant when set up sensibly. **RF Gain**, **PRE**, **ATT**, AGC and the adjustable filter overlap give far more control than the little screen suggests. The spectrum is narrow compared with a modern desktop SDR, but it is wide enough to locate activity, judge band occupancy and tune by eye.

Finally, it is serviceable as a computer-controlled digital station. CAT is available through the head's COMM port, analogue transmit/receive audio is on the rear ACC connector, and the optional DE-19 interface combines those paths for a computer. The supplied USB-to-3.5 mm programming lead is serial data only: it does not carry audio.

## Its honest limits

The small display and overloaded button labels make the first week harder than it should be. The five lower buttons do not always line up intuitively with the on-screen words. A function may also have changed meaning across firmware; the two-filter model introduced in v1.79 is the best example.

The receiver can overload in the presence of very strong signals. A preamplifier is not a “hear farther” switch: below roughly `18 MHz`, leaving **PRE** off is normally quieter and cleaner. At night on 40 or 80 metres, reducing RF gain or using the attenuator can make a weak station _more_ readable by restoring headroom.

The internal loudspeaker is small. Current hardware revisions add a hidden speaker/headphone impedance selector behind the detachable head and can drive a suitable passive speaker; older units generally provide a headphone-level output. The 2024 hardware revision also changed the DC connector from mini-Tamiya to Anderson Powerpole and changed the lower case cooling. Identify your own unit before buying cables.

The G90 has no internal battery. It needs a well-regulated `13.8 V` supply with comfortable current headroom; an `8 A` minimum is realistic and a fused `10 A` supply is a sensible station choice. It must have airflow during long digital transmissions.

## Who it suits

- **A newcomer to HF** who wants enough power, a built-in tuner and a visible band without buying a full-size station.
- **A portable operator** who values a forgiving tuner and can carry an external LiFePO4 battery.
- **A CW operator** who wants a keyer, adjustable QSK, a narrow filter and a basic decoder aid.
- **A digital operator** willing to use proper ACC audio and learn the firmware-specific ALC rule.
- **A shortwave listener** who wants general coverage, AM/SSB/CW and a small spectrum display.

It suits you less well if you need 100 W, 6 m, a large touch screen, multiple antenna ports, sophisticated DSP noise reduction or a single-cable USB audio interface built into the radio.

## A tour of the station connections

Knowing what each socket is _for_ prevents most accessory mistakes.

| Connection               | Intended job                                                              | Common misunderstanding                                |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| SO-239 antenna           | Main receive/transmit RF connection                                       | The ATU does not make an absent or broken antenna safe |
| DC input                 | Fused external 12–13.8 V-class supply                                     | Hardware revisions use different physical connectors   |
| Head COMM                | Normal CAT and APP/head firmware loading                                  | It carries serial data, not sound-card audio           |
| Rear COMM                | BASE/body firmware loading                                                | It is not the normal everyday CAT port                 |
| Rear ACC                 | Line input/output, PTT and accessory signals                              | Pinout and levels must be followed exactly             |
| I/Q output               | Stereo analogue baseband for an SDR sound card                            | Not ordinary speaker audio and not USB control         |
| KEY                      | Straight key or paddle with correct 3.5 mm TRS wiring                     | A mono adapter can hold the transmitter keyed          |
| Headphone/external audio | Listening output; later units can support a passive speaker with selector | Earlier and later impedance arrangements differ        |
| Microphone               | Hand microphone, PTT and keypad                                           | U-D/L-D deliberately mute mic audio in favour of ACC   |

The optional DE-19 is useful precisely because it bridges several rows: it presents computer audio and serial control while connecting to the head COMM and rear ACC routes. It does not change the underlying separation. Understanding the individual paths makes replacement cables and fault-finding much easier.

### What is and is not in the box

A typical G90 package contains the body/head, hand microphone, head connection hardware and DC lead; exact bundles vary by seller and year. It normally does **not** give you a mains supply, battery, antenna, dummy load, digital audio interface, key, headphones or safe mobile mount. Budgeting for those is part of buying the station.

For a first complete station, prioritise a regulated fused supply, suitable resonant antenna/feedline, dummy load and comfortable headphones. A small external SWR/power meter and analyser are helpful, but the G90 already provides enough internal indication to begin safely. Buy the DE-19/isolated interface only when computer data is an actual goal.

## A note on specifications and revisions

Specifications online sometimes conflict because they describe different dates or operating definitions. The most visible example is AM output: older product material commonly describes a roughly 5 W AM carrier, while the June 2025 manual's table can be read as up to 20 W for AM. An AM carrier, peak-envelope power and a software power setting are not interchangeable. Operate AM conservatively, watch current, heat and SWR, and verify actual carrier/PEP with suitable test equipment rather than promising a universal 20 W carrier.

Memory count has a similar history: a 2021 FAQ says 100, while current v1.79+ documentation and the live channel workflow expose `CH00–CH63`—64. This guide uses the current mechanical inventory and calls out the old figure instead of averaging the two.

The MFK inventory is another documentary wrinkle. One table in the June 2025 manual lists only five assignments and omits RF Gain, while the v1.75 release notes explicitly add RF Gain and current control inventories show six. This guide includes RF Gain but tells you to trust the live assignment list for the exact APP build. That is a documented discrepancy, not an invented hidden menu.

The lesson is general: model name alone is not a full configuration. Record connector generation, serial, APP, BASE and build dates. That five-line station record explains more than a photograph of the front panel.

## Safety and licence in one page

Transmit only under an appropriate amateur licence, inside the frequencies, modes and power limits that apply where you are. The receiver tuning range is not permission to transmit there.

Never transmit into an open antenna socket. Connect a suitable `50 Ω` antenna or dummy load, start at low power and watch SWR. The tuner briefly transmits while it searches, as does the SWR scanner, so both require a legal clear frequency.

Use only negative-ground DC between Xiegu's stated limits (`10.5–16.5 V`), with correct polarity and a fuse near the battery or supply. A nominal 12 V lead-acid or 4-cell LiFePO4 battery is appropriate; a poorly regulated charger is not. Do not use the radio while a lithium battery is being charged unless its maker explicitly supports that load. Keep the body ventilated and stop if connectors, cable or case become abnormally hot.

## The source trail

The companion is deliberately traceable rather than based on remembered forum advice:

- [Xiegu authorised downloads](https://xiegu.eu/downloads/)
- [G90 v1.81 firmware and release notes](https://xiegu.eu/sdm_downloads/xiegu-g90-firmware-v1-81-25-08-25/)
- [G90 Operation Manual archive](https://xiegu.eu/sdm_downloads/g90-operations-manual-v104/)
- [Xiegu/Radioddity Operation Manual v5, June 2025](https://radioddity.s3.amazonaws.com/Radioddity_G90_User_Manual_V5_June_2025.pdf)
- [Xiegu v1.79b03 cheat sheet and release history](https://xiegu.eu/wp-content/uploads/sites/4/2024/08/XIEGU-G90-Cheat-Sheet-V1.79b03-102622.pdf)
- [Official firmware-upgrade tutorial](https://xiegu.eu/sdm_downloads/g90-firmware-upgrade-tutorial/)
- [Xiegu CI-V command reference](https://xiegu.eu/wp-content/uploads/sites/4/2023/08/XIEGU-RADIO-CI-V-REFERENCE.pdf)
- [Xiegu data-connection tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2020/06/XIEGU-Radio-Data-Communication-Connection-Setup-Tutorial.pdf)

Only install firmware from Xiegu or an authorised source. A file with the right-looking name from a forum attachment is not worth risking two controllers.

## Key takeaways

- The G90 is a compact `20 W`, HF-only SDR with a `48 kHz` display, general-coverage receiver and unusually capable internal ATU.
- This guide's baseline is **matched APP and BASE v1.81**. The June 2025 manual is v1.80-era and v1.81 release notes supersede it.
- On v1.81, higher ALC means more input and digital-mode ALC must stay **no higher than 50**.
- It has two firmware halves, several hardware generations and many short/long/FUNC button actions; identify versions before following old instructions.
- A sound first setup is `13.8 V`, fused supply, airflow, resonant or plausible antenna, modest power, PRE off and AGC-A.

Next, [Getting started](outpost:entry/logbook73.guide.g90/getting-started) walks the hardware, connections, display and first receive session without assuming you already speak Xiegu.
