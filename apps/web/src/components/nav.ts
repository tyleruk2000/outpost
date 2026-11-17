/**
 * Every screen of the app and where it belongs: the one description the navigation is
 * drawn from. The desktop sidebar, the phone's bottom bar and More sheet, the quick
 * search's "Go to" list and the "g then a letter" shortcuts all read these two lists, so
 * a screen added here is in all of them. A screen reached from inside another (How
 * search works, from Search) is a child of that screen: the sidebar shows it indented
 * under its parent, the More sheet the same, and the parent screen links to it near its
 * top (`ScreensUnder`). `nav.test.ts` fails if a route in app.tsx is missing from here.
 */
import {
  AudioWaveform,
  BookMarked,
  BookOpen,
  ClipboardList,
  Compass,
  Contact,
  Download,
  FolderInput,
  Grid3x3,
  HardDrive,
  Home,
  LifeBuoy,
  ListChecks,
  ListTree,
  LockKeyhole,
  type LucideIcon,
  Map as MapIcon,
  MessageSquareText,
  MessagesSquare,
  NotebookText,
  Puzzle,
  Radio,
  RadioReceiver,
  RadioTower,
  Search,
  Settings,
  ShieldCheck,
  Undo2,
  Waves,
  Waypoints,
  Wrench,
} from "lucide-react";
import { gameScreens } from "@/features/games/screens";
import { DeviceIcon, ON_THIS_DEVICE } from "@/features/kept/device";
import { prepareScreens } from "@/features/prepare/screens";
import { toolScreens } from "@/features/tools/screens";

/** A screen reached from inside another one. */
export interface ChildScreen {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Other names the quick search finds it by: "patience klondike" for Solitaire. */
  keywords?: string;
}

export interface NavItem extends ChildScreen {
  /** Shortcut after "g", e.g. "g then h" for Home. */
  key: string;
  /** The screens reached from inside this one, in the order its screen lists them. */
  children?: ChildScreen[];
}

/*
 * Every name below is the screen's own title (its h1), so that the sidebar, the More sheet and the
 * screen agree; Home's title is "Your library", a sentence about it, and a guide's is a sentence.
 * `keywords` are the everyday words people type into the quick search for a screen: "food" for
 * Supplies, "wifi" for QR codes. A word no screen answers ("torch") is left to the library search.
 */

/**
 * Where people read, write and find things. The four of the phone's bottom bar come first, in its order (Home,
 * Library, Maps, Notes), with Search, as they are used most; the tree of pages follows the whole list in the sidebar.
 */
export const knowledgeNav: NavItem[] = [
  { to: "/", label: "Home", icon: Home, key: "h", keywords: "start" },
  {
    // The full screen, with every result and the filters. The field above it in the sidebar is "Quick search".
    to: "/search",
    label: "Search",
    icon: Search,
    key: "s",
    keywords: "find look up results",
    children: [{ to: "/search/how-it-works", label: "How search works", icon: Waypoints, keywords: "ranking explain why found" }],
  },
  {
    to: "/library",
    label: "Library",
    icon: BookOpen,
    key: "l",
    keywords: "documents books ebooks pdf files reading audiobooks learning school course lessons progress khan upload",
  },
  { to: "/maps", label: "Maps", icon: MapIcon, key: "m", keywords: "map offline places routes gps location directions print sun times" },
  // Importing brings in pages (Markdown, Notion), so it is Notes'.
  {
    to: "/notes",
    label: "Notes",
    icon: NotebookText,
    key: "n",
    keywords: "pages write notebook journal diary",
    children: [{ to: "/import", label: "Import", icon: FolderInput, keywords: "import files markdown notion obsidian" }],
  },
  {
    to: "/explore",
    label: "Explore",
    icon: Compass,
    key: "e",
    keywords: "catalogue download collections wikipedia encyclopedia kiwix books get more",
  },
  { to: "/chat", label: "Chat", icon: MessagesSquare, key: "c", keywords: "ask model questions answers ai assistant" },
  // "a" for address book: "c" is Chat's.
  { to: "/contacts", label: "Contacts", icon: Contact, key: "a", keywords: "address book people phone numbers email family friends" },
  // The household board (features/board). "w" for the board on the wall: "m" is Maps'.
  {
    to: "/messages",
    label: "Messages",
    icon: MessageSquareText,
    key: "w",
    keywords: "message board note to family household check in safe send a file",
  },
  {
    to: "/encryption",
    label: "Encryption",
    icon: LockKeyhole,
    key: "k",
    keywords: "encrypt decrypt pgp keys cipher one-time pad secret message private",
  },
  {
    to: "/radio",
    label: "Radio",
    icon: RadioTower,
    key: "r",
    keywords: "ham amateur",
    // The radio tools, in the order the Radio screen lists them.
    children: [
      { to: "/radio/propagation", label: "HF propagation", icon: Waves, keywords: "band conditions voacap shortwave" },
      { to: "/radio/coverage", label: "HF coverage", icon: Grid3x3, keywords: "range reach map" },
      { to: "/radio/plans", label: "Communication plans", icon: ListTree, keywords: "comms channels schedule net" },
      { to: "/radio/log", label: "Contact log", icon: ClipboardList, keywords: "logbook qso adif" },
      { to: "/radio/repeaters", label: "Repeaters", icon: RadioReceiver, keywords: "repeater callsign" },
      { to: "/radio/morse", label: "Morse trainer", icon: AudioWaveform, keywords: "cw code learn" },
      {
        to: "/radio/frequencies",
        label: "Frequencies to listen to",
        icon: Radio,
        keywords: "frequency scanner shortwave broadcast channels listen pmr cb",
      },
    ],
  },
  // Two sections that are lists of screens, each drawn from its own registry (features/<section>/screens.ts).
  // "o" for tOols and "y" for readY: the obvious letters are taken.
  { to: "/tools", label: "Tools", icon: Wrench, key: "o", keywords: "calculators", children: toolScreens },
  { to: "/prepare", label: "Preparedness", icon: ShieldCheck, key: "y", keywords: "prepare emergency", children: prepareScreens },
  // Games, drawn from features/games/screens.ts. "b" for board games: "g" begins every shortcut.
  { to: "/games", label: "Games", icon: Puzzle, key: "b", keywords: "play puzzles children", children: gameScreens },
];

