# Nuclear preparedness

**Preparedness → Nuclear preparedness** is a workspace over the offline map for civil
preparedness and education, built only from public, published information. Its reference
layers are described in [reference-layers.md](reference-layers.md), the plans it uses in
[emergency-plans.md](emergency-plans.md).

## The module's rules

It is about effects, preparedness and published history, and holds to these rules:

1. Nothing about how weapons are designed, built, obtained or delivered.
2. Historical records, mapped infrastructure and hypothetical scenarios are kept apart,
   each with its own mark and words.
3. Mapped infrastructure is never labelled, scored, ranked or filtered as a target, and
   no probability of attack is given. A scenario never lists or counts mapped features
   inside a ring, and never suggests a ground zero.
4. Results are educational estimates, not forecasts or instructions: no casualty
   figures, and nothing added up across rings or scenarios.
5. Ground zeros are only where you put them: pressed, typed, or one of your saved places.
6. Official guidance is quoted and dated; where it says nothing, you are asked a
   question. Outpost gives no advice of its own.
7. Nothing leaves the device but a download you pressed for. Scenarios are in backups
   and go with Erase everything.

## The effects simulator

Give a place (pressed, a saved place, or typed), a yield, a burst (on the surface, at a
height, or the height that carries a chosen overpressure farthest), a wind for fallout,
and a name. The answer is worked out at once on the device.

Every result carries: "An educational estimate from a published model for an idealised
case: flat ground at sea level, a standard atmosphere, clear air, and no buildings or
hills. It is not a forecast and not instructions. Distances are rounded to two
significant figures because the model is no more precise than that."

**The source**: Samuel Glasstone and Philip J. Dolan (eds), *The Effects of Nuclear
Weapons*, third edition, US Department of Defense and Energy Research and Development
Administration, 1977, a US Government work.

| Effect | What is shown | Range of the model |
| --- | --- | --- |
| Blast | Rings at 20, 10, 5, 2 and 1 psi, each described in the book's words (houses at 5 psi "almost completely destroyed"; windows at 0.5 to 1 psi) | Bursts up to 40,000 ft |
| Heat | Distances for second- and third-degree burns and exposures of 3 to 50 cal/cm² | 1 kiloton to 10 megatons, bursts below 15,000 ft; no first-degree burns |
| Initial radiation | Rings at 600 and 100 rads | Reliable "within a factor of 0.5 to 2" (fission) or "0.25 to 1.5" (thermonuclear) |
| Fireball | Radius | |
| Crater | The range across soils and rock | Surface bursts only |
| Fallout | The idealised dose-rate pattern for a steady wind: the map draws 1,000, 100, 10 and 1 rads per hour, the panel all eight levels | Surface bursts only; wind 13 to 72 km/h (8 to 45 mph) |

Real fallout never follows a steady wind; in the book's words the pattern "will
undoubtedly underestimate the fallout in some locations and overestimate it in others".

### Limitations

Listed on the screen under "How this is worked out" and in every PDF and Markdown file:
the idealised conditions; read-off error of a few per cent, and the book's own figures
differing by a few per cent; no casualty figures; the radiation curves' reliability and
the greater effect of neutrons; fallout's hot spots, wind shear, rain and decay; and
where the book draws no curve, nothing is given.

## The workspace

The map has a panel beside it (under it on a phone) with the tabs **Scenario**, **Saved**,
**Layers**, **Records** and **Plans**.

### Several scenarios

Up to **six** scenarios are on the map at once, lettered A to F. A press moves the
selected one, drawn at full strength; the others are fainter. Each can be hidden, removed
or saved, and those on the map can be saved together as a **set**. If one was saved
elsewhere since you opened it, choose **Keep my version** or **Load the other version**.

Each kind of effect has one colour everywhere; a stronger level is more opaque. No ring is
red or green: no line marks danger or safety. Every line also carries its dashes, letter,
level and distance, so a grey copy reads the same.

### Layers and records

