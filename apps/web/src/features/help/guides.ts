/**
 * The guides under Help, and which page of docs/ each one is. This list is the one place that decides it.
 *
 * A guide's words are not here and are never copied: they are the page in docs/, read when the app is built
 * (apps/web/guides-plugin.ts), so the page in the repository and the guide inside Outpost cannot say different
 * things. Every page in docs/ is either a guide below or named in `NOT_GUIDES` with its reason;
 * `guides.test.ts` fails otherwise, so a new page cannot be left out without anyone deciding to.
 *
 * A guide that is a screen of its own (the set-up guide, drawn from packages/shared/src/setup-guide.ts) has
 * `own`, and either a route of its own in app.tsx or a `page` to draw at /help/<slug>. A new one is one entry here.
 *
 * Plain data and type-only imports: the build reads this file with Node as it stands.
 */
import type { ComponentType } from "react";

export type GuideGroupId = "running" | "looking-after" | "using" | "how-it-works" | "developers";

export interface GuideGroup {
  id: GuideGroupId;
  title: string;
  /** Folded away until asked for. */
  closed?: boolean;
  about?: string;
}

export const GUIDE_GROUPS: GuideGroup[] = [
  { id: "running", title: "Getting it running" },
  { id: "looking-after", title: "Looking after it" },
  { id: "using", title: "Using it" },
  { id: "how-it-works", title: "How it works and where things come from" },
  {
    id: "developers",
    title: "For developers",
    closed: true,
    about: "For people changing Outpost's code. Nothing here is needed to install or use it.",
  },
];

export interface Guide {
  /** Its address is /help/<slug>. */
  slug: string;
  /** The page of docs/ it is, relative to docs/. */
  file: string;
  group: GuideGroupId;
  /** One sentence: what a person reads it for. */
  about: string;
  /** Everyday words the quick search finds it by, besides its title and its sections. */
  keywords?: string;
  /** The screen it describes, offered at the top of the guide. */
  opens?: { to: string; label: string };
  /** A screen of its own rather than the page drawn from Markdown (see the top of this file). */
  own?: true;
  /** For an `own` guide with no route of its own in app.tsx: the screen, drawn at /help/<slug>. */
  page?: () => Promise<{ default: ComponentType }>;
}

