# Households

Outpost keeps things for several households: one's own home and the family's, a home and
a second place with mostly the same people, a caravan or a hiking group. One household is
current for the whole Outpost, and every per-household screen and background task works
on it. This page is the contract the per-household modules work to; the code is
`apps/server/src/modules/households/` and `packages/shared/src/households.ts`.

## The model

| Table | What it holds |
| --- | --- |
| `households` | id, name, position, `kind` (`fixed` or `portable`), `home_marker_id`, `base_marker_id`, `country` (an override), `here_lat`, `here_lon`, `here_name`, `here_at`, `here_source`, timestamps. |
| `supply_members` | The people and pets, global. A person's needs (age band, energy, water) are on the person. |
| `household_people` | Who is in which household, with `position` for the order. Primary key (household, person). A person may be in several. |
| `household_positions` | Where a portable household has been: the last 50 a household, newest first. |
| settings row `households.current` | The current household's id, as JSON. Not a Settings screen setting; Erase everything removes it. |

- **The first household is id `household`.** Every one-row table that was the one
  household's (`supply_household`, `comms_plans`, `household_book`, `household_binder`,
  `garden_settings`) already had that id, so those tables are keyed by household id with
  no data moved. `morse_progress` stays global.
- **`household_id TEXT NOT NULL DEFAULT 'household'`** is on `supply_items`,
  `supply_shopping`, `emergency_plans`, `event_log`, `routine_checks` and
  `garden_sowings`. It is nullable on `power_plans` (null: shared by every household;
  plans from before stay shared) and on `medical_sheets`.
- **Medical sheets stay with the person.** A sheet linked to a person (`member_id`) has a
  null `household_id`; a sheet for nobody in particular has the household it belongs to.
  A household's sheets are its people's sheets and its own unlinked ones.
- **Ids are not foreign keys.** A saved place removed leaves a household with no home; a
  person removed leaves their medical sheets, unlinked, with their first household.
- **The migration** (`*_households.sql`) makes the first household "Home" with the home
  place it had (the first saved place with the home icon, by `created_at` then `id`, as
  `homePlaceOf` takes it), puts everyone in `supply_members` in it in their order, and
  gives unlinked medical sheets (and sheets of someone since taken out) to it. Old
  backups migrate forward the same way.
- **With no household stored** (a new install after Erase everything) every read sees
  the first household, unsaved, called "Home". The first change stores it
  (`households.ensure()`), so that a `GET` never writes.

## Where home is

`households.home(id?)` gives a `HouseholdHome` or null:

- **Fixed:** the saved place `home_marker_id`, while it exists. The first household (by
  position) falls back to `homePlaceOf(markers)` when it has none of its own, so an
  installation that marks home with the icon keeps working.
- **Portable:** where a person last said it is (`here_*`), named "Where <household> is
  now" when it has no name, with `at` (when it was set) and `source`. Never set: null,
  and the screen asks for it to be set. `base_marker_id` (where it is kept) is shown,
  never taken as home.

`households.country(id?)` is the override, else the country home is in (`countryAt` on
the Natural Earth boxes), else null. Changing `kind` keeps both the saved place and the
position.

## Services

On `ctx.services.households` (registered after maps, before every module that keeps
things for a household):

| Call | Gives |
| --- | --- |
| `current()`, `currentId()` | The current household; the first by position if the one chosen is gone. |
| `setCurrent(id)` | Makes it current for everyone; publishes `households.changed` with `{ currentChanged: true }`. |
| `list()`, `get(id)`, `first()` | `HouseholdDto`s in order; `first()` is what the mesh root topic and the allotment game take. |
| `home(id?)`, `country(id?)` | As above; `id` defaults to the current household. |
| `personIds(id?)` | Who is in it, in order. |
| `ensure()` | Stores the first household if none is stored. Call it before inserting a row keyed to a household. |
| `create`, `update`, `holds`, `remove`, `setPeople`, `setHere`, `positions` | What the routes do. |
| `people.list/get/create/update/remove` | The People list. |
| `syncMembers(ids)` | Used by Supplies' household screen (below). |
| `kept.count()`, `kept.eraseAll()` | For Erase everything (wired in `manage/cleanup.ts`). |

## The API

