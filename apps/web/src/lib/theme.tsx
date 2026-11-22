/**
 * Appearance preferences, kept in this browser only: colour theme (follows the system
 * until someone chooses), the typeface for reading surfaces, and the size of all text.
 * `public/pre-paint.js` puts the same choices on the page before anything is drawn; this
 * keeps them there as they change.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type ReadingFace = "serif" | "sans";
export type TextSize = "smaller" | "default" | "larger" | "largest";
/** The room between lines, words and paragraphs on reading surfaces: "wide" goes past what WCAG 1.4.12 asks a page to bear. */
export type ReadingSpacing = "normal" | "wide";

/**
 * The text sizes, as a scale of the root font size, which every size in the app is in rem of. They
 * are of the size the browser or phone is set to, so a person's own larger text is made larger
 * still. "Largest" is 150%, the size every screen is held to by the large-text end-to-end specs
 * (which also try 200%). Keep in step with public/pre-paint.js.
 */
export const TEXT_SIZES: Record<TextSize, string> = { smaller: "87.5%", default: "100%", larger: "125%", largest: "150%" };

/**
 * Puts a text size on the page. The default is the stylesheet's 100%: a size put there before is taken
 * away, and a root size set by something else (a test standing in for a phone's large text) is left be.
 */
export function applyTextSize(size: TextSize): void {
  const style = document.documentElement.style;
  if (size !== "default") style.fontSize = TEXT_SIZES[size];
  else if (Object.values(TEXT_SIZES).includes(style.fontSize)) style.removeProperty("font-size");
}

interface ThemeValue {
  theme: ThemeChoice;
  resolved: "light" | "dark";
  setTheme(theme: ThemeChoice): void;
  reading: ReadingFace;
  setReading(face: ReadingFace): void;
  textSize: TextSize;
  setTextSize(size: TextSize): void;
  spacing: ReadingSpacing;
  setSpacing(spacing: ReadingSpacing): void;
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
  const [textSize, setTextSizeState] = useState<TextSize>(() =>
    read("outpost.textSize", ["smaller", "default", "larger", "largest"], "default"),
  );
  const [spacing, setSpacingState] = useState<ReadingSpacing>(() => read("outpost.spacing", ["normal", "wide"], "normal"));
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
    if (spacing === "wide") document.documentElement.dataset.spacing = "wide";
    else delete document.documentElement.dataset.spacing;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0d1516" : "#1d3a3f");
  }, [resolved, reading, spacing]);

  useEffect(() => applyTextSize(textSize), [textSize]);

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
      textSize,
      setTextSize(next) {
        setTextSizeState(next);
        write("outpost.textSize", next);
      },
      spacing,
      setSpacing(next) {
        setSpacingState(next);
        write("outpost.spacing", next);
      },
    }),
    [theme, resolved, reading, textSize, spacing],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
