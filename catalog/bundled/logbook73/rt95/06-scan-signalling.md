# Scan, dual watch, tones and signalling

The RT95 has several features that all appear to “find activity”, but they solve different problems. Frequency scan searches VFO steps, memory scan searches your selected channel list, CTCSS/DCS scan identifies a continuous access tone on an active carrier, and dual watch samples two displayed channels.

## VFO frequency scan

1. Select VFO and the required band/step.
2. Choose the function group containing `SCN`.
3. Short-press `SCN`; `S` appears.
4. Use the knob or microphone `UP`/`DOWN` to reverse direction.
5. Turn the knob or press another key to leave scan.

A finer step finds closely spaced channels but takes longer to cross a band. Set a sensible start point and boundary rather than expecting a mobile radio to replace a spectrum analyser.

## Memory scan and scan skip

Memory scan moves only through stored channels that belong to the scan list. While stopped on a memory, hold the `SCN` soft key to add/remove it. The `S` indicator means included.

Build purposeful lists:

- include local repeaters, calling/simplex and event channels;
- exclude packet, permanently busy links and frequencies that open on local interference;
- keep receive-only memories TX-inhibited;
- use clear names so a stopped scan makes sense at a glance.

If “scan does nothing”, the most common cause is that no valid memories are included.

## Choosing scan behaviour

| Mode | Behaviour                                           | Best for                    |
| ---- | --------------------------------------------------- | --------------------------- |
| `CO` | hold while carrier remains, resume after it clears  | conversations and nets      |
| `TO` | pause 5/10/15 seconds, then move even if still busy | sampling many busy channels |
| `SE` | stop on the first qualifying signal                 | finding one active source   |

Receive tones and optional signalling affect what qualifies. A memory with strict `C&T` gating may sail past a strong carrier because the extra code does not match.

## CTCSS and DCS scan

On an active carrier, open the `CDT` soft action, choose CTCSS or DCS and hold that key to begin code scan. Change direction with the knob or `UP`/`DOWN`; press a key to exit. The manual says a match pauses about five seconds before resuming.

Use this as a diagnostic clue, not an authority. A found tone tells you what was present during that transmission; it does not prove you may access a repeater or that every subsequent transmission uses it. Confirm against the repeater keeper or current listing.

## Dual watch without wrong-side transmissions

A useful setup is:

- **main:** the repeater/event channel you are currently working;
- **sub:** a calling frequency or coordination channel;
- Menu 10 dual watch `ON`;
- `A/B` assigned to a front key;
- busy lockout `BU` on both saved channels.

When the sub side calls, deliberately select it main, confirm the indicator/frequency, listen for a gap, then PTT. The receiver does not automatically guarantee that transmit follows whichever row last made a sound.

## Monitor: the quickest diagnostic

Assign `MON` to a soft key. Depending on its key assignment it can toggle squelch open or open only while held. Use it when:

- the signal meter/RX icon moves but no audio is heard;
- you suspect receive CTCSS/DCS or optional signalling is blocking audio;
- a weak station sits below the squelch threshold;
- you need to distinguish an empty channel from a muted one.

If monitor reveals speech, reduce squelch and inspect `RCDT`, `T-DEC` and the signalling combination.

## CTCSS/DCS is access control, not privacy

`TCDT` adds the access tone/code you send. `RCDT` is the tone/code your receiver demands. They may be set independently. The most transparent repeater setup sends the required transmit tone while leaving receive decode off.

## DTMF and 5-tone

The microphone can send live DTMF: hold PTT and press number keys. It can also send a pre-programmed DTMF/5-tone group by holding PTT and pressing `UP`. The DTMF menu stores 16 sequences and chooses per-digit/gap timing of 50, 100, 200, 300 or 500 ms.

Longer timing is more tolerant of old or noisy decoders but occupies the channel longer. Start with the receiving system's documented value; if none is given, 100 ms is a reasonable conventional test point, not a guaranteed universal answer.

The five-tone, ANI, remote stun/kill/wake and optional scrambler functions are commercial-radio inheritances. Do not experiment with remote commands on-air. Scrambling amateur speech may breach licence rules and prevents ordinary operators from understanding the channel; leave it disabled unless a specific lawful service authorises it.

## Tone burst

Set Function Menu 14 to the published value, hold PTT and press microphone `DOWN`. Send one short burst to wake a legacy repeater, then speak normally. If the repeater uses continuous CTCSS instead, set `TCDT`; a tone burst will not replace it.
