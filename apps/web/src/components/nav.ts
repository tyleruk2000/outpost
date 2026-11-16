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
  MessagesSquare,
  NotebookText,
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
import { DeviceIcon, ON_THIS_DEVICE } from "@/features/kept/device";
import { prepareScreens } from "@/features/prepare/screens";
import { toolScreens } from "@/features/tools/screens";

/** A screen reached from inside another one. */
export interface ChildScreen {
  to: string;
  label: string;
  icon: LucideIcon;
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
  { to: "/explore", label: "Explore", icon: Compass, key: "e" },
  { to: "/library", label: "Library", icon: BookOpen, key: "l" },
  { to: "/maps", label: "Maps", icon: MapIcon, key: "m" },
  { to: "/chat", label: "Chat", icon: MessagesSquare, key: "c" },
  // "a" for address book: "c" is Chat's.
  { to: "/contacts", label: "Contacts", icon: Contact, key: "a" },
  { to: "/encryption", label: "Encryption", icon: LockKeyhole, key: "k" },
  {
    to: "/radio",
    label: "Radio",
    icon: RadioTower,
    key: "r",
    // The radio tools, in the order the Radio screen lists them.
    children: [
      { to: "/radio/propagation", label: "HF propagation", icon: Waves },
      { to: "/radio/coverage", label: "HF coverage", icon: Grid3x3 },
      { to: "/radio/plans", label: "Communication plans", icon: ListTree },
      { to: "/radio/log", label: "Contact log", icon: ClipboardList },
      { to: "/radio/repeaters", label: "Repeaters", icon: RadioReceiver },
      { to: "/radio/morse", label: "Morse trainer", icon: AudioWaveform },
    ],
  },
  // Two sections that are lists of screens, each drawn from its own registry (features/<section>/screens.ts).
  // "o" for tOols and "y" for readY: the obvious letters are taken.
  { to: "/tools", label: "Tools", icon: Wrench, key: "o", children: toolScreens },
  { to: "/prepare", label: "Preparedness", icon: ShieldCheck, key: "y", children: prepareScreens },
  // Last, so that the tree of pages sits under it in the sidebar. Importing brings in pages (Markdown, Notion), so it is Notes'.
  { to: "/notes", label: "Notes", icon: NotebookText, key: "n", children: [{ to: "/import", label: "Import files", icon: FolderInput }] },
];

/** Where the library is looked after. */
export const upkeepNav: NavItem[] = [
  { to: "/downloads", label: "Downloads", icon: Download, key: "d" },
  {
    to: "/storage",
    label: "Storage",
    icon: HardDrive,
    key: "t",
    children: [
      { to: "/storage/manage", label: "Manage and clean up", icon: ListChecks },
      { to: "/storage/merge", label: "Bring back from a drive", icon: Undo2 },
    ],
  },
  // "On this phone", "On this tablet" or "On this computer": what is kept in this browser for when the server is out of reach.
  { to: "/kept", label: ON_THIS_DEVICE, icon: DeviceIcon, key: "p" },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    key: ",",
    // How to set up search by meaning, answers and chat (SETUP_GUIDE_PATH): its settings link to it part by part.
    children: [{ to: "/help/search-and-answers", label: "Set-up guide", icon: LifeBuoy }],
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
