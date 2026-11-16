# Emergency plans

**Preparedness → Emergency plans** (`/prepare/plans`) holds a household's own plans for
a power cut, flooding, no phone or internet, severe weather (a storm, snow and ice, a
heatwave), sheltering at home, leaving at short notice, or anything else. A plan is
written on a quiet evening to be read on a bad one, possibly on a phone by torchlight,
possibly by someone who did not write it. So it is short, ordered, in plain words, and
printable.

Every plan carries one line, on the screen and on every card: *This is our household's
own plan, made in advance. In a real emergency, follow the emergency services and
official warnings. Emergency services: 999.* The number is the plan's own (see below).

A plan is the person's own data, on the server (migration `0018_emergency_plans`): in
the database a backup holds, counted under Storage → Database ("Preparedness") and in
the plan of **Erase everything**, and erased with everything else. Each plan is deleted
on its own from its screen.

## What a plan holds

Every part may be empty.

- **What it is for**: a kind (power cut, flooding, no phone or internet, severe
  weather, sheltering at home, leaving at short notice, something else) and words of
  the household's own ("Storm", "Chemical works alarm"); the **number for the
  emergency services** where the household is; how often to ask for a review.
- **Steps** for before, during and after, in order. In use, each can be ticked, and
  the tick is kept with its time.
- **The household**: each person, what they need to remember, anything medical they
  choose to have on their own wallet card, and their own number, linked from Contacts.
- **Who to contact, in order**: linked from **Contacts** (the plan keeps the contact's
  id, and shows the name and numbers Contacts has now) or typed; one marked as the
  out-of-area contact.
- **Where to meet**: if the home cannot be used, if the neighbourhood cannot, or
  another place; a **saved place** on the map (a press opens the offline map there) or
  a place described.
- **If the phones fail**: what the household will do, a radio frequency or channel and
  when to listen, and a **communication plan** under Radio.
- **Supplies**: what the plan needs, with an amount for the household or for each
  person, for the whole time or for each day, and the days to cover. See below.
- **Power**: a **power plan** (Tools → Power and batteries), with its headline figure,
  how long the batteries run its loads with no charging, worked out as that screen
  does.
- **Where things are**: the stopcock, the fuse board, the gas valve, the torch.
  Photos are left out: attachments in Outpost belong to pages of notes (the
  `attachments` table is keyed to a page), and Supplies came to the same conclusion. A
  page of notes with photos can be linked instead.
- **Notes and links** to notes, documents in the library (the first-aid manual, saved
  official guidance) and saved places.

### Links, and what happens when the thing goes

Contacts, saved places, the communication plan, the power plan, notes and documents
are linked by id, never copied. `GET /api/emergency-plans/:id` answers with the plan
and `resolved`: each linked thing as it is now, or `null` when it has been deleted.
A deleted contact or place stays in the plan, under the name it had when it was
linked, and the screen, the "use now" view and the cards say it is missing
("Ana Silva: no longer in Contacts"). The list of plans counts them. Nothing is
silently dropped.

### Review

A plan shows when it was last opened and when it was last looked over. After the
period the household chose (3 months, 6 months, a year, or never; 6 months to start
with) it asks to be looked over, on its own screen and in the list. Opening a plan is
recorded by the press that opens it (`POST /api/emergency-plans/:id/opened`); reading
it with a GET changes nothing.

## Templates, and where their words come from

A new plan starts from a template or from blank. Each template is drawn from official
guidance: every step, supply and "where things are" line names its source and carries
the words of that source it closely paraphrases (`packages/shared/src/emergency-templates-data.ts`).
On the screen each step says whose words it is:

