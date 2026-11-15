# VFO, steps, zones and VOX

This is the first of the reference pages, and it sets the pattern for all of them. From here on, every menu item on the radio gets the same treatment: what it does, what is happening inside, why the feature exists, sensible values, a UK-flavoured recommendation, a worked example, the mistakes people make, the settings it interacts with, and a straight answer to "should I actually change this?". You do not need to read these pages in order — jump to the item that is puzzling you.

We start with the settings closest to everyday tuning: **VOX**, **zones**, and the **VFO/CH** menu that governs how you step, offset and store frequencies.

## How to read these pages

Each item carries a one-glance verdict:

| Symbol | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| ✅     | Set it like this and forget it — right for almost everyone |
| ⭐     | Genuinely useful, depending on how you operate             |
| ⚠️     | Advanced — understand it before you enable it              |
| ❌     | Leave it off unless you have a specific reason             |

A note on menu paths: the RT-950 Pro's menu is one long list, so we name the **group** and the **item** (for example, _Radio → SQL_). Reach any of them with **MENU/OK**, the direction keys, and **MENU/OK** again to save — as covered in [Getting Started](outpost:entry/logbook73.guide.rt-950-pro/getting-started).

## VOX — voice-operated transmit

VOX makes the radio transmit when it hears your voice, so you can talk hands-free. It is three menu items working together, and it is the classic source of "why is my radio transmitting on its own?" — so it earns a careful look.

### VOX Switch — ❌ normally off

The master on/off for hands-free transmit.

- **Does:** when on, the radio starts transmitting the moment your voice (through the microphone) crosses a loudness threshold, and stops when you go quiet. No pressing PTT.
- **Inside:** an audio-level detector watches the mic. Cross the threshold and the firmware keys the transmitter exactly as a PTT press would; drop below it for longer than the delay (below) and it un-keys.
- **Why it exists:** genuine hands-free operation — driving, climbing, working with both hands — and headset use where reaching the PTT is awkward.
- **Values:** OFF / ON.
- **UK recommendation:** ❌ Leave **OFF** for general use. VOX transmits without you consciously deciding to, which on shared channels and repeaters is a fast way to annoy people (and to transmit background noise, or half a conversation you are having with someone in the room).
- **Example:** a cyclist using an open earpiece-and-boom-mic headset turns VOX on so they can answer a call without letting go of the handlebars.
- **Common mistakes:** leaving VOX on by accident, then wondering why the radio keys up when you cough; using it in a noisy car so road noise trips it constantly; using it on a busy repeater, where it doubles with others because it cannot hear the channel is occupied.
- **Related:** VOX Level and VOX Delay (below); _Radio → Busy Lockout_ (which does **not** stop VOX transmitting onto a busy channel — a real trap).
- **Should you change it?** Only if you have a specific hands-free need and a decent headset. Otherwise no.

### VOX Level — ⭐ 3–5 if you use VOX

How loud your voice must be to trigger transmit.

- **Does:** sets the sensitivity threshold. Higher numbers make the radio easier to trigger (quieter speech keys it); lower numbers demand a louder, more deliberate voice.
- **Inside:** it is simply where the level detector's trip point sits. A high setting places the trip point low, so more sound gets through — including unwanted noise.
- **Why it exists:** voices and environments differ enormously; a fixed threshold would key too easily for one person and never for another.
- **Values:** Level 1 (least sensitive) to Level 9 (most sensitive).
- **UK recommendation:** ⭐ **3–5** is a sensible middle. Start at 3 and raise it only if the radio fails to catch the start of your words.
- **Example:** in a quiet room, level 5 catches normal speech cleanly; on a windy hillside you might drop to 2 so the wind does not key the radio, and speak up.
- **Common mistakes:** cranking it to 9 "so it always works", then having every rustle and engine note transmit; setting it so low that the first syllable of every over is clipped off.
- **Related:** VOX Switch, VOX Delay.
- **Should you change it?** Yes, if you use VOX — it is the difference between VOX being usable and being a menace.

