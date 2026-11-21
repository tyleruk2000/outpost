# Weather and hazards

Preparedness → Weather and hazards (`/prepare/weather`) keeps forecasts, severe-weather
warnings, flood warnings and river levels, and climate and sunshine averages for places
a person chooses, so that they can be read with no connection. It also keeps a log of
the person's own barometer readings and gives the three-hour tendency.

It is a cache with its age always in view. A forecast is as good as the moment it was
fetched. Everything on the screen says who it came from, when it was fetched and what
period it covers. When it is old, or has run out, it says so in words, and its figures
are not shown as current.

## Nothing is fetched by itself

Outpost contacts the publishers only when a person presses a button:

- **Update now** fetches the UK's warnings, and the forecast, flood warnings and river
  and sea levels for every place in the list.
- **Fetch river and sea levels**, under River and sea levels, fetches them for the place
  chosen; **Fetch the last 3 days**, on a station's own view, fetches that station's
  readings.
- **Fetch the averages for this place**, under Climate, fetches climate averages and
  sunshine figures for one place. They change over decades, so they are not part of
  Update now.

There is one tick box, **Also update when I open this screen**, which is off until a
person ticks it. Ticked, it is stored on the server, so it holds for every device:
each opening of the screen then does what Update now does, once per visit. That is an
outbound request on every visit, and [security.md](security.md#weather-and-hazards)
says so. Nothing runs on a timer, and nothing is fetched by the server on its own.

The fetching is done by the server, not the browser. A copy is kept in the database, so
that every device on the home network sees the same one. A fetch that fails leaves the
copy that was there before, with its age; the screen lists what could not be updated
and why.

## Places

Forecasts are for places the person chooses from their saved places on the map. The
saved place with the **home** icon is the home place; if several have the icon, the one
saved first is home (editing or starring a place does not change which). This is the
one meaning of home across Outpost (`homePlaceOf` in `packages/shared/src/home-place.ts`):
the warnings on Emergency plans use it too, and there is no separate setting. With no
saved place carrying the icon there is no home place, and the Places view says in one
line how to mark one, with a link to the Maps screen; with a home that is not in the
weather list, it says that no warnings are matched to it until it is added. A place in the list is a copy of
the saved place's name and position, so the cache still makes sense if the saved place
is moved or removed.

Removing a place from the list removes what was fetched for it. A place may be removed
while an update is under way: the removal wins. An answer for it that arrives afterwards
is not kept, nothing more is asked about it, and the update lists it as removed. Copies
left for a place that is no longer in the list (as an earlier version could leave them)
are cleared when Outpost starts.

The device's own position is offered only where the browser gives it: on a secure page
(an https address or localhost). On a phone reaching Outpost at a plain
`http://192.168.x.x` address, it is not offered. The dialog says so, and points to
Settings → HTTPS on your network. Choosing a saved place always works.

The Met Office words its warnings by region, and Outpost cannot tell a region from a
position (it holds no region boundaries). So each place has a **Met Office warning
region**, chosen from a drop-down. Without one, every UK warning is listed and none is
matched to the place.

## How old is too old

These are Outpost's choices, not any publisher's. They are in `FRESH_FOR` in
`packages/shared/src/weather.ts`.

| Copy | Called fresh for | After that |
| --- | --- | --- |
| Forecast | 6 hours | "old": a newer forecast will have been made, and the nearer hours may have changed. Once its last hour has passed, it has "run out". The screen then shows no figures from it as expected, only that it has run out. |
| Warnings | 3 hours | "old": warnings may have been issued, changed or ended since. Each warning's own period is also checked: not begun, in force, or ended. |
| Flood warnings | 1 hour | "old". The Environment Agency's readings come every 15 minutes. |
| River and sea levels, a station's last days | 1 hour | "old", and each level also says when it was measured ("measured 17 Nov 2026, 11:15 (14 hours ago)"), which can be much older than when it was fetched (below). |
| Climate averages, sunshine | Always | They are averages over many years, not a forecast, and are labelled so. |

At every age the copy says "Fetched 3 days ago" (or minutes, or hours), followed by
what may be taken from it. A forecast's hours that have already passed are not shown.
The tests check each boundary (`apps/server/test/weather-arithmetic.test.ts`).

## The sources

Each publisher's terms are quoted, with the date they were read, in
[sources.md](sources.md#weather-and-hazards-read-on-2026-11-16).

| What | Publisher | Sent |
| --- | --- | --- |
| Forecast, seven days | [Open-Meteo](https://open-meteo.com/), asked for the Met Office's models (`models=ukmo_seamless`): UKV at 2 km over the UK and Ireland, the global model at 10 km elsewhere | Position to two decimal places |
| Severe-weather warnings | The Met Office's RSS feed for the whole UK | Nothing about the person: the one UK feed |
| Flood warnings within 15 km | The Environment Agency's real-time flood-monitoring API | Position to two decimal places, and the distance |
| River and sea levels within 3, 8, 15 or 25 km | The same API | Position to two decimal places and the distance; then each station's measure name, with no position |
| Climate averages by month | NASA POWER climatology | Position to two decimal places |
| Sunshine on a solar panel by month | PVGIS (European Commission Joint Research Centre), `MRcalc` | Position to two decimal places |

Two decimal places is about 1.1 km north to south. That is finer than any of these
services resolves (the finest is the Met Office's 2 km UKV grid), and no closer to a
house than that.

### What each shows

- **Forecast.** Each day ahead in words ("Moderate rain. 5 to 13 °C. 15.2 mm of rain
  or snow; the chance of some is 100%. Wind up to 23 km/h, gusts to 49 km/h."). A line
  chart of temperature through the hours ahead. Every hour as a table, behind a
  disclosure. It names the service, the model, and the model's grid point and height.
  The weather words are the WMO codes in Open-Meteo's own wording. Wind is offered in
  km/h or mph, and temperature in °C or °F; the choice is kept on the device.
- **Warnings.** The publisher's title and description, unaltered, with its level
  (yellow, amber, red) and whether the stated period has begun, is running or has
  ended. Each warning keeps its link straight to the full warning on the Met Office
  website, which the Met Office's RSS terms require. The place's region comes first;
  the rest of the UK is behind a disclosure. A line says that this is Outpost's copy,
  that it may be out of date, and where the live page is.
- **Flood.** The Environment Agency's warnings in force within 15 km, in its words
  and with its severity ("Flood alert", "Flood warning", "Severe flood warning"). The
  Agency's own caveat is quoted: its data "should not be relied upon for safety critical
  applications". River levels used to be listed here too (five gauges within 8 km);
  they are now their own view, and a line links to it.
- **River and sea levels.** See [below](#river-and-sea-levels).
- **Climate.** Mean temperature, rain, wind and sunshine on level ground, month by
  month, averaged over NASA POWER's stated period (January 2001 to December 2025 when
  read). It is on a grid of about 50 km, not a weather station's record. Rain for a
  month is the daily average times the days in the month, with 28 for February. NASA
  POWER's `T2M_MAX` and `T2M_MIN` were not used: in its climatology they are the
  highest and lowest over the whole period, not average daily highs.
- **Sunshine on a panel.** PVGIS's monthly irradiation on level ground and on a panel
  facing south at the tilt it finds best, averaged over its years (2005 to 2023 when
  read). The figures are kWh/m² a day, which is the same number as peak sun hours.
  Shading by nearby buildings and trees is not counted.

### The power planner

Tools → Power and batteries wants peak sun hours "on the panels' plane" for January to
December (`PowerSolar.sunHours`). A power plan reads the `solar` copy kept here
(`kept[].data.optimal` or `.level`) and offers "Fill in from Weather and hazards" for a
chosen place, on a press, asking before it replaces figures typed in, and records with
the plan whose figures they are. Where no copy is held for the place chosen there (one
of these places, a saved place, or a position typed in), the plan offers to fetch it: a
press that adds the place to this list if need be and asks for its `solar` copy alone,
through `POST /api/weather/update`, the same route this screen uses. See
[tools-power.md](tools-power.md#peak-sun-hours-from-weather-and-hazards).

## Not used, and why

- **Met Office Weather DataHub.** Needs an account and an API key in a header. Its
  free plan allows 360 calls a day, according to its FAQ. Its terms forbid making the
  data available "to third parties other than via Your Application". It would be
  acceptable only as an optional source with the person's own key, and was not built.
  Open-Meteo serves the same Met Office models with no key.
- **MET Norway (api.met.no).** Its terms are clear and generous. But every request
  must carry "a company email address or a link to the company website where we can
  find contact information", and a generic client name gets "403 Forbidden". Outpost's
  client name is generic. Sending the owner's contact details is the owner's decision,
  so it was left out.
- **US National Weather Service.** Public domain, with no key. It covers the United
  States only, and asks for contact details in the client name too. Not built.
- **MeteoAlarm.** Its terms ask redistributors to show warnings within "never longer
  than ten minutes" of MeteoAlarm. A copy kept for offline reading cannot promise
  that. Over the UK, its warnings are the Met Office's own, which Outpost fetches
  directly.
- **Flood risk maps** (Flood Map for Planning, Risk of Flooding from Rivers and Sea).
  These are open data. The Flood Zones have an OGC API that answers by bounding box
  (see sources.md), so they can be fetched by area. A map layer was not built in this
  version; see [Not done](#not-done).
- **Wildfire risk.** The Met Office's Fire Severity Index for England and Wales is
  published as maps only, now on Natural England's Open Access site, with no data feed
  and no licence stated, so it is linked. EFFIS publishes a fire danger forecast under
  CC BY 4.0 as WMS map images. Its exact request was not resolved, so it was not
  built.
- **Climate normals from the Met Office.** The station averages (1991–2020) are on
  its website. No licence is stated for the data files, so they are linked, not
  fetched.
- **WorldClim.** "Redistribution or commercial use is not allowed without prior
  permission." Not usable.
- **ERA5 (Copernicus).** CC BY 4.0, but it needs an account and a manual agreement to
  its terms. NASA POWER gives the averages wanted here with no account.
- **Scotland, Wales, Northern Ireland.** SEPA publishes river levels under the OGL
  with no registration; Natural Resources Wales's API needs a key; Northern Ireland's
  flood maps are licensed commercially. None was built. The Environment Agency covers
  England only, and the screen says so.

## River and sea levels

The **River and sea levels** view lists the Environment Agency's measuring stations near
the place chosen (home by default), nearest first, on a press. Each station is a row of
at most three lines on a phone: the station and how far away; the level, what it is
measured from and when (the time today, the date before then); and its state in one
line, with how long ago it was measured ("Within its typical range · steady · 3 hours
ago"). The explanations below are said once, under **What the figures mean**, and a
station's own page says them in full. Each row shows:

- the river or coast it is on and how far away it is;
- its latest level, with the time it was measured and how long ago that is;
- what the level is measured from, because a level means nothing without it. The Agency
  names this in its unit: `mAOD` is metres above Ordnance Datum, the level heights on
  Ordnance Survey maps are measured from; `mASD` is metres above the station's own
  datum, a point fixed for that gauge; `m` is metres from a datum the Agency does not
  name. Levels at two stations measured from different points cannot be compared;
- whether the level is within, above or below the **typical range the Agency publishes
  for that station**. In the Agency's words its top is the level "the measurement
  exceeded … for 5% of the relevant data on record", and its bottom the level exceeded
  for 95%. A station with no published range is not judged. A **tidal** station (the
  Agency's qualifier "Tidal Level") is marked as tidal and not judged against a range:
  it rises and falls with the tide;
- whether it is rising, steady or falling over the readings held (below);
- "Not reporting" when its latest reading is more than two days older than the moment
  it was fetched, and the Agency's own "suspended" or "closed" status and reason where
  it gives one.

**The distance** is a drop-down: 3, 8 (the default), 15 or 25 km, with miles beside.
It is one setting on the server (`weather.riversKm`), so every device and Update now
use it. Choosing one fetches nothing. The Agency says its distance "may be approximated
by a bounding box", so only stations truly within it are kept, and at most the nearest
ten, since each is one more request. The kept copy says which distance it was fetched
for.

**What is asked.** One request for the stations within the distance with each one's
scale (`/id/stations?parameter=level&lat=…&long=…&dist=…&_view=full`), then one for each
of the nearest ten's latest 16 readings (`/id/measures/{id}/readings?_sorted&_limit=16`).
A station measures several things; the one shown is its river level ("Stage"), else its
tidal level, else the level below a weir ("Downstream Stage"), preferring the measure
read every 15 minutes and the one whose unit names a datum. Groundwater is left out. A
station whose readings cannot be had is kept with a note saying why; a list that cannot
be had changes nothing, and the old copy stays with its age.

**A station's own view** (tap a station) shows the same figures with the highest level
on record and the highest in recent years, as the Agency gives them, and a link to the
Agency's own page for the station. **Fetch the last 3 days** asks for the station's
readings since three days before (about 288 for a station read every 15 minutes, about
70 kB) and draws them as a line, with the typical range as a quiet band behind it and
the highest on record as a dashed line, and the same figures as a table behind a
disclosure. The readings of up to ten stations are kept for each place.

### Rising, steady or falling: Outpost's rule

The Agency's API publishes no trend, so this is Outpost's rule, and the screen says so
(`levelTrend` in `packages/shared/src/weather-rivers.ts`): the latest reading held,
against the earliest held within the three hours before it. The two must be at least 45
minutes apart, or no trend is given. The change is rounded to the millimetre the Agency
gives; under 2 cm either way is "steady". The tests work it on cases
(`apps/server/test/weather-rivers.test.ts`).

### What the figures mean, and do not mean

The screen says, where the levels are read:

- These are the Environment Agency's measurements, not a forecast.
- A level within its typical range is not a promise that a place will not flood.
- Flood warnings are under Flood (a link).
- In an emergency, call 999. Floodline, the Agency's flood advice line, is 0345 988
  1188, 24 hours a day (from its "Check for flooding" pages, read 17 November 2026).
- England only. Scotland (SEPA), Wales (Natural Resources Wales) and Northern Ireland
  publish their own, which Outpost does not fetch.

Outpost adds no score of its own and never calls a level safe. The Agency measures
"usually every 15 minutes", but sends readings back "typically once or twice per day,
but usually increases during times of heightened flood risk". So a latest reading hours
old is ordinary, and every level says how long ago it was measured. With no connection
the last kept levels show with both ages, the copy is marked old after an hour, and
nothing is fetched on a timer. River levels follow **Also update when I open this
screen**, as part of Update now.

Emergency plans already shows a line when a flood warning is held for the home place
(`GET /api/weather/home-warnings`); river levels are not added there, nor to Home.

## The barometer

A person types what their barometer shows, in hPa (millibars are the same) or inches
of mercury, with the time and the barometer's height above sea level. The height is
remembered on that device for the next reading. A logger's or weather station's CSV
file can be brought in instead (below). The readings are the person's own data. They
are kept in the database (migration `0021_weather`), counted under Storage → Database,
kept in backups, and erased by "erase everything".

### Sea level

The barometer reads the pressure where it is. To compare it with a forecast, or with
a reading taken elsewhere, it is reduced to sea level by the International Standard
Atmosphere's relation between pressure and height. That is ICAO's standard
atmosphere, identical below 11 km to the US Standard Atmosphere 1976:

    p₀ = p × (1 − 0.0065 × h / 288.15) ^ −5.25588

Here p is the pressure read, h the height in metres, and p₀ the pressure at sea level.
It assumes the standard atmosphere's temperature (15 °C at sea level, falling 6.5 °C a
kilometre), so it gives what an altimeter setting (QNH) would.

The WMO's *Guide to Instruments and Methods of Observation* (WMO-No. 8, Vol. I,
chapter 3, §3.7) reduces with the temperature and humidity at the station instead.
Its equation 3.2 is `p₀ = pₛ·exp[(gₙ/R)·Hₚ / (Tₛ + a·Hₚ/2 + eₛ·Cₕ)]`. A person with a
barometer rarely has those figures to hand. The difference is small at the heights
where people live: for 1000 hPa read at 100 m, the standard atmosphere gives 1011.94
hPa, and the WMO's form with 10 °C and 10 hPa of vapour pressure gives about 1012.07
(worked out for this page; WMO-No. 8 gives no worked example). The tendency is the
change between two readings at the same height, which barely depends on the reduction.

It is good to a fraction of a hectopascal up to a few hundred metres, and less so
higher up and in very cold or hot weather. Heights from −450 to 3000 m are accepted. A
reading that comes to less than 850 or more than 1100 hPa at sea level is refused, with
a message to check the unit and the height (870 and 1084 hPa are the lowest and highest
ever recorded).

1 inch of mercury is taken as 33.8639 hPa, the conventional value at 0 °C and standard
gravity.

### The tendency

The tendency is the change in sea-level pressure over the three hours before the
latest reading. It is said in the Met Office's terms, from its *Glossary of terms used
in the shipping forecast and other marine forecasts*, "Pressure tendency in station
reports" (https://weather.metoffice.gov.uk/guides/coast-and-sea/glossary, read 16
November 2026):

> Rising (or falling) slowly: Pressure change of 0.1 to 1.5 hPa in the preceding three hours
> Rising (or falling): Pressure change of 1.6 to 3.5 hPa in the preceding three hours
> Rising (or falling) quickly: Pressure change of 3.6 to 6.0 hPa in the preceding three hours
> Rising (or falling) v. rapidly: Pressure change of more than 6.0 hPa in the preceding three hours
> Now rising (or falling): Pressure has been falling (rising) or steady in the preceding three hours, but at the time of observation was definitely rising (falling)

The glossary gives no number for "steady". Outpost calls a change that rounds to 0.0
hPa steady, matching the WMO's code table 0 10 063, "Steady; atmospheric pressure the
same as three hours ago". The change is rounded to a tenth of a hectopascal before it
is compared, as the thresholds are written: 1.54 is "slowly", 1.56 is plain "rising".

"Three hours before" is a reading within 20 minutes of that time. Failing that, it is
the value worked out in a straight line between the readings either side of it, if
they are no more than two hours apart. The screen says when the value was worked out.
With neither, it says why there is no tendency. "Now rising" or "now falling" is used
when, within the three hours, the pressure went the other way by at least 0.1 hPa.

### What a tendency is taken to suggest

Under the heading "A rule of thumb, not a forecast", the screen quotes the Met Office:

> "Generally, low pressure brings unsettled weather, while high pressure leads to settled conditions." (Met Office, *High and low pressure*, https://weather.metoffice.gov.uk/learn-about/weather/how-weather-works/high-and-low-pressure)

> "As a warm front approaches, temperature and dew-point within the cold air gradually rise and pressure falls more quickly." (Met Office for schools, *Understanding weather*)

> "You can tell when a cold front has passed by a rise of pressure, a fall of temperature and dew point, and a change in wind direction." (same page)

It adds that one barometer cannot tell which of these is happening, and that a
forecast or a warning is the thing to act on. No more specific barometer rule from
the Met Office, the Royal Meteorological Society, the WMO or NOAA was found.

### Readings from a file

**Bring in a CSV file** reads a file and shows what it would add, and which rows
cannot be read and why, before anything is kept. Then it adds the readings that are
not already kept: a reading at the same time is not added twice.

- A header row names the columns. Names are matched loosely: a time (`time`,
  `datetime`, `timestamp`, `date`, or a `date` and a `time` column), a pressure
  (`pressure`, `hPa`, `mb`, `mbar`, `inHg`, `value`), and optionally `unit` and
  `height` (or `altitude`, `elevation`), in metres.
- Times may be ISO 8601 with or without a zone (`2026-11-16T09:00Z`,
  `2026-11-16 09:00:00+01:00`, `2026-11-16 09:00`), British `16/11/2026 09:00`, or Unix
  seconds or milliseconds. A time with no zone is read in the zone of the device the
  file was chosen on, which the screen names.
- Comma, semicolon or tab separators; at most 50,000 rows and 4 MB. A semicolon file
  uses the decimal comma (`1.013,2` or `1013,2`), a comma file the decimal point
  (`"1,013.2"`), and a tab file is judged from its own numbers; a pressure or height the
  file does not settle is listed as a problem with both readings, not guessed. The rule
  is the one the supplies importer uses. Every pressure or height that was not written
  plainly is listed with its line and how it was read (`“1.013,2” read as 1013.2.`).
- The unit and height chosen beside the file are for rows that give none. A height
  with a decimal comma (`12,5`) is read; one that is not a number is refused, not taken
  as nought. Changing either after the file has been read clears what it would add
  until it is read again, so that Add never adds something other than what was shown.
- Readings brought in from a file say "from a file" in the list; typed ones say
  nothing.

### Clearing readings

Each reading in the list has a **Remove** button. **Clear readings**, above the list,
removes many at once:

- **All**, **Before a day** (readings on that day are kept), or **Between two days**
  (both days included). Days are the calendar days of the device you are using.
- The dialog says how many readings will go before you press, and offers **Save them
  as a CSV file first**. That file is the same readings, in a form **Bring in a CSV
  file** reads back as they were.
- If readings were added or removed elsewhere since the dialog counted them, nothing
  is removed and the dialog says how many are in the range now.
- Only readings are removed. Saved places and fetched forecasts are not touched.
- The chart, the tendency and the forecast from your readings are worked out from what
  is left, straight away.

There is no undo, and readings are not kept anywhere else unless a backup has them.

### A weather station

The owner has no weather station, and nothing talks to one. A station would need
three things: a way for it to reach Outpost, a reader for what it sends, and a decision
about how often Outpost may accept readings unattended. Most home stations can push
their readings over the home network as HTTP requests, in the "Weather Underground"
or "Ecowitt" protocols. Others are read over USB or serial by a program such as WeeWX,
which writes CSV files. The second needs nothing new: its file comes in through the
CSV import above. The first would need a route that accepts a station's push, which is
a write by a device rather than a person. That is outside how Outpost guards changes
today (`core/guard.ts`), so it needs a design of its own.

## Under Manage and clean up

- The fetched copies are listed under Storage → Manage and clean up → Leftovers, as
  "Forecasts, warnings and flood data fetched for offline use" (river and sea levels
  and stations' readings among them), with their count and
  size, and are cleared there in one go. Places and readings stay. On the Weather
  screen, Kept and sources lists each copy with its size, when it was fetched and what
  was sent for it, and removes one at a time.
- "Erase everything" takes the places, the copies and the readings.
- Storage → Database counts the readings, and puts the three tables under
  Preparedness.

The copies are small, about 10 to 25 kB a place, and live in the database. Nothing is
large enough to need the download manager. The flood-risk map layer would be (see
below).

## For other screens: warnings for the home place

`GET /api/weather/home-warnings` answers what was in force for the home place when it
was last fetched. It fetches nothing. See [api.md](api.md#weather-and-hazards).

## Not done

- **Flood-risk zones on the map** are now a reference layer on the Maps screen's
  Layers tab, not part of this screen: see
  [reference-layers.md](reference-layers.md#flood-zones-england). The Agency's "Risk
  of Flooding from Rivers and Sea" is not, as it has no feature service.
- **Wildfire risk** is linked, not fetched (above).
- **Scotland, Wales and Northern Ireland** have no flood data or river levels here
  (above).

## What was not tested

- The publishers' real answers were fetched by hand once, on 16 November 2026, for one
  public place in England (Bedford, 52.14, −0.47), on a private server with no stand-in.
  All five worked. Warnings: 6,454 bytes (7 warnings in the UK). Forecast: 10,127 bytes
  (168 hours, 7 days). Flood: 24,796 bytes in 7 requests (no warning within 15 km, 5
  gauges). Climate: 1,569 bytes. Sunshine: 15,169 bytes (2005 to 2023, best tilt 40°).
  The whole update took 47 seconds. Everything in the suites uses recorded answers
  (`apps/server/test/fixtures/weather`), and nothing in them touches the internet.
- River and sea levels: one real answer for an area (the level stations within 10 km
  of King's Lynn, 52.75, 0.40: 11 stations, 14,313 bytes) and one for a station (300
  readings of Kilham's Bridge, 96,344 bytes) were fetched by hand on 17 November 2026,
  to learn their shape. Trimmed copies are the test fixtures
  (`ea-level-stations.json`, `ea-level-readings.json`). A station that stopped
  reporting, readings out of order and failures are made from them by the test
  stand-in, not seen in a real answer. A whole press for a real place was not timed.
- King's Lynn's answer lists several stations with no river name, no status and no
  scale ("FREEBRIDGE TS KINGS LYNN", "KINGS LYNN SOUTH QUAY GSM"), and one (Kilham's
  Bridge) whose typical top, 3.448 mAOD, is above its highest on record, 2.172. Outpost
  shows what the Agency gives.
- One gauge the Environment Agency lists at 0.4 km from Bedford is labelled "BEDFORD
  ROAD SLUICE NORTHAMPTON AUTOMATION". Its position in the Agency's data may be wrong.
  Outpost shows what the Agency gives.
- The Environment Agency's warning times carry no zone (`2026-11-16T16:06:00`). They
  are read as UK time. In November that is UTC, so the recorded answer cannot tell the
  two apart; this is unverified for summer.
- A warning period that crosses the change of clocks was not seen in a real feed.
- The device's position was tested only as "offered" or "not offered" (by
  `window.isSecureContext`). No real position was asked for.
