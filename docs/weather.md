# Weather and hazards

**Preparedness → Weather and hazards** keeps forecasts, severe-weather warnings, flood
warnings, river and sea levels, and climate and sunshine averages for places you choose,
so that they can be read with no connection, and a log of your own barometer readings.

It is a copy with its age always in view: who it came from, when it was fetched, what
period it covers. When a copy is old or has run out, the screen says so and does not show
its figures as current.

## Nothing is fetched by itself

The server fetches only when you press **Update now** (UK warnings, and the forecast,
flood warnings and river levels for every place), **Fetch river and sea levels**, **Fetch
the last 3 days** on a station, **Fetch the averages for this place** under Climate, or
**Fetch alerts** on the Worldwide tab.

**Also update when I open this screen** is off until you tick it; then each opening, on
any device, does what Update now does. Nothing runs on a timer. A fetch that fails keeps
the previous copy and lists what could not be updated and why.

## Places

Choose places from your saved places on the map. The saved place with the **home** icon
is the home place (if several have it, the one saved first), the same home Emergency
plans uses. A place in the list is a copy, so moving the saved place does not change it;
removing it removes what was fetched for it.

Your device's position is offered only on a secure page (see Settings → HTTPS on your
network). Give each UK place a **Met Office warning region**; without one, every UK warning
is listed and none is matched to it.

**Bring in places from a file** reads `weather-places.geojson` from **Take everything out**,
or any GeoJSON file of named points. Each point is added beside the places already there; one
of the same name at the same position is passed over, and so is any past twelve. A point at
exactly the position of a saved place of the same name is linked to it.

## How old is too old

Outpost's choices, not the publishers':

| Copy | Fresh for | After that |
| --- | --- | --- |
| Forecast | 6 hours | "old"; after its last hour it has "run out" and shows no figures |
| Warnings | 3 hours | "old"; each warning also says whether its period has begun or ended |
| Flood warnings, river levels | 1 hour | "old"; each level also says when it was measured |
| Climate, sunshine | always | averages over many years |

## The sources