/** Where the library is looked after. */
export const upkeepNav: NavItem[] = [
  { to: "/downloads", label: "Downloads", icon: Download, key: "d", keywords: "download queue progress" },
  {
    to: "/storage",
    label: "Storage",
    icon: HardDrive,
    key: "t",
    keywords: "disk space drives nas folders usb full",
    children: [
      { to: "/storage/manage", label: "Manage and clean up", icon: ListChecks, keywords: "free space delete remove erase uninstall" },
      { to: "/storage/merge", label: "Bring back changes from a drive", icon: Undo2, keywords: "merge portable usb" },
    ],
  },
  // "On this phone", "On this tablet" or "On this computer": what is kept in this browser for when the server is out of reach.
  { to: "/kept", label: ON_THIS_DEVICE, icon: DeviceIcon, key: "p", keywords: "offline phone kept away from home" },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    key: ",",
    keywords: "preferences options",
    // How to set up search by meaning, answers and chat (SETUP_GUIDE_PATH): its settings link to it part by part.
    children: [{ to: "/help/search-and-answers", label: "Set-up guide", icon: LifeBuoy, keywords: "help models ollama install" }],
  },
  // The guides, made from docs/ (features/help/guides.ts); each guide is a page of its own, found by the quick search. "i" for information: "h" is Home's.
  {
    to: "/help",
    label: "Help",
    icon: BookMarked,
    key: "i",
    keywords: "guide guides manual how to install deploy raspberry pi docker set up instructions documentation troubleshooting",
  },
];

/**
 * The sections of Settings, in the order the screen has them, each reached at /settings#id. The
 * quick search lists each as "Settings: Backup", found by the words people use for it; those with
 * `inContents` are also the line of links at the top of Settings.
 */
export interface SettingsSection {
  id: string;
  label: string;
  keywords: string;
  inContents?: boolean;
}

export const settingsSections: SettingsSection[] = [
  {
    id: "appearance",
    label: "Appearance",
    inContents: true,
    keywords: "theme dark mode light mode night colours typeface serif sans clock 24-hour 12-hour",
  },
  { id: "text-size", label: "Text size", keywords: "font size bigger text larger smaller zoom read easier" },
  { id: "heights", label: "Heights in metres or feet", keywords: "units meters elevation altitude height" },
  { id: "downloads", label: "Downloads", inContents: true, keywords: "at once attempts speed slow connection" },
  { id: "indexing", label: "Reading documents", inContents: true, keywords: "ocr scans passages pdf pages indexing" },
  { id: "search", label: "Search", inContents: true, keywords: "reference collections wikipedia in results" },
  { id: "semantic", label: "Search by meaning", inContents: true, keywords: "semantic embeddings vectors model" },
  { id: "answers", label: "Answers", inContents: true, keywords: "ai language model ollama llm" },
  { id: "maps", label: "Maps", inContents: true, keywords: "map source terrain tiles" },
  { id: "board", label: "Message board", inContents: true, keywords: "messages files keep" },
  { id: "mesh", label: "Mesh radio", inContents: true, keywords: "meshtastic meshcore lora mqtt radio link mesh off grid messages" },
  { id: "backup", label: "Backup", inContents: true, keywords: "back up restore copy save everything password passphrase protect" },
  { id: "automatic-backups", label: "Automatic backups", inContents: true, keywords: "backup schedule every night nas" },
  { id: "https", label: "HTTPS", inContents: true, keywords: "secure certificate padlock not secure warning" },
  {
    id: "access",
    label: "Who can use it",
    inContents: true,
    keywords: "wifi wi-fi network lan phones share sharing household password sign in accounts",
  },
  { id: "about", label: "This installation", inContents: true, keywords: "version update memory processor about" },
];

/** The screens at the top level, the ones with a shortcut. */
export const allNav: NavItem[] = [...knowledgeNav, ...upkeepNav];

/** A screen with the one it sits under, if any. */
export interface PlacedScreen extends ChildScreen {
  key?: string;
  parent?: NavItem;
}

/** Every screen, each followed by its children, in the order of the sidebar. */
export const everyScreen: PlacedScreen[] = allNav.flatMap((item) => [
  item,
  ...(item.children ?? []).map((child) => ({ ...child, parent: item })),
]);

/** Whether `pathname` is the screen at `to` or somewhere inside it (a document of the library, a plan of the radio). */
export function isAt(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Whether `item` itself (not one of its children) is the screen in view: Radio is not lit while Repeaters is open. */
export function isOwnScreen(pathname: string, item: NavItem): boolean {
  return isAt(pathname, item.to) && !(item.children ?? []).some((child) => isAt(pathname, child.to));
}

/** Whether the screen in view is `item` or one of its children. */
export function isInGroup(pathname: string, item: NavItem): boolean {
  return isAt(pathname, item.to) || (item.children ?? []).some((child) => isAt(pathname, child.to));
}
