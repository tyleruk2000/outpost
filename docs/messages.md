# Messages: the household board

**Messages** (in the sidebar, and in the phone's More sheet) is a board for the people
of one household, on the home network, with no extra hardware: a short message for
everyone, a check-in ("I'm safe, gone to Mum's"), and a file or photo sent from one
device for another to save. It works with no internet: everything goes through the
Outpost on the home network.

It is a board on the kitchen wall, not a messenger. There is one shared place, with the
newest at the bottom. There are no private messages, read receipts, typing indicators
or reactions.

## Who is who

There are no accounts and no sign-in, and the board does not pretend otherwise.

- A person is a **name chosen once on each device**. The first time a device opens
  Messages it asks "Who is using this device?", offering the household's people where
  Outpost holds them (the household under Preparedness → Supplies, and the people of
  each emergency plan), or a name typed. The name is kept in that browser only
  (`outpost.board.name`), shown beside everything posted from it, and can be changed at
  any time ("Change", beside "Posting from this device as").
- **Anyone on the home network can post under any name, and read everything.** The
  screen says so once, under its title. A name proves nothing.
- **Anyone can change or remove any message.** It is one household's board. Nothing
  vanishes silently: a changed message says "Changed by Alex at 14:05", and a removed
  one keeps its place in the history as "Message removed by Sam at 14:02". Its words,
  place and position are deleted from the database; who wrote it, and when, stay.
- A message changed on another device after this one opened it is not overwritten: the
  change is refused, the screen says so, and shows it as it is now (the same rule as
  notes and contacts, `baseUpdatedAt`).

## Check-ins

At the top of the screen, **Check-ins** lists each person's latest check-in, so that
"is everyone all right?" is one glance:

- "Sam: safe, gone to Mum's, 14:02 today"
- "Alex: needs help: car won't start, 09:10 today" (in the danger colour, with an icon)
- "Jo: no check-in since Tuesday" (the latest is more than a day old)
- "Nan: no check-in yet" (one of the household who has never checked in)

The household's people come first, in the order Outpost holds them; anyone else who has
checked in follows, by name. Names are matched without regard to capitals.

To check in, from the top of the screen:

- **I'm safe** or **I need help**, one press each. A few words in "Where you are" go
  with it as the place ("gone to Mum's").
- **Words of my own…** opens a short form: safe, need help or just words; your words;
  the place; and, if you tick it, **this device's position**.

The position is asked of the browser only when ticked, and only once. Browsers give a
position only to a secure page (HTTPS, or the computer Outpost runs on). At a plain
`http://192.168.x.x:8080` address the form says so, and points to **Settings → HTTPS
on your network**; the place in words still works. A position, once sent, is on the
board for everyone on the network, and opens the offline map there.

A check-in is also a message in the history, and can be changed or removed like one. A
removed check-in no longer counts as that person's latest.

Where an emergency plan is in use, its "use now" screen has a link, **Check in on the
household board**. The plan's own steps are not changed.

## Sending a file to another device

**Send a file** at the foot of the screen: choose a file or a photo on one device, add a
few words if you like, and it appears on the board for everyone to save to theirs, with
its name, size and who sent it.

- **Size.** Up to 200 MB a file, said on the screen before anything is sent, checked on
  the device, and enforced by the server. The board keeps at most 100 files and 4 GB at
  once; past that it asks for some to be removed first.
- **How long.** Kept for 7 days and then removed by itself, or for as long as
  **Settings → Message board** says (1, 3, 7, 14, 30 or 90 days, or "until someone
  removes it"). A change there holds for files already sent. When a file goes, its
  message stays and says so. Removing the message removes the file.
- **Saving it.** **Save** downloads it. A picture (a PNG, JPEG, GIF or WebP that the
  server has checked is one) is shown on the board as well.
- **Add to library** copies it into the library after asking, as any added file is
  (checked, read for text, searchable, backed up), with the source "Sent on the
  household board by Sam on 2026-11-17". The file on the board is left as it is. The
  library takes only the kinds of file it takes from **Add documents**.
- **Text** from one device to pick up on another is just a message. A long one is
  folded, with **Show all of it** and **Copy the words**. Copying needs a secure page;
  on plain http **Select the words** selects them for the device's own Copy instead.

Files are kept in Outpost's own data folder, in `board/`, never in a storage location,
and are never opened, run or read on the server (see [security.md](security.md#the-household-board-messages)).

## New messages, and what the board does not do

- New messages, check-ins, changes and removals arrive by the live-events stream that
  every screen uses. Nothing polls. A hidden tab fetches nothing, and catches up once
  when it is shown.
- **Home** shows one quiet line, "2 new on the board", when there is a message newer
  than this device has shown on the board (or, on a device that has never opened it,
  from the last day), and nothing when there is none. The phone's bottom bar is not
  changed.
- While Outpost is open in a tab, a new message or check-in from someone else shows the
  app's own toast, unless the board is already on screen. A request for help is shown
  as an error toast.
- **The board does not wake a locked phone.** There are no push notifications: there is
  no internet to send them through and no accounts to send them to. A phone sees new
  messages when Outpost is open on it.

## What is kept, and where

Two tables (migration `0028_board`): `board_messages` (the channel, where it came from,
the kind, the author's name, the words, a check-in's status, place and position, the
times, and who changed or removed it) and `board_files` (each sent file's name, size,
checksum, place in `board/`, and when it goes or went). They are:

- counted under **Storage → Database** ("messages on the board"), and the files under
  **Manage and clean up → What is taking the space** ("Files sent on the board");
- listed under **Manage and clean up → Leftovers** as "Messages and files on the board",
  which empties the board on every device, files and all;
- erased by **Erase everything**;
- in backups, the files with them (the `board/` folder travels with the database, as the
  notes' attachments do), and restored with them;
- not copied to a portable drive: the board stays with the household's Outpost.

Messages are **not** added to search and are **never** sent to a model server.

## Limits

| What | Limit |
| --- | --- |
| A name | 40 characters, one line |
| A message | 10,000 characters |
| A place in words | 120 characters |
| Posts, check-ins, changes and removals from one address | 30 a minute |
| Files from one address | 30 an hour |
| A file | 200 MB |
| Files kept at once | 100, and 4 GB together |
| History | 50 messages a page, older ones on "Show earlier messages" |

The limits per address are set far above what a household does; they stop a runaway
script, not a person.

## Power

The screen asks for two lists when it opens (the history and the check-ins) and then
nothing until the server says something changed. Measured with `e2e/tools/idle-cost.mjs`
on 17 November 2026, at phone size over 20 seconds: visible, no animation frames, no
timers and no requests; hidden, no requests and no frames. The server at rest with the
board in use set no timer of its own except one for the next sent file due to go (a
timer for that moment, not a tick), and used 0.05 s of processor in a minute.

## For a transport (a radio link)

A message belongs to a **channel**. `board` is the household's own; a transport carries
channels of its own (`meshtastic:LongFast`), and the board stores and shows them the
same way (`GET /api/board/messages?channel=…`). A message records where it came from:
`source` is `here` for one written on a device of this Outpost, or the transport's name.

The interface is in `apps/server/src/modules/board/transport.ts`, on
`ctx.services.board`:

- `addTransport({ name, carries(channel), send(message) })`: each message posted here on
  a channel the transport carries is handed to `send` after it is stored, without the
  person who posted it waiting; a failure is logged.
- `receive({ channel, source, externalId, author, body, kind?, status?, place?, position?, meta? })`:
  stores a message heard by the transport, once per `(source, externalId)`, announces it,
  and does not hand it to transports again.
- `onMessage(listener)`: every new message, posted or received.
- `setMeta(id, meta)`: what a transport keeps with a message (a delivery report), at most
  4 KB as JSON.

No radio code is part of this feature.

## What has and has not been tested

Tested: the server's routes and limits, two devices posting and editing at once, the
trail of a removed message, the expiry timer, hostile files (an HTML page, an SVG with a
script, a name with path separators, a picture by name only), the transport interface
with a stand-in, each state of the screen, and an end-to-end test with two phones at
390 px: one checks in and sends a file, the other sees both arrive without reloading
and saves the file. Not tested: real phones on a real home network, a position from a
real device (the tests stand in for the browser's), and iOS's own handling of the
download.
