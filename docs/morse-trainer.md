# Morse trainer

**Radio → Morse trainer** teaches Morse code by ear and by hand, and gets a call ready for the
air. It works with no internet connection. Each tab has its own address (`?tab=`).

## The tabs

| Tab | What it does |
| --- | --- |
| **Receive** | The Koch method in 40 lessons, characters at full speed from the first, in LCWO's order. Type what you hear; 90% or better offers the next lesson. Also callsign, word, abbreviation and QSO-phrase drills. Gaps can be stretched to a slower overall speed (Farnsworth). |
| **Send** | Key on the screen, a keyboard or a real key (straight key, iambic paddle in Curtis mode A or B, single lever, bug). **Quick targets** (key what is shown), **Echo** (hear it, key it back, see your timing and a tip) and **CQ conversations** (a CQ, SOTA or POTA activation, over by over). |
| **QSO practice** | A whole contact with a made-up station that answers what you keyed: it slows for QRS, repeats for AGN or ?, corrects a busted call and signs off at 73. A scorecard at the end. |
| **On the air** | Build a call a Reverse Beacon Network skimmer can spot, hear it, practise it, and **Check my call**. Then a checklist, and a link to the network's own page for your spots. |
| **Code chart** | Letters, digits, punctuation, prosigns and the timing rule. |
| **Progress** | Accuracy over time for each kind of practice, the lesson reached, and the characters missed most. **Start again** clears it. |

### Timing

One dit lasts 1.2 / *wpm* seconds (PARIS). A dah is 3 dits; gaps are 1 dit inside a character, 3
between characters, 7 between words (ITU-R M.1677-1). Farnsworth keeps the character speed and
stretches the gaps. Sources: [sources.md](sources.md).

### Timing coaching

Echo and On the air score your keying on dah length and the three gaps, measured in your own dit,
so steady keying at another speed is not marked down. The one or two worst measures below 85%
give the tips. With a paddle or single lever only the gaps are scored, as the keyer times the
elements.

### Adaptive practice

Weak and little-tried characters (over their last 20 tries) come up more often, and a new
character takes about one place in three. In Echo the next Koch character unlocks itself when the
newest has 10 tries at 90%+ and the lesson's characters are at 90%. Echo's speed rises 1 wpm after
3 clean replies and falls 1 after 2 misses, within 5 to 40 wpm; this can be turned off.

## Keys

| Key | How |
| --- | --- |
| On the screen | Two levers (or one knob for a straight key) for thumbs; hold both for an iambic squeeze. |
| A keyboard, or a USB interface that types keys | Press the binding button, then the key. Left and right Ctrl and Space to start with. |
| A two-button mouse adapter | **Start mouse paddle**: left dit, right dah, until Escape or Stop. |
| A paddle on a USB serial adapter | **Connect a wired key**: dit on CTS, dah on DSR or DCD. Chrome or Edge on a computer, on a secure page (https or the computer Outpost runs on); see **HTTPS on your network** in [deployment.md](deployment.md#https-on-your-network). |
| A game-controller interface | **Connect a game controller**: buttons one and three dit, two and four dah. Some browsers need a secure page. |

### Sound

The tone is made in the browser. On an iPhone, the silent switch can mute web pages; if you hear
nothing, the screen says what to try: tap again, check the switch and volume, check the tab is
not muted.

## What is stored

Outpost has no accounts, so there is **one record of progress for the whole household**. The
lesson reached, best speeds, settings and the newest 5,000 sessions are in the database: in
backups, counted under **Storage → Database**, and erased by "erase everything". The callsign on **On the air** starts from
your own call in the latest contact log entry.

## Differences from LogBook73

The trainer comes from LogBook73's, by the same author under the same MIT licence. Progress is
the household's, not per person. Spots from the Reverse Beacon Network are not fetched. Practice
callsigns start with Q, which is never issued. The keyer presets are each maker's default as
LogBook73 recorded them, not checked against each manual.

What has not been tried: [testing-status.md](testing-status.md).
