import { X } from "lucide-react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlay = "fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade";
/**
 * Centred on a wide screen. On a phone (under 768 px) a sheet from the foot of the screen, edge to edge, where a thumb
 * reaches its buttons: rounded at the top only, rising rather than growing, and clear of the home indicator. A screen
 * that wants the whole phone screen for a long form passes its own `max-md:` classes (`phoneSheet` in Storage).
 */
const panel =
  "fixed z-(--z-dialog) flex max-h-[min(86dvh,46rem)] w-[calc(100vw-2rem)] flex-col rounded-panel border border-border bg-raised shadow-dialog focus:outline-none data-[state=open]:animate-enter left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)] max-md:data-[state=open]:animate-sheet";

/** The least room the body of a dialog is given before the whole dialog scrolls instead, in rem. */
const LEAST_BODY_REM = 6;

/**
 * True when the dialog's header and footer leave its body less than LEAST_BODY_REM: on a small
 * screen with large text, their wrapped lines can take all of it, and more, so that the footer's
 * buttons were below the screen. The whole dialog then scrolls, the body with it. Measured,
 * because what decides it is the length of the words on the day, not the size of the screen.
 * Measured each time the panel is put on the page: a dialog that stays mounted while closed
 * has no panel when this first runs.
 */
function useCramped(): [(panel: HTMLDivElement | null) => void, boolean] {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [cramped, setCramped] = useState(false);
  useLayoutEffect(() => {
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => check());
    const check = () => {
      let fixed = 0;
      // The dialog's own header and footer, the footer sometimes inside a form round the body. One that is added
      // or grows later is measured from then on.
      for (const part of panel.querySelectorAll("header, footer")) {
        if (part.closest('[role="dialog"]') !== panel) continue;
        observer.observe(part);
        fixed += part.getBoundingClientRect().height;
      }
      const most = Number.parseFloat(getComputedStyle(panel).maxHeight);
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setCramped(Number.isFinite(most) && fixed + LEAST_BODY_REM * rem > most);
    };
    observer.observe(panel);
    check();
    return () => observer.disconnect();
  }, [panel]);
  return [setPanel, cramped];
}

/**
 * The element that had focus before the one that has it now. A field with `autoFocus` takes
 * focus while its dialog is being put on the page, before the dialog can note what had it.
 */
let focusedBefore: HTMLElement | null = null;
let focusedNow: HTMLElement | null = null;
// Followed from when this file is loaded, which is before any dialog in it can be opened.
if (typeof document !== "undefined") {
  focusedNow = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target === focusedNow || !(event.target instanceof HTMLElement)) return;
      focusedBefore = focusedNow;
      focusedNow = event.target;
    },
    true,
  );
}

/**
 * Puts focus back where it was when a dialog closes. Radix gives it back only to a
 * `DialogTrigger`, and most dialogs here are opened from state (a button's onClick, a
 * menu item), so focus fell to the top of the page and a keyboard user lost their place.
 * The element in focus is noted as the dialog's panel is attached, before focus moves in;
 * a menu item, gone by then, stands for its menu's button.
 */
export function useFocusReturn(onCloseAutoFocus?: (event: Event) => void) {
  const opener = useRef<HTMLElement | null>(null);
  const note = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    let element = document.activeElement as HTMLElement | null;
    if (element && node.contains(element)) element = focusedBefore;
    // Focus fell to the page because what held it has just gone: the frame quick search shows while its code loads,
    // the first time it is opened. What had focus before that frame opened both.
    else if ((!element || element === document.body) && focusedNow && !focusedNow.isConnected) element = focusedBefore;
    const menu = element?.closest<HTMLElement>('[role="menu"]');
    if (menu?.id) element = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) ?? element;
    opener.current = element && element !== document.body && !node.contains(element) ? element : null;
    // And if the opener is that frame, still there as this attaches, what had focus before it.
    const previous = element === focusedNow ? focusedBefore : null;
    fallback.current = previous && previous !== document.body && !node.contains(previous) ? previous : null;
  }, []);
  const fallback = useRef<HTMLElement | null>(null);
  const onClose = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const element = opener.current?.isConnected ? opener.current : fallback.current;
      opener.current = null;
      fallback.current = null;
      if (event.defaultPrevented || !element?.isConnected) return;
      event.preventDefault();
      element.focus();
    },
    [onCloseAutoFocus],
  );
  return { ref: note, onCloseAutoFocus: onClose };
}

export function DialogContent({
  title,
  description,
  size = "md",
  className,
  children,
  onCloseAutoFocus,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  const [measure, cramped] = useCramped();
  const focusReturn = useFocusReturn(onCloseAutoFocus);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      measure(node);
      focusReturn.ref(node);
    },
    [measure, focusReturn.ref],
  );
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        ref={attach}
        data-cramped={cramped}
        // It scrolls as a whole when what is in it is taller than it can be (a form round the body, or a header and
        // footer that leave the body no room); otherwise the body scrolls and the header and footer stay put.
        className={cn(panel, "group/dialog overflow-y-auto", width, className)}
        {...props}
        onCloseAutoFocus={focusReturn.onCloseAutoFocus}
        // With no description the dialog is described by nothing, rather than by its own title read a second time.
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <header className="flex items-start gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-lead font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-small text-ink-muted">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="-mr-1.5 -mt-0.5 max-md:-mr-2.5 max-md:-mt-1.5 max-md:size-11"
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
        </header>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4 group-data-[cramped=true]/dialog:flex-none group-data-[cramped=true]/dialog:overflow-visible",
        className,
      )}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"footer">) {
  return (
    <footer className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5", className)} {...props} />
  );
}

/**
 * A confirmation for actions that cannot be undone. The confirm button names the
 * action; there is no generic "OK".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  /** What staying put is called here, when "Cancel" would be ambiguous: "Keep drawing". */
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  const focusReturn = useFocusReturn();
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlay} />
        {/* Its words can be longer than a small screen with large text: it then scrolls, the buttons with it. */}
        <AlertPrimitive.Content
          ref={focusReturn.ref}
          onCloseAutoFocus={focusReturn.onCloseAutoFocus}
          className={cn(panel, "max-w-md overflow-y-auto")}
        >
          <div className="px-5 pt-5 pb-4">
            <AlertPrimitive.Title className="text-lead font-semibold text-ink">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description asChild>
              <div className="mt-2 text-small leading-relaxed text-ink-muted">{description}</div>
            </AlertPrimitive.Description>
            {children ? <div className="mt-4">{children}</div> : null}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertPrimitive.Cancel>
            <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </footer>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
