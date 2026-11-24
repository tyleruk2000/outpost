import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { App } from "./app";
import { TooltipProvider } from "./components/ui/misc";
import { registerServiceWorker } from "./features/kept/register";
import { ErrorAnnouncer } from "./lib/notify";
import { createQueryClient } from "./lib/query-client";
import { ThemeProvider, useTheme } from "./lib/theme";
import { useMediaQuery } from "./lib/use-media-query";
import "./styles/base.css";

const queryClient = createQueryClient();

/**
 * Toasts: at the foot of a wide screen; on a phone under the top bar (on Maps above the bottom bar, taller by the home
 * indicator on some phones, and the map's sheet); six seconds to read (held while pointed at or touched, and while the page is hidden), each
 * with a close button, three at most in view. Colours come from tokens (base.css).
 * One look for all of them: words and no icon (a tick on one screen and none on the next
 * made them two things); an error, through `notify.error`, keeps its icon, so it is not told
 * apart by its words alone. An action (Undo, Open it) is drawn as the app's own secondary button.
 */
function ThemedToaster() {
  const { resolved } = useTheme();
  // On a phone, at the top, under the top bar: at the foot they lay over what had just been pressed for their six seconds (a
  // dialog's footer, Done today, the save bar), where a thumb is (owner's review, 24 Nov 2026). Maps keeps them at the foot,
  // over its own bar at the top and above its sheet. 600 px is where the library draws toasts the full width.
  const phone = useMediaQuery("(max-width: 599px)");
  const onMaps = useSyncExternalStore(
    (changed) => router.subscribe(changed),
    () => router.state.location.pathname === "/maps",
  );
  const top = phone && !onMaps;
  return (
    <Toaster
      theme={resolved}
      position={top ? "top-center" : "bottom-right"}
      offset={{ bottom: 20, right: 20 }}
      // On Maps the sheet over the foot of the map says how tall it is (--sheet-toast-lift), and messages stand above it
      // rather than over its handle and tabs.
      mobileOffset={
        top
          ? { top: "calc(3.25rem + env(safe-area-inset-top) + 0.5rem)" }
          : { bottom: "calc(4.25rem + env(safe-area-inset-bottom) + var(--sheet-toast-lift, 0px))" }
      }
      duration={6000}
      closeButton
      icons={{ success: null, info: null, warning: null }}
      toastOptions={{
        closeButtonAriaLabel: "Hide this message",
        style: {
          fontFamily: "var(--font-sans)",
          fontSize: "0.875rem",
          borderRadius: "var(--radius-panel)",
          boxShadow: "var(--shadow-float)",
        },
        actionButtonStyle: {
          background: "var(--raised)",
          color: "var(--ink)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-control)",
          fontWeight: 600,
        },
      }}
    />
  );
}

// A data router, so that a screen with changes not saved can ask before it is left (components/leave-guard.tsx).
// It has one route that matches every address and draws the app, whose own <Routes> (app.tsx) choose the screen
// exactly as they did under BrowserRouter: no route, lazy load or address changed.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

// Keeps the app itself on this device, so it opens when the server is out of reach (HTTPS and the packaged app only).
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
          <RouterProvider router={router} />
          <ThemedToaster />
          <ErrorAnnouncer />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