export const GUIDES: Guide[] = [
  // Getting it running
  {
    slug: "deployment",
    file: "deployment.md",
    group: "running",
    about: "Installing Outpost with Docker or without it, moving it to a Raspberry Pi, letting phones on your network use it, and HTTPS.",
    keywords: "install deploy deployment raspberry pi docker compose set up setup move nas hotspot update",
    opens: { to: "/settings#access", label: "Open Who can use it in Settings" },
  },
  {
    slug: "search-and-answers",
    file: "setup-guide.md",
    group: "running",
    own: true,
    about: "Setting up search by meaning, and answers and chat with a language model you run yourself.",
    keywords: "ollama model language ai semantic embeddings install",
  },
  {
    slug: "which-model",
    file: "which-model.md",
    group: "running",
    own: true,
    about: "Which language model to use on a Raspberry Pi or a Mac, from seven tried here at answering and at looking things up.",
    keywords: "model which model choose llm ollama pi raspberry compare tried measured tools look up",
    page: () => import("@/features/chat/which-model-page"),
  },
  {
    slug: "portable",
    file: "portable.md",
    group: "running",
    about: "Making a USB drive that runs Outpost on another computer, and bringing back what was written on it.",
    keywords: "usb stick drive take it with you portable copy",
    opens: { to: "/storage", label: "Open Storage" },
  },
  // Looking after it
  {
    slug: "downloads-and-tasks",
    file: "downloads-and-tasks.md",
    group: "looking-after",
    about: "What is downloading and what Outpost is working on, how fast, about how long is left, and what happened.",
    keywords: "downloads tasks jobs background work progress queue paused failed retry",
    opens: { to: "/downloads", label: "Open Downloads and tasks" },
  },
  {
    slug: "storage",
    file: "storage.md",
    group: "looking-after",
    about: "Where Outpost keeps things, using drives and network shares, moving collections, and backing up and restoring.",
    keywords: "disk drive nas share usb backup restore space move",
    opens: { to: "/storage", label: "Open Storage" },
  },
  {
    slug: "device",
    file: "device.md",
    group: "looking-after",
    about: "How the server is doing, putting its clock right, reaching a Pi as outpost.local, and Prometheus and Grafana.",
    keywords: "status health temperature sd card clock time wrong mdns avahi outpost.local prometheus grafana metrics",
    opens: { to: "/settings/status", label: "Open Server status" },
  },
  {
    slug: "updating",
    file: "updating.md",
    group: "looking-after",
    about: "Updating Outpost from the app or from a release file on a USB stick, and what each kind of installation allows.",
    keywords: "update upgrade new version release usb stick offline install roll back",
    opens: { to: "/settings#updates", label: "Open Settings, Updates" },
  },
  {
    slug: "troubleshooting",
    file: "troubleshooting.md",
    group: "looking-after",
    about: "The messages Outpost shows when something is wrong, each with what it means and what to do.",
    keywords: "problem error broken fix not working help stuck",
  },
  {
    slug: "security",
    file: "security.md",
    group: "looking-after",
    about: "What Outpost protects against and what it does not, with no accounts, and how to make an installation safer.",
    keywords: "safe private protect password access network threat",
    opens: { to: "/settings#access", label: "Open Who can use it in Settings" },
  },
  // Using it
  {
    slug: "search",
    file: "search.md",
    group: "using",
    about: "What the search box understands, how results are ranked, and search by meaning.",
    keywords: "find look up results semantic",
    opens: { to: "/search", label: "Open Search" },
  },
  {
    slug: "answers",
    file: "ai.md",
    group: "using",
    about: "Answers from your own library, and chat, with a language model of your own: what is sent where, and what is kept.",
    keywords: "ai language model chat ollama llm answer",
    opens: { to: "/chat", label: "Open Chat" },
  },
  {
    slug: "mcp",
    file: "mcp.md",
    group: "using",
    about: "Letting other programs on the home network, such as Claude Code or VS Code, use the tools a model may look things up with.",
    keywords: "mcp model context protocol tools claude code vs code llm look up",
    opens: { to: "/settings#tools", label: "Open Looking things up in Settings" },
  },
  {
    slug: "library",
    file: "library.md",
    group: "using",
    about: "The document library, audiobooks, and the PDFs Outpost makes and adds to it.",
    keywords: "documents books pdf audiobooks files",
    opens: { to: "/library", label: "Open Library" },
  },
  {
    slug: "epub",
    file: "epub.md",
    group: "using",
    about: "Reading EPUB books in Outpost, and what the reader leaves out.",
    keywords: "ebook book reader",
    opens: { to: "/library", label: "Open Library" },
  },
  {
    slug: "learning",
    file: "learning.md",
    group: "using",
    about: "Learning progress: where each learner got to in a course such as Khan Academy.",
    keywords: "school course lessons children khan progress",
    opens: { to: "/library", label: "Open Library" },
  },
  {
    slug: "notes",
    file: "notes-and-imports.md",
    group: "using",
    about: "Writing pages in Notes, importing from Markdown and Notion, and saving web pages.",
    keywords: "pages write import notion markdown web page",
    opens: { to: "/notes", label: "Open Notes" },
  },
  // The two quick starts, for the rest of the household; each is offered on its screens the first time they open.
  {
    slug: "map-quick-start",
    file: "map-quick-start.md",
    group: "using",
    about: "Find a place, read the height and grid reference, print a map, and check line of sight and radio range, step by step.",
    keywords: "map quick start beginner how do i grid reference height print line of sight range first time",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "radio-quick-start",
    file: "radio-quick-start.md",
    group: "using",
    about: "Find something to listen to, the frequency sheets, repeaters, and a message by mesh radio, step by step.",
    keywords: "radio quick start beginner how do i frequencies listen repeaters mesh message first time",
    opens: { to: "/radio", label: "Open Radio" },
  },
  {
    slug: "maps",
    file: "maps.md",
    group: "using",
    about: "Downloading map regions, contour lines, printing, routes and tracks, and where the map data comes from.",
    keywords: "map offline region route gpx print contour",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "map-routes",
    file: "map-routes.md",
    group: "using",
    about: "Drawing, recording, finding and importing routes and tracks on the map, and GPX, KML and GeoJSON files.",
    keywords: "route track gpx kml geojson record walk draw find route overpass",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "road-routes",
    file: "road-routes.md",
    group: "using",
    about:
      "Planned road directions offline: main roads, junctions and signs, via points and Channel crossings, from road networks you install.",
    keywords: "road route drive directions motorway junction ferry eurotunnel channel crossing sat nav",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "map-printing",
    file: "map-printing.md",
    group: "using",
    about: "Printing part of the map as a one-page PDF at a true scale.",
    keywords: "print pdf paper map scale a4 a3",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "map-imagery",
    file: "map-imagery.md",
    group: "using",
    about: "Downloading satellite imagery and aerial photographs to see under the map.",
    keywords: "satellite imagery aerial photograph sentinel nasa",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "reference-layers",
    file: "reference-layers.md",
    group: "using",
    about: "The layers of published data on the map: boundaries, places, hospitals, shelters and more.",
    keywords: "layers map boundaries hospitals shelters",
    opens: { to: "/maps", label: "Open Maps" },
  },
  {
    slug: "contacts",
    file: "contacts.md",
    group: "using",
    about: "Keeping the people and places to reach when the phones are down.",
    keywords: "address book people phone numbers",
    opens: { to: "/contacts", label: "Open Contacts" },
  },
  {
    slug: "messages",
    file: "messages.md",
    group: "using",
    about: "The household board: messages, check-ins and sending a file from one phone to another.",
    keywords: "board check in send file household",
    opens: { to: "/messages", label: "Open Messages" },
  },
  {
    slug: "mesh-radio",
    file: "mesh-radio.md",
    group: "using",
    about: "Carrying the board beyond the Wi-Fi through a LoRa radio (Meshtastic or MeshCore). Not yet tried with a real radio.",
    keywords: "meshtastic meshcore lora mqtt radio",
    opens: { to: "/settings#mesh", label: "Open Mesh radio in Settings" },
  },
  {
    slug: "heard-on-the-radio",
    file: "heard-on-the-radio.md",
    group: "using",
    about:
      "APRS stations, aircraft and ships your own receivers hear, on the map and in a list. Listening only. Not yet tried with a real radio.",
    keywords: "aprs ads-b aircraft ships ais dire wolf receiver sdr range",
    opens: { to: "/radio/heard", label: "Open Heard on the radio" },
  },
  {
    slug: "encryption",
    file: "encryption.md",
    group: "using",
    about: "Encrypting text, files and pages with OpenPGP keys, and the pencil-and-paper ciphers.",
    keywords: "pgp encrypt decrypt keys cipher",
    opens: { to: "/encryption", label: "Open Encryption" },
  },
  {
    slug: "radio",
    file: "radio.md",
    group: "using",
    about: "The radio reference sheets, the handbook and radio guides, repeaters and the radio tools on the map.",
    keywords: "ham amateur repeaters sheets",
    opens: { to: "/radio", label: "Open Radio" },
  },
  {
    slug: "frequencies",
    file: "radio-frequencies.md",
    group: "using",
    about: "Where to tune to hear the time, news, warnings and weather when the internet is out.",
    keywords: "listen shortwave broadcast scanner",
    opens: { to: "/radio/frequencies", label: "Open Frequencies to listen to" },
  },
  {
    slug: "radio-licences",
    file: "radio-licences.md",
    group: "using",
    about: "What you may listen to, what is licence-free, and what needs an amateur licence, from Ofcom and the FCC.",
    keywords: "ham callsign scanner airband ads-b ais pmr446 legal listen transmit",
    opens: { to: "/settings#radio-licence", label: "Open Radio licence in Settings" },
  },
  {
    slug: "satellites",
    file: "satellites.md",
    group: "using",
    about: "Passes of the amateur, weather and crewed satellites over Home, where they are now, and Doppler.",
    keywords: "satellite iss pass orbit doppler sgp4 tle amsat noaa",
    opens: { to: "/radio/satellites", label: "Open Satellites" },
  },
  {
    slug: "hf-propagation",
    file: "hf-propagation.md",
    group: "using",
    about: "Predicting how well a shortwave signal gets from one place to another, and communication plans.",
    keywords: "voacap band conditions shortwave",
    opens: { to: "/radio/propagation", label: "Open HF propagation" },
  },
  {
    slug: "morse",
    file: "morse-trainer.md",
    group: "using",
    about: "Learning Morse code by ear and by hand.",
    keywords: "cw code learn",
    opens: { to: "/radio/morse", label: "Open Morse trainer" },
  },
  {
    slug: "tools",
    file: "tools.md",
    group: "using",
    about: "The calculators for water, the outdoors, radio, building and cooking, and where each formula comes from.",
    keywords: "calculators water cooking building",
    opens: { to: "/tools", label: "Open Tools" },
  },
  {
    slug: "power",
    file: "tools-power.md",
    group: "using",
    about: "Battery runtime, solar charging and power plans for a power cut.",
    keywords: "battery solar generator power cut",
    opens: { to: "/tools/power", label: "Open Power and batteries" },
  },
  {
    slug: "compass",
    file: "tools-compass.md",
    group: "using",
    about: "Magnetic and grid north for a place, and the phone's own compass.",
    keywords: "declination north bearing",
    opens: { to: "/tools/compass", label: "Open Compass" },
  },
  {
    slug: "solar-clock",
    file: "tools-solar-clock.md",
    group: "using",
    about: "Telling the time from the sun and the stars.",
    keywords: "sundial time stars",
    opens: { to: "/tools/solar-clock", label: "Open Solar clock" },
  },
  {
    slug: "tides",
    file: "tides.md",
    group: "using",
    about: "High and low water at the tide stations near a place, worked out with no internet.",
    keywords: "tide high water low water coast sea harbour",
    opens: { to: "/tools/tides", label: "Open Tide times" },
  },
  {
    slug: "night-sky",
    file: "night-sky.md",
    group: "using",
    about: "The Moon tonight, a chart of the stars and planets, and finding north by the stars.",
    keywords: "stars moon planets constellations polaris",
    opens: { to: "/tools/night-sky", label: "Open Night sky" },
  },
  {
    slug: "celestial-navigation",
    file: "celestial-navigation.md",
    group: "using",
    about: "A position from sextant sights, with the almanac worked out on the device.",
    keywords: "sextant sight fix latitude longitude almanac",
    opens: { to: "/tools/celestial-navigation", label: "Open Celestial navigation" },
  },
  {
    slug: "garden",
    file: "garden.md",
    group: "using",
    about: "What to sow, plant and harvest this month, your last frost, and the record of sowings.",
    keywords: "vegetables sow harvest frost",
    opens: { to: "/tools/garden", label: "Open Garden" },
  },
  {
    slug: "qr-and-network",
    file: "tools-qr-and-network.md",
    group: "using",
    about: "Making QR codes, and listing the devices on your network.",
    keywords: "qr wifi network scan devices",
    opens: { to: "/tools/qr", label: "Open QR codes" },
  },
  {
    slug: "households",
    file: "households.md",
    group: "using",
    about: "Households and the people in each: fixed and portable homes, someone in several, and which household is current.",
    keywords: "household people family members pets caravan second home portable current switch",
    opens: { to: "/prepare/households", label: "Open Households" },
  },
  {
    slug: "supplies",
    file: "supplies.md",
    group: "using",
    about: "Keeping stored food and water, and how many days they last.",
    keywords: "food water stores pantry",
    opens: { to: "/prepare/supplies", label: "Open Supplies" },
  },
  {
    slug: "emergency-plans",
    file: "emergency-plans.md",
    group: "using",
    about: "A household's own plans for a power cut, a flood, leaving at short notice and more, with cards to print.",
    keywords: "plan flood power cut grab bag",
    opens: { to: "/prepare/plans", label: "Open Emergency plans" },
  },
  {
    slug: "readiness",
    file: "readiness.md",
    group: "using",
    about: "Check-ins and the roll call, the log of events, routine checks, and the offline drill.",
    keywords: "check in roll call log of events routine checks overdue offline drill",
    opens: { to: "/prepare/check-in", label: "Open Check-in and roll call" },
  },
  {
    slug: "household-papers",
    file: "household-papers.md",
    group: "using",
    about: "Medical sheets, the communication plan and grab cards: the household's papers, kept current and printed in the household book.",
    keywords: "medical medicines allergies pace communication plan grab card wallet card binder",
    opens: { to: "/prepare/medical", label: "Open Medical sheets" },
  },
  {
    slug: "household-book",
    file: "household-book.md",
    group: "using",
    about: "A few questions about the household, and a printable book made from the answers and from what Outpost holds.",
    keywords: "household book emergency book wizard first aid journeys checklists",
    opens: { to: "/prepare/book", label: "Open Household book" },
  },
  {
    slug: "weather",
    file: "weather.md",
    group: "using",
    about: "Forecasts, warnings and river levels kept for reading with no connection, and the barometer log.",
    keywords: "forecast flood warnings river levels barometer",
    opens: { to: "/prepare/weather", label: "Open Weather and hazards" },
  },
  {
    slug: "nuclear",
    file: "nuclear-preparedness.md",
    group: "using",
    about: "The nuclear preparedness workspace, built only from public information, and what it rests on.",
    keywords: "radiation fallout shelter",
    opens: { to: "/prepare/nuclear", label: "Open Nuclear preparedness" },
  },
  {
    slug: "games",
    file: "games.md",
    group: "using",
    about: "The small games, and what each one keeps.",
    keywords: "play puzzles children",
    opens: { to: "/games", label: "Open Games" },
  },
  // How it works and where things come from
  {
    slug: "offline",
    file: "offline.md",
    group: "how-it-works",
    about: "What works with no internet, what needs it, how Outpost keeps from reaching out, and a checklist before you leave.",
    keywords: "internet no connection away phone kept checklist",
    opens: { to: "/kept", label: "Open what is kept on this device" },
  },
  {
    slug: "sources",
    file: "sources.md",
    group: "how-it-works",
    about: "Where everything in the catalogue comes from, the terms each publisher gives, and what may be shared.",
    keywords: "licence license terms copyright attribution share catalogue",
    opens: { to: "/explore", label: "Open Explore" },
  },
  {
    slug: "testing-status",
    file: "testing-status.md",
    group: "how-it-works",
    about: "What has not yet been tried with real hardware, real data or a real browser, by feature.",
    keywords: "tested untested tried untried limits known gaps",
  },
  // For developers
  { slug: "architecture", file: "architecture.md", group: "developers", about: "How the parts of Outpost fit together, and why." },
  { slug: "api", file: "api.md", group: "developers", about: "Every route the server answers, with what it takes and gives." },
  { slug: "server-modules", file: "development/server-modules.md", group: "developers", about: "Writing a module of the server." },
  { slug: "web-screens", file: "development/web-screens.md", group: "developers", about: "Building a screen of the web app." },
  {
    slug: "design-quality",
    file: "development/design-quality.md",
    group: "developers",
    about: "The checklist a screen is held to, the shared part for each need, and the audit of the app's frame.",
  },
  {
    slug: "households-development",
    file: "development/households.md",
    group: "developers",
    about: "Several households, the current one, people, and how a feature becomes per household.",
  },
  {
    slug: "printed-pages",
    file: "development/printed-pages.md",
    group: "developers",
    about: "Laying out a printed PDF with the print kit.",
  },
  {
    slug: "maps-on-a-phone",
    file: "development/maps-on-a-phone.md",
    group: "developers",
    about: "What a study of the Maps screen on an iPhone found, and what was done about it.",
  },
  {
    slug: "offline-audit",
    file: "development/offline-audit.md",
    group: "developers",
    about: "What each screen needs from outside, and what it says when that is missing.",
  },
  {
    slug: "releases",
    file: "development/releases.md",
    group: "developers",
    about: "Making and signing a release, and how an update is installed.",
  },
  {
    slug: "propagation-development",
    file: "development/propagation.md",
    group: "developers",
    about: "How the HF propagation engines and the Morse trainer are built, checked and rebuilt.",
  },
  {
    slug: "encryption-and-contacts",
    file: "development/encryption-and-contacts.md",
    group: "developers",
    about: "How encryption, encrypted pages, vCard reading and the address book for phones are built.",
  },
  {
    slug: "library-and-games",
    file: "development/library-and-games.md",
    group: "developers",
    about: "How the library, notes, audiobooks, PDFs, the EPUB reader, learning progress and games are built.",
  },
  {
    slug: "storage-and-https",
    file: "development/storage-and-https.md",
    group: "developers",
    about: "The protected backup file format, storage and HTTPS internals, and the variables only the tests use.",
  },
  {
    slug: "tools-development",
    file: "development/tools.md",
    group: "developers",
    about: "How the calculators, compass, solar clock, QR encoder and network scan are built.",
  },
  {
    slug: "answers-and-search-internals",
    file: "development/answers-and-search.md",
    group: "developers",
    about: "How answers, Chat's tools, MCP, search by meaning and OCR work inside, and how to run the model evaluations.",
  },
  {
    slug: "development-maps",
    file: "development/maps.md",
    group: "developers",
    about: "How the map's parts work, its own map and route sources, and its constants.",
  },
  {
    slug: "development-road-routes",
    file: "development/road-routes.md",
    group: "developers",
    about:
      "How road networks are built and joined, how routes and directions are worked out, the speed table, measurements and the API shapes.",
  },
  {
    slug: "radio-development",
    file: "development/radio.md",
    group: "developers",
    about: "Repeater sources, the radio sheets and frequency data, the LogBook73 importer, and the mesh radio broker.",
  },
  {
    slug: "preparedness-internals",
    file: "development/preparedness.md",
    group: "developers",
    about: "How the reference layers, the nuclear effects model and the preparedness screens work inside.",
  },
  {
    slug: "worldwide",
    file: "development/worldwide.md",
    group: "developers",
    about: "Where Outpost assumed the United Kingdom, and what each screen does elsewhere.",
  },
];

/** Pages of docs/ that are deliberately not guides, each with the reason. Keep it short. */
export const NOT_GUIDES: Record<string, string> = {};

/** The address of a guide. */
export const guidePath = (slug: string) => `/help/${slug}`;

/** The repository, for a link to a file that is not a guide. It needs the internet. */
export const REPOSITORY = "https://github.com/tyleruk2000/outpost";
