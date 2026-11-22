// Run by index.html before anything is drawn: puts this device's appearance choices (Settings →
// Appearance, kept in this browser by src/lib/theme.tsx) on the page, so that a dark theme or a
// larger text size does not flash in after the app has loaded. A plain script, not a module, so
// that it runs at once; a file of its own, since the page's security policy forbids inline ones.
// The text sizes must match TEXT_SIZES in src/lib/theme.tsx (lib/theme.test.tsx checks).
(() => {
  const root = document.documentElement;
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const choice = read("outpost.theme");
  const dark = choice === "dark" || (choice !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  if (read("outpost.reading") === "sans") root.dataset.reading = "sans";
  if (read("outpost.spacing") === "wide") root.dataset.spacing = "wide";
  const scale = { smaller: "87.5%", larger: "125%", largest: "150%" }[read("outpost.textSize")];
  if (scale) root.style.fontSize = scale;
})();
