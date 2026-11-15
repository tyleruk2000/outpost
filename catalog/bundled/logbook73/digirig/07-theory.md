# The theory: sound cards, keying and clean stations

Nothing in this chapter is required to operate. All of it makes you better at operating, because a station you understand is a station you can fix, improve and trust. Four ideas underlie everything the little box does: the sound card as a modem, the four ways radios get keyed, why serial "standards" fractured into dialects, and where noise and RF actually enter a station.

## The sound card is your modem

Every mode you run through a Digirig — FT8, PSK31, packet, SSTV, Winlink's software modems — is **audio mathematics**. The transmitting computer computes a waveform and plays it; the radio treats it exactly as it would treat your voice; somewhere far away the process runs in reverse, and a decoder turns recovered audio back into bits. The radio never knows it is doing data.

This is why a humble USB codec can be the heart of a data station, and it sets the two quality limits that matter:

- **Dynamic range**: the receive converter must capture weak signals and strong ones in the same capture without the strong ones clipping — which is why the [levels chapter](outpost:entry/logbook73.guide.digirig/levels) fusses about meters in their target zones rather than "as loud as possible".
- **Cleanliness on transmit**: any distortion of the computed waveform becomes literal spurious emission. A clipped sine acquires harmonics; on the air those are extra signals you are transmitting. The waterfall's sidebars are not a metaphor — they are your audio chain's sins made RF. [Modulation](outpost:entry/logbook73.handbook/modulation) and [FFTs and Waterfalls](outpost:entry/logbook73.handbook/ffts-and-waterfalls) carry this further.

One reassurance while we're here: sample-rate perfectionism is mostly wasted worry at this level. The modes are engineered for ordinary sound cards; the engineering effort belongs in levels and RF hygiene, not golden-eared hardware.

## The four ways a radio gets keyed

Every data setup keys the radio one of four ways, and knowing all four turns product pages into open books:

| Method                           | Mechanism                                                                                   | Character                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Hardware line via serial RTS** | A control line closes a transistor switch on the radio's PTT pin — the Digirig Mobile's way | Precise, universal, software-agnostic; needs a real serial port                                                  |
| **CAT command**                  | The protocol itself says "transmit"                                                         | Clean, one-cable elegance; only as good as the radio's CAT implementation                                        |
| **Codec GPIO**                   | The sound chip's spare pin drives the switch — the Digirig **Lite**'s way (CM108 GPIO3)     | No serial port needed; support depends on software knowing the trick                                             |
| **VOX**                          | The radio keys itself when audio appears                                                    | Zero wiring; pays in clipped starts, hung tails and false triggers — the method the other three exist to replace |

The Mobile betting on RTS is a considered choice: it is the mechanism _every_ serious application supports on _every_ platform, and its timing is deterministic — the transmission starts when the waveform starts, not a syllable later.

## Why serial has dialects (a short history with consequences)

Serial data itself is ancient and simple; what fractured is the **electrical layer**. Classic RS-232 swings its voltages both sides of ground; microcontroller-era "TTL serial" stays between ground and a few volts; Icom collapsed the whole thing onto **one shared wire** (CI-V) so several radios could party-line a single controller; and some modern rigs rolled their own arrangements again (the TX-500's scheme earns its own configuration). None of these interoperate electrically even though they'd understand each other's _data_ — hence the Digirig's [solder-set configurations](outpost:entry/logbook73.guide.digirig/how-it-works): the same CP2102 dressed for four different parties.

The lasting insight: **when serial fails, think in layers.** Electrical mismatch (wrong configuration) fails silently; wiring mismatch (TX/RX crossed) fails silently; protocol mismatch (wrong baud, wrong radio model) fails noisily or silently — and the [loopback test](outpost:entry/logbook73.guide.digirig/rig-control) is powerful precisely because it cuts between the layers.

## Grounds, loops and where the noise gets in

Connect a mains-powered computer to a mains-powered radio and you have built a loop: signal leads one way, mains-earth path the other. Any magnetic field threading that loop — mains hum, switch-mode supply hash — drives current around it, and that current rides on your audio as buzz. Portable stations dodge it (batteries break the loop); desk stations manage it with short leads, shared power strips, and chokes.

The nastier cousin arrives on transmit: **your own RF**. The antenna's field induces currents on every cable in the station; USB, tolerant of almost nothing, is usually first to fall over. The symptom set is diagnostic gold — _everything works at low power or into a dummy load, and fails when real watts meet the real antenna_: audio distorts, PTT sticks, the interface disconnects mid-over. The official prescription is the standard RF-hygiene kit, in escalating order: reduce power and confirm the diagnosis; fix the antenna system (lower SWR; "install a choke balun at the antenna's feed point"); and apply **ferrites** to the cables — clip-ons or a few turns through a ring — to block what the officials call "stray RF in the shack disrupting Digirig's communication". [EMC and RFI](outpost:entry/logbook73.handbook/emc-rfi) is the full course; [SWR](outpost:entry/logbook73.handbook/swr) and [Antennas](outpost:entry/logbook73.handbook/antennas) explain why the feed point matters most.

A note on isolation: classic interface designs used audio transformers to break ground loops galvanically. Compact modern designs rely instead on careful level management, filtering and RF hygiene — which is exactly the filtering-and-attenuation circuitry the Digirig documentation describes, plus the ferrite discipline above. The practical takeaway is unchanged either way: **loops are managed, not wished away**, and battery-powered field stations are the quietest of all.

## The deeper rabbit holes

For the reader this chapter has whetted rather than satisfied: [Electrical Circuits](outpost:entry/logbook73.handbook/electrical-circuits) for what "open collector" really means; [Receivers](outpost:entry/logbook73.handbook/receivers) and [Transmitters](outpost:entry/logbook73.handbook/transmitters) for the radio side of the wall; [HF Data Modes](outpost:entry/logbook73.handbook/hf-data-modes) for how each mode spends the audio channel it is given; and [Measurement and Construction](outpost:entry/logbook73.handbook/measurement-and-construction) for the multimeter-and-scope skills that turn every diagnosis in this guide from ritual into understanding.

The single sentence to keep: **a data station is a computer doing mathematics, a radio doing RF, and an interface keeping their handshake honest — and each of the three fails in its own recognisable accent.** Learning the accents is the whole craft of the [troubleshooting chapter](outpost:entry/logbook73.guide.digirig/troubleshooting) to come.