| What | Publisher |
| --- | --- |
| Forecast, seven days | [Open-Meteo](https://open-meteo.com/), with the Met Office's models (2 km over the UK and Ireland, 10 km elsewhere) |
| Severe-weather warnings | The Met Office's UK feed |
| Flood warnings within 15 km, river and sea levels | The Environment Agency |
| Climate averages by month | NASA POWER (2001 to 2025, a grid of about 50 km) |
| Sunshine on a solar panel by month | PVGIS (European Commission JRC) |

Each is sent your place's position to two decimal places (about 1.1 km); the warnings feed
is sent nothing. Terms are in [sources.md](sources.md#weather-and-hazards-read-on-2026-11-16).

Warnings are the publishers' words unaltered, with a link to the full warning. The
Environment Agency says its data "should not be relied upon for safety critical
applications". Sunshine is kWh/m² a day (the same number as peak sun hours), not counting
shade.

### The power planner

**Tools → Power and batteries** can fill its peak sun hours from the sunshine copy kept
here, asking before replacing figures you typed, and fetch one if none is held. See
[tools-power.md](tools-power.md#peak-sun-hours-from-weather-and-hazards).

## Worldwide alerts

On the **Worldwide** tab:

- **Disasters worldwide** from GDACS (European Commission and United Nations), orange and
  red first. Its alerts are automatic and do not replace the authorities'.
- **Earthquakes of magnitude 4.5 and over** in the past week, from the USGS.
- **National warnings for the country home is in** (the screen names the country taken; a
  border can mislead it): MeteoAlarm in Europe, the National Weather Service in the
  United States, Environment and Climate Change Canada, MetService in New Zealand and the
  Japan Meteorological Agency.

**Country for national warnings** chooses another country instead, for a home near a
border or a household that wants its neighbour's warnings. It is one setting for every
device; **Home's country** goes back to the position.

What each national service gives:

- **Canada**: the alerts for the forecast area that holds Home, in English, asked for by
  a small box round Home. Ended alerts are listed apart.
- **New Zealand**: every outlook, watch and warning in MetService's feed, those whose
  area holds Home first. An alert whose full text cannot be had is shown from the feed's
  words, and says so.
- **Japan**: the latest headline from each local office, in Japanese as written, highest
  level first. Outpost cannot tell which prefecture Home is in: find its office.

Each is old after an hour (GDACS three, MeteoAlarm ten minutes) and shows the publisher's words and credit.

**MeteoAlarm** (Europe) names the national service whose warnings they are: the Met
Office for the United Kingdom (with the Environment Agency, Natural Resources Wales and
SEPA, which also take part), Deutscher Wetterdienst for Germany, and so on. Where a
warning names its own sender, that name is used. MeteoAlarm's terms ask for this, and ask
that warnings passed on are never more than ten minutes behind. Outpost is for personal
use and keeps its copy for when the connection is gone, which cannot keep to ten minutes,
so a MeteoAlarm copy fetched more than ten minutes ago says **Not current: for reference
only**, with the time it was fetched. It is still shown; press **Fetch alerts**, or see
meteoalarm.org, for the warnings in force now.

## River and sea levels

**River and sea levels** lists up to ten Environment Agency stations near the place
chosen, within 3, 8 (the default), 15 or 25 km. Each gives:

- the river or coast and its distance;
- the latest level, when it was measured and how long ago;
- what it is measured from: `mAOD` (metres above Ordnance Datum), `mASD` (the station's
  own datum) or `m` (unnamed). Levels from different datums cannot be compared;
- whether it is within, above or below the station's **typical range** (exceeded 5% and
  95% of the time). Tidal stations are not judged;
- rising, steady or falling: Outpost's rule, the latest reading against the earliest in
  the three hours before, at least 45 minutes apart; under 2 cm is steady;
- "Not reporting" when the latest reading is over two days old.

A station's own view adds its highest on record and a link to the Agency's page; **Fetch
the last 3 days** draws its readings.

**What the figures mean.** Measurements, not a forecast. A level within its typical range
is no promise a place will not flood, and Outpost never calls a level safe. Readings are
often sent only once or twice a day, so hours old is ordinary. In an emergency call 999;
Floodline is 0345 988 1188, 24 hours. England only.

## The barometer

Type what your barometer shows, in hPa (millibars) or inches of mercury, with the time and
its height above sea level (remembered on the device). The reading is reduced to sea
level by the International Standard Atmosphere, good to a fraction of a hectopascal up to
a few hundred metres. Heights from −450 to 3,000 m are accepted; a result outside 850 to
1,100 hPa is refused (check the unit and height).

**The tendency** over the three hours before the latest reading is said in the Met
Office's terms: rising or falling slowly (0.1 to 1.5 hPa), rising or falling (1.6 to
3.5), quickly (3.6 to 6.0), very rapidly (over 6.0), or "now rising" or "now falling" when
it turned. It is a rule of thumb, not a forecast: act on a forecast or a warning.

**Wind from** is optional with each reading: the point of the compass the wind was
blowing from. It shows beside the reading, goes in the CSV file, and the forecast below
starts from the latest reading's wind.

**A forecast from your readings**, in words ("Becoming fine"), by the Zambretti method,
from the pressure, the tendency and the wind direction. A rule of thumb for
about twelve hours in the British Isles and similar latitudes; not for the southern
hemisphere or the tropics.

**Bring in a CSV file** from a logger or weather station shows what it would add, and
what it cannot read, first. It needs a header naming a time and a pressure column (`hPa`,
`mb`, `inHg`), optionally `unit`, `height` and `wind` (a point of the compass or degrees); at most 50,000 rows and 4 MB. **Clear
readings** says how many will go and offers to save them as a CSV first; there is no undo.

## Under Manage and clean up

Fetched copies (10 to 25 kB a place) are under Storage → Manage and clean up → Leftovers;
**Kept and sources** on this screen lists each with its size, age and what was sent.

## Not done

- **Flood zones on the map** are a reference layer:
  [reference-layers.md](reference-layers.md#flood-zones-england).
- **Wildfire risk** is linked: the Met Office's index is maps only.
- **Scotland, Wales and Northern Ireland**: no flood data or river levels.
- **Not used**: Met Office DataHub (needs a key), MET Norway (needs contact details sent),
  WorldClim, ERA5 and Australia's Bureau of Meteorology (terms). Canada's, New Zealand's
  and Japan's warning feeds are not built yet.