### VOX Delay — ⭐ 0.5–1.0 s

How long the radio keeps transmitting after you stop speaking.

- **Does:** holds the transmitter on for a set time after your voice drops below the threshold, so natural pauses between words do not chop your transmission into fragments.
- **Inside:** a hold timer restarted by every burst of speech; the transmitter only drops when the timer runs out with no new audio.
- **Why it exists:** without it, the gap between "good… morning" would drop and re-key the transmitter mid-sentence, mangling your audio and hammering the channel.
- **Values:** roughly 0.5 s to 2.0 s.
- **UK recommendation:** ⭐ **0.5–1.0 s**. Long enough to ride over normal pauses, short enough that you are not transmitting dead air for two seconds after every over.
- **Example:** at 1.0 s you can pause to think mid-sentence without the radio dropping; at 2.0 s the tail feels sluggish and holds the channel needlessly.
- **Common mistakes:** setting it very long and effectively transmitting silence after every over; setting it near zero and chopping your own speech.
- **Related:** VOX Switch, VOX Level.
- **Should you change it?** Tune it once when you set VOX up, then leave it.

## Zones — folders for your channels

A **zone** is simply a labelled folder of memory channels. The radio gives you up to **15 zones of 64 channels each** — nearly a thousand memories — but their real value is organisation, not capacity.

- **Does:** groups stored channels so you can flick between, say, "Repeaters" and "Airband" without scrolling past 900 unrelated entries.
- **Inside:** each memory channel belongs to a zone; the channel knob steps within the current zone, and a user key or the menu switches zones.
- **Why it exists:** a flat list of hundreds of channels is unusable in the field. Zones turn the radio into a set of purpose-built "band plans" you can jump between.
- **Values:** Zone 1 to Zone 15.
- **UK recommendation:** ✅ Use them, and group by **purpose** — Repeaters, Simplex, Airband, PMR446, APRS/data, Marine. This is the single biggest quality-of-life decision when you program the radio.
- **Example:** on a hilltop you switch to your "Summits" zone with that region's repeaters pre-loaded, rather than hunting through everything.
- **Common mistakes:** dumping every channel into Zone 1; grouping by band (2 m / 70 cm) instead of by purpose, which scatters "the repeaters I actually use" across two folders.
- **Related:** _VFO/CH → CH-Memory_ (which zone a saved channel lands in); the User Keys menu (assign a "Zone" quick key).
- **Should you change it?** Set your zones up thoughtfully once — ideally in programming software — and you will thank yourself forever.

## VFO/CH in frequency mode

These items appear when you are in VFO (frequency) mode. They control how the radio tunes and how you turn a dialled-up frequency into a saved channel.

### Step — ✅ match the service

The size of each tuning increment.

- **Does:** sets how far the frequency moves per click of the knob or press of the direction key — 12.5 kHz, 25 kHz, 8.33 kHz and so on.
- **Inside:** the synthesiser can land on a grid of frequencies; the step is the spacing of that grid as you tune. It does **not** change your transmit bandwidth (that is _Radio → Bandwidth_) — only where the dial stops.
- **Why it exists:** different services lay their channels on different grids. Land-mobile VHF/UHF uses 12.5 kHz; the European aviation band moved to 8.33 kHz; marine and some airband use 25 kHz. Match the grid and every channel lands exactly on frequency.
- **Values:** 2.5 / 5 / 6.25 / 8.33 / 10 / 12.5 / 20 / 25 / 50 / 100 kHz.
- **UK recommendation:** ✅ **12.5 kHz** for the 2 m and 70 cm amateur bands; **8.33 kHz** for the European VHF airband; **25 kHz** for marine and older airband channels.
- **Example:** to tune the 2 m calling channel `145.500`, a 12.5 kHz step lands on it exactly; a 25 kHz step from `145.000` would skip straight past to `145.525`.
- **Common mistakes:** trying to reach an 8.33 kHz airband channel with a 25 kHz step and never landing on it; blaming a "deaf" radio for missing a repeater when the real fault is a mismatched step.
- **Related:** Direction and Offset (below); _Radio → Bandwidth_.
- **Should you change it?** Yes — set it to suit whatever you are tuning. It is a per-VFO setting, so each of A/B/C can differ.