| Route | Body | Answer |
| --- | --- | --- |
| `GET /api/households` | | `HouseholdsResponse` `{ households, currentId }` |
| `POST /api/households` | `HouseholdCreateInput` `{ name, kind?, homePlaceId?, basePlaceId?, copyPeopleFrom? }` | `{ household }` |
| `GET /api/households/:id` | | `{ household }` |
| `PUT /api/households/:id` | `HouseholdUpdateInput` `{ name?, kind?, homePlaceId?, basePlaceId?, countryOverride? }` (only what is named changes) | `{ household }` |
| `DELETE /api/households/:id?confirm=true` | | `HouseholdsResponse`. Without `confirm`: 409 with `details.holds` (`HouseholdHolds`). The last household: always 409. |
| `PUT /api/households/:id/people` | `{ personIds }`, in order | `{ household }` |
| `PUT /api/households/current` | `{ id }` | `HouseholdsResponse` |
| `PUT /api/households/:id/here` | `HouseholdHereInput` `{ lat, lon, name?, source: "device" \| "map" \| "place" }`; portable only (else 400) | `{ household }` |
| `GET /api/households/:id/positions` | | `{ positions }`, newest first, at most 50 |
| `GET /api/people`, `GET /api/people/:id` | | `{ people }` / `{ person }`: `PersonDto` (a `Person` with `householdIds`, `medicalSheets`) |
| `POST /api/people` | `PersonCreateInput` (a person, `householdIds?`; left out: the current household) | `{ person }` |
| `PUT /api/people/:id` | `PersonInput` | `{ person }` |
| `DELETE /api/people/:id?confirm=true` | | Without `confirm`, someone with medical sheets: 409 with `PersonHolds`. The sheets are kept, unlinked. |

Removing a household removes its rows in the tables above, its one-row papers, its
unlinked medical sheets, its positions and its membership. It never removes a person:
those in no other household stay on the People list (`peopleOnlyHere`), with their
sheets (`theirMedicalSheets`). The 409 says all of this before anything goes.

`PUT /api/supplies/household` still takes `members`: they are the current household's
people. One left out leaves that household, and goes from the People list only if it is
in no other household. Every other supplies route is the current household's; an item or
shopping line of another household is 404. The 5,000-item limit is per household. A CSV
preview answers `household` (`{ id, name }`, the current one it was read against) and
`POST /api/supplies/import/apply` takes it back as `householdId`: if another household
has been made current since, the apply is 409 and nothing is brought in (left out, by an
older page: the current household). `GET /api/supplies/outlooks` gives every
household's days of food and water, the current one first (Home's lines).

Types: `HouseholdDto` (named so because `Household` is still the supplies settings type,
also exported as `SupplyHousehold`), `HouseholdHome`, `HouseholdPosition`, `Person` (the
old `HouseholdMember`, which stays), `PersonDto`, `HOUSEHOLD_LIMITS`, `FIRST_HOUSEHOLD_ID`.

## The live event and the web app

Every change publishes `households.changed`. The web app's event provider
(`lib/events.tsx`) refreshes the household, supplies, papers, book and plans queries on
it; when `data.currentChanged` is set it resets every cached query, so each screen
fetches its own again and nothing of the other household is shown meanwhile.

The screens: Prepare › Households (`features/households/households-page.tsx`, the list,
a new household and the People list) and each household's page (`household-page.tsx`).
`<ForHousehold />` (`for-household.tsx`) is the "For <name> · Change" line under a
per-household screen's title, nothing with one household; `HouseholdSwitcher`
(`switcher.tsx`) is in the sidebar and the More sheet with two or more; the people rows
are `PeopleEditor` (`people-editor.tsx`), which Supplies' Household tab uses too.

`features/households/use-household.ts`: `useHouseholds()` (the list and `currentId`),
`useHousehold()` (`{ household, home, country, several, households }` for the current
one), `usePeople()`, `useSetCurrentHousehold()`. Query keys start with `households`.

## How a feature becomes per-household

1. **Rows:** filter by `household_id = ctx.services.households.currentId()`, and include
   `household_id` on every insert (after `households.ensure()`). Counting and erasing
   everything stays across all households.
2. **One-row tables:** key the row by the household's id in place of the constant
   `"household"`.
3. **Home and country:** take `households.home()` and `households.country()` (web:
   `useHousehold()`), never `homePlaceOf` on the markers.
4. **Background work** (chat tools, scheduled checks, the drill) uses the current
   household, the same as a request.
5. **Publish your own `*.changed`** as before; `households.changed` already refreshes
   screens when the current household changes.

