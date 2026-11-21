# What has not been tried

The things a test cannot reach or a person has not yet done, by feature. A guide page
does not carry its own copy of this; it is kept here once.

## Accessibility

- **Checked automatically:** every screen reached from the navigation, on a wide screen
  and on a phone, in the light and the dark theme, with axe-core against WCAG 2.2 AA
  (`e2e/tests/a11y.ts`). Serious and critical findings fail the suite; what is let
  through is listed with its reason in `e2e/tests/a11y-waivers.ts`. Only the first
  state of each screen is checked: dialogs, menus, editors with text in them and
  screens reached from inside another screen are not.
- **Not tried: a pass by hand with a screen reader.** No one has yet used the map, the
  notes editor or the reader with VoiceOver (or any other screen reader) from start to
  finish. Automated checks cannot judge whether what is read out makes sense, in what
  order, or whether a task can be finished by ear.