### Direction — ⭐ only for repeaters

The direction of the duplex offset.

- **Does:** tells the radio to transmit **above** (`+`) or **below** (`−`) the frequency you are listening on, or on the same frequency (None) for simplex.
- **Inside:** on transmit, the radio adds or subtracts the Offset value (below) from the displayed frequency. On receive it sits on the displayed frequency. This is the "automatic frequency hop" that lets you work a [repeater](outpost:entry/logbook73.handbook/repeaters).
- **Why it exists:** a repeater listens on one frequency and transmits on another; your radio must mirror that split, shifting on transmit and shifting back on receive, without you retuning.
- **Values:** None / + / −.
- **UK recommendation:** ⭐ **None** for simplex (direct) contacts. For repeaters, set the direction your band plan requires — in the UK, **−** on 2 m and **+** on 70 cm — but honestly, storing the repeater as a memory channel sets this for you.
- **Example:** a UK 2 m repeater with output `145.700` needs Direction `−` and Offset `0.600`, so your transmit lands on `145.100`, the repeater's input.
- **Common mistakes:** setting a direction on a simplex channel (so you transmit off-frequency and nobody hears you); using `+` where your band plan wants `−`.
- **Related:** Offset (below); _Radio → R-TONE_ and the CTCSS menu (most repeaters also need a tone).
- **Should you change it?** For casual use, no — program repeaters as memories. Set it by hand only when adding a new repeater in VFO mode.

### Offset — ⭐ match the band plan

The size of the duplex shift.

- **Does:** sets how far, in MHz, the transmit frequency moves from the receive frequency when Direction is `+` or `−`.
- **Inside:** the number added or subtracted on transmit. Direction sets the sign; Offset sets the size.
- **Why it exists:** each band standardises a repeater shift, and the radio needs the figure to work out its transmit frequency.
- **Values:** entered manually, typically `0.600` MHz on 2 m and `1.600` or `7.600` MHz on 70 cm depending on region.
- **UK recommendation:** ⭐ **0.600 MHz** on 2 m; **1.600 MHz** on 70 cm. Elsewhere, check your national band plan — the 70 cm shift in particular varies (±5 MHz in the US, −7.6 MHz across much of Europe).
- **Example:** 70 cm UK repeater output `433.150`, Direction `+`, Offset `1.600` → you transmit on `434.750`.
- **Common mistakes:** entering `600` instead of `0.600`; copying a US 5 MHz 70 cm offset onto a UK repeater.
- **Related:** Direction (above); the repeater's own listing, which is the final word on offset and tone.
- **Should you change it?** Only when programming a repeater by hand; a stored memory remembers it for you.

### RX Modulation — ✅ FM for ham, AM for airband

How the radio demodulates what it receives on this VFO.

- **Does:** chooses FM or AM demodulation for the current VFO.
- **Inside:** it selects which detector the receiver uses. The [aviation band](outpost:entry/logbook73.handbook/vhf) transmits in AM; the amateur and PMR bands use FM. Pick the wrong one and a strong, clear signal still comes out as unintelligible mush.
- **Why it exists:** the radio receives far outside the ham bands, where different services use different [modulation](outpost:entry/logbook73.handbook/modulation). One setting cannot suit them all.
- **Values:** FM / AM.
- **UK recommendation:** ✅ **FM** for 2 m, 70 cm, PMR446 and marine; **AM** for the aviation airband.
- **Example:** listening to your local airfield on `118–137 MHz`, set RX Modulation to AM or you will hear only a faint, distorted whisper.
- **Common mistakes:** leaving it on FM for airband and concluding the radio "can't hear aircraft"; forgetting it is per-VFO, so VFO A is on AM for airband while B stays FM for the repeater.
- **Related:** Step (airband uses 8.33/25 kHz); the SSB/CW receive modes covered later for HF listening.
- **Should you change it?** Yes, to match whatever the VFO is tuned to. Store it in the memory so you never think about it again.

