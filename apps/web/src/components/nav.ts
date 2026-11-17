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
  /** The name in the sidebar, where it differs from the screen's own. */
  sidebarLabel?: string;
  /** The screens reached from inside this one, in the order its screen lists them. */
  children?: ChildScreen[];
}

/** Where people read, write and find things. */
export const knowledgeNav: NavItem[] = [
  { to: "/", label: "Home", icon: Home, key: "h" },
  {
    to: "/search",
    label: "Search",
    // The field at the top of the sidebar opens the quick search from anywhere; this is the full screen, with
    // every result and the filters. Called "Search" beside that field, it could not be told from it.
    sidebarLabel: "Search page",
    icon: Search,
    key: "s",
    children: [{ to: "/search/how-it-works", label: "How search works", icon: Waypoints }],
  },
  { to: "/explore", label: "Explore", icon: Compass, key: "e", keywords: "catalogue download collections wikipedia kiwix books" },
  {
    to: "/library",
    label: "Library",
    icon: BookOpen,
    key: "l",
    keywords: "documents books pdf files reading learning school course lessons progress khan",
  },
  { to: "/maps", label: "Maps", icon: MapIcon, key: "m", keywords: "map offline places routes gps" },
  { to: "/chat", label: "Chat", icon: MessagesSquare, key: "c", keywords: "ask model questions answers" },
  // "a" for address book: "c" is Chat's.
  { to: "/contacts", label: "Contacts", icon: Contact, key: "a", keywords: "address book people phone numbers" },
  // The household board (features/board). "w" for the board on the wall: "m" is Maps'.
  {
    to: "/messages",
    label: "Messages",
    icon: MessageSquareText,
    key: "w",
    keywords: "message board chat note to family check in safe send a file",
  },
  { to: "/encryption", label: "Encryption", icon: LockKeyhole, key: "k", keywords: "pgp keys cipher one-time pad secret" },
  {
    to: "/radio",
    label: "Radio",
    icon: RadioTower,
    key: "r",
    // The radio tools, in the order the Radio screen lists them.
    children: [
      { to: "/radio/propagation", label: "HF propagation", icon: Waves, keywords: "band conditions voacap" },
      { to: "/radio/coverage", label: "HF coverage", icon: Grid3x3 },
      { to: "/radio/plans", label: "Communication plans", icon: ListTree },
      { to: "/radio/log", label: "Contact log", icon: ClipboardList, keywords: "logbook qso adif" },
      { to: "/radio/repeaters", label: "Repeaters", icon: RadioReceiver },
      { to: "/radio/morse", label: "Morse trainer", icon: AudioWaveform, keywords: "cw code" },
      { to: "/radio/frequencies", label: "Frequencies to listen to", icon: Radio, keywords: "scanner shortwave broadcast" },
    ],
  },
  // Two sections that are lists of screens, each drawn from its own registry (features/<section>/screens.ts).
  // "o" for tOols and "y" for readY: the obvious letters are taken.
  { to: "/tools", label: "Tools", icon: Wrench, key: "o", children: toolScreens },
  { to: "/prepare", label: "Preparedness", icon: ShieldCheck, key: "y", children: prepareScreens },
  // Games, drawn from features/games/screens.ts. "b" for board games: "g" begins every shortcut.
  { to: "/games", label: "Games", icon: Puzzle, key: "b", children: gameScreens },
  // Last, so that the tree of pages sits under it in the sidebar. Importing brings in pages (Markdown, Notion), so it is Notes'.
  {
    to: "/notes",
    label: "Notes",
    icon: NotebookText,
    key: "n",
    children: [{ to: "/import", label: "Import files", icon: FolderInput, keywords: "markdown notion" }],
  },
];

/** Where the library is looked after. */
export const upkeepNav: NavItem[] = [
  { to: "/downloads", label: "Downloads", icon: Download, key: "d", keywords: "queue progress" },
  {
    to: "/storage",
    label: "Storage",
    icon: HardDrive,
    key: "t",
    keywords: "disk space drives nas folders",
    children: [
      { to: "/storage/manage", label: "Manage and clean up", icon: ListChecks, keywords: "free space delete remove erase" },
      { to: "/storage/merge", label: "Bring back from a drive", icon: Undo2, keywords: "merge restore portable" },
    ],
  },
  // "On this phone", "On this tablet" or "On this computer": what is kept in this browser for when the server is out of reach.
  { to: "/kept", label: ON_THIS_DEVICE, icon: DeviceIcon, key: "p", keywords: "offline phone kept" },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    key: ",",
    keywords: "preferences theme dark light backup https passphrase",
    // How to set up search by meaning, answers and chat (SETUP_GUIDE_PATH): its settings link to it part by part.
    children: [{ to: "/help/search-and-answers", label: "Set-up guide", icon: LifeBuoy, keywords: "help models ollama" }],
  },
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
