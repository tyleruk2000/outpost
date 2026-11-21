# Satellite imagery

**Satellite**, on the Maps screen, draws pictures of the ground under the map's roads and
names, from Outpost's own disk: nothing is fetched while you look. Download them under
**Offline maps → Satellite imagery**. All are free and need no account.

| | The world | A small area in detail |
| --- | --- | --- |
| From | NASA's Blue Marble, July 2004 | The EU's Sentinel-2 satellites, one pass |
| Detail | 2 km or 500 m a pixel | 10 m a pixel: fields, woods, rivers, not single houses |
| Fetched | 256 MB or 3.26 GB | About 16 MB for 100 km² |
| Kept | 15.5 MB or about 350 MB | Under 1 MB for 100 km² |
| Cloud | None | Whatever there was that day |

The most detailed set covering the screen is drawn on top. **A picture is of one day**, with
that day's cloud, snow and season; the day is written in the credits under the map.

## Choosing an area

1. **Choose an area**: draw a box or use the current view, and name it.
2. **Find pictures** lists the passes of the last year: day, cloud and coverage.
3. **Continue** shows the picture, **the cloud over your area**, the exact bytes to fetch, the
   size on disk, the time, and the cost (none). If cloud covers what you need, choose another
   day.
4. **Fetch** starts a download that can be paused and survives a restart.

Above 2,500 km² you are warned that several small areas are usually better; above 10,000 km²
it is refused.

## Aerial photographs

Where a government publishes aerial photographs openly in a form Outpost reads, **Find
pictures** lists them first: 5 cm to 1 m a pixel, so houses, paths and walls show.

| | New Zealand | United States (lower 48) |
| --- | --- | --- |
| Publisher | Toitū Te Whenua Land Information New Zealand (LINZ) | USDA Farm Service Agency (NAIP) |
| Detail | 5 to 30 cm (shown at up to 15 cm) | 30 cm to 1 m |
| Terms | CC BY 4.0, credited to each survey's licensor | Public domain |

They are meant for a town centre or a valley, not a county: above about 20 km² you are warned,
and above about 80 km² refused. A photograph may sit a metre or two off the map's roads.

England's photographs are published only in a closed format (ECW) and are not offered.

## Where the pictures come from, and the terms

NASA Earth Observatory's Blue Marble ("NASA Earth Observatory") and Copernicus Sentinel-2
("Contains modified Copernicus Sentinel data", with the year) are free and open; the
publishers' own words are in [sources.md](sources.md). Nothing is bundled with Outpost.
Cloud-free mosaics are not offered: the one that exists (EOX) is sold, not free to keep.

## Limits

- Areas cannot cross the 180° meridian.
- **Imagery is not kept on a phone**: away from the server, a phone shows no pictures.
