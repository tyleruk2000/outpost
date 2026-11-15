# Troubleshooting the RT95 logically

Change one thing at a time. Begin with power, antenna, main-channel selection and gating before reaching for reset.

## Nothing appears on the display

1. Switch the supply off.
2. Verify 12/13.8 V—not 24 V—and correct red-positive/black-negative polarity.
3. Inspect both 10 A fuses and fuse holders.
4. Measure voltage at the radio connector under load.
5. If a replacement fuse blows, disconnect and find the short; never fit a larger fuse.

## Display dims or radio resets on transmit

Receive current is small; transmit exposes weak wiring.

- measure voltage while PTT is held into a dummy load;
- avoid thin extension leads and poor accessory sockets;
- clean/tighten battery and fuse connections;
- use a supply with adequate current headroom;
- test low power—if low works and high collapses, suspect delivery before firmware.

## RX indicator or meter moves, but no sound

1. Press `MON`. If speech/noise appears, the RF and speaker path work.
2. Lower Function 04 squelch.
3. Set `RCDT` off temporarily.
4. Set `T-DEC` off and signalling combination to `SQ`.
5. Check Function 16 speaker routing (`MAIN`, `HAND`, `M&H`).
6. Check mute and volume.

An unmatched receive tone or fleet signalling gate is the classic cause.

## You hear a repeater but cannot open it

- confirm the displayed side is main;
- verify receive frequency and the **derived transmit frequency**;
- verify offset sign/magnitude;
- verify `TCDT` against the current repeater listing;
- distinguish continuous CTCSS from a one-shot tone burst;
- ensure Channel 13 permits TX (`ON` according to the manual);
- try low power first, then higher only if the path is weak;
- check antenna and range.

## PTT only beeps

Likely causes are:

- Channel 13 TX permission is `OFF` (receive-only);
- busy lockout sees a carrier;
- TOT has expired;
- the entered frequency is outside the unit's transmit limits;
- a password/professional code plug has restricted operation.

Do not defeat TX protection until you understand why it acted.

## PTT transmits on the wrong frequency

Immediately release PTT. Then check:

- which row is main;
- offset and direction;
- reverse and talk-around state;
- whether `RTDF` is active and what the lower TX row contains;
- whether a temporary memory edit disappeared;
- the code plug's exact TX field.

Use a dummy load while diagnosing.

## Scan does not start or finds nothing

- in memory mode, ensure channels show the `S` scan-list marker;
- ensure memories are not empty;
- lower squelch;
- remove receive-tone/optional-decode gating for a test;
- choose `CO`, `TO` or `SE` intentionally;
- in VFO, choose a step appropriate to the range.

## The first syllable is missed in dual watch

That is a consequence of one receiver sampling two channels. Turn dual watch off when complete audio on one working channel matters more than awareness of the second.

## The menu item you expect has disappeared

- Channel name is hidden in VFO and while `RTDF` is on.
- Offset and talk-around are hidden while `RTDF` is on.
- Professional/channel lock configured in software can remove front-panel VFO access.
- A soft action may be in another `FUNC` group or assigned to another P key.

## Programming software cannot read the radio

1. Confirm the exact RT95 driver/model selection.
2. Confirm the COM port after plugging into the current USB socket.
3. Switch the radio on before read/write.
4. Close other software using the port.
5. Do not power-cycle during transfer.
6. If stuck, close software, disconnect cable, restore radio power, reconnect, reopen and select the current port.

Never start by writing a random downloaded code plug.

## Poor range

Check in this order:

1. antenna connector fully seated;
2. correct 2 m/70 cm antenna and sound mount/ground-plane arrangement;
3. SWR at the actual frequency;
4. coax loss/damage and adaptors;
5. power-supply voltage under PTT;
6. terrain and repeater status;
7. only then compare power levels or another radio.

## Reset as the last step

Read and save the radio first. Use `OPT` if only global options are suspect. `ALL` erases channel/signalling configuration as well. Restore a known-good backup, then re-test one simple receive and one lawful simplex/repeater channel before loading complex signalling.
