import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import { App } from "./app";
import { TooltipProvider } from "./components/ui/misc";
import { registerServiceWorker } from "./features/kept/register";
import { ApiError } from "./lib/api";
import { ErrorAnnouncer } from "./lib/notify";
import { ThemeProvider, useTheme } from "./lib/theme";
import "./styles/base.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retrying helps when the server is restarting; it does not help a 4xx.
      retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.isUnreachable || error.status >= 500),
    },
  },
});

/**
 * Toasts: above the phone's bottom bar (taller by the home indicator on some phones), six
 * seconds to read (held while pointed at or touched, and while the page is hidden), each
 * with a close button, three at most in view. Colours come from tokens (base.css).
 * One look for all of them: words and no icon (a tick on one screen and none on the next
 * made them two things); an error, through `notify.error`, keeps its icon, so it is not told
 * apart by its words alone. An action (Undo, Open it) is drawn as the app's own secondary button.
 */
function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      offset={{ bottom: 20, right: 20 }}
      mobileOffset={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
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

// Keeps the app itself on this device, so it opens when the server is out of reach (HTTPS and the packaged app only).
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <ThemedToaster />
          <ErrorAnnouncer />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
