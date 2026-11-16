import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Page, PageHeader, Rows } from "@/components/page";

/** The radio tools Outpost has, in one place. Each row is a tool; a new one is one more row. */
const TOOLS = [
  {
    to: "/radio/propagation",
    name: "HF propagation",
    about:
      "Predict how a shortwave signal gets between two places through the day, across the bands, with your power and antennas. Includes short, steep (NVIS) paths.",
  },
  {
    to: "/radio/coverage",
    name: "HF coverage",
    about:
      "Where one transmitter is predicted to be heard, as a layer over the offline map: the engine asked about every cell of a grid, hour by hour.",
  },
  {
    to: "/radio/plans",
    name: "Communication plans",
    about:
      "Several stations, and for each pair of them which band is predicted to serve at which hour, with a primary and an alternate. Written out as a PDF or as Markdown to print and carry.",
  },
  {
    to: "/radio/log",
    name: "Contact log",
    about:
      "What actually happened on the air, typed in or imported from an ADIF file, and set beside what the engine predicted for the same paths.",
  },
  {
    to: "/radio/repeaters",
    name: "Repeaters",
    about:
      "Lists of repeaters you have brought in, and entries of your own: by band, mode and distance from a place, on the map, and written out for programming a radio.",
  },
  {
    to: "/maps",
    name: "Line of sight, on the map",
    about: "Whether two points can see each other over the terrain installed, for VHF and above. Geometry, not a prediction of signal.",
  },
  {
    to: "/maps",
    name: "Maidenhead locators, on the map",
    about: "A locator grid over the map, and locators understood in the map's search.",
  },
  {
    to: "/explore?category=radio",
    name: "Band plans, frequencies and guides",
    about: "The reference sheets, the handbook and the radio guides that ship with Outpost, in Explore.",
  },
];

export default function RadioPage() {
  return (
    <Page width="reading">
      <PageHeader title="Radio" description="Tools for planning radio contacts. Everything here works with no connection." />
      <Rows className="border-y border-border">
        {TOOLS.map((tool) => (
          <li key={tool.name}>
            <Link
              to={tool.to}
              className="group flex items-center gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lead text-ink group-hover:text-primary">{tool.name}</span>
                <span className="mt-0.5 block text-small text-ink-muted">{tool.about}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
            </Link>
          </li>
        ))}
      </Rows>
      <p className="mt-6 text-small text-ink-muted">
        Nothing here says which frequencies you may transmit on. That is set by your licence; the band sheets in the library give the
        limits.
      </p>
    </Page>
  );
}
