# Downloads and tasks

**Downloads and tasks** (in the sidebar, or `g` then `d`) lists two kinds of work that
carry on in the background, whether or not the screen is open:

- **Downloads**: collections, maps and other files fetched from the internet. Each is
  resumable, retried by itself when the connection drops, and checked against its
  published checksum before it is installed.
- **Tasks**: work Outpost does here, such as reading a document, building search by
  meaning, or building a place's routes. Moving a collection, writing a portable drive,
  checking the database and making a backup are tasks too.

**Show** at the top picks **Downloads and tasks**, **Downloads** or **Tasks**. The
choice is in the address (`/downloads?show=tasks`), so a bookmark keeps it.

## Downloads

The plan at the top says how much is left, how fast it is coming and when each download
should finish. Beside it, **Speed limit** caps the connection Outpost uses (as fast as it
allows, a preset, or **Other…** to type one), **At once** sets how many transfers run
together (one to eight), and **Pause all** and **Resume all** act on every download. **In progress** has each download with its bar, speed and time left;
**Needs attention** holds those that stopped and will not continue by themselves, with
the reason and **Retry**; **History** lists what finished.

**Details** on a row opens that download's page: where it comes from, its speed over
time, every change of state, its checksum and where it was put. See
[troubleshooting.md](troubleshooting.md#downloads) for what its messages mean.

## Tasks

The list has every task under way and the 50 that ended last. **Running**, **Waiting**,
**Finished** and **Failed** narrow it; each says how many there are. A running task has a
bar, how far it has got in what it counts (passages, pages, files, ways, bytes), how many
it does a minute and, when it knows how much there is, about how long it has left.

Some tasks can be paused: building search by meaning, reading scanned pages and adding a
collection's files carry on from where they stopped; checking a collection and building a
place's routes start again from the beginning. **Cancel** asks first: a cancelled task does
not carry on by itself, though what it finished is kept. Reading a document, reclaiming
space in the database, installing an update and erasing everything cannot be cancelled,
because stopping them part of the way would leave things worse.

### A task's page

**Details** on a row opens the task's page:

| Part | What it says |
| --- | --- |
| Now | Where it stands, its progress, rate and time left, when it started and how long it has run; for one that is waiting, what it waits for |
| Rate over time | How many it did a minute, as a line; the arrow keys read it a reading at a time |
| What happened | Every change of state, each retry with its error, and each stage it reached |
| About this task | What kind of work it is, what it counts, whether it can be paused, and how many of its kind run at once |

**Time left** is a guess from the rate over the last few minutes, so it says "about". It
appears only for a task that knows how much there is to do.

A task that is **waiting** says why, and names what it waits behind: another of its kind
is running (each kind has its own line, one at a time unless Settings allows more, so
building search by meaning does not hold up reading a new document); it is paused; it
failed and tries again by itself at the time shown; or other work has the server to
itself for a moment (reclaiming space in the database).

A task that **failed** gives the error and what to do: **Retry** where running it again
is all it takes, otherwise a link to the screen it was started from.

A task's samples and history are kept for a week after it ends. If the server cannot be
reached, the page says **These details are not updating** and refreshes by itself when it
is back.
