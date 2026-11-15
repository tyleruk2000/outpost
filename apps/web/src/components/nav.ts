import { BookOpen, Compass, Download, HardDrive, Home, Map as MapIcon, NotebookText, Search, Settings, type LucideIcon } from "lucide-react";

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
  { to: "/notes", label: "Notes", icon: NotebookText, key: "n" },
];

/** Where the library is looked after. */
export const upkeepNav: NavItem[] = [
  { to: "/downloads", label: "Downloads", icon: Download, key: "d" },
  { to: "/storage", label: "Storage", icon: HardDrive, key: "t" },
  { to: "/settings", label: "Settings", icon: Settings, key: "," },
];

export const allNav = [...knowledgeNav, ...upkeepNav];
