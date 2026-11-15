# VFO, memories, repeaters and odd splits

The RT95 is easiest to understand as two layers: **VFO is the workbench** and **memory is the finished tool**. Build and test a channel in VFO, then save it. Do not keep “fixing” a recalled memory and assume every temporary value became permanent.

## Direct frequency entry

Make the required side main, select VFO, then type six digits on the microphone. `145.125 MHz` is `1 4 5 1 2 5`; the manual also accepts the shorter `1 4 5` for `145 MHz`. An out-of-range entry is rejected.

The channel knob normally moves one selected step. Pressing `PUSH` makes a digit position flash; turning then changes by decimal place (roughly 1 kHz, 10 kHz, 100 kHz, 1 MHz or 10 MHz). If the knob has been reassigned to volume, use the soft key assigned `FRQ` first.

## Save a new memory from the front panel

1. In VFO, set the receive frequency.
2. Set transmit tone/code with the `CDT` soft action or Channel Menu 02.
3. Set offset/direction, power, bandwidth and any receive tone.
4. Hold `FUNC` and check the channel menu values.
5. Short-press `FUNC` to the function group containing `V/M`.
6. Hold the `V/M` soft key until a channel number flashes.
7. Choose a slot with the knob or microphone `UP`/`DOWN`. The manual describes valid/occupied as red and empty as green; confirm on your revision rather than relying on colour alone.
8. Hold `V/M` again. A beep and stopped flashing confirm the store.
9. Recall the memory and verify every field before transmitting.

Give it a name in Channel Menu 11 or, more comfortably, in programming software.

## Delete a memory

Recall the unwanted memory, select the function group containing `V/M`, then hold `FUNC` and that `V/M` soft key together for about two seconds. The radio deletes the channel and advances. Back up first: there is no recycle bin.

## Direct memory selection

In memory mode the knob and microphone `UP`/`DOWN` skip empty channels. The microphone keypad accepts a three-digit slot: `001` through `200`. Entering an empty slot returns an error and leaves the previous channel selected.

## Standard repeater example

Suppose a repeater publishes:

- output/receive `145.725 MHz`;
- shift `−0.600 MHz`;
- access tone `82.5 Hz CTCSS`;
- 12.5 kHz channel plan.

Build it as:

| Field                  | Value             | Why                                |
| ---------------------- | ----------------- | ---------------------------------- |
| VFO receive            | `145.725`         | listen on repeater output          |
| Offset                 | `− 0.600`         | derived transmit is `145.125`      |
| `TCDT`                 | `CTCSS 82.5`      | opens the repeater                 |
| `RCDT`                 | `OFF`             | hear all output traffic and faults |
| Signalling combination | `SQ`              | no fleet selective-calling gate    |
| Bandwidth              | `NAR`             | follows this example's plan        |
| Power                  | `LO`              | test at 5 W first                  |
| Busy lockout           | `BU`              | do not key over an occupied output |
| Name                   | repeater callsign | travels better than `LOCAL`        |

Before PTT, confirm `145.125 MHz` is lawful for the intended transmission in your national plan. The example teaches the radio; it is not a universal repeater allocation.

## Reverse and talk-around are diagnostic tools

**Reverse** swaps the repeater input/output pair and their tones. If you hear the other station on the input, they may be close enough for simplex. **Talk-around** makes a direct call on the repeater output without using the repeater path. Neither should be left on accidentally, and direct use of an output must fit the local plan and coordination.

## `RTDF`: when offset is not enough

Normal repeaters are one receive frequency plus a signed shift. `RTDF` instead presents independent upper receive and lower transmit frequencies in VFO mode. It is useful for a true odd split but adds risk because the transmit frequency is no longer obvious from one line.

When using it:

1. turn `RTDF` on only in VFO;
2. enter the receive frequency on the upper/main side;
3. use `A/B` or the assigned action to select and enter the lower transmit frequency;
4. verify tones and legal band placement at both ends;
5. make a low-power test;
6. turn `RTDF` off when returning to ordinary channels.

Offset, talk-around and channel naming are hidden while `RTDF` is active. If an expected menu disappears, check Menu 17 before assuming a fault.

## Receive-only memories are worth using

Set Channel 13 to `OFF` for any frequency you intend only to monitor. The RT95 then beeps instead of transmitting when PTT is pressed. This is a better safety control than trusting memory, especially in a shared car or go-box.
