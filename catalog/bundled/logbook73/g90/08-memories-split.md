# VFOs, memories, RIT and split

The G90 is a VFO-first radio with a small bank of conventional memories. Use the VFOs for live HF operation and memories for anchors—calling frequencies, nets, beacons and band starting points. Current firmware exposes **64 channels, CH00 through CH63**. A much older support FAQ said 100; the live v1.79+/v1.80-era control documentation and current radio are the safer authority.

## VFO mode versus memory mode

Short-press **VM** to switch.

- **VFO mode:** the main dial tunes freely and band/mode/filter context follows normal operation.
- **Memory mode:** the dial/arrows select stored channels. A recalled memory is not directly tunable like a VFO.

If the dial suddenly selects `CH..` instead of changing frequency, press VM. Nothing has failed.

## Write a memory

Prepare the exact frequency, mode and relevant state in VFO mode, then:

1. Short-press **MW/MC**.
2. Rotate/select a channel. Empty entries are indicated as empty (`E`) in the documented workflow.
3. Confirm with **MW/MC** as prompted.
4. Switch to VM and recall it to verify.

Avoid overwriting a channel whose purpose you no longer remember. Keep an external channel list because a firmware update/factory reset can clear records.

The microphone **MW** key mirrors memory write. Use it only when you can see which channel is selected; a convenient button is also an easy accidental overwrite.

## Clear a memory

Enter memory mode, select the exact channel, then use `FUNC + MW/MC` to clear it. Confirm on the display. There is no undo, and the channel label alone may not remind you what was there.

Because destructive memory actions are local and immediate, photograph/list all 64 channels before major firmware work.

## Tune from a stored channel

Memories are intended to be fixed. To make a stored frequency tunable:

1. Press VM and select the wanted channel.
2. Use `FUNC + A/B` to copy the recalled data into the VFO arrangement as documented on current firmware.
3. Press VM to return to VFO mode.
4. Tune normally and verify which VFO is active.

This copy workflow preserves the original channel while letting you move around it.

## A useful memory plan

Do not fill every channel with random frequencies. A simple structure remains useful after months away:

| Range   | Suggested use                       |
| ------- | ----------------------------------- |
| CH00–09 | band calling/starting points        |
| CH10–19 | regular local/regional nets         |
| CH20–29 | digital centres and beacons         |
| CH30–39 | shortwave references (receive only) |
| CH40–49 | portable/activation favourites      |
| CH50–59 | experiments/temporary events        |
| CH60–63 | calibration/reference and spare     |

Respect regional band plans. A frequency that is an SSB calling point in one IARU region may not be appropriate in another, and storing it does not make transmit legal.

## What a memory should capture

Before writing, deliberately set frequency and mode. Current firmware may retain operating context associated with the channel, but do not depend on every transient control—RIT, split, tuner network, AGC or filter—to behave as a complete station profile. After recall, run the before-PTT scan.

Name and purpose live mainly in your external list because the G90 display offers little room. A useful record has:

`channel · frequency · mode · purpose · region/source · last verified`

“14.300 USB net” is not enough if the purpose or legality changes; cite the band-plan/net source and review periodically. Receive-only broadcast channels should be clearly marked RX so nobody assumes PTT is appropriate.

## Band stack is not memory

The BAND keys recall a convenient last-used state for each band. That feels like hidden memories but serves a different job:

- **band stack:** last working place while moving among bands;
- **VFO A/B:** two live, freely tunable operating positions; and
- **CH00–63:** deliberate fixed recalls.

Use band stack for spontaneous band hopping, VFOs for a current task and memories for stable anchors. If a band key returns somewhere surprising, tune/set the desired starting point and leave it there before changing bands. System item 08 `Full Band` adds receive ranges to this navigation but does not add memory capacity.

## Field and event workflow

Before a planned activation or exercise:

1. Put primary net/calling frequencies in the first channels.
2. Add alternate bands and modes in a logical order.
3. Include receive-only propagation beacons/references where useful.
4. Verify every frequency against the current local band plan.
5. Rehearse VM recall and copying one channel to a VFO.
6. Print the list; do not make the radio its only copy.

