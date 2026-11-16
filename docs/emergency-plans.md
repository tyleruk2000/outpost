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
the words of that source it closely paraphrases, or reproduces exactly where the
source's terms allow no change (`packages/shared/src/emergency-templates-data.ts`).
On the screen each step says whose words it is:

- **From** a named source (publisher, page title, the page's own date), with the
  source's words, its address and the licence statement a press away;
- **Changed from the words of** a named source, when the household has edited it, with
  what the template said beside it;
- **A pointer, not advice**: a line in Outpost's own words that names a page to read,
  for a publisher whose words may not be copied (below), quoting nothing; the household
  puts its own words in its place;
- **Your own words**, for a step the household wrote.

Steps of the template that were taken out are listed under the steps and can be put
back. A step keeps the id of the template step it came from, so these hold after
saving, copying and reopening.

Outpost writes no safety advice of its own. Where no official source found covers
something a household plan needs, the template leaves a question for the household
under **For you to decide** instead of an answer (listed below).

Severe weather is three templates (Storm; Snow, ice and cold; Heatwave), each a plan
of the kind "Severe weather", because the steps of each have little in common.

### Whose words are shipped, and on what terms

Outpost is a public repository under the MIT licence, and the templates are in it, so
only the words of a publisher whose own terms allow them to be copied are shipped.
Each publisher's terms were read on its own terms, copyright or reuse page on
16 November 2026; the table is `SOURCE_TERMS_DATA`, and a test fails if a template
line quotes a source whose terms are not cleared, if a pointer quotes anything, or if a
step of a publisher that allows only exact copies differs from its words.

| Publisher | Terms page (read 16 November 2026) | What it says | Verdict |
| --- | --- | --- | --- |
| GOV.UK (Government Digital Service), including the Environment Agency's pages on GOV.UK | https://www.gov.uk/help/terms-conditions | “Most content on GOV.UK is subject to Crown copyright protection and is published under the Open Government Licence (OGL), which also sets out which content is exempt. … You can reproduce content published on GOV.UK under the OGL as long as you follow the licence’s conditions.” | Cleared: Open Government Licence v3.0 (logos, crests, the Royal Arms and third-party rights are exempt; none is used). Shown with its words: “Contains public sector information licensed under the Open Government Licence v3.0.” |
| Be Ready (Cabinet Office), beready.campaign.gov.uk | https://beready.campaign.gov.uk/about-this-website-and-uk-resilience/ | “It was developed by the Cabinet Office, in partnership with experts from across local and national government, … All content is available under the Open Government Licence v3.0, except where otherwise stated” | Cleared: Open Government Licence v3.0 (the site's own statement; its two PDFs carry no other notice). Shown with its words: “Contains public sector information licensed under the Open Government Licence v3.0.” |
| Met Office | https://www.metoffice.gov.uk/policies/tandc | “the Met Office grants you a worldwide, royalty-free, perpetual, non-exclusive licence to use, copy and adapt the Content (the "Licensed Content") under the terms of the UK Open Government Licence for Public Sector Information v3.0 … You must place the following attribution statement adjacent to the Licensed Content when reproducing the Licensed Content, as required by the Open Government Licence: "Contains public sector information licensed under the Open Government Licence v3.0"” | Cleared: Open Government Licence v3.0, with the statement adjacent to the words. Shown with its words: “Contains public sector information licensed under the Open Government Licence v3.0.” |
| NHS website (Department of Health and Social Care) | https://www.nhs.uk/our-policies/terms-and-conditions/ | “Copyright and database rights in NHS Website Content are released free-of-charge under the current version of the Open Government Licence ("OGL"), except where specified … If you copy and reuse NHS Website Content but do not make any changes or adaptions … then you must attribute us as follows: "Information from the NHS website", and "as at DDMMYY" … You must not attribute the content to the NHS website or cite the NHS specifically as the source of the adapted, updated or non-refreshed content.” | Cleared for exact copies only: Open Government Licence v3.0 with the NHS website's own conditions: an unchanged copy is credited "Information from the NHS website" with the date copied, on every appearance; an adapted one may not name the NHS. No NHS words are shipped: Be Ready's own (OGL) heat advice, which points to the NHS, is used instead.. |
| Ofcom | https://www.ofcom.org.uk/about-ofcom/our-website/copyright | “Unless indicated as Crown-owned material or otherwise, the material featured on this website or provided in hard copy may be reproduced free of charge in any format or medium, provided that it is reproduced accurately and not used in a misleading context. The material must be acknowledged as Ofcom copyright and the title of the document/publication specified.” | Cleared for exact copies only: Ofcom's permission to reproduce accurately, acknowledged; not a licence to adapt, so each step is a whole sentence of the page, unchanged. Shown with its words: “Ofcom copyright: words from “Stay connected in severe weather”, reproduced unchanged.” |
| European Commission | https://commission.europa.eu/legal-notice_en | “Unless otherwise indicated (e.g. in individual copyright notices), content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided appropriate credit is given and changes are indicated.” | Cleared: CC BY 4.0. Shown with its words: “© European Union, CC BY 4.0 (European Commission, “112 - the EU's emergency phone number”).” |
| Queensland Government | https://www.qld.gov.au/legal/copyright | “Unless otherwise noted, all copyright material available on or through this website is licensed under a Creative Commons Attribution 4.0 International licence (CC BY 4.0). … You must keep the copyright notice on the copyright material and attribute the State of Queensland as the source of the copyright material.” | Cleared: CC BY 4.0. Shown with its words: “© State of Queensland, CC BY 4.0 (“Triple Zero (000)”, qld.gov.au).” |
| British Red Cross | https://www.redcross.org.uk/terms-and-conditions | “We and our licensors reserve all of our and their rights in any intellectual property in connection with these Terms. … Commercial use or publication of any or all of the Content is strictly prohibited without prior authorisation from us. Nothing contained herein shall be construed as conferring any licence to use any item displayed, other than as necessary to enable you to access the Site.” | Not cleared: All rights reserved: pointed to, not quoted. |
| Ready.gov and FEMA (United States) | https://www.fema.gov/about/website-information | “Not read directly: fema.gov refused every request from here (HTTP 403). Read through a summarising fetcher, the page says “Most material on FEMA.gov is free of copyright and may be copied and distributed without permission”, which names FEMA.gov and not Ready.gov; Ready.gov has no terms page of its own that could be found.” | Not cleared: Not established from a page that could be read: pointed to or left as a question, not quoted. |
| New Zealand Police | https://www.police.govt.nz/about-site-and-nz-police-app/copyright | “You may save to disk and reprint images and other information contained on this site for non-commercial private purposes only. Requests and enquiries concerning the reproduction of information on this website, or the use of web scripts or code, for any other purpose requires permission.” | Not cleared: Permission needed: the number 111 is given as a fact, cited, with none of the page's words. |

What follows on the screen and on paper:

- **Words included**: GOV.UK and the Environment Agency, Be Ready (Cabinet Office) and
  the Met Office, under the Open Government Licence v3.0; Ofcom, reproduced unchanged by
  its permission. Each quoted step shows its licence statement beside its words when
  opened (the Met Office asks for it "adjacent"); the plan's screen, the list of
  templates, the "use now" view, the fridge sheet and the grab list each carry the
  statements once: "Contains public sector information licensed under the Open
  Government Licence v3.0." and "Ofcom copyright: words from “Stay connected in severe
  weather”, reproduced unchanged." Wallet cards carry no template words.
- **The NHS** licenses its pages under the OGL, but with conditions of its own: an
  unchanged copy must be credited on every appearance with the date it was copied, and
  an adapted one may not name the NHS at all. Rather than ship NHS words on those terms,
  the heatwave template uses Be Ready's own heat advice (OGL), which says to read the
  NHS's advice, and the one NHS cold-weather step is covered by Be Ready's.
- **The British Red Cross** reserves all rights, so its pages are pointed to, never
  quoted. **Ready.gov and FEMA** (US) are treated as not cleared: fema.gov refused every
  direct request, and the statement found through a summarising fetcher names FEMA.gov,
  not Ready.gov. **New Zealand Police** requires permission. Their numbers (911, 111)
  are given as facts, cited, without their words.

### What was replaced

Lines from the publishers not cleared were replaced, in this order of preference: by
the step of a cleared source that says the same thing (for example the Red Cross's
"avoid candles" by Be Ready's "Torches are safer than candles."; Ready.gov's flood
driving step by Be Ready's "turn around and find another route"; the NHS heat steps by
Be Ready's); by a pointer, one to a page, where no cleared source says it (food after a
power cut, fallen trees after a storm, what to put in an emergency kit, preparing a home
for 72 hours, planning tips); or by a question (which room to shelter in, a contact
outside the area, a note left at home). Lines already covered by a cleared step in the
same template were taken out. Every changed line has a new id, so a plan made earlier
still tells its words from the template's.

| Template | Steps first shipped | Steps now | Of them, pointers | Supplies | "Where things are" | Prompts |
| --- | --- | --- | --- | --- | --- | --- |
| Power cut | 29 | 22 | 1 | 10 | 1 | 2 |
| Flooding | 34 | 34 | 0 | 10 | 4 | 1 |
| No phone or internet | 25 | 25 | 0 | 6 | 0 | 3 |
| Storm | 18 | 15 | 1 | 3 | 0 | 1 |
| Snow, ice and cold | 10 | 10 | 1 | 6 | 1 | 1 |
| Heatwave | 10 | 10 | 1 | 3 | 0 | 1 |
| Sheltering at home | 21 | 21 | 1 | 13 | 2 | 2 |
| Leaving home at short notice | 24 | 20 | 2 | 9 | 2 | 5 |

### How the sources were read

Each page was read on 16 November 2026. Every quote now shipped (227, counting
supplies, "where things are" lines, days and numbers) was checked word for word
against the page or PDF as downloaded that day, and all are found; one replacement step
was found on Be Ready's storms page rather than its power cuts page and is cited to it.
Where a page shows no date of its own, the docs and the screen say "No date shown".

### The sources

| Source | Page's own date | Terms | Used for |
| --- | --- | --- | --- |
| UK Government (GOV.UK campaign: Be Ready), [Be Ready](https://beready.campaign.gov.uk/) `gov-be-ready-home` | No date shown | Quoted (be-ready) | the number 999 in the United Kingdom |
| UK Government (GOV.UK campaign: Be Ready), [Be ready for emergencies](https://beready.campaign.gov.uk/be-ready-for-emergencies/) `gov-be-ready-for-emergencies` | No date shown | Quoted (be-ready) | Power cut; Snow, ice and cold; Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Be informed about hazards](https://beready.campaign.gov.uk/be-informed-about-hazards/) `gov-be-ready-hazards` | No date shown | Quoted (be-ready) | Sheltering at home; Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Power cuts](https://beready.campaign.gov.uk/be-informed-about-hazards/power-cuts/) `gov-be-ready-power-cut` | No date shown | Quoted (be-ready) | Power cut; Storm; Snow, ice and cold |
| UK Government (GOV.UK campaign: Be Ready), [Phone and broadband outages](https://beready.campaign.gov.uk/be-informed-about-hazards/phone-broadband-outages/) `gov-be-ready-phone-broadband` | No date shown | Quoted (be-ready) | Power cut; No phone or internet; Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [Flooding](https://beready.campaign.gov.uk/be-informed-about-hazards/flooding/) `gov-be-ready-flooding` | No date shown | Quoted (be-ready) | Flooding; Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Storms](https://beready.campaign.gov.uk/be-informed-about-hazards/storms/) `gov-be-ready-storms` | No date shown | Quoted (be-ready) | Power cut; Storm |
| UK Government (GOV.UK campaign: Be Ready), [Cold weather, snow and ice](https://beready.campaign.gov.uk/be-informed-about-hazards/cold-weather-snow-ice/) `gov-be-ready-cold` | No date shown | Quoted (be-ready) | Snow, ice and cold; Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [Hot weather and heatwaves](https://beready.campaign.gov.uk/be-informed-about-hazards/hot-weather-and-heatwaves/) `gov-be-ready-heat` | No date shown | Quoted (be-ready) | Heatwave |
| UK Government (GOV.UK campaign: Be Ready), [Water supply interruptions or outages](https://beready.campaign.gov.uk/be-informed-about-hazards/water-supply-interruptions-or-outages/) `gov-be-ready-water` | No date shown | Quoted (be-ready) | Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [Fires in the home](https://beready.campaign.gov.uk/be-informed-about-hazards/fires-in-the-home/) `gov-be-ready-fires` | No date shown | Quoted (be-ready) | Leaving home at short notice |
| UK Government (GOV.UK campaign: Be Ready), [Hazardous substance and radiation exposure](https://beready.campaign.gov.uk/be-informed-about-hazards/hazardous-substance-and-radiation-exposure/) `gov-be-ready-hazardous` | No date shown | Quoted (be-ready) | Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [Alerts and warnings](https://beready.campaign.gov.uk/be-ready-for-emergencies/alerts-and-warnings/) `gov-be-ready-alerts` | No date shown | Quoted (be-ready) | Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [BE READY CHECKLIST](https://beready.campaign.gov.uk/wp-content/uploads/sites/252/2026/10/Be-Ready-Checklist_English.pdf) `gov-be-ready-checklist-pdf` | No date shown (PDF metadata title 'National Resilience Checklist English', created/modified 15 October 2026) | Quoted (be-ready) | No phone or internet; Sheltering at home |
| UK Government (GOV.UK campaign: Be Ready), [HOUSEHOLD EMERGENCY PLAN](https://beready.campaign.gov.uk/wp-content/uploads/sites/252/2026/10/Be-Ready_Household_Emergency_Plan_English_Final.pdf) `gov-be-ready-household-plan-pdf` | No date shown (upload path 2026/10) | Quoted (be-ready) | Power cut; Storm; Snow, ice and cold; Sheltering at home; Leaving home at short notice |
| GOV.UK, [What to do before or during a flood - GOV.UK](https://www.gov.uk/help-during-flood) `govuk-help-during-flood` | No date shown | Quoted (govuk) | Flooding; Leaving home at short notice |
| GOV.UK, [What to do after a flood - GOV.UK](https://www.gov.uk/after-flood) `govuk-after-flood` | No date shown | Quoted (govuk) | Flooding |
| GOV.UK, [Prepare for flooding: Protect yourself from future flooding - GOV.UK](https://www.gov.uk/prepare-for-flooding) `govuk-prepare-for-flooding` | No date shown | Quoted (govuk) | Flooding |
| GOV.UK, [Prepare for flooding: Protect your property - GOV.UK](https://www.gov.uk/prepare-for-flooding/protect-your-property) `govuk-protect-property` | No date shown | Quoted (govuk) | Power cut; Flooding; Leaving home at short notice |
| Environment Agency (GOV.UK), [Flood alerts and warnings: what they are and what to do - GOV.UK](https://www.gov.uk/guidance/flood-alerts-and-warnings-what-they-are-and-what-to-do) `govuk-flood-alerts-warnings` | Published 1 November 2010 (no updated date shown) | Quoted (govuk) | Flooding; Leaving home at short notice |
| Environment Agency (GOV.UK), [Personal flood plan](https://www.gov.uk/government/publications/personal-flood-plan/personal-flood-plan) `ea-personal-flood-plan` | Published 1 July 2009, Last updated 15 November 2023 | Quoted (govuk) | Flooding; Leaving home at short notice |
| GOV.UK (DCMS, DSIT, DHSC, Home Office), [999 and 112: the UK's national emergency numbers - GOV.UK](https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers) `govuk-999-112` | Published 12 August 2021, Last updated 1 April 2025 | Quoted (govuk) | the number 112 or 112, in the United Kingdom |
| Ofcom, [Stay connected in severe weather](https://www.ofcom.org.uk/phones-and-broadband/vulnerable-customers/stay-connected-in-severe-weather) `ofcom-severe-weather` | Published 13 October 2026, Last updated 22 October 2026 | Quoted (ofcom) | No phone or internet |
| Met Office, [5 tips for staying safe in strong wind - Met Office](https://weather.metoffice.gov.uk/warnings-and-advice/seasonal-advice/stay-safe-in-strong-wind) `metoffice-strong-wind` | No date shown | Quoted (met-office) | Storm |
| Met Office, [10 things you should do now to prepare for winter - Met Office](https://weather.metoffice.gov.uk/warnings-and-advice/seasonal-advice/10-things-you-should-do-now-to-prepare-for-winter) `metoffice-winter-10` | No date shown | Quoted (met-office) | Snow, ice and cold |
| British Red Cross, [How to prepare for a power cut](https://www.redcross.org.uk/get-help/prepare-for-emergencies/power-cut) `redcross-power-cut` | Last updated 9 November 2026 | Not quoted (british-red-cross) | Power cut (pointer) |
| British Red Cross, [Prepare an emergency kit](https://www.redcross.org.uk/get-help/prepare-for-emergencies/prepare-an-emergency-kit) `redcross-emergency-kit` | Last updated 29 October 2026 | Not quoted (british-red-cross) | Snow, ice and cold (pointer); Heatwave (pointer); Leaving home at short notice (pointer) |
| British Red Cross, [Five tips to plan for emergencies](https://www.redcross.org.uk/get-help/prepare-for-emergencies/five-tips-to-plan-for-emergencies) `redcross-five-tips` | No date shown | Not quoted (british-red-cross) | Leaving home at short notice (pointer) |
| British Red Cross, [Prepare for a storm or thunderstorm](https://www.redcross.org.uk/get-help/prepare-for-emergencies/support-during-a-storm) `redcross-storm` | No date shown | Not quoted (british-red-cross) | Storm (pointer) |
| British Red Cross, [How to prepare your home for 72 hours in case of emergency](https://www.redcross.org.uk/get-help/prepare-for-emergencies/how-to-prepare-your-home-for-72-hours) `redcross-72-hours` | Last updated 30 October 2026 | Not quoted (british-red-cross) | Sheltering at home (pointer) |
| Ready.gov (FEMA), [Home Fires](https://www.ready.gov/home-fires) (US) `readygov-home-fires` | Last Updated: 02/26/2026 | Not quoted (ready-gov) | the number 911 in the United States (fact only) |
| European Commission, [112 - the EU's emergency phone number](https://digital-strategy.ec.europa.eu/en/policies/112) `eu-112` | Last update: 5 November 2026 | Quoted (european-commission) | the number 112 across the European Union; the number 112 in Switzerland and South Africa |
| Queensland Government, [Triple Zero (000)](https://www.qld.gov.au/emergency/emergencies-services/assistance/triple-000) `qld-triple-zero` | Last updated: 5 December 2014 | Quoted (queensland) | the number 000 in Australia |
| New Zealand Police, [111 Police Emergency](https://www.police.govt.nz/node/29262) `nz-police-111` | No date shown | Not quoted (nz-police) | the number 111 in New Zealand (fact only) |

### Where official guidance differs

- **Water**: Be Ready says "3 litres per person per day" for at least 3 days, and the
  templates use that figure. The British Red Cross and Ready.gov give figures of their
  own on their pages (linked above); they are not copied here.
- **The out-of-area contact** is not in the UK government's Be Ready pages or household
  plan. The plan has a switch to mark one; the "leaving home" template asks the question
  and points to the British Red Cross's planning tips.

### Left to the household

No official guidance was found for these in a source whose words may be shipped, so
the templates ask instead of answering:

- how to reach each other with no phone: a time and place, a radio channel (PMR446 or
  amateur), a note left at home; and when to listen;
- a word or sign that tells the household a message is really from one of them;
- a contact outside the area, a second meeting place outside the neighbourhood, and
  which rest centre to use (the official pages say to ask the local council);
- generators, and medicines that must be kept cold in a long power cut;
- which room to shelter in, and when to come out after sheltering at home;
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
personal flood plan is used.

### The number for the emergency services

The number differs by country, and each plan keeps its own, offered from the country
the device's language names (`en-GB`: 999) and changeable: 999 or 112 in the United
Kingdom, 112 across the European Union and in Switzerland and South Africa, 911 in the
United States, 000 in Australia, 111 in New Zealand. Each has its source above; the
words of a source are kept with its number only where its terms allow (999 and 112 in
the UK, 112 in Europe, 000 in Australia).

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
