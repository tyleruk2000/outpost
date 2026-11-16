# Repeater files for the tests

Every station here is made up. The callsigns begin with QZ, a prefix no country has
(the Q series is kept for the Q code), the keepers and towns do not exist, and the
positions are arbitrary points in the north of England and the south of Scotland.

The files follow real layouts, so that the importer is tested against the headings and
the forms of value it will meet:

- `etcc-status.csv`, `etcc-voice.csv`, `etcc-all.csv`: the headings of three of the CSV
  files the RSGB's ETCC offers on ukrepeater.net, as they were on 16 November 2026,
  trailing commas included. No row of those files is here.
- `chirp.csv`: the columns CHIRP writes (`Memory.CSV_FORMAT` in its source).
- `club-list.csv`: a list as a club might keep it in a spreadsheet, with semicolons,
  its own headings, a shift column and a locator but no coordinates.
- `hearham.json`: the fields of the JSON list hearham.com offers to applications, as
  they were on 16 November 2026: frequency and shift in whole hertz, one field for
  whatever is needed to get in, 1 or 0 for in use. No row of that list is here.
- `wia.csv`: the headings, the rows that head each section and the forms of value in
  the Wireless Institute of Australia's repeater directory CSV dated 5 July 2026. The
  callsigns here begin with QZ like the rest; no row of the directory is here.
