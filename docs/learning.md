# Learning progress

Outpost can hold course archives through Kiwix (Khan Academy, PhET, LibreTexts and
others). Learning progress records where each learner got to, so a child can carry on
tomorrow and a parent can see what has been covered. It relies only on which page is
open, its links, and whether a video on it played to the end, not on any archive's own
markup. What has not been tried is in [testing-status.md](testing-status.md#learning-progress).

## Who is learning

The reader's bar has a button with the learner's name, or **Who is learning?**. It lists
people with progress and the household's people, **Just me** (one unnamed learner),
**Someone else…**, and **Stop recording on this device**. Two children sharing a tablet
switch in two presses. The choice is remembered on the device.

**Nothing is recorded on a device until someone is chosen there**, nor while recording is
off ("Not recording").

**A name is not proof of anything.** There are no accounts: anyone with the device can
pick any name, and anyone in the house can see and remove everyone's progress.

## What is recorded

For each learner and page: when it was first and last opened, how long it was on screen
while visible, and whether it is done: **marked** (the learner pressed **Done**) or
**watched** (a video on it played at least nine tenths through to the end). Press **Done**
again to undo. A video in a frame of its own, or a player that is not a plain video, is
not seen. Time per day per archive gives "about 2 hours this week"; weeks start Monday.

Progress is written when a page is left, when the tab is hidden, and at most once a
minute otherwise. It is kept by the archive's name without its date, so it carries on
when the archive is updated, and stays when the archive is removed.

**Topics.** Where a topic page is a plain list of links, the Learning view says "2 of 3
done in Fractions": the count is the lessons that page links to, so it can include
links that are not lessons. Where links are drawn by a script, or a page has over 300,
only the pages done are counted.

## Where it is seen

- A collection's page says "Carry on where Sam left off".
- **Library → Learning** shows, for the learner chosen or **Everyone**, each course: where
  they got to, pages opened and done, time this week, and topic lines. **Carry on** opens
  that page and makes that learner the device's. **On paper** makes a PDF
  ([library.md](library.md#learning-progress-on-paper)).

Progress is never put in search or sent to a model server.

## Removing it

**Storage → Manage and clean up → Clean up → Learning progress** removes one learner's
progress or everyone's, after asking. Erase everything removes it all. It is in every
backup and goes onto a portable drive, but is not brought back from one.

Limits: 50 learners, 20,000 pages each (the oldest not-done page makes room), names of 40
characters.

## Not done

- EPUB and PDF reading is not tracked per learner (an EPUB remembers its place per
  device). OpenStax books in the Schoolroom pack are library PDFs, not archives.
- Whether an exercise was answered correctly is not known.