The **Layers** tab is the Maps screen's reference layers. The **Records** tab lists
historical records you have imported, by period and name; none ships
([reference-layers.md](reference-layers.md#historical-records)).

### People inside a ring

With a WorldPop grid installed, each ring of the selected scenario says how many people
the grid counts inside it: "About 220,000 people live inside this ring, by WorldPop's
2020 estimate. This is who lives there, not a prediction of harm." Counts are rounded to
two significant figures. A ring smaller than four grid cells, or less than half inside
the grid, gets no count; one partly inside is counted for the part covered and says so.
The fallout pattern gets no count. With no grid for the rings, the section says so and
offers **Add population density for** the country the rings are in, which opens Add a place
on Offline maps with Population density ticked.

### The wind

Give the direction the wind blows **from** and its speed; one line says whether the
pattern is drawn or why not. Where Weather and hazards holds a forecast within 50 km, its
wind for the nearest hour is offered. That is the wind 10 m above one place; fallout is
carried by the winds at every height up to the top of the cloud.

Your saved places are shown with their distance from the selected ground zero and which
rings they are inside.

### On paper

**Make the PDF** (or **Markdown**) writes every scenario shown with its figures, what
each level means, notes, limitations and source, without people counts. With **Maps in
the PDF** on, each has maps of its rings and fallout, never with reference layers. Saved
places are drawn only if you tick **Show my saved places on the maps**, off each time
because the PDF may be shared.

## Personal planning

A plan for a radiation emergency is an emergency plan, made from the **"Radiation
emergency"** template and used, printed and reviewed on the emergency plans screens. The
**Plans** tab gathers:

- **Plans for a radiation emergency**; one press makes a new one.
- **A scenario as an illustration**: attach a saved scenario to a plan; it shows the rings
  and caveat, and none of the plan's steps changes.
- **Places that matter**: the distances between your saved places.
- **Supplies for staying in**: your days of food and water against Be Ready's 3 days and
  UKHSA's "one to two days", longer if a release goes on.

### The radiation emergency template

Its words are the UK Health Security Agency's guidance on GOV.UK, under the Open
Government Licence v3.0, checked word for word against the pages as read on 16 November
2026.

| Source | Page's own date | Verdict | Used for |
| --- | --- | --- | --- |
| UKHSA, [What to do in a radiation emergency](https://www.gov.uk/government/publications/radiation-emergencies-information-for-the-public/what-to-do-in-a-radiation-emergency) | Updated 10 September 2024 | Quoted | Go in, stay in, tune in; the room, vents; children, pets, medication, stable iodine, food and water, evacuation, coming back |
| UKHSA, [How to remove radioactive material from your skin and clothes](https://www.gov.uk/government/publications/radiation-emergencies-information-for-the-public/how-to-remove-radioactive-material-from-your-skin-and-clothes-self-decontamination-guidance) | Updated 10 September 2024 | Quoted | Taking off and bagging outer clothes, washing, clean clothes |
| Be Ready (Cabinet Office), household emergency plan | No date shown | Quoted | Water for 3 days, food, radio, torch, medication, alerts |
| Ready.gov (FEMA), [Radiation Emergencies](https://www.ready.gov/radiation) | 7 January 2025 | Pointed to, not quoted (terms not cleared for Ready.gov) | One pointer step |
| ICRP, IAEA, council REPPIR leaflets | | Not used (permission needed, nothing for households, or no licence stated) | A question asks you to ask your council |

**For the household to decide**: which room is nearest the middle of the home; which
building near school, work or a usual route you would go into; what the children's school
will do; which radio station, and who keeps the radio; whether you live or work near a
nuclear site (ask the council); and, since the UK guidance is for incidents such as one at
a nuclear site and says nothing of a nuclear explosion's blast, heat or flash, what if
anything you would do differently.

## What is not built, and why

- **Casualty figures**, figures across scenarios, and features counted inside a ring:
  ruled out.
- **Winds aloft**: no offline source.
- **Sets attached to plans**: a plan holds single scenarios.

How the models were read and checked, for developers:
[development/preparedness.md](development/preparedness.md).
