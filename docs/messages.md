# Messages: the household board

**Messages** is a board for one household on the home network: a short message for
everyone, a check-in ("I'm safe, gone to Mum's"), or a file sent from one device for
another to save. It works with no internet. It is a board on the kitchen wall, not a
messenger: one shared place, newest at the bottom, with no private messages, read
receipts or reactions.

## Who is who

There are no accounts. The first time a device opens Messages it asks **Who is using this
device?**, offering the household's people or a typed name. The name is kept in that
browser and can be changed with **Change**.

- **Anyone on the home network can post under any name and read everything.** A name
  proves nothing.
- **Anyone can change or remove any message**, and nothing vanishes silently: "Changed by
  Alex at 14:05", "Message removed by Sam at 14:02". A removed message's words and position
  are deleted; who wrote it and when stay.
- A change to a message someone else changed since you opened it is refused, and you are
  shown it as it is now.

## Check-ins

**Check-ins** at the top shows each person's latest, so "is everyone all right?" is one
glance: "Sam: safe · gone to Mum's · 14:02 today", a request for help in the danger
colour, "no check-in since Tuesday" when the latest is over a day old, or "no check-in
yet".

- **I'm safe** or **I need help**: one press each, with **Where you are** in words if you
  like.
- **Words of my own…**: your status, words, place and, if ticked, **this device's
  position**.

Browsers give a position only to a secure page (HTTPS, or the computer Outpost runs on); at
a plain `http://` address the form points to **Settings → HTTPS on your network**. A
position sent is on the board for everyone. An emergency plan's "use now" screen links to
**Check in on the household board**.

## Sending a file to another device

**Send a file** at the foot of the screen: choose a file or photo, add words if you like,
and it appears for everyone to **Save**. A checked picture is shown on the board too.

- Up to 200 MB a file; the board keeps at most 100 files and 4 GB.
- Files are kept for 7 days, or as **Settings → Message board** says (1 to 90 days, or until
  removed). When a file goes, its message stays and says so.
- **Add to library** copies it into the library (same file kinds as **Add documents**),
  leaving the board's copy.
- A long message folds, with **Show all of it** and **Copy the words**.

Files are kept in Outpost's own data folder and never opened or run on the server
([security.md](security.md#the-household-board-messages)).

## New messages

New messages arrive at once on every open screen. **Home** shows "2 new on the board" when
there is something unseen, and a message from someone else shows a toast (a request for
help as an error, read out by a screen reader). **The board does not wake a locked phone**: there are no push notifications.

## What is kept

**Manage and clean up → Leftovers → Messages and files on the board** empties the board on
every device. The board is in backups, removed by **Erase everything**, not copied to a
portable drive, and not in search. A model reads them only if both **Let the model look things
up in Outpost** and its **Messages on the board** area are on ([ai.md](ai.md)); then it sees
the household channel's words and check-ins, never a radio channel, a file or a position.

## Limits

| What | Limit |
| --- | --- |
| A name | 40 characters |
| A message | 10,000 characters |
| A place in words | 120 characters |
| Posts, check-ins, changes and removals from one address | 30 a minute |
| Files from one address | 30 an hour |
| A file | 200 MB |
| Files kept at once | 100, and 4 GB together |
| History | 50 messages a page, then **Show earlier messages** |

Radio channels beside **Home** are described in [mesh-radio.md](mesh-radio.md).
