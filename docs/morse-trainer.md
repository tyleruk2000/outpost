# Morse trainer

Radio → Morse trainer (`/radio/morse`) teaches Morse code by ear and by hand, and gets
a call ready for the air. It came from LogBook73's Morse trainer, by the same author
under the same MIT licence, and does what that one does, with the differences listed
under [What was changed or left out](#what-was-changed-or-left-out). Everything on it
works with no internet connection.

## The tabs

The tab is in the address (`?tab=`), so each can be linked to. The ids are LogBook73's
and stay as they are whatever the tabs are called. Receive, the Code chart and Progress
come with the screen; Send, QSO practice and On the air are fetched the first time one
of them is opened.

| Tab | `?tab=` | What it does |
| --- | --- | --- |
| Receive | `receive` (the default) | The Koch method in 40 lessons: characters at full speed from the first lesson, two to start and one more each lesson, in the order LCWO uses. Type what you hear; 90 % or better offers the next lesson. Also callsign, word, abbreviation and QSO-phrase drills, each simple or harder. Characters at the character speed, gaps stretched to the effective speed (Farnsworth). The tab's name carries the lesson reached ("L3"). |
| Send | `send` | Key on the screen, on a keyboard or on a real key: straight key, iambic paddle (Curtis mode A or B, with the radio presets), single lever or bug. Three ways to practise: **Quick targets** (key what is shown), **Echo** (hear it with the text hidden, key it back, and see the copy, the timing and a coaching tip) and **CQ conversations** (a standard CQ, a SOTA or a POTA activation, over by over). |
| QSO practice | `qso` | A whole contact, turn by turn, with a made-up station that answers what your keying decoded to: it slows down for QRS, repeats for AGN or ?, corrects a busted call and signs off at 73. A scorecard at the end. |
| On the air | `rbn` | Build a call a Reverse Beacon Network skimmer can spot (everyday CQ, contest TEST, or TEST DE, each word with its reason), hear it, practise sending it, and **Check my call** against what a skimmer needs. Then the checklist for before you call on the air, and what the network is, with a link to its own page. |
| Code chart | `reference` | The letters, digits, punctuation and prosigns, and the timing rule. |
| Progress | `progress` | Accuracy over time for each kind of practice (receive, send, QSO, echo), the Koch lesson reached, and the characters missed most. |

### Timing

One dit lasts 1.2 / *wpm* seconds: the PARIS standard, in which the word "PARIS" with
the space after it is 50 dits long. A dah is 3 dits; the gap inside a character is 1
dit, between characters 3 and between words 7 (ITU-R M.1677-1). With Farnsworth spacing
the characters keep the character speed and the gaps between them are stretched until
the whole runs at the effective speed, as described by Jon Bloom, KE3Z, for the ARRL
(QEX, April 1990). The Code chart says this on the screen. Sources: [sources.md](sources.md#the-morse-trainer-its-method-timing-and-content-read-2026-11-16).

### Timing coaching (Echo, On the air)

Your keying is scored on four measures against standard sending: dah length (3 dits),
gaps inside letters (1), between letters (3) and between words (7). Gaps are measured
in your own dit, so steady keying at another speed is not taken for bad spacing; a
speed difference is said once, by itself. Each measure scores 1 − 2 × |keyed −
standard| / standard, from 0 to 1, and the one or two tips come from the worst below
85 %. With Farnsworth on, these are still the targets: Farnsworth only stretches what
you hear. With a paddle or single lever the keyer times the elements, so only the gaps
are scored. The played and keyed marks are drawn on one time line, and the same
figures are in two tables, so nothing is told apart by colour alone.

### Adaptive practice

Every session keeps how often each character came up and how often it was missed.
Over each character's last 20 tries, weak and little-tried characters come up more
often in the Koch drills and Echo's groups, and the newest character takes about one
place in three while it is new. In Echo the next Koch character unlocks by itself when
the newest has 10 tries at 90 % or better and the lesson's characters are at 90 %.
Echo's speed goes up 1 wpm after 3 clean replies and down 1 after 2 misses in a row,
within 5 to 40 wpm, and says why; it can be turned off.

## Keys

| Key | How |
| --- | --- |
| On the screen | Two levers (or one knob for a straight key) made for thumbs. Each finger is followed on its own, so both levers can be held at once for an iambic squeeze, and a thumb slid across moves to the other lever. The levers take no part in scrolling, selecting, zooming or the long-press menu. At least 160 px tall. |
| A keyboard, or a USB interface that types keys | Key bindings, by `KeyboardEvent.code`, so the layout does not matter: press the button, then the key or the paddle. Left and right Ctrl and Space to start with. The on-screen key names the keys, except on a phone or tablet with only a touch screen, which has none. |
| A two-button mouse adapter | **Start mouse paddle**: left button dit, right dah, until Escape or Stop. Off unless started, so ordinary clicking is never taken over. |
| A paddle wired to a USB serial adapter | **Connect a wired key**: dit on CTS, dah on DSR or DCD. Needs Web Serial, which is only in Chrome and Edge on a computer, and only on a secure page (https, or the computer Outpost runs on). At a plain http address the panel says so and points to Settings → HTTPS on your network. |
| A game-controller interface | **Connect a game controller**: first and third buttons dit, second and fourth dah. Some browsers list controllers only on a secure page; the panel says so where that is why. |

### Sound

The tone is made in the browser (Web Audio). Browsers start sound only from a press,
and an iPhone only from certain ones, so the trainer starts its sound inside the press
itself and again when the finger lifts. On an iPhone the silent switch mutes web pages
unless they ask for media playback; the trainer asks (Safari's `navigator.audioSession`
where it has it, otherwise by playing a moment of silence). If sound still cannot be
heard, the screen says what to do: tap again, check the silent switch and the volume,
check the tab is not muted.

To save power the sound is put to sleep two seconds after the last tone ends, and at
once when the page is hidden with nothing playing; the next key or Play wakes it.
During QSO practice with band noise it stays awake while the page is shown, since the
noise is meant to be heard between overs. A drill that is playing when the phone is
locked plays to its end. The automatic keyers (paddle, single lever, bug) work only
while an element is being sent, so an open Send tab costs nothing between presses.

## What is stored, and where

Outpost has no accounts, so there is **one record of progress and one list of sessions
for the whole copy**, shared by everyone who uses it. The Progress tab says so.

- **On the server, in the database** (tables `morse_progress` and `morse_sessions`,
  migration `0026_morse_trainer`): the Koch lesson reached, the best receive speeds,
  the trainer's settings, and every finished session (kind, accuracy, speeds,
  steadiness, lesson, characters missed and tried), the newest 5,000. They are counted
  under Storage → Database (in the Radio group) and under Manage and clean up, are
  erased by "erase everything", are in every backup, and **Start again** on the
  Progress tab clears them.
- **In each browser**: the settings (speeds, tone, key type, preset, bindings, echo
  options, the callsign) as a preference of the device, so keying starts at once.
  They are mirrored to the server's record a couple of seconds after a change, and a
  browser with none of its own starts from the server's.
- **Your callsign**: the On the air tab has its own field, kept with the settings. When
  it is empty and the contact log has entries, it starts from the station's own call
  in the latest one.

Routes: [api.md](api.md#morse-trainer).

## What was changed or left out

- **"Did the RBN hear you?"** In LogBook73 it lists the network's spots of your call
  from that server's own live feed. Outpost has no such feed and makes no request to
  anyone unless a person presses for it, so the tab explains what the network is and
  links to its own page (<https://www.reversebeacon.net/main.php>), where you type your
  call into the box for the spotted station. The network's pages give no address for
  one call's spots. Outpost itself asks the network nothing. "RBN on the map" is left
  out with it, and so is the distance to each skimmer.
- **Accounts.** Progress was per person in LogBook73; here it is the household's.
- **Left out, because Outpost has no such thing:** achievements and awards, the Learn
  hub and the handbook links, the command palette entries, the phone app and the
  desktop app. The handbook chapters that pointed to LogBook73's Morse practice still
  have their words and no link.
- **Callsigns.** Fixed example and practice callsigns start with Q, which is never
  issued, so they cannot be anyone's. The drills' random calls use real prefixes.
- **The keyer presets** are each maker's default as LogBook73 recorded it, not checked
  against each manual; the screen says so.

## What was not tested

Tested in the unit, server and end-to-end suites, at desktop and phone width, at a
plain http address and at a secure one. Not tested, because there was none to hand:
a real iPhone (the first-tap sound, the silent switch, and waking the sound after it
has been put to sleep without another press, which Safari allows once a page has
been let play but which was not tried on a phone), a real paddle on a USB
serial adapter, a game-controller interface and a two-button mouse adapter. The
end-to-end suite runs with the browser's audio, not listened to.

## Code

| Piece | Where |
| --- | --- |
| Engine (code, timing, keyers, decoder, Koch, drills, echo, the practice contact, CQ conversations, skimmer checks) and its tests | `packages/shared/src/morse/`; `apps/server/test/morse-*.test.ts` |
| Shared types | `packages/shared/src/morse.ts` |
| Server | `apps/server/src/modules/morse/`; `apps/server/test/morse.test.ts` |
| Screen | `apps/web/src/features/morse/` |
| End-to-end | `e2e/tests/morse.mobile.spec.ts` |