During the event, avoid rewriting core channels under pressure. Use higher temporary channels or VFO B for ad-hoc frequencies. Afterwards, copy useful discoveries into the planned list and clear temporary clutter.

## Split etiquette and capability boundary

Observe several exchanges before choosing B. If the DX says “up 2 to 5,” choose a clear point in that range, not automatically the lower edge. If they say “listening 14.205,” use that exact B frequency. If the listening range lies outside your privileges, you cannot call.

The current operator-facing inventory has no separate XIT control. Do not infer one from a generic CI-V command table. Use A/B SPLT for a deliberate transmit offset and RIT for receive-only fine correction.

## VFO A/B operating patterns

### Same band, two activities

Put the voice segment in A and data centre in B. Short A/B swaps without losing either. Confirm mode each time; frequency and mode both matter.

### Calling and working frequency

Keep a calling frequency in A, copy to B, then move B to the working frequency. This is useful for a scheduled contact, but do not occupy a published calling channel for a long QSO.

### Guard against mistakes

Before experimenting with filters/RIT around a valuable setup, copy A to B. A/B then returns to the known point. This is not a full settings backup, but it is faster than rebuilding a frequency.

## Split operation step by step

Split is used when a busy DX station receives on one frequency and transmits on another. On the G90:

`VFO A = receive`  
`VFO B = transmit`

Procedure:

1. Disable existing split.
2. Put the DX transmit frequency in A and tune them accurately.
3. Put their announced receive frequency in B—perhaps `up 2` means 2 kHz above, but listen to their exact instruction.
4. Verify B lies in your permitted band segment and is not occupied.
5. Return to A.
6. Tap FUNC then AGC/SPL; confirm SPLT.
7. Listen to where successful callers transmit before choosing a spot in the pile-up.
8. Key briefly and watch that the display indicates B transmit.
9. Disable split immediately after the contact.

Do not transmit blindly on “up 5” if that enters another mode segment or outside your licence. The DX operator's instruction cannot override your licence.

### Tuning while split

Use A/B carefully to inspect the transmit frequency, but remember split's fixed roles. RIT can fine-tune reception without moving B. The v1.81 firmware fixes an ATU hang when SPLT is active; still, it is simplest to establish the antenna match on the actual B frequency before enabling split.

## RIT is not split

RIT moves only the receiver by about `±500 Hz` while transmit stays at the VFO frequency. It is for a slightly off-frequency caller, not for a DX station listening several kilohertz away. Split uses independent A/B frequencies; RIT is a fine offset.

The display's `R+`/`R−` indicator should return to zero after the QSO. A stored or forgotten receive offset creates confusing reports and bad memory captures.

## Startup callsign editor

Long-press **VM** to edit the callsign/boot text. The main dial selects and enters characters. Current instructions use soft actions including `BACK`, `QUIT` and `SAVE` (associated with the visible button labels; older documentation names NB/VM/PRE as the physical keys).

Enter your licensed callsign only. It is a local identification display, not automatic over-air identification and not proof of operator authority. If loaning or selling the radio, change or clear it and reset personal memories.

## Memory and update hygiene

The official update tutorial warns that channel records can be cleared. Before updating:

- list channel number, frequency, mode and purpose;
- record A/B starting points;
- photograph System Menu assignments/AUX values; and
- note APP/BASE versions.

After a reset, rebuild only channels still useful. A smaller curated list beats an imported archive of obsolete nets.

## Key takeaways

- Current stock firmware uses CH00–CH63: 64 memories, not the stale FAQ's 100.
- VM toggles VFO/memory; memories are fixed until copied back into a VFO.
- MW writes; FUNC+MW clears. Keep an external list because reset/update can erase them.
- Split receives on A and transmits on B. Verify B legally and clear split afterwards.
- RIT is only a ±500 Hz receive offset and should return to zero.

Next, [Connectivity and digital modes](outpost:entry/logbook73.guide.g90/connectivity-digital) connects CAT, ACC audio, CI-V, I/Q and the optional interfaces without confusing a serial lead for a sound card.