- **From** a named source (publisher, page title, the page's own date), with the
  source's words and address a press away;
- **Changed from the words of** a named source, when the household has edited it, with
  what the template said beside it;
- **Your own words**, for a step the household wrote.

Steps of the template that were taken out are listed under the steps and can be put
back. A step keeps the id of the template step it came from, so these hold after
saving, copying and reopening.

Outpost writes no safety advice of its own. Where no official source found covers
something a household plan needs, the template leaves a question for the household
under **For you to decide** instead of an answer (listed below).

Severe weather is three templates (Storm; Snow, ice and cold; Heatwave), each a plan
of the kind "Severe weather", because the steps of each have little in common.

### How the sources were read

Each page was read on 16 November 2026. Every quote was then checked word for word
against the page or PDF as downloaded that day: 255 of 260 matched at once; three more
matched once markup inside words was allowed for (Ofcom's page splits words across
tags); one had lost a word in transcription and was corrected ("Use your devices
sparingly"); and one, from the Government of Canada's wildfire page, could not be
fetched again and was left out. Where a page shows no date of its own, the docs and the
screen say "No date shown".

### The sources

| Source | Page's own date | Used for |
| --- | --- | --- |
| UK Government (GOV.UK campaign: Be Ready), [Be Ready](https://beready.campaign.gov.uk/) `gov-be-ready-home` | No date shown | the number 999 in the United Kingdom |
| UK Government (GOV.UK campaign: Be Ready), [Be ready for emergencies](https://beready.campaign.gov.uk/be-ready-for-emergencies/) `gov-be-ready-for-emergencies` | No date shown | Power cut; Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Be informed about hazards](https://beready.campaign.gov.uk/be-informed-about-hazards/) `gov-be-ready-hazards` | No date shown | Sheltering at home; Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Power cuts](https://beready.campaign.gov.uk/be-informed-about-hazards/power-cuts/) `gov-be-ready-power-cut` | No date shown | Power cut |
| UK Government (GOV.UK campaign: Be Ready), [Phone and broadband outages](https://beready.campaign.gov.uk/be-informed-about-hazards/phone-broadband-outages/) `gov-be-ready-phone-broadband` | No date shown | No phone or internet |
| UK Government (GOV.UK campaign: Be Ready), [Flooding](https://beready.campaign.gov.uk/be-informed-about-hazards/flooding/) `gov-be-ready-flooding` | No date shown | Flooding; Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Storms](https://beready.campaign.gov.uk/be-informed-about-hazards/storms/) `gov-be-ready-storms` | No date shown | Storm |
| UK Government (GOV.UK campaign: Be Ready), [Cold weather, snow and ice](https://beready.campaign.gov.uk/be-informed-about-hazards/cold-weather-snow-ice/) `gov-be-ready-cold` | No date shown | Snow, ice and cold |
| UK Government (GOV.UK campaign: Be Ready), [Hot weather and heatwaves](https://beready.campaign.gov.uk/be-informed-about-hazards/hot-weather-and-heatwaves/) `gov-be-ready-heat` | No date shown | Heatwave |
| UK Government (GOV.UK campaign: Be Ready), [Water supply interruptions or outages](https://beready.campaign.gov.uk/be-informed-about-hazards/water-supply-interruptions-or-outages/) `gov-be-ready-water` | No date shown | Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [Fires in the home](https://beready.campaign.gov.uk/be-informed-about-hazards/fires-in-the-home/) `gov-be-ready-fires` | No date shown | Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Hazardous substance and radiation exposure](https://beready.campaign.gov.uk/be-informed-about-hazards/hazardous-substance-and-radiation-exposure/) `gov-be-ready-hazardous` | No date shown | Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [Alerts and warnings](https://beready.campaign.gov.uk/be-ready-for-emergencies/alerts-and-warnings/) `gov-be-ready-alerts` | No date shown | Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [BE READY CHECKLIST](https://beready.campaign.gov.uk/wp-content/uploads/sites/252/2026/10/Be-Ready-Checklist_English.pdf) `gov-be-ready-checklist-pdf` | No date shown (PDF metadata title 'National Resilience Checklist English', created/modified 15 October 2026) | No phone or internet; Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [HOUSEHOLD EMERGENCY PLAN](https://beready.campaign.gov.uk/wp-content/uploads/sites/252/2026/10/Be-Ready_Household_Emergency_Plan_English_Final.pdf) `gov-be-ready-household-plan-pdf` | No date shown (upload path 2026/10) | Sheltering at home; Leaving home at short notice |
| GOV.UK, [What to do before or during a flood - GOV.UK](https://www.gov.uk/help-during-flood) `govuk-help-during-flood` | No date shown | Flooding; Leaving home at short notice |
| GOV.UK, [What to do after a flood - GOV.UK](https://www.gov.uk/after-flood) `govuk-after-flood` | No date shown | Flooding |
| GOV.UK, [Prepare for flooding: Protect yourself from future flooding - GOV.UK](https://www.gov.uk/prepare-for-flooding) `govuk-prepare-for-flooding` | No date shown | Flooding |
| GOV.UK, [Prepare for flooding: Protect your property - GOV.UK](https://www.gov.uk/prepare-for-flooding/protect-your-property) `govuk-protect-property` | No date shown | Flooding; Leaving home at short notice |
| Environment Agency (GOV.UK), [Flood alerts and warnings: what they are and what to do - GOV.UK](https://www.gov.uk/guidance/flood-alerts-and-warnings-what-they-are-and-what-to-do) `govuk-flood-alerts-warnings` | Published 1 November 2010 (no updated date shown) | Flooding; Leaving home at short notice |
| Environment Agency (GOV.UK), [Personal flood plan](https://www.gov.uk/government/publications/personal-flood-plan/personal-flood-plan) `ea-personal-flood-plan` | Published 1 July 2009, Last updated 15 November 2023 | Flooding; Leaving home at short notice |
| GOV.UK (DCMS, DSIT, DHSC, Home Office), [999 and 112: the UK's national emergency numbers - GOV.UK](https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers) `govuk-999-112` | Published 12 August 2021, Last updated 1 April 2025 | the number 112 or 112, in the United Kingdom |
| Ofcom, [Stay connected in severe weather](https://www.ofcom.org.uk/phones-and-broadband/vulnerable-customers/stay-connected-in-severe-weather) `ofcom-severe-weather` | Published 13 October 2026, Last updated 22 October 2026 | No phone or internet |
| Met Office, [5 tips for staying safe in strong wind - Met Office](https://weather.metoffice.gov.uk/warnings-and-advice/seasonal-advice/stay-safe-in-strong-wind) `metoffice-strong-wind` | No date shown | Storm |
| Met Office, [10 things you should do now to prepare for winter - Met Office](https://weather.metoffice.gov.uk/warnings-and-advice/seasonal-advice/10-things-you-should-do-now-to-prepare-for-winter) `metoffice-winter-10` | No date shown | Snow, ice and cold |
| NHS, [Heatwave: how to cope in hot weather - NHS](https://www.nhs.uk/live-well/seasonal-health/heatwave-how-to-cope-in-hot-weather/) `nhs-heatwave` | Page last reviewed: 12 June 2026 | Heatwave |
| NHS, [Winter vaccinations and winter health - NHS](https://www.nhs.uk/live-well/seasonal-health/keep-warm-keep-well/) `nhs-winter-health` | Page last reviewed: 16 November 2022, Next review due: 16 November 2025 | Snow, ice and cold |
| British Red Cross, [How to prepare for a power cut | British Red Cross](https://www.redcross.org.uk/get-help/prepare-for-emergencies/power-cut) `redcross-power-cut` | Last updated 9 November 2026 | Power cut |
| British Red Cross, [How to prepare for flooding in the UK | British Red Cross](https://www.redcross.org.uk/get-help/prepare-for-emergencies/how-to-prepare-for-floods-and-flooding) `redcross-flood` | Last updated 5 November 2026 | Leaving home at short notice |
| British Red Cross, [Prepare an emergency kit – Essential items to have on hand](https://www.redcross.org.uk/get-help/prepare-for-emergencies/prepare-an-emergency-kit) `redcross-emergency-kit` | Last updated 29 October 2026 | Storm; Snow, ice and cold; Heatwave; Sheltering at home; Leaving home at short notice |
| British Red Cross, [Five tips to plan for emergencies | British Red Cross](https://www.redcross.org.uk/get-help/prepare-for-emergencies/five-tips-to-plan-for-emergencies) `redcross-five-tips` | No date shown | Leaving home at short notice |
| British Red Cross, [Prepare for a storm or thunderstorm | British Red Cross](https://www.redcross.org.uk/get-help/prepare-for-emergencies/support-during-a-storm) `redcross-storm` | No date shown | Storm; Snow, ice and cold |
| British Red Cross, [How to prepare your home for 72 hours in case of emergency](https://www.redcross.org.uk/get-help/prepare-for-emergencies/how-to-prepare-your-home-for-72-hours) `redcross-72-hours` | Last updated 30 October 2026 | Sheltering at home |
| Ready.gov (FEMA), [Make A Plan | Ready.gov](https://www.ready.gov/plan) (US) `readygov-plan` | Last Updated: 09/01/2026 | No phone or internet |
| Ready.gov (FEMA), [Make a Plan | Ready.gov](https://www.ready.gov/kids/make-a-plan) (US) `readygov-kids-plan` | Last Updated: 04/29/2026 | No phone or internet |
| Ready.gov (FEMA), [Power Outages | Ready.gov](https://www.ready.gov/power-outages) (US) `readygov-power-outages` | Last Updated: 06/04/2026 | Power cut |
| Ready.gov (FEMA), [Floods | Ready.gov](https://www.ready.gov/floods) (US) `readygov-floods` | Last Updated: 10/20/2026 | Flooding |
| Ready.gov (FEMA), [Shelter | Ready.gov](https://www.ready.gov/shelter) (US) `readygov-shelter` | Last Updated: 09/24/2026 | Sheltering at home |
| Ready.gov (FEMA), [Evacuation | Ready.gov](https://www.ready.gov/evacuation) (US) `readygov-evacuation` | Last Updated: 03/20/2026 | Leaving home at short notice |
| Ready.gov (FEMA), [Home Fires | Ready.gov](https://www.ready.gov/home-fires) (US) `readygov-home-fires` | Last Updated: 02/26/2026 | the number 911 in the United States |
| European Commission, [112 - the EU's emergency phone number | Shaping Europe's digital future](https://digital-strategy.ec.europa.eu/en/policies/112) `eu-112` | Last update: 5 November 2026 | the number 112 across the European Union; the number 112 in Switzerland and South Africa |
| Queensland Government, [Triple Zero (000) - qld.gov.au](https://www.qld.gov.au/emergency/emergencies-services/assistance/triple-000) `qld-triple-zero` | Last updated: 5 December 2014 | the number 000 in Australia |
| New Zealand Police, [111 Police Emergency | New Zealand Police](https://www.police.govt.nz/node/29262) `nz-police-111` | No date shown | the number 111 in New Zealand |

### Where official guidance differs

- **Water**: Be Ready says "3 litres per person per day" for at least 3 days; the
  British Red Cross says 2.5 to 3 litres to drink and about 10 litres more for cooking
  and washing; Ready.gov (US) says one gallon a person a day. The templates use Be
  Ready's figure.
- **The out-of-area contact** is not in the UK government's Be Ready pages or household
  plan. The British Red Cross ("choose someone outside your local area who'll be a
  contact during emergencies") and Ready.gov cover it; the screen quotes the Red Cross.

### Left to the household

No official guidance was found for these, so the templates ask instead of answering:

- how to reach each other with no phone: a time and place, a radio channel (PMR446 or
  amateur), a note left at home; and when to listen;
- a word or sign that tells the household a message is really from one of them;
- a second meeting place outside the neighbourhood, and which rest centre to use (the
  official pages say to ask the local council);
- generators, and medicines that must be kept cold in a long power cut (covered only by
  Ready.gov, for the US);
- when to come out after sheltering at home;
- what to do after a cold spell or a heatwave;
- who holds a spare key, and who checks on neighbours.

Also searched for and not found: how to register for emergency text messages (the old
emergencysms.org.uk address now redirects to an unrelated site), and silent 999 calls.

Pages that could not be read on 16 November 2026: powercut105.com and the Energy
Networks Association's power cut page (refused), National Grid's power cut page and
Ofcom's emergency calls page (not found), 911.gov, the FCC and the CRTC (refused), and
the Australian federal Triple Zero pages (timed out; the Australian number is from the
Queensland Government's page, last updated 5 December 2014). "Prepare, act, survive" is
the Environment Agency's campaign line; no template of that name was found, and its
personal flood plan is used. The NHS "Keep warm, keep well" address now serves "Winter
vaccinations and winter health", last reviewed 16 November 2022 and overdue for review.

### The number for the emergency services

The number differs by country, and each plan keeps its own, offered from the country
the device's language names (`en-GB`: 999) and changeable: 999 or 112 in the United
Kingdom, 112 across the European Union and in Switzerland and South Africa, 911 in the
United States, 000 in Australia, 111 in New Zealand. Each has its source above.

## Supplies, beside the inventory

The plan's supplies are set beside **Supplies** (`/prepare/supplies`):

- **Days of food and water held**, from `GET /api/supplies/outlook`, against the days
  this plan wants. These are Supplies' figures for its own household, which the screen
  says.
- **Each thing listed**, against the rows of the inventory: a row matches when it is in
  the line's category (if one is chosen) and its name has every word of the thing the
  line names, plurals aside: the words before the line's first bracket, comma, "and",
  "or", "that", "with" or "for" ("Torch (battery or wind-up) and spare batteries" is
  looked for as "Torch", and "LED torch" matches; "AA batteries" matches "AA Batteries
  (Duracell)"). Its amount
  counts when its unit is the line's (or neither has one). A row past its use-by is
  not counted. The amount wanted is the line's quantity, times the people in the plan
  if "each person", times the days if "each day". Then: **in stock** (held at least
  that, or anything held when no quantity is given), **low**, **missing**, or **check**
  (held only in another unit: compare by hand). The rule is `compareSupplies` in
  `packages/shared/src/emergency-plans.ts`, tested against cases worked by hand.
- **One press** puts every missing and low thing on the Supplies shopping list
  (`POST /api/supplies/shopping`, one line each, with the shortfall where it can be
  said and a note naming the plan).

## Using a plan

**Use now** (`/prepare/plans/:id/use`) is the steps, the numbers and the places, in
large type, and nothing else. A number is a `tel:` link: a press calls it on a phone.
A place opens the offline map there. "Start using this plan" records when it started;
each tick is kept on the server with its time, so whoever opens the plan next sees
what has been done. "Reset for next time" clears the ticks and the start and changes
no step. Ticks have routes of their own (`/ticks`, `/start`, `/reset`), apart from
editing, so a tick on one phone never undoes an edit on another, nor the other way
round; a step taken out of the plan takes its tick with it.

From the Preparedness page a plan in use is two presses away: **Emergency plans**,
then **Use now** beside it. On a phone, the "use now" page can be added to the Home
Screen from the browser's Share menu for one press.

It needs Outpost's server and nothing beyond it. Reading a plan with the server out of
reach is the job of **Keep on this phone** ([offline.md](offline.md)), which needs a
secure page; this screen keeps nothing in the browser.

## Cards to print

**Cards to print** (`/prepare/plans/:id/cards`) makes, on the device, as a PDF:

- **Wallet cards**, one for each person: a strip two bank cards tall (85.6 × 54 mm
  each half) that folds across the middle, four to a sheet of A4 or US Letter, with
  marks at the corners to cut along and a broken line to fold along. The front: who
  they are, their own number, anything medical they chose, the emergency number. The
  inside: who to call (up to three), the out-of-area contact, where to meet. The type
  starts at 10 point and is made smaller, to 6 point, until it fits; if it still does
  not, the screen says whose card and what to shorten.
- **The fridge sheet**: the steps for during and after, the numbers in order, the
  places to meet and how to communicate, on one page, set as large as will fit (steps
  from 20 point down to 11; past that a second page). The steps for before stay in the
  plan: they are done before the day.
- **The grab list**: the plan's supplies, with the amount for the household and a box
  to tick for each.

They are black on white, so a grey copy reads the same. A phone number is one piece of
text, never broken across lines; one too long for its room is set smaller. A name in
letters the PDF's typefaces lack (Greek, Chinese) is drawn by the browser as a picture
with the words hidden over it, so that the library's search finds them, as on the
contacts' emergency sheet (`features/maps/print/lettering.ts`). Each is offered with
**Save as PDF**, **Add to library** and **Share**; **Add to library** asks first,
because a card holds people's names, numbers and where they will be. A file is dated by
when the plan was last changed, so the same plan makes the same file.

## For other screens

The nuclear preparedness workspace, and anything else, can use plans through
`ctx.services.emergencyPlans` on the server (`list`, `get`, `create`, `update`,
`copy`, `remove`, `tick`, `start`, `reset`) or the routes below. A plan's kind is one of
the known ones or `other` with free text in `kindText` ("Nuclear incident"), so a
caller can file its plans under its own name and find them by `kind` and `kindText`.
Its parts are general: ordered steps with phases, people, contacts, places, supplies,
links. A caller with its own templates gives each step an `origin` id of its own; the
"whose words" labels work for steps whose origin is in `PLAN_TEMPLATES`.

## Not tested

- On a real phone: the `tel:` links, adding the page to the Home Screen, and the
  type at arm's length were not tried on a phone; the end-to-end test runs Chromium at
  390 px wide.
- On a printer: the cards' sizes (85.6 × 54 mm) are right in the PDF's own units, but
  no card was printed, cut and folded, and printers that scale to fit will make them
  smaller.
