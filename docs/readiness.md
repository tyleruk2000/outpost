# Check-ins, the log, routine checks and the offline drill

Four screens under **Preparedness**, all working over the home network with no internet.
Outpost cannot wake a locked phone or send a notification: anything here is seen when
someone next opens Outpost.

The log of events, the routine checks and the offline drill are for the household
Outpost is set to: each household has its own log and checks, and the drill is checked
against its home. With more than one household, the line under each title says which.
Check-ins and the roll call are the whole board's, for everyone.

## Check-in and roll call

- **Check in**: press **I'm safe** or **I need help**, with a few words about where you
  are if you like. **Words of my own…** adds a longer message and, on an HTTPS page, the
  device's position. A check-in is a message on the household board, under the name this
  device uses on **Messages**.
- **Roll call**: everyone in the household (the people of the current household, under
  [Households](households.md), and in its emergency plans) and anyone else who has checked in, with their latest check-in and its
  age. Choose the time to count from: the last time someone asked, an hour ago, midnight,
  or a time you give. The line above says who has not checked in since.
- **Ask everyone to check in** posts "Roll call: please check in" on the board, and the
  roll call counts from then. Where a mesh radio link is set up, tick its channels to ask
  by radio too; check-ins by radio count under the name the radio sends. Where a check-in
  came over the mesh from a radio that is switched on for the map (**Layers → Heard on the
  radio → Mesh radios**), its line also says where that radio last reported itself and how
  long ago, as a link to the place on the map. A radio left off shows nothing.

## Log of events

**Log of events**: what happened when, one line at a time ("Power went off", "River at
the step").

- Each line is stamped with the time and this device's name. Tick **It happened
  earlier** to give a time up to 30 days back.
- While an emergency plan is in use, a new line is linked to it unless you untick
  **During …**.
- **With check-ins and ticked steps** shows those among the lines, read from where they
  are kept. Resetting a plan clears its ticks.
- Anyone can change a line; the log says who and when. Removing one asks first and cannot
  be undone.
- **Save as PDF** prints a table per day. **Write to a page of Notes** makes a page that
  stays as it is when the log changes; its times are in the server's time zone.

## Routine checks

**Routine checks**: the few things that keep a household ready, each with how often and
when it was last done.

- **Start from the suggested list** adds eight: replace stored water you filled yourself,
  test the torches, run the generator, charge the radios, replace what expires in
  Supplies, test restoring a backup, read through the plans, and do the offline drill.
  Change, add or remove any.
- The water's six months is from [Ready.gov, Water](https://www.ready.gov/water) (read 21
  November 2026): water not commercially bottled should be replaced every six months. The
  other intervals are Outpost's suggestions.
- **Done today** records today and your name; **Undo** on the toast puts the old date
  back. To record a past day, change the check.
- A check never done, or past its interval, is overdue, and **Home** shows overdue checks
  in one line.
- The Supplies check says how many items are dated within the next 30 days.

## Offline drill

**Offline drill**: what would stop working if the internet went off now.

**What Outpost holds** has a line for each thing a household needs without the internet:
home on the map, a map and terrain covering it, place names, an emergency plan, contacts
with an emergency list, supplies, a backup and its age, HTTPS, what this device keeps,
your own radio channels, anything half-downloaded, and the radio receiver. Each says
**Held**, **Missing**, **Out of date** or **Not checked**, with a link to the screen that
puts it right. It fetches nothing. For a caravan or other household that moves, home is
where it was last said to be, with how long ago; a week or more ago reads **Out of date**.
Outpost cannot see inside other phones: open the screen on each one.

**The drill** is a list of steps for a phone with the internet unplugged: open the map,
search a place name, use a plan, check in, listen on the radio, and finally switch the
router off to see what the phone kept. Answer each **Worked** or **Did not**; answers are
kept on the phone, so the list carries on with the server out of reach. When everything is
back, write what to put right and press **Keep the result**.

With the server out of reach, a phone on HTTPS can still check in and write new pages,
sent when Outpost is back ([offline.md](offline.md#writing-while-out-of-reach)).