### CH-Memory — ✅ how you save a channel

Stores the current VFO setup into a numbered memory channel.

- **Does:** takes everything about the current VFO — frequency, offset, direction, tones, bandwidth, modulation, power — and saves it as a recallable channel in a zone you choose.
- **Inside:** it writes a snapshot to memory. From then on, recalling that channel restores the whole setup in one step.
- **Why it exists:** nobody wants to re-enter a repeater's frequency, offset and tone every time. Memories are the point of the radio for daily use.
- **Values:** choose a zone (1–15) and a channel slot.
- **UK recommendation:** ✅ Save every frequency you use more than once, into a sensibly named zone. Better still, build the lot in programming software and write it in one go.
- **Example:** you tune your local repeater in VFO mode, add its offset and tone, then CH-Memory it into your "Repeaters" zone as "GB3xx".
- **Common mistakes:** saving into the wrong zone; overwriting a channel you meant to keep; saving before you have set the tone, so the stored channel cannot open the repeater.
- **Related:** Zone; CH-Edit Name; CH-Delete.
- **Should you change it?** This is an action, not a setting — use it whenever you have something worth keeping.

### CH-Delete — ⭐ housekeeping

Removes a stored channel. ⭐ Use it to tidy up; deleting a channel does not renumber the others. There is no undo, so if you programmed via software, keep the backup.

## VFO/CH in channel mode

In memory (channel) mode a few extra items appear, because now you are managing stored channels rather than raw frequencies.

### MDF-A / MDF-B / MDF-C — ⭐ what each row shows

Sets whether each VFO row displays a channel's **name**, its **frequency**, or its **channel number** while in memory mode.

- **Does:** independently chooses the display style for rows A, B and C.
- **Why it exists:** some operators think in names ("GB3xx"), others in frequencies, others in channel numbers. The radio lets each of the three rows suit its job.
- **Values:** Name / Frequency / Channel Number.
- **UK recommendation:** ⭐ **Name** is friendliest once your channels are named; **Frequency** is reassuring while you are learning. Note that Name only shows if you actually named the channel (in software or via CH-Edit Name).
- **Common mistakes:** setting rows to Name but never naming channels, so the display shows blanks or numbers.
- **Should you change it?** A matter of taste — set it once to how you think.

### CH-Edit Name — ⭐ and CH-Delete / CH-Memory

**CH-Edit Name** (⭐) renames the current stored channel using the keypad's multi-tap input — the friendly touch that turns "channel 007" into "GB3xx". **CH-Memory** here updates the current memory in place, and **CH-Delete** removes it. Remember the golden rule from [Getting Started](outpost:entry/logbook73.guide.rt-950-pro/getting-started): most _content_ of a channel (frequency, tone, offset) is edited in **VFO mode** and re-saved — channel mode is for naming, displaying and housekeeping, not re-tuning.

## Key takeaways

- **VOX** is three settings (Switch, Level, Delay); leave it off for general use, and if you do use it, set Level 3–5 and Delay 0.5–1.0 s and use a proper headset.
- **Zones** are folders — group your channels by purpose, not by band, and set them up once in software.
- **Step** must match the service's channel grid (12.5 kHz ham, 8.33 kHz Euro airband, 25 kHz marine); it does not affect transmit bandwidth.
- **Direction + Offset** create the repeater duplex shift (UK: −0.6 MHz on 2 m, +1.6 MHz on 70 cm) — but storing repeaters as memories sets these for you.
- **RX Modulation** is per-VFO: FM for ham/PMR/marine, AM for airband.
- **CH-Memory** saves the whole VFO setup as a recallable channel; do your tuning and toning in VFO mode first, then save.

Next, the tones that keep your speaker quiet and open repeaters: [CTCSS, DCS & Sub-tones](outpost:entry/logbook73.guide.rt-950-pro/menus-ctcss).
