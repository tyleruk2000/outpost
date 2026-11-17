# Learning progress

Outpost can hold course archives through Kiwix: Khan Academy, PhET's simulations,
LibreTexts and others. Learning progress records where each learner got to in them, so
that a child can carry on tomorrow where they stopped today, and a parent can see what
has been covered.

**It has not been tried with the real Khan Academy archive**, or with any real course
archive. The Khan Academy archive in the catalogue is 180 GB, and none was installed on
the machine this was built on. Everything here was built and tested against a small
course archive made up for the tests (`apps/server/test/course-archive.ts`), and is
designed so that it does not depend on any archive's own markup: it uses only which page
is on show, its title, the links on it that lead to other pages of the same archive, and
whether a `<video>` on it played to the end.

## Who is learning

A learner is a name chosen on the device. The reader's bar has a button that says who
is learning ("Sam"), or "Who is learning?" when no one has been chosen on this device
yet. Pressing it lists:

- the people who already have progress, and the household's people where Outpost holds
  them (the household under Preparedness, Supplies, and the people of the emergency
  plans);
- **Just me**, for someone who does not want to give a name (one shared, unnamed learner);
- **Someone else…**, to type a name;
- **Stop recording on this device** (or **Record progress on this device**).

On a tablet two children share, switching is one press to open the list and one to pick
the other name. The button is in the bar whenever an archive's page is open.

The choice is remembered in the browser of that device (`outpost.learning.learner`,
`outpost.learning.recording`); the progress itself is on the server.

**Nothing is recorded on a device until someone has been chosen there**, and nothing is
recorded while recording is turned off; the bar then says "Not recording".

**A name is not proof of anything.** There are no accounts and no passwords: anyone
holding the device can choose any name, and anyone in the house can see everyone's
progress (a parent included, which is the point). The Learning view says this once, in
those words.

## What is recorded

For each learner, archive and page:

- the page's address inside the archive and its title;
- when it was first opened, and when it was last opened;
- how long it was on screen while the reader's tab was visible, in whole seconds;
- whether it is done, when, and how: **marked** (the learner pressed Done) or
  **watched** (a video on it played to the end).

And, for each day, the seconds spent in each archive, for "about 2 hours this week". The
week begins on Monday at midnight by the server's clock.

Progress is kept under the archive's own name without its date
(`khanacademy_en_all`, not `khanacademy_en_all_2023-03`), so it carries on when an
archive is updated to a newer edition, and it is kept when the archive is removed (the
Learning view then says the course is not installed now). If a newer edition moves its
pages to other addresses, progress on the old addresses stays where it was.

### When it is written

The reader counts on the device and writes to the server:

- when a page is left (another page, another learner, the reader closed);
- when the tab is hidden (the phone locked, another tab, the browser closed);
- at most once a minute while one page stays open in a visible tab.

Never per second. Time counts only while the tab is visible. Nothing runs while no
archive page is open. The server holds each write to what could have passed since the
page was last written (plus five seconds), and to two minutes at most, so a device with a
wrong clock or a fault cannot add hours.

What it costs, measured with `e2e/tools/idle-cost.mjs` (a copy that chooses a learner
first) at phone size against the packaged app on the development Mac, 17 November 2026,
the reader open on a lesson and left alone:

| | Page | Frames | Timers | Requests | Server |
| --- | --- | --- | --- | --- | --- |
| Recording, visible (70 s) | 0% | 0 | 7 a minute | 1 a minute (the write) | 0% |
| Recording, hidden (70 s) | 0% | 0 | 1 a minute | 0 | 0.1% |
| No one chosen, visible (70 s) | 0% | 0 | 6 a minute | 0 | 0.1% |
| No one chosen, hidden (70 s) | 0% | 0 | 1 a minute | 0 | 0% |

The one extra timer a minute is the write. The other timers are the app's own, the same
with or without learning.

### Done, and videos

**Done** is a control in the reader's bar, 44 px on a phone. Pressing it marks the page
on show done and says so, with **Undo**; pressing it again undoes it.

