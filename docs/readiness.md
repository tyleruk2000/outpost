# Check-ins, the log, routine checks and the offline drill

Four screens under **Preparedness** for the household's day-to-day readiness and for the
day something goes wrong. All of them work over the home network with no internet.

Outpost cannot wake a locked phone or send a notification. Anything here is seen when
someone next opens Outpost.

## Check-in and roll call

**Preparedness → Check-in and roll call**.

- **Check in.** Press **I'm safe** or **I need help**, with a few words about where you
  are if you like. **Words of my own…** adds a longer message and, on an HTTPS page, the
  device's position. A check-in is a message on the household board, so it also shows on
  **Messages**. The name you check in under is the one this device uses on Messages.
- **Roll call.** Everyone in the household (the people under Supplies and in the emergency
  plans), and anyone else who has checked in, with their latest check-in and how old it
  is. Choose the time to count from: the last time someone asked, an hour ago, midnight,
  or a time you give. The line above the list says who has not checked in since then.
- **Ask everyone to check in** posts "Roll call: please check in" on the board under your
  name, with a line of your own if you add one, and the roll call then counts from that
  moment. Where a mesh radio link is set up, tick its channels to ask by radio as well.
  Check-ins that come in by radio count in the roll call too, under the name the radio
  sends.

## Log of events

**Preparedness → Log of events**: what happened when, one line at a time. "Power went
off", "Called the network operator", "River at the step".

- Each line is stamped with the time it is added and the name this device uses. Tick
  **It happened earlier** to give an earlier time, up to 30 days back.
- When an emergency plan is in use (started with **Use now**), a new line is linked to it,
  unless you untick **During …**.
- **With check-ins and ticked steps** shows the board's check-ins and the steps ticked in
  plans among the lines. They are read from where they are kept, not copied into the log.
  A plan's ticks are its current ones: resetting the plan clears them.
- Any line can be changed by anyone; the log then says who changed it and when. Removing a
  line asks first, and cannot be undone.
- **Save as PDF** prints the log as shown, a table per day. **Write to a page of Notes**
  makes a new page with the same lines, which stays as it is when the log changes.

Times on the page of Notes are written in the server's own time zone.

## Routine checks

**Preparedness → Routine checks**: the few things that keep a household ready, each with
how often and the day it was last done.

- **Start from the suggested list** adds eight checks: replace stored water you filled
  yourself, test the torches, run the generator, charge the radios, replace what expires in
  Supplies, test restoring a backup, read through the plans, and do the offline drill.
  Change, add or remove any of them.
- The water's six months comes from [Ready.gov, Water](https://www.ready.gov/water) (read
  21 Nov 2026), which says water that has not been commercially bottled should be replaced
  every six months. The other intervals are Outpost's suggestions.
- **Done today** records today and your name; the toast's **Undo** puts the old date back.
  To record a day in the past, change the check.
- A check never done, or past its interval, is overdue. **Home** shows overdue checks in
  one line, and nothing when none are.
- The Supplies check says how many items are dated within the next 30 days.

## Offline drill

**Preparedness → Offline drill**: what would stop working if the internet went off now.

**What Outpost holds** has a line for each thing a household needs without the internet:
home on the map, a map and terrain covering it, place names, an emergency plan, contacts
with an emergency list, supplies, a backup and its age, HTTPS, what this device keeps,
your own radio channels, anything half-downloaded, and whether the radio receiver is heard
with the mains off. Each says **Held**, **Missing**, **Out of date** or **Not checked**, with
a link to the screen that puts it right. The screen reads only what Outpost and this
browser hold; it fetches nothing.

Outpost cannot see inside other phones: open the screen on each phone to see what that
phone keeps. Whether a radio is heard with the mains off is not checked by Outpost yet;
the drill has a step for it.

**The drill** is a list of steps to follow on a phone with the internet unplugged: open
the map, search a place name, use a plan, check in, listen on the radio, and finally
switch the whole router off to see what the phone kept. Answer each step **Worked** or
**Did not**. The answers are kept on the phone as you go, so the list carries on with the
server out of reach. When everything is back on, write what to put right and press
**Keep the result**; the screen then shows when the drill was last done.

## Out of reach, on a phone

With the server out of reach, a phone on HTTPS can still check in and write new pages,
which are sent when Outpost is back. See [Out of reach](offline.md#writing-while-out-of-reach).
