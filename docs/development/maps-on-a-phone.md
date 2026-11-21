# The Maps screen on a phone: what fails and what was done

A study of the Maps screen in WebKit at the room Safari leaves on an iPhone with its
bars showing (375 by 548, 390 by 664, 430 by 740), light and dark, with the text at
100% and 125%, against WCAG 2.2 AA and against plain use: can each tool be found, does
one thing cover another, can each card be read and closed with one thumb. The rules
that came of it are in `web-screens.md`, "Things over a map". The states are held by
`e2e/tests/maps.iphone.spec.ts` (WebKit) and `e2e/tests/phone-layout.mobile.spec.ts`
(Chromium as a phone), which attach a picture of each.

## Found, and fixed

1. **Tools that could not be found.** The column of icons showed what fitted (six on
   an iPhone 15, three with a card up) and stopped, with nothing to say there were
   more. The rest were behind three dots at the end of the search box. Fixed: the
   column ends in a button with "More" written on it, which opens every tool by name;
   the dots in the search box are gone. A tool in hand, or a layer that is on, keeps
   its icon in the column ahead of one that is not (WCAG 3.2.3, 2.4.6; plain use).
2. **A card too small to read.** The card of the tool in hand had three fifths of the
   clear map, about 180 px on an iPhone 15, over the readout. "Find where you are from
   bearings" showed its title, three lines and half a choice, and scrolled in a small
   box (WCAG 1.4.10). Fixed: on a phone a card of what is in hand takes the sheet's
   place at the foot, edge to edge, and may reach up to just below the cross at the
   centre (about 320 px there, 250 px on an iPhone SE). The readout and the sheet's tabs
   step aside while it is up and come back when it is closed. One thing at a time.
3. **The way to save a found place was out of sight.** A position found by search put
   "Save this place" below the fold of its card. Fixed by 2: it shows on an iPhone 15.
4. **A hint over the tabs.** "Tap the map where the place is" was a message at the
   foot of the screen, over the sheet's row of tabs. Fixed: on a phone it is the card
   of "Save a place", with a close button.
5. **Line of sight said twice.** Choosing a point showed an untitled card over the
   readout and the tool's name in the lowered sheet under it. Fixed: the card has the
   sheet's place, with its title and close button.
6. **A notice pushed the sheet off the screen.** The Maps screen on a phone was the
   height of the window less the top bar, so a notice the app shows above every screen
   (the server's clock is wrong, an update) pushed the sheet under the bar of screens,
   where its tabs could not be reached. Fixed: the screen has what is left under the
   notice.
7. **The foot of the map under the bar of screens.** The screen left 3.5rem for the
   bar of screens, but the bar is as tall as its names, which grow with the text: at
   125% the sheet's tabs went 9.5 px under it. Fixed: the bar says its height
   (`--mobile-nav-height`) and the Maps screen leaves exactly that.
8. **Search cut short with larger text.** At 125% on an iPhone SE the search box's
   words ran into the three dots. Fixed by 1: the box has the whole width.

## Checked, and passing

- Touch targets 44 px each way on everything over the map (WCAG 2.5.8 asks 24; the
  screen keeps 44), except links in the line of credits, which WCAG allows.
- Contrast: every colour over the map is a token checked at 4.5:1 for text and 3:1 for
  control outlines on its surface, in both themes.
- Focus order follows the screen from the top: search, the tools, "More", then the
  credits and the card under them, or the readout and the sheet when no card is up.
- Names: every icon has a name that is also its tooltip and its words in the menu;
  "More" is named "More map tools", starting with the word that shows (WCAG 2.5.3).
- Motion: the card comes up in 180 ms; nothing moves under `prefers-reduced-motion`.
  The map does not move when a card comes up or goes.
- Reflow: nothing scrolls sideways at 320 px wide or with the text at 125%.

## Not tried

- A real iPhone. WebKit in Playwright has no on-screen keyboard and no bars that come
  and go as the page scrolls; how a docked card's bearing fields sit with the keyboard
  up has not been seen.
- VoiceOver. The order and names above are read from the page, not heard.
- Text at 200%. Checked to 125%; the map has little room left beyond that.