A page whose `<video>` plays to its end counts as watched, if at least nine tenths of it
was played. The reader learns this from the script the proxy already adds to every
archive page, which now also sends one more message up to the reader when a video ends.
**The sandbox was not loosened for it**: the frame's `sandbox` attribute and the proxy's
policy are exactly what they were, and the tests assert both
([security.md](security.md#learning-progress)). The archive's page can only tell the
reader something; it cannot ask anything of it. A page could claim falsely that its video
ended; the most that does is mark that page watched. A video inside a frame of its own
on the page, or a player that is not a `<video>` element, is not seen; then the manual
control and the time on screen are what there is.

### A course's shape

Where an archive's home and topic pages are ordinary pages of links, the reader learns
which lessons a topic lists as the learner visits it, and the Learning view says
"2 of 3 done in Fractions". The rule, which needs no knowledge of an archive's markup:

- The script the proxy adds reports the links on each page that lead to other pages of
  the same archive (pictures, scripts, styles, media and documents left out), once the
  page has loaded. Up to 600.
- A page with 2 to 300 such links is kept as a list. The archive's first page (the one
  the reader shows for the archive's own address) is kept whatever its size, for what it
  shares with the rest.
- A topic's lessons are the pages it links to, less itself, the first page, and every
  link the first page has (the subjects and the menu every page carries).
- A topic is shown for a learner only when they opened it and have done at least one of
  its lessons.

"Of 3" is the number of pages that topic page links to under that rule: it is counted,
not made up. It can still include links that are not lessons, such as a sidebar that
lists other topics and is not on the first page. Where the reader could not read a list
(links drawn by a script after the page has loaded, as on the test archive's "Practice"
page, or a page of more than 300 links), no topic line is shown and the view says only
how many pages are done.

## Where it is seen

- **The collection's page in the Library**: "Carry on where Sam left off: *page*", for
  the learner of this device, with when and how many pages are done.
- **Library → Learning**: for the learner chosen (this device's, to begin with) each
  course they opened: where they got to and when, pages opened and done, time this week
  in plain words ("about 2 hours this week"), and the topic lines. **Everyone** shows
  each learner's row under each course. **Carry on** opens the reader at that page and
  makes that learner the device's. **On paper** makes a PDF of what is shown, through the
  same actions as every PDF Outpost makes ([library.md](library.md#learning-progress-on-paper)).

## Keeping it private inside the house

- It is never put in search, and never sent to a model server.
- Anyone on the home network can read and remove anyone's progress through the app or
  the API, as with everything else in Outpost.
- A device can stop recording; the reader then says "Not recording".
- A PDF of it added to the library is a document like any other, so **Add to library**
  asks first.

## Removing it

- **Storage → Manage and clean up → Clean up → Learning progress** lists each learner
  with their pages, and removes one learner's progress, or everyone's (which also forgets
  what was learned of the archives' topic pages). Each asks first.
- **Erase everything** removes all of it.
- It is counted under Storage → Database ("pages of learning progress", in the library's
  records), is in every backup, and goes onto a portable drive with the rest of the
  household's own records, like the Morse trainer's progress: a child taking a drive to
  their grandparents' carries on there. It is **not brought back** by "Bring back from a
  drive", which compares pages, documents, places and tracks only.

## The tables

| Table | Columns |
| --- | --- |
| `learning_pages` | `id`, `learner`, `archive`, `archive_title`, `path`, `title`, `first_opened_at`, `last_opened_at`, `seconds_in_view`, `done_at`, `done_how`, `updated_at`; unique on (`learner`, `archive`, `path`) |
| `learning_days` | `learner`, `archive`, `day`, `seconds`; key (`learner`, `archive`, `day`) |
| `learning_topics` | `archive`, `path`, `title`, `links` (JSON list), `is_home`, `seen_at`; key (`archive`, `path`) |

Limits: 50 learners; 20,000 pages a learner (beyond that the page opened longest ago
that is not done makes room); names of at most 40 characters; addresses of at most
2,000; titles cut at 200; 2,000 pages of links an archive (the one seen longest ago
makes room), each list at most 300 links and 64 KB written out. A list of links is
passed on only for the page on show.

## Not done

- **EPUB and PDF reading.** An EPUB in the library already remembers its chapter and
  place on each device (`features/library/epub-data.ts`); that is not tied to a learner
  and is not part of this. OpenStax books in the Schoolroom pack are PDFs in the library,
  not archives, and are not tracked.
- **Exercises.** Whether a learner answered an exercise correctly is not known: that
  would mean reading the archive's own scripts.
- **The Schoolroom pack** in the catalogue does not include Khan Academy (it is listed
  separately, at 180 GB); this work did not change the pack.
- **Not tried on a real phone or tablet**, or with a real course archive.

## Code

| | |
| --- | --- |
| Routes, limits, the shape of a course | `apps/server/src/modules/learning/index.ts` |
| The messages the archive's page sends | `BRIDGE` in `apps/server/src/modules/kiwix/index.ts` |
| Types and the words for time | `packages/shared/src/learning.ts` |
| What the reader records, and when | `apps/web/src/features/learning/tracker.ts` |
| The learner of a device | `apps/web/src/features/learning/device.ts`, `learner-switch.tsx` |
| The bar's controls | `apps/web/src/features/learning/reader-controls.tsx` |
| The Learning view, its PDF, Carry on, Manage | `learning-panel.tsx`, `progress-document.ts`, `carry-on.tsx`, `learning-cleanup.tsx` in the same folder |
| The stand-in course archive | `apps/server/test/course-archive.ts` |
| Tests | `apps/server/test/learning.test.ts`, `apps/web/src/features/learning/learning.test.tsx`, `e2e/tests/learning.mobile.spec.ts` |