### When home moves

A portable household's home is wherever a person last said it was, so a place user:

- shows the position's age with it ("as of 3 hours ago": `homeAgeMs(home, now)`), and the
  name it was given;
- never fetches anything because the position changed. A forecast, tide or pass list for
  the new place is fetched only when a person presses for it, as everywhere else; until
  then the screen says its figures are for the earlier place;
- treats a null home as "set where it is now", with a link to the household's page.

## Per household already

Emergency plans, the log of events, routine checks, the offline drill, the garden and
power plans work on the current household:

- `emergencyPlans.list()` is the current household's; `get(id)` answers any plan, with
  `household` (`PlanHousehold`: id, name, `several`) so that a phone's copy says whose it
  is. A new plan's number is `emergencyNumberFor(households.country())`.
- The log, checks and sowings are read, changed and removed only in the current
  household (another's id is 404); their limits are per household; `count()` and
  `eraseAll()` stay across all.
- `garden_settings` is keyed by the household's id.
- `power.list()` is the shared plans (null `household_id`) and the current household's;
  `get(id)` answers any; `listAll()` is for Export everything. `householdId` on a plan
  input: left out keeps it (new: shared), null shares it, an id ties it (400 if unknown).
  A plan brought in from a file is shared.
- Web: `<ForHousehold />` (`features/households/for-household.tsx`) under the titles;
  `features/households/test-support.ts` has stand-in `GET /api/households` answers.

## The place users

These take the current household's home and country already: weather (the national
warnings' country and position, the Home badge, the places list, its "add where it is now"),
tides, the solar clock, night sky and celestial navigation (`usePlaceAndZone`), Explore's
suggestions, frequencies and licences, nuclear planning, heard and APRS weather, satellites
(page and map layer), repeaters and the compass (`useOrigin`), the propagation transmitter,
power's sun figures, the layers' region chooser and food panel, the garden's country, the
map's "near home" (heard, range), and the chat tools (`homePlace`/`noHomeText` in
`tools/where.ts`: sun, weather, radio, places). The mesh root topic and the allotment take
`first()`.

- Web: `features/households/home.tsx` has `useHome()` (home, household, country, `several`),
  `<HomeAsOf home />` (the "as of 3 hours ago" line, nothing for a saved place) and
  `<NoHome />` (no home: the home icon and Maps for the first household, else a link to
  /prepare/households). `NoHomePlace` (maps/home-place.tsx) is the same line.
- Shared: `homeAsOf`, `homeLabel` and `noHomeWords` (`home-place.ts`).
- The map: `features/households/map.ts` draws every household's home, labelled with its
  name, a portable one's as a ringed dot with its age (source `o-households`). With one
  household whose home is a saved place it draws nothing.
- Marker changes refresh the households query (a home is a saved place).
- Tests: `useHome` is answered by `GET /api/households`; `fakeApi` answers it, when a test
  does not, with one household whose home is the home-icon place among the markers it was
  given (`oneHouseholdOf` in `features/households/test-support.ts`).

## Housekeeping

- **Export everything** writes a folder per household, named after it, under
  `supplies/`, `plans/` and `papers/` when there are several (each read through its own
  service with the household's id: `supplies.items(id)`, the plans' `household_id`, its
  people's medical sheets and its keeping-in-touch plan). With one household the layout
  is as it always was. `households/` holds `households.json`, `people.json` and the
  book's answers (one file per household with several). Power plans stay in one folder.
- **Erase everything** counts and removes the households, positions and the
  `households.current` setting; the database inspector and the table checks know the
  new tables.
- **The portable drive** carries every household, and its screen names them.

## Still the first household, or the whole Outpost's

Each of these is so by choice:

- `morse_progress` (one row, id `household`), the board and the roll call are the whole
  Outpost's.
- The mesh root topic and the allotment game take `households.first()`.
- The first household, when it has no home place of its own, takes the saved place with
  the home icon (`homePlaceOf`, in `households/service.ts` only).
- The phone keeps one copy of the medical sheets per household, under the household's id
  (a copy from before is under `household`, the first's). `keepMedical(id?)` fetches
  `GET /api/medical-sheets?household=<id>` (left out: the current household's); a refresh
  brings each copy up to date from its own household, and leaves a removed household's
  copy as it was.
- An insert that leaves `household_id` out takes the column default, the first
  household: every per-household service sets it, so a new one must too.
