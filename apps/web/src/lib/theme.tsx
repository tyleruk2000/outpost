/**
 * Appearance preferences, kept in this browser only: colour theme (follows the system
 * until someone chooses) and the typeface for reading surfaces.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type ReadingFace = "serif" | "sans";

interface ThemeValue {
  theme: ThemeChoice;
  resolved: "light" | "dark";
  setTheme(theme: ThemeChoice): void;
  reading: ReadingFace;
  setReading(face: ReadingFace): void;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the choice then lasts for this visit only.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => read("outpost.theme", ["system", "light", "dark"], "system"));
  const [reading, setReadingState] = useState<ReadingFace>(() => read("outpost.reading", ["serif", "sans"], "serif"));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.reading = reading;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0d1516" : "#1d3a3f");
  }, [resolved, reading]);

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      resolved,
      setTheme(next) {
        setThemeState(next);
        write("outpost.theme", next);
      },
      reading,
      setReading(next) {
        setReadingState(next);
        write("outpost.reading", next);
      },
    }),
    [theme, resolved, reading],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
