import {
  BookOpen,
  Compass,
  Contact,
  Download,
  FolderInput,
  HardDrive,
  Home,
  ListChecks,
  type LucideIcon,
  Map as MapIcon,
  MessagesSquare,
  NotebookText,
  Search,
  Settings,
  Undo2,
  Waypoints,
} from "lucide-react";
import { DeviceIcon, ON_THIS_DEVICE } from "@/features/kept/device";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shortcut after "g", e.g. "g then h" for Home. */
  key: string;
  adminOnly?: boolean;
}

/** Where people read, write and find things. */
export const knowledgeNav: NavItem[] = [
  { to: "/", label: "Home", icon: Home, key: "h" },
  { to: "/search", label: "Search", icon: Search, key: "s" },
  { to: "/explore", label: "Explore", icon: Compass, key: "e" },
  { to: "/library", label: "Library", icon: BookOpen, key: "l" },
  { to: "/maps", label: "Maps", icon: MapIcon, key: "m" },
  { to: "/chat", label: "Chat", icon: MessagesSquare, key: "c" },
  // "a" for address book: "c" is Chat's.
  { to: "/contacts", label: "Contacts", icon: Contact, key: "a" },
  // Last, so that the tree of pages sits under it in the sidebar.
  { to: "/notes", label: "Notes", icon: NotebookText, key: "n" },
];

/** Where the library is looked after. */
export const upkeepNav: NavItem[] = [
  { to: "/downloads", label: "Downloads", icon: Download, key: "d" },
  { to: "/storage", label: "Storage", icon: HardDrive, key: "t" },
  // "On this phone", "On this tablet" or "On this computer": what is kept in this browser for when the server is out of reach.
  { to: "/kept", label: ON_THIS_DEVICE, icon: DeviceIcon, key: "p" },
  { to: "/settings", label: "Settings", icon: Settings, key: "," },
];

export const allNav = [...knowledgeNav, ...upkeepNav];

/**
 * Screens reached from inside another screen on a wide display (a button on Storage, a
 * link under the search box). A phone has no sidebar to orient by, so its More sheet
 * lists them outright: every screen is one tap from the bottom bar.
 */
export const tuckedAwayNav: Array<Omit<NavItem, "key">> = [
  { to: "/storage/manage", label: "Manage and clean up", icon: ListChecks },
  { to: "/storage/merge", label: "Bring back from a drive", icon: Undo2 },
  { to: "/import", label: "Import files", icon: FolderInput },
  { to: "/search/how-it-works", label: "How search works", icon: Waypoints },
];
